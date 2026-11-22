package dev.zieviox.promptpipe

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import org.json.JSONArray
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import java.net.URLEncoder
import kotlin.concurrent.thread

// The screen's session lives as long as the app; the activity only shows it.
object Screen {
    var activity: MainActivity? = null
    val session: GeckoSession by lazy { screen_session_build() }

    private fun screen_session_build() = GeckoSession().apply {
        val app = App.app
        navigationDelegate = object : GeckoSession.NavigationDelegate {
            // Links on the screen open in the phone's browser, never inside the app.
            override fun onLoadRequest(session: GeckoSession, request: GeckoSession.NavigationDelegate.LoadRequest): GeckoResult<AllowOrDeny> {
                // Decided at once: GeckoView calls this on the main thread, where waiting isn't allowed.
                val allowed = Pages.load_allowed(request.uri, app.core.base)
                if (!allowed) app.main.post { activity?.url_open(request.uri) }
                return GeckoResult.fromValue(if (allowed) AllowOrDeny.ALLOW else AllowOrDeny.DENY)
            }
        }
        contentDelegate = object : GeckoSession.ContentDelegate {
            override fun onCrash(session: GeckoSession) = screen_restart()
            override fun onKill(session: GeckoSession) = screen_restart()
        }
        open(app.runtime)
        setActive(true)
        app.port.screen_listen(this)
    }

    private fun screen_restart() {
        if (session.isOpen) session.close()
        session.open(App.app.runtime)
        open("")
    }

    // "Starting…" until the core answers its challenge, then the screen with the key (R8).
    fun open(query: String) = thread(isDaemon = true) {
        val app = App.app
        app.main.post { session.loadUri(page_build("Starting promptpipe…", "")) }
        for (i in 0 until 150) {
            if (app.core.verify()) {
                app.main.post { session.loadUri("${app.core.base}/open?key=${app.core.key}$query") }
                return@thread
            }
            Thread.sleep(200)
        }
        val why = app.core.problem.ifEmpty { "the core didn't answer within 30 seconds" }
        app.main.post { session.loadUri(page_build("promptpipe couldn't start: $why", app.core.last_log())) }
    }

    private fun page_build(title: String, detail: String): String {
        fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;")
        val retry = if (detail.isEmpty()) "" else "<pre>${esc(detail)}</pre><p><a href='${App.app.core.base}/open?key=${App.app.core.key}'>Try again</a></p>"
        val html = "<meta name=viewport content='width=device-width'><body style='background:#17181d;color:#ece9e4;font:16px system-ui;padding:24px'><p>${esc(title)}</p>$retry"
        return "data:text/html;charset=utf-8," + URLEncoder.encode(html, "UTF-8").replace("+", "%20")
    }
}

