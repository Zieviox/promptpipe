package dev.zieviox.promptpipe

import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.WebExtension
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

// The site pages: one browser session each, its page script's port, and its state reported to the
// screen as `page_changed`. A page Android stopped or that crashed is reopened and reloaded (R3).
class Page(val id: String, var provider: JSONObject) {
    lateinit var session: GeckoSession
    var port: WebExtension.Port? = null
    var url = ""
    var title = ""
    var status = "loading"
    var hello = CompletableFuture<JSONObject>()
    // Done once the page's scripts are handed over; a new one at every load of the page.
    @Volatile var scripts = CompletableFuture<Unit>()
    val waiting = ConcurrentHashMap<String, CompletableFuture<JSONObject>>()
    // Listed a moment before its session starts (on the main thread).
    val started get() = ::session.isInitialized

    fun json(): JSONObject = JSONObject().put("id", id).put("provider", provider.optString("id"))
        .put("url", url).put("title", title).put("status", status)
}

class Pages(private val app: App) {
    val pages = ConcurrentHashMap<String, Page>()
    var popup: GeckoSession? = null

    init {
        app.port.handlers.apply {
            put("page_open") { d -> page_open(d.optString("url"), d.optJSONObject("provider") ?: JSONObject()) }
            put("page_close") { d -> page_close(d.optString("page")) }
            put("page_navigate") { d -> page_navigate(d.optString("page"), d.optString("to"), d.optBoolean("wait")) }
            put("view_set") { d -> app.main_run { Screen.activity?.view_set(pages[d.optString("page")], d.optJSONObject("region")) }; null }
        }
    }

    private fun page_get(id: String) = pages[id] ?: throw Refusal("not_found", "there is no site page $id")

    fun page_open(url: String, provider: JSONObject): JSONObject {
        val page = Page(UUID.randomUUID().toString().take(8), provider)
        pages[page.id] = page
        app.main_run { session_start(page) }
        page_load(page, url.ifEmpty { provider.optString("url") })
        return page.json()
    }

    private fun session_start(page: Page) {
        page.session = GeckoSession().apply {
            navigationDelegate = navigation_build(page)
            contentDelegate = object : GeckoSession.ContentDelegate {
                override fun onTitleChange(session: GeckoSession, title: String?) {
                    page.title = title ?: ""
                    changed_send(page)
                }
                override fun onCrash(session: GeckoSession) = app.workers.execute { page_start(page, "crashed") }
                override fun onKill(session: GeckoSession) = app.workers.execute { page_start(page, "was stopped by Android") }
            }
            open(app.runtime)
            setActive(true)
        }
        app.port.session_listen(page.session, { m, p -> page_message(page, m, p) }, { page_lost(page) })
        Screen.activity?.views_attach()
    }

    // Load a url and hand the page its provider and content scripts once its page script says hello.
    private fun page_load(page: Page, url: String) {
        page.hello = CompletableFuture()
        page.status = "loading"
        app.main.post { page.session.loadUri(url) }
        try {
            page.hello.get(45, TimeUnit.SECONDS)
        } catch (e: Exception) {
            page.status = "failed"
            changed_send(page, "the page did not finish loading: $url")
            throw Refusal("unavailable", "the page did not finish loading: $url")
        }
        scripts_hand(page)
    }

    // The page's scripts (the default routine, then the provider's own): at the first load and
    // again whenever the page loads anew (a reload, the site's own navigation, a crash), since a
    // new page starts with none.
    private fun scripts_hand(page: Page) {
        try {
            call_send(page, "script_run", JSONObject().put("provider", page.provider), 30_000)
            page.scripts.complete(Unit)
        } catch (e: Refusal) {
            page.scripts.completeExceptionally(e)
            throw e
        }
    }

    private fun page_message(page: Page, m: JSONObject, port: WebExtension.Port) {
        when (m.optString("type")) {
            "hello" -> {
                val again = page.hello.isDone
                page.port = port
                page.url = m.optString("url")
                page.title = m.optString("title")
                page.status = "ready"
                if (again || page.scripts.isDone) page.scripts = CompletableFuture()
                page.hello.complete(m)
                changed_send(page)
                if (again) app.workers.execute {
                    try {
                        scripts_hand(page)
                    } catch (e: Refusal) {
                        changed_send(page, "the page reloaded and its scripts couldn't be handed over: ${e.message}")
                    }
                }
            }
            "reply" -> page.waiting.remove(m.optString("id"))?.complete(m)
            "event" -> {
                val data = (m.optJSONObject("data") ?: JSONObject()).put("page", page.id)
                if (m.optString("name") == "page_changed") {
                    page.url = data.optString("url", page.url)
                    if (data.has("ready")) page.status = if (data.optBoolean("ready")) "ready" else "loading"
                    changed_send(page)
                } else app.port.event_send(m.optString("name"), data)
            }
        }
    }

    private fun page_lost(page: Page) {
        page.port = null
        page.waiting.values.forEach { it.completeExceptionally(Refusal("unavailable", "the AI page reloaded")) }
        page.waiting.clear()
    }

