package dev.zieviox.promptpipe

import android.os.Environment
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.concurrent.thread

// Starts the core (the Odin program packed as libppcore.so) and keeps it running: it waits for
// storage after a reboot (R1), makes a new key for every start, checks the core is its own with a
// challenge that never sends the key (S2), and starts it again when it stops (R8).
class Core(private val app: App) {
    val key: String = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    @Volatile var problem = ""
    val base = "http://127.0.0.1:${App.PORT}"

    // The app folder: Documents/PromptPipe on shared storage once all-files access is allowed,
    // else the app's own external folder (the old app's /sdcard/PromptPipe is only imported, X5).
    val app_dir: File
        get() = if (Environment.isExternalStorageManager()) {
            File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS), "PromptPipe")
        } else {
            File(app.getExternalFilesDir(null), "Documents/PromptPipe")
        }
    val log_file: File get() = File(app_dir, "logs/core.log")
    private val assets_dir: File get() = File(app.filesDir, "app-files")

    fun start() = thread(name = "core", isDaemon = true) {
        while (Environment.getExternalStorageState() != Environment.MEDIA_MOUNTED) Thread.sleep(500)
        try {
            assets_copy()
        } catch (e: Exception) {
            problem = "preparing the app's files failed: ${e.message}"
        }
        var wait = 1000L
        while (true) {
            val started = System.currentTimeMillis()
            try {
                run()
            } catch (e: Exception) {
                problem = "the core failed to start: ${e.message}"
                Log.e(TAG, problem, e)
            }
            wait = if (System.currentTimeMillis() - started > 60_000) 1000L else (wait * 2).coerceAtMost(30_000)
            Thread.sleep(wait)
        }
    }

    private fun run() {
        val bin = File(app.applicationInfo.nativeLibraryDir, "libppcore.so")
        app_dir.mkdirs()
        log_file.parentFile?.mkdirs()
        if (log_file.length() > 512 * 1024) log_file.delete()
        val process = ProcessBuilder(
            bin.path, "--app", app_dir.path, "--private", app.filesDir.path,
            "--assets", assets_dir.path, "--port", App.PORT.toString(),
        ).redirectErrorStream(true).apply { environment()["PP_KEY"] = key }.start()
        process.inputStream.bufferedReader().forEachLine { line ->
            log_file.appendText(line + "\n")
        }
        process.waitFor()
    }

    // The APK's screen, docs and built-in plugins, copied out once per installed version so the
    // core can serve them.
    private fun assets_copy() {
        val info = app.packageManager.getPackageInfo(app.packageName, 0)
        val stamp = File(assets_dir, ".version")
        val version = "${info.versionName}-${info.lastUpdateTime}"
        if (stamp.exists() && stamp.readText() == version) return
        assets_dir.deleteRecursively()
        fun copy(path: String) {
            val names = app.assets.list(path) ?: emptyArray()
            if (names.isEmpty()) {
                val out = File(assets_dir, path).apply { parentFile?.mkdirs() }
                app.assets.open(path).use { input -> out.outputStream().use { input.copyTo(it) } }
            } else names.forEach { copy(if (path.isEmpty()) it else "$path/$it") }
        }
        listOf("ui", "docs", "plugins").forEach { copy(it) }
        stamp.writeText(version)
    }

    // True when the core answers our nonce with HMAC-SHA256 under our key (S2).
    fun verify(): Boolean = try {
        val nonce = ByteArray(16).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
        val connection = URL("$base/challenge?nonce=$nonce").openConnection() as HttpURLConnection
        connection.connectTimeout = 1000
        val answer = connection.inputStream.bufferedReader().readText()
        val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key.toByteArray(), "HmacSHA256")) }
        answer == mac.doFinal(nonce.toByteArray()).joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
        false
    }

    fun last_log(): String = try {
        log_file.readLines().takeLast(20).joinToString("\n")
    } catch (e: Exception) {
        ""
    }

    companion object { const val TAG = "promptpipe" }
}
