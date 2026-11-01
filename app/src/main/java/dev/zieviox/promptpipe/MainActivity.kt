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
    private lateinit var siteView: GeckoView
    private lateinit var siteLabel: TextView
    private var siteShown = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        uiView = GeckoView(this)
        siteView = GeckoView(this)
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
            setOnClickListener { app.hub.reloadAll() }
        }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.rgb(18, 22, 31))
            addView(back)
            addView(siteLabel, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 1f))
            addView(reload)
        }
        siteBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(bar)
            addView(siteView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
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
        siteView.setSession(app.hub.popup ?: app.hub.siteSession)

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
        siteView.releaseSession()
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
        siteLabel.text = app.hub.siteInfo.optString("url")
        // Keep both pages running even when hidden.
        app.hub.siteSession.setActive(true)
        app.hub.uiSession.setActive(true)
        (if (show) siteView else uiView).requestFocus()
    }

    override fun reattach() {
        uiView.releaseSession()
        uiView.setSession(app.hub.uiSession)
        siteView.releaseSession()
        siteView.setSession(app.hub.popup ?: app.hub.siteSession)
    }

    override fun showPopup(session: GeckoSession?) {
        siteView.releaseSession()
        siteView.setSession(session ?: app.hub.siteSession)
        if (session != null) showSite(true)
    }

    override fun runAction(action: String, data: JSONObject) {
        when (action) {
            "site" -> showSite(true)
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