    private fun call_send(page: Page, name: String, data: JSONObject, timeout: Long): JSONObject {
        val port = page.port ?: throw Refusal("unavailable", "the AI page is not connected (still loading?)")
        val id = UUID.randomUUID().toString()
        val done = CompletableFuture<JSONObject>().also { page.waiting[id] = it }
        app.main.post { port.postMessage(JSONObject().put("type", "call").put("name", name).put("data", data).put("id", id)) }
        val reply = try {
            done.get(timeout, TimeUnit.MILLISECONDS)
        } catch (e: java.util.concurrent.TimeoutException) {
            throw Refusal("deadline_exceeded", "the AI page did not answer in time")
        } catch (e: java.util.concurrent.ExecutionException) {
            throw (e.cause as? Refusal) ?: Refusal("unavailable", e.cause?.message ?: "the AI page failed")
        } finally {
            page.waiting.remove(id)
        }
        reply.optJSONObject("error")?.let { throw Refusal(it.optString("code", "internal"), it.optString("message")) }
        return reply.optJSONObject("data") ?: JSONObject()
    }

    // A `site_*` call from the application to the page it names. A send may wait as long as its
    // limits allow (a week without one).
    fun call_forward(name: String, data: JSONObject): Any? {
        val page = page_get(data.optString("page"))
        val total = data.optJSONObject("limits")?.optDouble("total_min", 0.0) ?: 0.0
        val timeout = if (name == "site_send" && total == 0.0) 7 * 86_400_000L else if (total > 0) (total * 60_000).toLong() + 60_000 else 120_000L
        // A page that just reloaded gets its scripts back first.
        try {
            page.scripts.get(30, TimeUnit.SECONDS)
        } catch (e: Exception) {
            throw Refusal("unavailable", "the AI page reloaded and isn't ready again yet; try again in a moment")
        }
        if (name == "site_send" || name == "site_model_set") page.status = "busy"
        try {
            val r = call_send(page, name, data, timeout)
            return if (r.has("list")) r.getJSONArray("list") else r
        } finally {
            if (page.status == "busy") page.status = "ready"
            changed_send(page)
        }
    }

    fun page_close(id: String): Any? {
        val page = pages.remove(id) ?: return null
        page_lost(page)
        page.status = "closed"
        changed_send(page)
        app.main_run {
            page.session.close()
            Screen.activity?.views_attach()
        }
        return null
    }

    // `wait`: an address loaded and the page ready again, its scripts handed over, before this
    // returns (a send moving the page to its chat's conversation first).
    fun page_navigate(id: String, to: String, wait: Boolean = false): Any? {
        val page = page_get(id)
        if (wait && to != "back" && to != "reload") {
            page_load(page, to)
            changed_send(page)
            return null
        }
        app.main_run {
            when (to) {
                "back" -> page.session.goBack()
                "reload" -> if (page.session.isOpen) page.session.reload() else app.workers.execute { page_start(page, "") }
                else -> page.session.loadUri(to)
            }
        }
        return null
    }

    // Reopen a page whose engine is gone and load it again (R3).
    fun page_start(page: Page, why: String) {
        app.main_run {
            if (page.session.isOpen) page.session.close()
            session_start(page)
        }
        try {
            page_load(page, page.url.ifEmpty { page.provider.optString("url") })
            if (why.isNotEmpty()) changed_send(page, "AI page $why and was reloaded")
        } catch (e: Refusal) {
            changed_send(page, e.message)
        }
    }

    // Coming back to the app: reopen any page whose engine is gone.
    fun revive() = pages.values.filter { it.started && !it.session.isOpen }.forEach { p -> app.workers.execute { page_start(p, "was stopped by Android") } }

    fun changed_send(page: Page, error: String? = null) {
        val data = page.json().put("page", page.id).put("popup", popup != null)
        if (error != null) data.put("error", JSONObject().put("code", "unavailable").put("message", error))
        app.port.event_send("page_changed", data)
    }

    // Links on the screen open in the phone's browser; a site's sign-in pop-up gets its own view
    // over the site and closes when the site closes it, or with Back (#244).
    private fun navigation_build(page: Page) = object : GeckoSession.NavigationDelegate {
        override fun onLocationChange(session: GeckoSession, url: String?, perms: MutableList<GeckoSession.PermissionDelegate.ContentPermission>, user: Boolean) {
            page.url = url ?: page.url
            changed_send(page)
        }
        override fun onNewSession(session: GeckoSession, uri: String): GeckoResult<GeckoSession> {
            val popup_session = GeckoSession()
            popup_session.contentDelegate = object : GeckoSession.ContentDelegate {
                override fun onCloseRequest(session: GeckoSession) = popup_close()
            }
            popup = popup_session
            Screen.activity?.popup_show(popup_session)
            changed_send(page)
            return GeckoResult.fromValue(popup_session)
        }
    }

    fun popup_close() {
        val session = popup ?: return
        popup = null
        app.main.post {
            Screen.activity?.popup_show(null)
            session.close()
        }
        pages.values.firstOrNull()?.let { changed_send(it) }
    }

    fun list(): JSONArray = JSONArray().also { a -> pages.values.forEach { a.put(it.json()) } }

    companion object {
        fun load_allowed(uri: String, base: String): Boolean =
            uri.startsWith(base) || uri.startsWith("about:") || uri.startsWith("data:")
    }
}
