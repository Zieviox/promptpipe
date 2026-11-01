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
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView

// Two stacked views: the chat UI, and the AI site (for logging in or checking
// what the page does). Alt+S or the Site button switches; Back returns to chat.
class MainActivity : Activity(), Hub.Screen {
    private val app get() = application as App
    private lateinit var uiView: GeckoView
    private lateinit var siteBox: LinearLayout
    // One view per site page, stacked; the shown one is on top.
    private lateinit var siteStack: FrameLayout
    private val siteViews = ArrayList<GeckoView>()
    private var shown = 0
    private lateinit var siteLabel: TextView
    private lateinit var pageButton: Button
    private var siteShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        uiView = GeckoView(this)
        siteStack = FrameLayout(this)
        siteLabel = TextView(this).apply {
            setTextColor(Color.LTGRAY)
            setPadding(16, 0, 16, 0)
            gravity = Gravity.CENTER_VERTICAL
            isSingleLine = true
        }
        val back = Button(this).apply {
            text = "← Chat  (Alt+S)"
            setOnClickListener { showSite(false) }
        }
        val reload = Button(this).apply {
            text = "Reload"
            setOnClickListener { app.hub.reloadAll(shown) }
        }
        // With several site pages: tap to look at the next one.
        pageButton = Button(this).apply {
            setOnClickListener { showPage((shown + 1) % app.hub.pages.size) }
            visibility = View.GONE
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.rgb(18, 22, 31))
            addView(back)
            addView(siteLabel, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
            addView(pageButton)
            addView(reload)
        }
        siteBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bar)
            addView(siteStack, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            visibility = View.GONE
        }
        root.addView(uiView)
        root.addView(siteBox)
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
                val id = app.store.installFile(uri.lastPathSegment ?: "file", bytes) {}
                hub.emit(JSONObject().put("type", "pluginInstalled").put("id", id))
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
        siteShown = show
        siteBox.visibility = if (show) View.VISIBLE else View.GONE
        updateBar()
        // Keep every page running even when hidden.
        app.hub.pages.forEach { it.session.setActive(true) }
        app.hub.uiSession.setActive(true)
        (if (show) siteViews.getOrNull(shown) ?: uiView else uiView).requestFocus()
    }

    private fun updateBar() {
        val n = app.hub.pages.size
        siteLabel.text = (app.hub.pages.getOrNull(shown) ?: app.hub.pages[0]).info.optString("url")
        pageButton.text = "Page ${shown + 1}/$n"
        pageButton.visibility = if (n > 1) View.VISIBLE else View.GONE
    }

    // Bring site page i to the front (the others keep running under it).
    private fun showPage(i: Int) {
        shown = i.coerceIn(0, siteViews.size - 1)
        siteViews[shown].bringToFront()
        updateBar()
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

    override fun runAction(action: String, data: JSONObject) {
        when (action) {
            "site" -> {
                if (data.has("page")) showPage(data.optInt("page"))
                showSite(true)
            }
            "chat" -> showSite(false)
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
            "pickPlugin" -> startActivityForResult(
                Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE),
                PICK_PLUGIN,
            )
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.isAltPressed && event.keyCode == KeyEvent.KEYCODE_S) {
            showSite(!siteShown)
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
    }
}
