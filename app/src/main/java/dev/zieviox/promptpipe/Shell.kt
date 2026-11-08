package dev.zieviox.promptpipe

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.concurrent.thread

// The Android shell's side of the page bridge: it takes the calls the core
// queues (drive a site page, app actions, fetch, native modules), runs them
// and sends back the answers. Every module listed in `modules` works here;
// the core reports any other as "not supported on this platform".
class Shell(private val app: App) {
    private val core get() = app.core
    private val git by lazy { GitStore(app.store) }
    private val workers = Executors.newCachedThreadPool()
    private val modules = listOf("git", "clipboard", "vibration", "share")

    fun start() = thread(name = "shell", isDaemon = true) {
        while (true) {
            try {
                val info = app.packageManager.getPackageInfo(app.packageName, 0)
                val about = JSONObject().put("version", info.versionName).put("allFiles", app.store.hasAllFiles())
                core.call("POST", "/shell/hello", JSONObject().put("platform", "android").put("modules", JSONArray(modules)).put("app", about))
                core.status()
                while (true) {
                    val calls = core.call("GET", "/shell/next", timeoutMs = 40_000).optJSONArray("calls") ?: JSONArray()
                    for (i in 0 until calls.length()) {
                        val c = calls.getJSONObject(i)
                        workers.execute { answer(c) }
                    }
                }
            } catch (e: Exception) {
                // The core is starting or restarting: try again shortly.
                Thread.sleep(500)
            }
        }
    }

    private fun answer(c: JSONObject) {
        val out = JSONObject().put("id", c.getString("id"))
        try {
            out.put("ok", true).put("result", run(c.getString("kind"), c.optJSONObject("data") ?: JSONObject()))
        } catch (e: Throwable) {
            Log.w(App.TAG, "${c.optString("kind")}: $e")
            out.put("ok", false).put("error", e.message ?: e.toString())
        }
        try { core.call("POST", "/shell/done", out) } catch (e: Exception) { Log.w(App.TAG, "done: $e") }
    }

    private fun run(kind: String, d: JSONObject): Any = when (kind) {
        "site" -> app.hub.request(d, d.optLong("timeout", 31 * 60_000L))
        "site.open" -> app.hub.open(d.getString("url"), d.optInt("page", 0))
        "site.pages" -> {
            if (d.has("count")) app.hub.setPages(d.optInt("count", 1))
            JSONObject().put("pages", app.hub.pagesInfo()).put("max", Hub.MAX_PAGES)
        }
        "app.action" -> {
            val action = d.getString("action")
            app.hub.main.post { app.hub.screen?.runAction(action, d) }
            JSONObject().put("ok", true)
        }
        "fetch" -> fetch(d.getString("url"))
        "module" -> module(d.getString("module"), d.getString("call"), d.optJSONObject("args") ?: JSONObject())
        else -> throw IOException("the Android app doesn't know '$kind'")
    }

    private fun module(name: String, call: String, a: JSONObject): Any = when ("$name.$call") {
        "git.commit" -> {
            val paths = a.optJSONArray("paths") ?: JSONArray()
            val id = git.commit((0 until paths.length()).map { paths.getString(it) }, a.optString("message", "update"), a.optString("name"), a.optString("email"))
            if (a.optBoolean("autoPush") && a.optString("remote").isNotBlank()) workers.execute {
                try { git.push(a.optString("remote")) } catch (e: Throwable) {
                    core.emit(JSONObject().put("type", "error").put("text", "Auto push failed: ${e.message}"))
                }
            }
            id ?: JSONObject.NULL
        }
        "git.log" -> git.log(a.optInt("count", 30), a.optString("path").ifBlank { null })
        "git.push" -> git.push(a.optString("remote"))
        "git.pull" -> git.pull(a.optString("remote"))
        "clipboard.copy" -> {
            onMain { app.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("promptpipe", a.optString("text"))) }
            JSONObject().put("ok", true)
        }
        "clipboard.paste" -> JSONObject().put("text", onMain {
            app.getSystemService(ClipboardManager::class.java).primaryClip?.getItemAt(0)?.coerceToText(app)?.toString() ?: ""
        })
        "vibration.vibrate" -> {
            vibrate(a.optLong("ms", 0))
            JSONObject().put("ok", true)
        }
        "share.text" -> {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, a.optString("text"))
            app.startActivity(Intent.createChooser(send, null).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            JSONObject().put("ok", true)
        }
        else -> throw IOException("$name has no call '$call'")
    }

    @Suppress("DEPRECATION")
    private fun vibrate(ms: Long) {
        val v = app.getSystemService(Vibrator::class.java) ?: return
        if (!v.hasVibrator()) return
        v.vibrate(
            if (ms <= 0 && Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
            else VibrationEffect.createOneShot(if (ms > 0) ms else 25, VibrationEffect.DEFAULT_AMPLITUDE)
        )
    }

    // Some Android services (clipboard) want the main thread.
    private fun <T> onMain(f: () -> T): T {
        val done = java.util.concurrent.CompletableFuture<T>()
        app.hub.main.post { try { done.complete(f()) } catch (e: Throwable) { done.completeExceptionally(e) } }
        return done.get(5, java.util.concurrent.TimeUnit.SECONDS)
    }

    // The fetch primitive: https only, redirects followed, body as base64.
    private fun fetch(url: String): JSONObject {
        if (!url.startsWith("https://")) throw IOException("only https links can be fetched")
        val c = URL(url).openConnection() as HttpURLConnection
        c.setRequestProperty("User-Agent", "promptpipe")
        c.connectTimeout = 15_000
        c.readTimeout = 60_000
        c.instanceFollowRedirects = true
        val code = c.responseCode
        val bytes = ByteArrayOutputStream()
        (if (code in 200..299) c.inputStream else c.errorStream)?.use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                bytes.write(buf, 0, n)
                if (bytes.size() > 50 * 1024 * 1024) throw IOException("that download is over 50 MB")
            }
        }
        return JSONObject().put("status", code).put("url", c.url.toString()).put("base64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
    }
}