class MainActivity : Activity() {
    private val app get() = App.app
    private lateinit var root: FrameLayout
    private lateinit var screen_view: GeckoView
    private val page_views = mutableMapOf<String, GeckoView>()
    private var popup_view: GeckoView? = null
    private var shown: Page? = null
    private var region: JSONObject? = null

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.setDecorFitsSystemWindows(false)
        root = FrameLayout(this)
        screen_view = GeckoView(this).apply { setSession(Screen.session) }
        root.addView(screen_view, FrameLayout.LayoutParams(-1, -1))
        root.setOnApplyWindowInsetsListener { view, insets -> insets_set(view, insets) }
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> place() }
        setContentView(root)
        Screen.activity = this
        if (state == null) Screen.open("")
        views_attach()
        startForegroundService(Intent(this, KeepAlive::class.java))
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        intent_parse(intent)
    }

    override fun onDestroy() {
        if (Screen.activity === this) Screen.activity = null
        screen_view.releaseSession()
        page_views.values.forEach { it.releaseSession() }
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        app.pages.revive()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent_parse(intent)
    }

    // Keep the screen and the pages clear of the bars, the cutout and the keyboard (R7).
    private fun insets_set(view: View, insets: WindowInsets): WindowInsets {
        val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
        view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
        return WindowInsets.CONSUMED
    }

    // One view per page, each on its own surface; called when pages open or close.
    fun views_attach() {
        for (page in app.pages.pages.values) if (page.id !in page_views) {
            val view = GeckoView(this).apply { setSession(page.session) }
            page_views[page.id] = view
            root.addView(view, FrameLayout.LayoutParams(-1, -1))
        }
        for (id in page_views.keys.toList()) if (!app.pages.pages.containsKey(id)) {
            page_views.remove(id)?.let { it.releaseSession(); root.removeView(it) }
        }
        place()
    }

    // Show a page in the region the screen names (fractions of the screen); every other page moves
    // off screen at its real size so it keeps running and its replies can be read (R3, #236).
    // Focus moves only when the site view opens or closes, or another page is picked (#240).
    fun view_set(page: Page?, region: JSONObject?) {
        val moved = page?.id != shown?.id
        shown = page
        this.region = region
        place()
        if (moved) (page?.let { page_views[it.id] } ?: screen_view).requestFocus()
    }

    private fun place() {
        val w = root.width - root.paddingLeft - root.paddingRight
        val h = root.height - root.paddingTop - root.paddingBottom
        val r = region
        for ((id, view) in page_views) {
            val params = view.layoutParams as FrameLayout.LayoutParams
            if (id == shown?.id && r != null) {
                params.leftMargin = (r.optDouble("l") * w).toInt()
                params.topMargin = (r.optDouble("t") * h).toInt()
                params.width = ((r.optDouble("r") - r.optDouble("l")) * w).toInt()
                params.height = ((r.optDouble("b") - r.optDouble("t")) * h).toInt()
                view.translationX = 0f
            } else {
                params.leftMargin = 0
                params.topMargin = 0
                params.width = w
                params.height = h
                view.translationX = OFF_SCREEN
            }
            view.layoutParams = params
        }
    }

    fun popup_show(session: GeckoSession?) {
        popup_view?.let { it.releaseSession(); root.removeView(it) }
        popup_view = session?.let { s ->
            s.open(app.runtime)
            GeckoView(this).apply { setSession(s); root.addView(this, FrameLayout.LayoutParams(-1, -1)) }
        }
    }

    // Back closes what is on top (R5): a pop-up, else what the screen has open, else to the
    // background. Alt+S (the site view) goes to the screen too, even while a page has the focus.
    @Deprecated("Back is handled here for the stacked views")
    override fun onBackPressed() {
        if (app.pages.popup != null) return app.pages.popup_close()
        thread {
            val handled = app.port.screen_call("back_pressed")?.optBoolean("handled") ?: false
            if (!handled) app.main.post { moveTaskToBack(true) }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.isAltPressed && event.keyCode == KeyEvent.KEYCODE_S) {
            thread { app.port.screen_call("back_pressed", JSONObject().put("key", "Alt+S")) }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    // Text or files shared from another app, or text sent from the selection menu (UC14, UC48).
    private fun intent_parse(intent: Intent?) {
        val data = JSONObject()
        when (intent?.action) {
            Intent.ACTION_PROCESS_TEXT -> data.put("text", intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString())
            Intent.ACTION_SEND -> {
                intent.getStringExtra(Intent.EXTRA_TEXT)?.let { data.put("text", it) }
                @Suppress("DEPRECATION")
                (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { data.put("files", JSONArray().put(file_read(it))) }
            }
            else -> return
        }
        thread { Thread.sleep(500); app.port.event_send("share_received", data) }
    }

    fun file_read(uri: Uri): JSONObject {
        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0)
        return JSONObject().put("name", uri.lastPathSegment ?: "file").put("mime_type", contentResolver.getType(uri) ?: "")
            .put("size", bytes.size).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
    }

    fun url_open(url: String) = try {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (e: Exception) {
    }

    @Deprecated("The picker answers here")
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        if (request != PICK) return
        val uris = mutableListOf<Uri>()
        data?.data?.let { uris.add(it) }
        data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri) }
        thread { Services.picked.complete(JSONArray().also { a -> uris.forEach { a.put(file_read(it)) } }) }
    }

    companion object {
        const val OFF_SCREEN = 100_000f
        const val PICK = 7
    }
}
