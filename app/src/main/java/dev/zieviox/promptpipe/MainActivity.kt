package dev.zieviox.promptpipe

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.widget.FrameLayout
import org.json.JSONObject
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

// A thin host: the chat UI fills the screen and draws everything you see,
// including the site view (its header, tabs and address bar). When the UI shows
// the site view it says where the page goes (the "hole", as fractions of the
// screen) and the site page is placed there, over the UI. Back, Alt+S and login
// popups tell the UI (event "siteView"), so it stays the one place that decides.
class MainActivity : Activity(), Hub.Screen {
    private val app get() = application as App
    private lateinit var uiView: GeckoView
    // What shows behind the pages; its colour follows the app's theme ("theme" action).
    private lateinit var rootView: FrameLayout
    // One view per site page, stacked; the shown one is on top.
    private lateinit var siteStack: FrameLayout
    private val siteViews = ArrayList<GeckoView>()
    private var shown = 0
    private var siteShown = false
    // Where the UI leaves room for the page: left, top, right, bottom as fractions.
    private var hole = doubleArrayOf(0.0, 0.0, 1.0, 1.0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        rootView = root
        uiView = GeckoView(this)
        // Hidden pages stay laid out at their real size, just moved off screen: a page with no
        // size (a GONE view) gets no room to draw, and sites with virtual lists (DeepSeek) then
        // take their messages off the page, so a finished reply can't be read.
        siteStack = FrameLayout(this).apply { translationX = OFF_SCREEN }
        root.addView(uiView)
        root.addView(siteStack, FrameLayout.LayoutParams(-1, -1))
        // The keyboard or a turn of the phone changes the size: keep the page in its hole.
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> placeSite() }
        root.setBackgroundColor(Color.rgb(11, 12, 15))
        // Android draws apps edge to edge: keep both pages clear of the status
        // bar, the navigation bar and the keyboard.
        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(b.left, b.top, b.right, b.bottom)
                WindowInsets.CONSUMED
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                @Suppress("DEPRECATION")
                insets.consumeSystemWindowInsets()
            }
        }
        setContentView(root)

        app.hub.screen = this
        uiView.setSession(app.hub.uiSession)
        pagesChanged()

        startForegroundService(Intent(this, KeepAlive::class.java))
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        handleShare(intent)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_PLUGIN) return
        val uri = data?.data ?: return
        val hub = app.hub
        Thread {
            try {
                val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: throw java.io.IOException("can't read the file")
                val body = JSONObject().put("name", uri.lastPathSegment ?: "file").put("base64", android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP))
                val id = app.core.call("POST", "/api/plugins/install", body, 60_000).getString("id")
                // A bundle announces itself (the core emits pluginBundle).
                if (!id.startsWith("bundle:")) hub.emit(JSONObject().put("type", "pluginInstalled").put("id", id))
            } catch (e: Exception) {
                hub.emit(JSONObject().put("type", "error").put("text", "Install failed: ${e.message}"))
            }
        }.start()
    }

    override fun onResume() {
        super.onResume()
        app.hub.revive()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShare(intent)
    }

    override fun onDestroy() {
        if (app.hub.screen === this) app.hub.screen = null
        uiView.releaseSession()
        siteViews.forEach { it.releaseSession() }
        super.onDestroy()
    }

    // A short tick when a reply arrives.
    @Suppress("DEPRECATION")
    private fun haptic() {
        try {
            val v = getSystemService(Vibrator::class.java) ?: return
            if (!v.hasVibrator()) return
            v.vibrate(
                if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                else VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } catch (e: Exception) {}
    }

    // Text shared from another app (Share menu or the text selection menu).
    private fun handleShare(intent: Intent?) {
        val text = when (intent?.action) {
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)
            Intent.ACTION_PROCESS_TEXT -> intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
            else -> null
        } ?: return
        app.hub.emit(JSONObject().put("type", "share").put("text", text))
    }

    override fun showSite(show: Boolean) {
        val changed = siteShown != show
        siteShown = show
        siteStack.translationX = if (show) 0f else OFF_SCREEN
        if (changed) app.hub.emit(JSONObject().put("type", "siteView").put("show", show))
        // Keep every page running even when hidden.
        app.hub.pages.forEach { it.session.setActive(true) }
        app.hub.uiSession.setActive(true)
        (if (show) siteViews.getOrNull(shown) ?: uiView else uiView).requestFocus()
    }

    // Put the page stack in the hole the UI left for it.
    private fun placeSite() {
        val w = rootView.width - rootView.paddingLeft - rootView.paddingRight
        val h = rootView.height - rootView.paddingTop - rootView.paddingBottom
        if (w <= 0 || h <= 0) return
        val lp = siteStack.layoutParams as FrameLayout.LayoutParams
        val l = (hole[0] * w).toInt()
        val t = (hole[1] * h).toInt()
        val nw = ((hole[2] - hole[0]) * w).toInt().coerceAtLeast(1)
        val nh = ((hole[3] - hole[1]) * h).toInt().coerceAtLeast(1)
        if (lp.leftMargin == l && lp.topMargin == t && lp.width == nw && lp.height == nh) return
        lp.leftMargin = l
        lp.topMargin = t
        lp.width = nw
        lp.height = nh
        siteStack.post { siteStack.layoutParams = lp }
    }

    // {"hole": {"l":…, "t":…, "r":…, "b":…}} from the UI, fractions of its screen.
    private fun takeHole(data: JSONObject) {
        val o = data.optJSONObject("hole") ?: return
        hole = doubleArrayOf(o.optDouble("l", 0.0), o.optDouble("t", 0.0), o.optDouble("r", 1.0), o.optDouble("b", 1.0))
        placeSite()
    }

    // Bring site page i to the front (the others keep running under it).
    private fun showPage(i: Int) {
        shown = i.coerceIn(0, siteViews.size - 1)
        siteViews[shown].bringToFront()
        if (siteShown) siteViews[shown].requestFocus()
        app.hub.emit(JSONObject().put("type", "shown").put("page", shown))
    }

    private fun sessionFor(i: Int) = if (i == shown && app.hub.popup != null) app.hub.popup!! else app.hub.pages[i].session

    // One view per page; called at start and when the page count changes.
    override fun pagesChanged() {
        val n = app.hub.pages.size
        while (siteViews.size > n) siteViews.removeAt(siteViews.size - 1).also { it.releaseSession(); siteStack.removeView(it) }
        while (siteViews.size < n) siteViews.add(GeckoView(this).also { siteStack.addView(it, 0, FrameLayout.LayoutParams(-1, -1)) })
        if (shown >= n) shown = 0
        for (i in 0 until n) if (siteViews[i].session !== sessionFor(i)) {
            siteViews[i].releaseSession()
            siteViews[i].setSession(sessionFor(i))
        }
        showPage(shown)
    }

    override fun reattach() {
        uiView.releaseSession()
        uiView.setSession(app.hub.uiSession)
        for (i in siteViews.indices) {
            siteViews[i].releaseSession()
            siteViews[i].setSession(sessionFor(i))
        }
    }

    override fun showPopup(session: GeckoSession?) {
        val v = siteViews.getOrNull(shown) ?: return
        v.releaseSession()
        v.setSession(session ?: app.hub.pages[shown].session)
        if (session != null) showSite(true)
    }

    // Dark or light system bar icons on Android 10 (newer ones use insetsController).
    @Suppress("DEPRECATION")
    private fun legacyBars(dark: Boolean) {
        window.decorView.systemUiVisibility =
            if (dark) 0 else (View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR)
    }

    override fun runAction(action: String, data: JSONObject) {
        when (action) {
            "site" -> {
                takeHole(data)
                if (data.has("page")) showPage(data.optInt("page"))
                showSite(true)
            }
            "siteHole" -> takeHole(data)
            "chat" -> showSite(false)
            "reload" -> app.hub.reloadPage(data.optInt("page", shown))
            "openUrl" -> try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(data.getString("url"))))
            } catch (e: Exception) {}
            "grantFiles" -> try {
                if (Build.VERSION.SDK_INT >= 30) {
                    startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
                } else {
                    requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), 2)
                }
            } catch (e: Exception) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
            "background" -> moveTaskToBack(true)
            "stopService" -> startService(Intent(this, KeepAlive::class.java).setAction(KeepAlive.ACTION_STOP))
            "haptic" -> haptic()
            "theme" -> try {
                // The page's background colour and whether it is dark, from the chat UI.
                val bg = Color.parseColor(data.optString("bg", "#1b1a1f"))
                val dark = data.optBoolean("dark", true)
                rootView.setBackgroundColor(bg)
                if (Build.VERSION.SDK_INT >= 30) {
                    val light = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                    window.insetsController?.setSystemBarsAppearance(if (dark) 0 else light, light)
                } else {
                    legacyBars(dark)
                }
            } catch (e: Exception) {}
            "pickPlugin" -> startActivityForResult(
                Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),
                PICK_PLUGIN,
            )
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.isAltPressed && event.keyCode == KeyEvent.KEYCODE_S) {
            // Hiding is done here; showing is the UI's (it draws the site view first).
            if (siteShown) showSite(false) else app.hub.emit(JSONObject().put("type", "siteKey"))
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Deprecated("Back handling for the two stacked pages")
    override fun onBackPressed() {
        when {
            app.hub.popup != null -> app.hub.closePopup()
            siteShown -> showSite(false)
            app.hub.uiCanGoBack -> app.hub.uiSession.goBack()
            else -> moveTaskToBack(true)
        }
    }

    companion object {
        const val PICK_PLUGIN = 7
        // Far enough to the right that no screen shows it.
        const val OFF_SCREEN = 100_000f
    }
}
