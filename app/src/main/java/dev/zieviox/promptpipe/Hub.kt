package dev.zieviox.promptpipe

import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.WebExtension
import java.io.IOException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

// Owns the pages and connects them:
// - uiSession shows the app's own chat UI (served by Server on 127.0.0.1).
// - pages are the AI site pages (1 by default, more for chats in parallel).
//   The built-in extension's content script on each talks to us over its own
//   native messaging port ("pp").
// The UI reaches a page through Server -> request(cmd with "page") -> port -> content script.
class Hub(private val app: App) {
    interface Screen {
        fun showSite(show: Boolean)
        fun showPopup(session: GeckoSession?)
        fun runAction(action: String, data: JSONObject)
        fun reattach()
        fun pagesChanged()
    }

    val main = Handler(Looper.getMainLooper())
    val uiSession = GeckoSession()
    var popup: GeckoSession? = null
    var screen: Screen? = null
    var uiCanGoBack = false

    private val nextId = AtomicInteger(1)

    // Events for the UI page, fetched by long polling /api/events.
    private val lock = Object()
    private val events = ArrayList<JSONObject>()
    private var seq = 0
    @Volatile var lastPoll = 0L

    // Jobs from the local API, answered by the UI page.
    val jobs = ConcurrentHashMap<String, CompletableFuture<JSONObject>>()

    // ---------- events ----------
    fun emit(e: JSONObject) {
        synchronized(lock) {
            seq++
            events.add(e.put("seq", seq))
            if (events.size > 200) events.removeAt(0)
            lock.notifyAll()
        }
    }

    fun poll(after: Int, waitMs: Long): JSONObject {
        lastPoll = System.currentTimeMillis()
        synchronized(lock) {
            val until = System.currentTimeMillis() + waitMs
            while (seq <= after) {
                val left = until - System.currentTimeMillis()
                if (left <= 0) break
                lock.wait(left)
            }
            val out = JSONArray()
            for (e in events) if (e.getInt("seq") > after) out.put(e)
            return JSONObject().put("seq", seq).put("events", out)
        }
    }

    fun uiAlive() = System.currentTimeMillis() - lastPoll < 40_000

    // ---------- site pages ----------
    inner class SitePage(val index: Int) {
        val session = GeckoSession()
        @Volatile var port: WebExtension.Port? = null
        @Volatile var info: JSONObject = JSONObject()
        val pending = ConcurrentHashMap<Int, CompletableFuture<JSONObject>>()
        private val helloWaiters = mutableListOf<CompletableFuture<JSONObject>>()

        private val portDelegate = object : WebExtension.PortDelegate {
            override fun onPortMessage(message: Any, p: WebExtension.Port) {
                val m = message as? JSONObject ?: return
                when (m.optString("type")) {
                    "hello" -> {
                        port = p
                        info = m
                        p.postMessage(JSONObject().put("type", "welcome"))
                        synchronized(helloWaiters) {
                            helloWaiters.forEach { it.complete(m) }
                            helloWaiters.clear()
                        }
                        emit(JSONObject().put("type", "site").put("page", index).put("connected", true).put("url", m.optString("url")).put("title", m.optString("title")))
                    }
                    "reply" -> pending[m.optInt("id")]?.complete(m)
                    "event" -> {
                        if (m.has("url")) info = m
                        emit(m.put("type", "site").put("page", index).put("connected", true))
                    }
                }
            }

            override fun onDisconnect(p: WebExtension.Port) {
                if (port !== p) return
                port = null
                for (f in pending.values) f.completeExceptionally(IOException("the AI page reloaded"))
                emit(JSONObject().put("type", "site").put("page", index).put("connected", false))
            }
        }

        val messages = object : WebExtension.MessageDelegate {
            override fun onConnect(p: WebExtension.Port) {
                p.setDelegate(portDelegate)
            }
        }

        fun waitHello(): CompletableFuture<JSONObject> {
            val f = CompletableFuture<JSONObject>()
            synchronized(helloWaiters) { helloWaiters.add(f) }
            return f
        }

        fun listen() {
            extension?.let { session.webExtensionController.setMessageDelegate(it, messages, "pp") }
        }

        fun start() {
            session.open(app.runtime)
            session.navigationDelegate = siteNav
            session.contentDelegate = recovery
            session.setActive(true)
            listen()
            session.loadUri("about:blank")
        }

        fun stop() {
            for (f in pending.values) f.completeExceptionally(IOException("that site page was closed (fewer pages in Settings)"))
            if (session.isOpen) session.close()
        }
    }

