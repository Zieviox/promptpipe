package dev.zieviox.promptpipe

import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.Executors
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.concurrent.thread

// Starts the portable core (libppcore.so, an Odin program) and talks to it
// over 127.0.0.1 with the security key. A new key is made every time the core
// starts and handed only to the core (environment) and the app screen
// (/open?key=…).
//
// Port 7790 is open to every app on the phone: while our core is down, another
// app could take it and pretend to be the core. So nothing is sent to the port
// (not the key, not a call) unless our own core process is running, said it is
// listening, and proved on /hello that it holds this start's key.
class Core(private val app: App) {
    private val random = SecureRandom()
    @Volatile var key: String = newSecret(24)
        private set
    @Volatile private var proc: Process? = null
    // Our core is up and proved itself; `generation` counts those starts.
    @Volatile private var trusted = false
    @Volatile private var generation = 0
    // What went wrong last, for the screen to show (never a silent blank page).
    @Volatile var problem: String = ""
    val logFile get() = File(app.store.base, "logs/core.log")
    private val sender = Executors.newSingleThreadExecutor() // emits and status, in order

    fun start() {
        val store = app.store
        thread(name = "core", isDaemon = true) {
            // Off the main thread: copying the app files can take a moment after an install.
            try {
                store.migrateSecrets()
                val info = app.packageManager.getPackageInfo(app.packageName, 0)
                store.extractAssets("${info.versionName}-${info.lastUpdateTime}") // new on every install
            } catch (e: Exception) {
                log("preparing the app files failed: $e")
                problem = "preparing the app files failed: ${e.message ?: e}"
            }
            var backoff = 1000L
            while (true) {
                val started = System.currentTimeMillis()
                try {
                    run(store)
                } catch (e: Exception) {
                    Log.e(App.TAG, "core failed to start", e)
                    log("core failed to start: $e")
                    problem = "the core failed to start: ${e.message ?: e}"
                }
                // It should never stop; if it does, start it again (slower each time it fails fast).
                backoff = if (System.currentTimeMillis() - started > 60_000) 1000L else (backoff * 2).coerceAtMost(30_000)
                Log.w(App.TAG, "core stopped; restarting in ${backoff}ms")
                Thread.sleep(backoff)
            }
        }
    }

    private fun newSecret(bytes: Int) = ByteArray(bytes).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }

    private fun run(store: Store) {
        trusted = false
        // A key that went to a core that stopped is useless to whoever is on the port now.
        val k = newSecret(24)
        key = k
        val bin = File(app.applicationInfo.nativeLibraryDir, "libppcore.so")
        val pb = ProcessBuilder(
            bin.path,
            "--data", store.base.path,
            "--private", store.privateDir.path,
            "--assets", store.appFiles.path,
            "--port", App.PORT.toString(),
        ).redirectErrorStream(true)
        pb.environment()["PP_KEY"] = k
        logFile.parentFile?.mkdirs()
        if (logFile.length() > 512 * 1024) logFile.delete()
        log("starting ${bin.path} (exists: ${bin.exists()}, runnable: ${bin.canExecute()})")
        val p = pb.start()
        proc = p
        var portTaken = false
        try {
            p.inputStream.bufferedReader().forEachLine {
                Log.i(App.TAG, it)
                log(it)
                if (it.startsWith("core: listening on")) thread(isDaemon = true) { verify(p, k) }
                if (it.startsWith("core: can't listen")) portTaken = true
            }
        } finally {
            trusted = false
        }
        val code = p.waitFor()
        Log.w(App.TAG, "core exited with $code")
        log("core exited with code $code")
        problem = if (portTaken) "another app is using port ${App.PORT}, so promptpipe can't start. Close that app (or restart the phone), then open promptpipe again."
        else "the core stopped (exit code $code)"
        // The screen still holds the old key and would keep calling the port: take it off.
        app.hubOrNull()?.openScreen(if (portTaken) "promptpipe can't start: $problem" else "The core stopped; starting it again…")
    }

    // Our core said it is listening: check that the port really is it.
    private fun verify(p: Process, k: String) {
        repeat(20) {
            if (!p.isAlive || proc !== p) return
            try {
                val nonce = newSecret(16)
                val c = URL("${App.base}/hello?nonce=$nonce").openConnection() as HttpURLConnection
                c.connectTimeout = 2000
                c.readTimeout = 3000
                val got = JSONObject(c.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }).optString("proof")
                if (MessageDigest.isEqual(got.toByteArray(), proof(k, nonce).toByteArray()) && p.isAlive && proc === p && key == k) {
                    generation++
                    trusted = true
                    problem = ""
                    log("core verified on port ${App.PORT}")
                    // Open the screen with this start's key (after a restart it still has the old one).
                    app.hubOrNull()?.openScreen()
                } else {
                    problem = "port ${App.PORT} answers, but not as promptpipe's core: another app may be using it"
                    log(problem)
                }
                return
            } catch (e: Exception) {
                Thread.sleep(250)
            }
        }
        problem = "the core didn't answer on port ${App.PORT}"
        log(problem)
    }

    private fun proof(k: String, nonce: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(k.toByteArray(), "HmacSHA256"))
        return mac.doFinal("ppcore-proof:$nonce".toByteArray()).joinToString("") { "%02x".format(it) }
    }

    // Still our verified core: before a call goes out, and again before its answer is used.
    private fun stillTrusted(gen: Int) = trusted && generation == gen && proc?.isAlive == true

    // The core's output also goes to PromptPipe/logs/core.log, readable from a file manager or Termux.
    @Synchronized fun log(line: String) {
        try { logFile.appendText("${java.time.LocalTime.now().withNano(0)} $line\n") } catch (e: Exception) {}
    }

    fun lastLog(lines: Int = 15): String = try { logFile.readLines().takeLast(lines).joinToString("\n") } catch (e: Exception) { "(no log yet)" }

    // ---------- calls to the core ----------

    fun call(method: String, path: String, body: JSONObject? = null, timeoutMs: Int = 15_000): JSONObject {
        val gen = generation
        val k = key
        if (!stillTrusted(gen)) throw IOException("the core isn't running yet")
        val c = URL("${App.base}$path").openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 3000
        c.readTimeout = timeoutMs
        c.setRequestProperty("X-PP-Key", k)
        if (body != null) {
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(body.toString().toByteArray()) }
        }
        val code = c.responseCode
        val text = (if (code in 200..299) c.inputStream else c.errorStream)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
        // The core stopped while this call was out: the answer may not be from it.
        if (!stillTrusted(gen)) throw IOException("the core restarted")
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

    // Our core is running and proved it holds the key (the screen may open it).
    fun ready(): Boolean = stillTrusted(generation)
}
