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
// - uiSession shows the app's own chat UI (served by the core on 127.0.0.1).
// - pages are the AI site pages (1 by default, more for chats in parallel).
//   The built-in extension's content script on each talks to us over its own
//   native messaging port ("pp").
// The UI reaches a page through the core -> Shell -> request(cmd with "page") -> port -> content script.
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

    // Events for the app screen go through the core, which the screen long-polls.
    fun emit(e: JSONObject) {
        app.core.emit(e)
        if (e.optString("type") in listOf("site", "pages")) app.core.status()
    }

    // The app screen, opened with the security key once the core answers.
    // Until then it shows "Starting…", and if the core doesn't answer, why.
    fun openScreen() = kotlin.concurrent.thread(isDaemon = true) {
        main.post { uiSession.loadUri(page("Starting promptpipe…", "")) }
        for (i in 0 until 150) {
            if (app.core.ready()) {
                main.post { uiSession.loadUri("${App.base}/open?key=${app.core.key}") }
                return@thread
            }
            Thread.sleep(200)
        }
        val why = app.core.problem.ifEmpty { "the core didn't answer within 30 seconds" }
        main.post { uiSession.loadUri(page("promptpipe couldn't start: $why", "Last lines of ${app.core.logFile.path}:\n\n${app.core.lastLog()}")) }
    }

    // A plain page made on the spot (no server needed), in the app's dark colours.
    private fun page(title: String, detail: String): String {
        fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;")
        val html = "<meta name=viewport content='width=device-width'><body style='background:#0b0c0f;color:#d8dbe2;font:16px system-ui;padding:24px'>" +
            (if (detail.isEmpty()) "<style>@keyframes s{to{transform:rotate(360deg)}}</style><p style='display:flex;align-items:center;gap:12px'><span style='width:18px;height:18px;border-radius:50%;border:2px solid #9aa1ad;border-right-color:transparent;animation:s .9s linear infinite'></span>${esc(title)}</p>" else "<p>${esc(title)}</p>") + (if (detail.isEmpty()) "" else "<pre style='white-space:pre-wrap;font-size:12px;color:#9aa1ad'>${esc(detail)}</pre><p><a style='color:#e8875a' href='${App.base}/open?key=${app.core.key}'>Try again</a></p>")
        return "data:text/html;charset=utf-8," + java.net.URLEncoder.encode(html, "UTF-8").replace("+", "%20")
    }

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

    fun page(i: Int): SitePage = pages.getOrNull(i) ?: throw IOException("there is no site page ${i + 1} (Settings › Sites › Max replies at once)")

    fun pagesInfo(): JSONArray = JSONArray().also { a -> pages.forEach { a.put(JSONObject().put("page", it.index).put("connected", it.port != null).put("url", it.info.optString("url")).put("title", it.info.optString("title"))) } }

    // How many site pages run at once (1-10). Extra pages are closed from the end.
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
            if (request.uri.startsWith(App.base) || request.uri.startsWith("about:") || request.uri.startsWith("data:")) return GeckoResult.fromValue(AllowOrDeny.ALLOW)
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
        if (isUi) openScreen()
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

    // Reload one site page (the site view's reload button).
    fun reloadPage(i: Int) {
        main.post {
            val s = (pages.getOrNull(i) ?: pages[0]).session
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
        openScreen()
    }

    companion object {
        const val MAX_PAGES = 10
    }
}
