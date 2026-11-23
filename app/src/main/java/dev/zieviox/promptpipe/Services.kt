package dev.zieviox.promptpipe

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.view.WindowInsetsController
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

// The phone's services, each a few lines around Android: the clipboard, sharing and saving files,
// the file picker, links, a short tick, the bars' colours, how selections reach the keyboard, all-files access, and the app itself.
class Services(private val app: App) {
    private val activity get() = Screen.activity ?: throw Refusal("unavailable", "the app isn't on screen")

    init {
        app.port.handlers.apply {
            put("clipboard_write") { d -> clipboard().setPrimaryClip(ClipData.newPlainText("promptpipe", d.optString("text"))); null }
            put("clipboard_read") { _ -> clipboard().primaryClip?.getItemAt(0)?.coerceToText(app)?.toString() ?: "" }
            put("content_export") { d -> content_export(d) }
            put("picker_open") { d -> picker_open(d) }
            put("url_open") { d -> app.main_run { activity.url_open(d.getString("url")) }; null }
            put("vibration_start") { _ -> vibration_start(); null }
            put("bars_set") { d -> app.main_run { bars_set(d) }; null }
            put("keyboard_set") { d -> Keyboard.ordered = d.optBoolean("ordered", true); null }
            put("storage_access_open") { _ -> app.main_run { access_open() }; null }
            put("app_get") { _ -> app_get() }
            put("app_start") { d -> Screen.open(if (d.optString("mode") == "safe") "&safe=1" else ""); null }
            put("app_close") { _ -> app.main_run { activity.moveTaskToBack(true) }; null }
            put("service_stop") { _ -> app.startService(Intent(app, KeepAlive::class.java).setAction(KeepAlive.STOP)); null }
        }
    }

    private fun clipboard() = app.main_run { app.getSystemService(ClipboardManager::class.java) }

    // Share text, or save a file to the app folder's export/ (reachable from other apps).
    private fun content_export(d: JSONObject): Any? {
        if (d.optString("to") == "share") {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, d.optString("text"))
            app.main_run { activity.startActivity(Intent.createChooser(send, null)) }
            return null
        }
        val file = File(app.core.app_dir, "export/${File(d.getString("name")).name}").apply { parentFile?.mkdirs() }
        file.writeText(d.optString("text"))
        return file.path
    }

    private fun picker_open(d: JSONObject): Any {
        picked = CompletableFuture()
        val types = d.optJSONArray("types")?.let { a -> Array(a.length()) { a.getString(it) } } ?: arrayOf("*/*")
        val pick = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(Intent.EXTRA_MIME_TYPES, types).putExtra(Intent.EXTRA_ALLOW_MULTIPLE, d.optBoolean("many"))
        @Suppress("DEPRECATION")
        app.main_run { activity.startActivityForResult(pick, MainActivity.PICK) }
        return picked.get(10, TimeUnit.MINUTES)
    }

    private fun vibration_start() {
        val vibrator = app.getSystemService(Vibrator::class.java) ?: return
        if (vibrator.hasVibrator()) vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
    }

    // The colour behind the pages and light or dark bar icons, from the screen's theme (UC34).
    private fun bars_set(d: JSONObject) {
        val a = Screen.activity ?: return
        a.window.decorView.setBackgroundColor(Color.parseColor(d.optString("background", "#17181d")))
        val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
        a.window.insetsController?.setSystemBarsAppearance(if (d.optBoolean("dark", true)) 0 else light, light)
    }

    private fun access_open() {
        val uri = Uri.parse("package:${app.packageName}")
        activity.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, uri))
    }

    private fun app_get(): Any {
        val info = app.packageManager.getPackageInfo(app.packageName, 0)
        return JSONObject().put("version", info.versionName).put("platform", "android")
            .put("calls", JSONArray(app.port.handlers.keys().toList() + SITE_CALLS))
            .put("app_folder", app.core.app_dir.path).put("port", App.PORT)
            .put("all_files", android.os.Environment.isExternalStorageManager())
            .put("device", Build.MODEL)
            .put("free_bytes", android.os.StatFs(android.os.Environment.getExternalStorageDirectory().path).availableBytes)
    }

    companion object {
        var picked = CompletableFuture<JSONArray>()
        val SITE_CALLS = listOf("site_send", "site_stop", "site_read", "site_model_list", "site_model_set", "site_chat_list", "site_report_build")
    }
}
