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
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

// Owns the two pages and connects them:
// - uiSession shows the app's own chat UI (served by Server on 127.0.0.1).
// - siteSession shows the AI chat site; the built-in extension's content script
//   there talks to us over a native messaging port ("pp").
// The UI reaches the site through Server -> request() -> port -> content script.
class Hub(private val app: App) {
    interface Screen {
        fun showSite(show: Boolean)
        fun showPopup(session: GeckoSession?)
        fun runAction(action: String, data: JSONObject)
        fun reattach()
    }

    val main = Handler(Looper.getMainLooper())
    val uiSession = GeckoSession()
    val siteSession = GeckoSession()
    var popup: GeckoSession? = null
    var screen: Screen? = null
    var uiCanGoBack = false

    @Volatile private var port: WebExtension.Port? = null
    @Volatile var siteInfo: JSONObject = JSONObject()
    private val pending = ConcurrentHashMap<Int, CompletableFuture<JSONObject>>()
    private val nextId = AtomicInteger(1)
    private val helloWaiters = mutableListOf<CompletableFuture<JSONObject>>()

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

    // ---------- site page ----------
    private val portDelegate = object : WebExtension.PortDelegate {
        override fun onPortMessage(message: Any, p: WebExtension.Port) {
            val m = message as? JSONObject ?: return
            when (m.optString("type")) {
                "hello" -> {
                    port = p
                    siteInfo = m
                    p.postMessage(JSONObject().put("type", "welcome"))
                    synchronized(helloWaiters) {
                        helloWaiters.forEach { it.complete(m) }
                        helloWaiters.clear()
                    }
                    emit(JSONObject().put("type", "site").put("connected", true).put("url", m.optString("url")).put("title", m.optString("title")))
                }
                "reply" -> pending[m.optInt("id")]?.complete(m)
                "event" -> {
                    if (m.has("url")) siteInfo = m
                    emit(m.put("type", "site").put("connected", true))
                }
            }
        }

        override fun onDisconnect(p: WebExtension.Port) {
            if (port !== p) return
            port = null
            for (f in pending.values) f.completeExceptionally(IOException("the AI page reloaded"))
            emit(JSONObject().put("type", "site").put("connected", false))
        }
    }

    private val messages = object : WebExtension.MessageDelegate {
        override fun onConnect(p: WebExtension.Port) {
            p.setDelegate(portDelegate)
        }
    }

    private fun waitHello(): CompletableFuture<JSONObject> {
        val f = CompletableFuture<JSONObject>()
        synchronized(helloWaiters) { helloWaiters.add(f) }
        return f
    }

    // Send a command to the content script and wait for its answer.
    fun request(cmd: JSONObject, timeoutMs: Long): JSONObject {
        var p = port
        if (p == null) {
            val hello = waitHello()
            if (port == null) try {
                hello.get(20, TimeUnit.SECONDS)
            } catch (e: Exception) {
                throw IOException("the AI page is not connected (still loading? open it with the Site button)")
            }
            p = port ?: throw IOException("the AI page is not connected")
        }
        val id = nextId.getAndIncrement()
        cmd.put("id", id)
        val f = CompletableFuture<JSONObject>()
        pending[id] = f
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
            return r.optJSONObject("result") ?: JSONObject()
        } catch (e: java.util.concurrent.TimeoutException) {
            throw IOException("the AI page did not answer in time")
        } catch (e: java.util.concurrent.ExecutionException) {
            throw IOException(e.cause?.message ?: "failed")
        } finally {
            pending.remove(id)
        }
    }

    // Load a URL in the site page and wait until its content script says hello.
    fun open(url: String): JSONObject {
        val hello = waitHello()
        main.post { siteSession.loadUri(url) }
        return try {
            hello.get(45, TimeUnit.SECONDS)
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
        Log.w(App.TAG, "${if (isUi) "chat UI" else "site"} page ${if (crashed) "crashed" else "was stopped"}; reloading")
        if (crashed) {
            if (s.isOpen) s.close()
            s.open(app.runtime)
            if (!isUi) extension?.let { siteSession.webExtensionController.setMessageDelegate(it, messages, "pp") }
        }
        s.setActive(true)
        screen?.reattach()
        if (isUi) s.loadUri("${App.base}/")
        else {
            s.loadUri(siteInfo.optString("url").ifEmpty { "about:blank" })
            emit(JSONObject().put("type", "error").put("text", "The AI page " + (if (crashed) "crashed" else "was stopped by Android") + " and was reloaded. Resend if a message was waiting."))
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
            if (!siteSession.isOpen) restore(siteSession, true)
        }
    }

    // Reload both pages (the Reload button over the AI page).
    fun reloadAll() {
        main.post {
            if (!uiSession.isOpen) restore(uiSession, true) else uiSession.reload()
            if (!siteSession.isOpen) restore(siteSession, true) else siteSession.reload()
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
        uiSession.open(app.runtime)
        siteSession.open(app.runtime)
        uiSession.navigationDelegate = uiNav
        siteSession.navigationDelegate = siteNav
        uiSession.contentDelegate = recovery
        siteSession.contentDelegate = recovery
        uiSession.setActive(true)
        siteSession.setActive(true)
        app.runtime.webExtensionController
            .ensureBuiltIn("resource://android/assets/ppext/", "promptpipe@zieviox.dev")
            .accept({ ext ->
                if (ext != null) {
                    extension = ext
                    siteSession.webExtensionController.setMessageDelegate(ext, messages, "pp")
                    Log.i(App.TAG, "extension ready")
                }
                // The chat screen opens the profile's site when it needs it.
                siteSession.loadUri("about:blank")
            }, { e ->
                Log.e(App.TAG, "extension failed", e)
                emit(JSONObject().put("type", "error").put("text", "Built-in extension failed to load: $e"))
            })
        uiSession.loadUri("${App.base}/")
    }
}