    val pages = CopyOnWriteArrayList<SitePage>()
    // The first page, which also stands for "the site" in older calls.
    val siteSession get() = pages[0].session
    val siteInfo get() = pages[0].info

    fun page(i: Int): SitePage = pages.getOrNull(i) ?: throw IOException("there is no site page ${i + 1} (Settings › Site pages at once)")

    fun pagesInfo(): JSONArray = JSONArray().also { a -> pages.forEach { a.put(JSONObject().put("page", it.index).put("connected", it.port != null).put("url", it.info.optString("url")).put("title", it.info.optString("title"))) } }

    // How many site pages run at once (1-4). Extra pages are closed from the end.
    fun setPages(n: Int) {
        val want = n.coerceIn(1, MAX_PAGES)
        main.post {
            if (want == pages.size) return@post
            while (pages.size < want) pages.add(SitePage(pages.size).also { it.start() })
            val gone = ArrayList<SitePage>()
            while (pages.size > want) gone.add(pages.removeAt(pages.size - 1))
            screen?.pagesChanged() // lets go of the views before their pages close
            gone.forEach { it.stop() }
            emit(JSONObject().put("type", "pages").put("count", pages.size).put("pages", pagesInfo()))
        }
    }

    // Send a command to a page's content script and wait for its answer.
    fun request(cmd: JSONObject, timeoutMs: Long): JSONObject {
        val pg = page(cmd.optInt("page", 0))
        var p = pg.port
        if (p == null) {
            val hello = pg.waitHello()
            if (pg.port == null) try {
                hello.get(20, TimeUnit.SECONDS)
            } catch (e: Exception) {
                throw IOException("the AI page is not connected (still loading? open it with the Site button)")
            }
            p = pg.port ?: throw IOException("the AI page is not connected")
        }
        val id = nextId.getAndIncrement()
        cmd.put("id", id)
        val f = CompletableFuture<JSONObject>()
        pg.pending[id] = f
        main.post {
            try {
                p.postMessage(cmd)
            } catch (e: Exception) {
                f.completeExceptionally(e)
            }
        }
        try {
            val r = f.get(timeoutMs, TimeUnit.MILLISECONDS)
            if (!r.optBoolean("ok")) throw IOException(r.optString("error", "failed"))
            return (r.optJSONObject("result") ?: JSONObject()).put("page", pg.index)
        } catch (e: java.util.concurrent.TimeoutException) {
            throw IOException("the AI page did not answer in time")
        } catch (e: java.util.concurrent.ExecutionException) {
            throw IOException(e.cause?.message ?: "failed")
        } finally {
            pg.pending.remove(id)
        }
    }

    // Load a URL in a site page and wait until its content script says hello.
    fun open(url: String, index: Int = 0): JSONObject {
        val pg = page(index)
        val hello = pg.waitHello()
        main.post { pg.session.loadUri(url) }
        return try {
            hello.get(45, TimeUnit.SECONDS).put("page", pg.index)
        } catch (e: Exception) {
            throw IOException("the page did not finish loading: $url")
        }
    }

    // ---------- navigation ----------
    private val uiNav = object : GeckoSession.NavigationDelegate {
        override fun onCanGoBack(session: GeckoSession, canGoBack: Boolean) {
            uiCanGoBack = canGoBack
        }

        // Links in chats open in the normal browser, not inside the app UI.
        override fun onLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<AllowOrDeny>? {
            if (request.uri.startsWith(App.base) || request.uri.startsWith("about:")) return GeckoResult.fromValue(AllowOrDeny.ALLOW)
            main.post { screen?.runAction("openUrl", JSONObject().put("url", request.uri)) }
            return GeckoResult.fromValue(AllowOrDeny.DENY)
        }
    }

