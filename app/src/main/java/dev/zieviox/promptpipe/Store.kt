package dev.zieviox.promptpipe

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import org.json.JSONObject
import java.io.File

// Where the files are. The core reads and writes them; the shell only needs
// the folders (to start the core) and the git token (for the git module).
//   PromptPipe/config.json   profiles and settings
//   PromptPipe/plugins/<id>/ your plugins
//   PromptPipe/history/      chats as Markdown, a git repository
// PromptPipe is /sdcard/PromptPipe once "All files access" is allowed, and the
// app's own folder until then. App-only files (key, secrets, plugin updates,
// the app's own UI and plugins) live in the app's private storage.
class Store(private val ctx: Context) {
    fun hasAllFiles(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    val base: File
        get() = (if (hasAllFiles()) File(Environment.getExternalStorageDirectory(), "PromptPipe")
        else File(ctx.getExternalFilesDir(null), "PromptPipe")).also { it.mkdirs() }
    val history get() = File(base, "history").also { it.mkdirs() }
    val privateDir get() = File(ctx.filesDir, "core").also { it.mkdirs() }
    val appFiles get() = File(ctx.filesDir, "app-files")

    // The core owns secrets.json (owner-only); the git module reads its token here.
    fun secret(key: String): String = try {
        JSONObject(File(privateDir, "secrets.json").readText()).optString(key)
    } catch (e: Exception) {
        ""
    }

    // Secrets from before the core (SharedPreferences) move into its file once.
    fun migrateSecrets() {
        val prefs = ctx.getSharedPreferences("private", Context.MODE_PRIVATE)
        if (prefs.getBoolean("movedToCore", false)) return
        val f = File(privateDir, "secrets.json")
        val o = try { JSONObject(f.readText()) } catch (e: Exception) { JSONObject() }
        for (k in listOf("gitToken", "apiToken")) prefs.getString(k, "")?.takeIf { it.isNotEmpty() }?.let { o.put(k, it) }
        f.writeText(o.toString())
        f.setReadable(false, false); f.setReadable(true, true)
        f.setWritable(false, false); f.setWritable(true, true)
        prefs.edit().putBoolean("movedToCore", true).remove("gitToken").remove("apiToken").apply()
    }

    // The app's own UI, docs and plugins, copied out of the APK so the core can
    // serve them. Copied again whenever the app version changes.
    fun extractAssets(version: String) {
        val marker = File(appFiles, ".version")
        if (marker.isFile && marker.readText() == version) return
        val fresh = File(ctx.filesDir, "app-files.new").also { it.deleteRecursively(); it.mkdirs() }
        for (top in listOf("ui", "docs", "plugins")) copyAssetDir(top, File(fresh, top))
        File(fresh, ".version").writeText(version)
        appFiles.deleteRecursively()
        fresh.renameTo(appFiles)
    }

    private fun copyAssetDir(asset: String, dest: File) {
        dest.mkdirs()
        for (name in ctx.assets.list(asset) ?: emptyArray()) {
            val sub = "$asset/$name"
            val kids = ctx.assets.list(sub)
            if (kids != null && kids.isNotEmpty()) copyAssetDir(sub, File(dest, name))
            else ctx.assets.open(sub).use { i -> File(dest, name).outputStream().use { i.copyTo(it) } }
        }
    }
}
