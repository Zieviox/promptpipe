package dev.zieviox.promptpipe

import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.SecureRandom
import java.util.concurrent.Executors
import kotlin.concurrent.thread

// Starts the portable core (libppcore.so, an Odin program) and talks to it
// over 127.0.0.1 with the security key. A new key is made on every start and
// handed only to the core (environment) and the app screen (/open?key=…).
class Core(private val app: App) {
    val key: String = ByteArray(24).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }
    @Volatile private var proc: Process? = null
    private val sender = Executors.newSingleThreadExecutor() // emits and status, in order

    fun start() {
        val store = app.store
        thread(name = "core", isDaemon = true) {
            // Off the main thread: copying the app files can take a moment after an install.
            store.migrateSecrets()
            val info = app.packageManager.getPackageInfo(app.packageName, 0)
            store.extractAssets("${info.versionName}-${info.lastUpdateTime}") // new on every install
            var backoff = 1000L
            while (true) {
                val started = System.currentTimeMillis()
                try {
                    run(store)
                } catch (e: Exception) {
                    Log.e(App.TAG, "core failed to start", e)
                }
                // It should never stop; if it does, start it again (slower each time it fails fast).
                backoff = if (System.currentTimeMillis() - started > 60_000) 1000L else (backoff * 2).coerceAtMost(30_000)
                Log.w(App.TAG, "core stopped; restarting in ${backoff}ms")
                Thread.sleep(backoff)
            }
        }
    }

    private fun run(store: Store) {
        val bin = File(app.applicationInfo.nativeLibraryDir, "libppcore.so")
        val pb = ProcessBuilder(
            bin.path,
            "--data", store.base.path,
            "--private", store.privateDir.path,
            "--assets", store.appFiles.path,
            "--port", App.PORT.toString(),
        ).redirectErrorStream(true)
        pb.environment()["PP_KEY"] = key
        val p = pb.start()
        proc = p
        p.inputStream.bufferedReader().forEachLine { Log.i(App.TAG, it) }
        val code = p.waitFor()
        Log.w(App.TAG, "core exited with $code")
    }

    // ---------- calls to the core ----------

    fun call(method: String, path: String, body: JSONObject? = null, timeoutMs: Int = 15_000): JSONObject {
        val c = URL("${App.base}$path").openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 3000
        c.readTimeout = timeoutMs
        c.setRequestProperty("X-PP-Key", key)
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val code = c.responseCode
        val text = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
        val o = try { JSONObject(text) } catch (e: Exception) { JSONObject().put("error", text.ifEmpty { "HTTP $code" }) }
        if (code !in 200..299) throw java.io.IOException(o.optString("error", "HTTP $code"))
        return o
    }

    // Events for the app screen (fire and forget, in order).
    fun emit(event: JSONObject) = sender.execute {
        try { call("POST", "/shell/emit", JSONObject().put("event", event)) } catch (e: Exception) { Log.w(App.TAG, "emit: $e") }
    }

    // The site pages as the shell sees them, shown by /api/app.
    fun status() = sender.execute {
        try { call("POST", "/shell/status", JSONObject().put("site", app.hub.siteInfo).put("pages", app.hub.pagesInfo())) } catch (e: Exception) {}
    }

    fun ready(): Boolean = try { call("GET", "/api/app", timeoutMs = 2000); true } catch (e: Exception) { false }
}