    // Sign-in popups (e.g. Google) get their own page, shown over the site.
    private val siteNav = object : GeckoSession.NavigationDelegate {
        override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession>? {
            val s = GeckoSession()
            s.navigationDelegate = this
            s.contentDelegate = object : GeckoSession.ContentDelegate {
                override fun onCloseRequest(session: GeckoSession) {
                    closePopup()
                }
            }
            popup = s
            main.post { screen?.showPopup(s) }
            return GeckoResult.fromValue(s)
        }
    }

    // ---------- recovery ----------
    // Android may stop a page's engine to free memory (onKill), or it may crash
    // (onCrash). Either leaves a blank page, so bring it back and reload it.
    private var extension: WebExtension? = null

    private fun recover(s: GeckoSession, crashed: Boolean) {
        main.post { restore(s, crashed) }
    }

    private fun restore(s: GeckoSession, crashed: Boolean) {
        val isUi = s === uiSession
        val pg = pages.firstOrNull { it.session === s }
        if (!isUi && pg == null) return // a page that was closed meanwhile
        Log.w(App.TAG, "${if (isUi) "chat UI" else "site page ${pg!!.index + 1}"} ${if (crashed) "crashed" else "was stopped"}; reloading")
        if (crashed) {
            if (s.isOpen) s.close()
            s.open(app.runtime)
            pg?.listen()
        }
        s.setActive(true)
        screen?.reattach()
        if (isUi) s.loadUri("${App.base}/")
        else {
            s.loadUri(pg!!.info.optString("url").ifEmpty { "about:blank" })
            emit(JSONObject().put("type", "error").put("text", "AI page ${if (pages.size > 1) "${pg.index + 1} " else ""}" + (if (crashed) "crashed" else "was stopped by Android") + " and was reloaded. Resend if a message was waiting."))
        }
    }

    private val recovery = object : GeckoSession.ContentDelegate {
        override fun onCrash(session: GeckoSession) = recover(session, true)
        override fun onKill(session: GeckoSession) = recover(session, false)
    }

    // Coming back to the app: reopen any page whose engine is gone.
    fun revive() {
        main.post {
            if (!uiSession.isOpen) restore(uiSession, true)
            for (p in pages) if (!p.session.isOpen) restore(p.session, true)
        }
    }

    // The Reload button over the AI page: the chat UI and the page on screen.
    fun reloadAll(shown: Int = 0) {
        main.post {
            if (!uiSession.isOpen) restore(uiSession, true) else uiSession.reload()
            val s = (pages.getOrNull(shown) ?: pages[0]).session
            if (!s.isOpen) restore(s, true) else s.reload()
        }
    }

    fun closePopup() {
        val s = popup ?: return
        popup = null
        main.post {
            screen?.showPopup(null)
            s.close()
        }
    }

    // Last in the class: it uses the delegates declared above.
    init {
        pages.add(SitePage(0))
        uiSession.open(app.runtime)
        uiSession.navigationDelegate = uiNav
        uiSession.contentDelegate = recovery
        uiSession.setActive(true)
        pages[0].let {
            it.session.open(app.runtime)
            it.session.navigationDelegate = siteNav
            it.session.contentDelegate = recovery
            it.session.setActive(true)
        }
        app.runtime.webExtensionController
            .ensureBuiltIn("resource://android/assets/ppext/", "promptpipe@zieviox.dev")
            .accept({ ext ->
                if (ext != null) {
                    extension = ext
                    pages.forEach { it.listen() }
                    Log.i(App.TAG, "extension ready")
                }
                // The chat screen opens the profile's site when it needs it.
                pages.forEach { it.session.loadUri("about:blank") }
            }, { e ->
                Log.e(App.TAG, "extension failed", e)
                emit(JSONObject().put("type", "error").put("text", "Built-in extension failed to load: $e"))
            })
        uiSession.loadUri("${App.base}/")
    }

    companion object {
        const val MAX_PAGES = 4
    }
}
