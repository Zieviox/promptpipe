package dev.zieviox.promptpipe

import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

// Local HTTP server on 127.0.0.1:7790. It serves the chat UI and plugins, gives
// the UI access to files, git and the AI page, and offers /api/v1 to other apps.
class Server(private val app: App) : NanoHTTPD("127.0.0.1", App.PORT) {
    private val git by lazy { GitStore(app.store) }

    override fun serve(s: IHTTPSession): Response = try {
        route(s)
    } catch (e: Throwable) {
        Log.w(App.TAG, "${s.uri}: $e")
        json(JSONObject().put("error", e.message ?: e.toString()), Response.Status.INTERNAL_ERROR)
    }

    private fun body(s: IHTTPSession): JSONObject {
        val len = s.headers["content-length"]?.toIntOrNull() ?: 0
        if (len == 0) return JSONObject()
        val buf = ByteArray(len)
        var off = 0
        while (off < len) {
            val n = s.inputStream.read(buf, off, len - off)
            if (n < 0) break
            off += n
        }
        return JSONObject(String(buf, 0, off, Charsets.UTF_8))
    }

    private fun json(o: Any, status: Response.IStatus = Response.Status.OK): Response =
        newFixedLengthResponse(status, "application/json; charset=utf-8", o.toString()).also {
            it.addHeader("Cache-Control", "no-store")
        }

    private fun ok() = json(JSONObject().put("ok", true))

    private fun stream(input: InputStream?, path: String): Response {
        if (input == null) return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "not found: $path")
        val mime = when (path.substringAfterLast('.')) {
            "html" -> "text/html; charset=utf-8"
            "js" -> "text/javascript; charset=utf-8"
            "css" -> "text/css; charset=utf-8"
            "json" -> "application/json; charset=utf-8"
            "md" -> "text/markdown; charset=utf-8"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            else -> "application/octet-stream"
        }
        val bytes = input.use { it.readBytes() }
        return newFixedLengthResponse(Response.Status.OK, mime, bytes.inputStream(), bytes.size.toLong()).also {
            it.addHeader("Cache-Control", "no-store")
        }
    }

    private fun asset(path: String): InputStream? = try {
        app.assets.open(path)
    } catch (e: IOException) {
        null
    }

    private fun config(): JSONObject = try {
        JSONObject(app.store.readConfig())
    } catch (e: Exception) {
        JSONObject()
    }

    private fun route(s: IHTTPSession): Response {
        val uri = s.uri
        val post = s.method == Method.POST || s.method == Method.PUT
        when {
            uri == "/" -> return stream(asset("ui/index.html"), "index.html")
            uri.startsWith("/ui/") -> return stream(asset(uri.drop(1)), uri)
            uri.startsWith("/docs/") -> return stream(asset(uri.drop(1)), uri)
            uri.startsWith("/plugins/") -> {
                val parts = uri.removePrefix("/plugins/").split("/", limit = 2)
                return stream(if (parts.size == 2) app.store.pluginFile(parts[0], parts[1]) else null, uri)
            }
            // Safe mode reads the built-in copies even where a plugin of yours overrides one.
            uri.startsWith("/builtin/") -> {
                val parts = uri.removePrefix("/builtin/").split("/", limit = 2)
                return stream(if (parts.size == 2) app.store.builtinFile(parts[0], parts[1]) else null, uri)
            }
            uri.startsWith("/api/v1/") -> return external(s)
            uri.startsWith("/v1/") -> return openai(s)
        }
        if (!uri.startsWith("/api/")) return newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "not found")
        val b = if (post) body(s) else JSONObject()
        val q = s.parms
        return when (uri) {
            "/api/app" -> json(
                JSONObject()
                    .put("storage", app.store.base.path)
                    .put("allFiles", app.store.hasAllFiles())
                    .put("version", app.packageManager.getPackageInfo(app.packageName, 0).versionName)
                    .put("port", App.PORT)
                    .put("gitToken", app.store.secret("gitToken").isNotEmpty())
                    .put("apiToken", app.store.secret("apiToken").isNotEmpty())
                    .put("site", app.hub.siteInfo)
                    .put("pages", app.hub.pagesInfo()),
            )
            "/api/app/action" -> {
                val action = b.getString("action")
                app.hub.main.post { app.hub.screen?.runAction(action, b) }
                ok()
            }
            "/api/secret" -> {
                val key = b.getString("key")
                if (key !in listOf("gitToken", "apiToken")) throw IOException("unknown secret")
                app.store.setSecret(key, b.optString("value"))
                ok()
            }
            "/api/config" -> if (post) {
                app.store.writeConfig(b.toString(2))
                ok()
            } else json(config())
            "/api/events" -> json(app.hub.poll(q["after"]?.toIntOrNull() ?: 0, 25_000))
            "/api/plugins" -> json(JSONObject().put("plugins", app.store.listPlugins(q["builtin"] == "1")).put("folder", app.store.plugins.path))
            "/api/plugins/install" -> {
                val log = JSONArray()
                val id = app.store.install(b.getString("url")) { log.put(it) }
                json(JSONObject().put("id", id).put("log", log))
            }
            // Plugin updates: the latest release's plugin bundle (see Store.updateFromRelease).
            "/api/plugins/update" -> {
                val log = JSONArray()
                json(app.store.updateFromRelease(b.optString("repo", "Zieviox/promptpipe"), b.optBoolean("force")) { log.put(it) }.put("log", log))
            }
            "/api/plugins/bundle" -> json(app.store.bundleInfo())
            "/api/plugins/fork" -> json(JSONObject().put("path", app.store.fork(b.getString("id"))))
            "/api/site" -> json(app.hub.request(b, b.optLong("timeout", 31 * 60_000L)))
            "/api/site/open" -> json(app.hub.open(b.getString("url"), b.optInt("page", 0)))
            "/api/site/pages" -> {
                if (post) app.hub.setPages(b.optInt("count", 1))
                json(JSONObject().put("pages", app.hub.pagesInfo()).put("max", Hub.MAX_PAGES))
            }
            "/api/history/tree" -> json(app.store.history.let { app.store.tree() })
            "/api/history/file" -> {
                val f = app.store.file(q["path"] ?: "")
                json(JSONObject().put("path", q["path"]).put("text", if (f.isFile) f.readText() else null))
            }
            "/api/history/all" -> json(JSONObject().put("files", app.store.allChats()))
            "/api/history/save" -> save(b)
            "/api/git/log" -> json(JSONObject().put("log", git.log(if (q["path"].isNullOrBlank()) 30 else 200, q["path"])))
            "/api/git/push" -> json(JSONObject().put("result", git.push(gitCfg().optString("remote"))))
            "/api/git/pull" -> json(JSONObject().put("result", git.pull(gitCfg().optString("remote"))))
            "/api/jobs/done" -> {
                app.hub.jobs.remove(b.getString("id"))?.complete(b)
                ok()
            }
            else -> json(JSONObject().put("error", "unknown $uri"), Response.Status.NOT_FOUND)
        }
    }

    private fun gitCfg() = config().optJSONObject("git") ?: JSONObject()

    // Files that belong to one chat live in .memory/<chat path without .md>/
    // (hidden from the chat list); they move and go with the chat.
    private fun companion(chatPath: String): java.io.File? {
        if (!chatPath.endsWith(".md") || chatPath.split("/").any { it.startsWith(".") }) return null
        return app.store.file(".memory/" + chatPath.removeSuffix(".md"))
    }

    // Write files, apply moves/deletes and folders, then commit them together.
    private fun save(b: JSONObject): Response {
        val touched = mutableListOf<String>()
        b.optJSONArray("mkdir")?.let { a -> for (i in 0 until a.length()) app.store.file(a.getString(i)).mkdirs() }
        b.optJSONArray("moves")?.let { a ->
            for (i in 0 until a.length()) {
                val m = a.getJSONObject(i)
                val from = app.store.file(m.getString("from"))
                val to = app.store.file(m.getString("to"))
                if (to.exists()) throw IOException("${m.getString("to")} already exists")
                to.parentFile?.mkdirs()
                if (!from.renameTo(to)) throw IOException("could not move ${m.getString("from")}")
                touched.add(m.getString("to"))
                // A chat's companion files (e.g. Memory's summaries) move with it.
                val cf = companion(m.getString("from"))
                val ct = companion(m.getString("to"))
                if (cf != null && ct != null && cf.isDirectory && !ct.exists()) {
                    ct.parentFile?.mkdirs()
                    if (cf.renameTo(ct)) touched.add(ct.relativeTo(app.store.history).path)
                }
            }
        }
        b.optJSONArray("files")?.let { a ->
            for (i in 0 until a.length()) {
                val f = a.getJSONObject(i)
                val file = app.store.file(f.getString("path"))
                file.parentFile?.mkdirs()
                file.writeText(f.getString("text"))
                touched.add(f.getString("path"))
            }
        }
        b.optJSONArray("delete")?.let { a ->
            for (i in 0 until a.length()) {
                app.store.file(a.getString(i)).delete()
                companion(a.getString(i))?.let { if (it.isDirectory) it.deleteRecursively() }
            }
        }
        val out = JSONObject().put("ok", true)
        val cfg = gitCfg()
        if (cfg.optBoolean("enabled", true)) {
            try {
                out.put("commit", git.commit(touched, b.optString("message", "update"), cfg.optString("name"), cfg.optString("email")))
                if (cfg.optBoolean("autoPush") && cfg.optString("remote").isNotBlank()) thread {
                    try {
                        git.push(cfg.optString("remote"))
                    } catch (e: Throwable) {
                        app.hub.emit(JSONObject().put("type", "error").put("text", "Auto push failed: ${e.message}"))
                    }
                }
            } catch (e: Throwable) {
                out.put("gitError", e.toString())
            }
        }
        return json(out)
    }

    // ---------- API for other apps ----------
    // POST /api/v1/chat {"prompt": "...", "profile": "name"?, "chat": "path"|"new"?, "folder": "api"?}
    // -> {"reply", "raw", "sent", "chat", "source"}. The open app runs the
    // same pipeline as the chat screen, so plugins and profiles apply.
    private fun external(s: IHTTPSession): Response {
        val token = app.store.secret("apiToken")
        if (token.isNotEmpty() && s.headers["authorization"] != "Bearer $token") {
            return json(JSONObject().put("error", "missing or wrong token"), Response.Status.UNAUTHORIZED)
        }
        if (s.uri == "/api/v1/health") {
            return json(JSONObject().put("ok", true).put("ui", app.hub.uiAlive()).put("site", app.hub.siteInfo).put("pages", app.hub.pagesInfo()))
        }
        if (s.uri != "/api/v1/chat" || s.method != Method.POST) return json(JSONObject().put("error", "use POST /api/v1/chat"), Response.Status.NOT_FOUND)
        if (!app.hub.uiAlive()) return json(JSONObject().put("error", "open the promptpipe app first"), Response.Status.SERVICE_UNAVAILABLE)
        val req = body(s)
        if (req.optString("prompt").isBlank()) return json(JSONObject().put("error", "prompt is empty"), Response.Status.BAD_REQUEST)
        val r = runJob(req)
        return json(r.optJSONObject("result") ?: JSONObject().put("error", r.optString("error", "failed")),
            if (r.has("error")) Response.Status.INTERNAL_ERROR else Response.Status.OK)
    }

    // Hands a request to the chat screen and waits for its answer ({"result"} or {"error"}).
    private fun runJob(req: JSONObject): JSONObject {
        val id = UUID.randomUUID().toString()
        val f = CompletableFuture<JSONObject>()
        app.hub.jobs[id] = f
        app.hub.emit(JSONObject().put("type", "job").put("id", id).put("req", req))
        return try {
            // As long as the chat screen keeps working on it; the user's wait limits apply there.
            f.get(7, TimeUnit.DAYS)
        } catch (e: Exception) {
            JSONObject().put("error", "timed out")
        } finally {
            app.hub.jobs.remove(id)
        }
    }

    // ---------- OpenAI-compatible API ----------
    // Base URL http://127.0.0.1:7790/v1, API key = the app's API token (any key
    // works while none is set). Models are the app's profiles. Every request
    // is one new chat on the site; earlier messages go into that one prompt.
    private fun openai(s: IHTTPSession): Response {
        if (s.method == Method.OPTIONS) return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""))
        val token = app.store.secret("apiToken")
        if (token.isNotEmpty() && s.headers["authorization"] != "Bearer $token") {
            return oaError("Incorrect API key. Use the API token from promptpipe settings.", "invalid_api_key", Response.Status.UNAUTHORIZED)
        }
        val profiles = config().optJSONArray("profiles") ?: JSONArray()
        val names = (0 until profiles.length()).map { profiles.getJSONObject(it).optString("name") }.filter { it.isNotEmpty() }
        if (s.uri == "/v1/models") {
            val data = JSONArray()
            names.forEach { data.put(JSONObject().put("id", it).put("object", "model").put("created", 0).put("owned_by", "promptpipe")) }
            return cors(json(JSONObject().put("object", "list").put("data", data)))
        }
        if (s.uri != "/v1/chat/completions" || s.method != Method.POST) return oaError("Only /v1/models and /v1/chat/completions exist here.", "not_found", Response.Status.NOT_FOUND)
        if (!app.hub.uiAlive()) return oaError("Open the promptpipe app first.", "app_closed", Response.Status.SERVICE_UNAVAILABLE)
        val req = body(s)
        val prompt = flatten(req.optJSONArray("messages") ?: JSONArray())
        if (prompt.isBlank()) return oaError("messages is empty", "invalid_request", Response.Status.BAD_REQUEST)
        val model = req.optString("model")
        val profile = names.firstOrNull { it.equals(model, ignoreCase = true) } ?: ""
        val r = runJob(JSONObject().put("prompt", prompt).put("profile", profile).put("chat", "new").put("folder", "api"))
        val result = r.optJSONObject("result")
        if (result == null || result.optString("error").isNotEmpty()) {
            return oaError(result?.optString("error")?.ifEmpty { null } ?: r.optString("error", "failed"), "site_error", BAD_GATEWAY)
        }
        val reply = result.optString("reply")
        val thinking = result.optString("thinking")
        val id = "chatcmpl-" + UUID.randomUUID().toString().replace("-", "").take(24)
        val created = System.currentTimeMillis() / 1000
        val name = profile.ifEmpty { names.firstOrNull() ?: "promptpipe" }
        // Token counts are estimates (about 4 characters per token).
        val usage = JSONObject().put("prompt_tokens", prompt.length / 4).put("completion_tokens", reply.length / 4).put("total_tokens", (prompt.length + reply.length) / 4)
        if (req.optBoolean("stream")) {
            // The reply only exists once the site has finished, so it goes out as one chunk.
            fun chunk(delta: JSONObject, finish: String?) = "data: " + JSONObject().put("id", id).put("object", "chat.completion.chunk").put("created", created).put("model", name)
                .put("choices", JSONArray().put(JSONObject().put("index", 0).put("delta", delta).put("finish_reason", finish ?: JSONObject.NULL))) + "\n\n"
            val delta = JSONObject().put("role", "assistant").put("content", reply)
            if (thinking.isNotEmpty()) delta.put("reasoning_content", thinking)
            val sse = chunk(delta, null) + chunk(JSONObject(), "stop") + "data: [DONE]\n\n"
            return cors(newFixedLengthResponse(Response.Status.OK, "text/event-stream; charset=utf-8", sse).also { it.addHeader("Cache-Control", "no-store") })
        }
        val msg = JSONObject().put("role", "assistant").put("content", reply)
        if (thinking.isNotEmpty()) msg.put("reasoning_content", thinking)
        return cors(json(JSONObject().put("id", id).put("object", "chat.completion").put("created", created).put("model", name)
            .put("choices", JSONArray().put(JSONObject().put("index", 0).put("message", msg).put("finish_reason", "stop")))
            .put("usage", usage)))
    }

    // One self-contained prompt: a single user message goes as it is; a longer
    // conversation is written out with role headings, ending on the last message.
    private fun flatten(messages: JSONArray): String {
        val parts = (0 until messages.length()).map { messages.getJSONObject(it) }.map { m ->
            val c = m.opt("content")
            val text = if (c is JSONArray) (0 until c.length()).mapNotNull { c.optJSONObject(it)?.optString("text")?.ifEmpty { null } }.joinToString("\n") else m.optString("content")
            m.optString("role", "user") to text.trim()
        }.filter { it.second.isNotEmpty() }
        if (parts.size == 1 && parts[0].first == "user") return parts[0].second
        return parts.joinToString("\n\n") { (role, text) -> "### " + role.replaceFirstChar { it.uppercase() } + "\n" + text }
    }

    // NanoHTTPD 2.3.1 has no 502 in Response.Status.
    private object BAD_GATEWAY : Response.IStatus {
        override fun getDescription() = "502 Bad Gateway"
        override fun getRequestStatus() = 502
    }

    private fun oaError(message: String, code: String, status: Response.IStatus) =
        cors(json(JSONObject().put("error", JSONObject().put("message", message).put("type", "promptpipe_error").put("code", code)), status))

    private fun cors(r: Response) = r.also {
        it.addHeader("Access-Control-Allow-Origin", "*")
        it.addHeader("Access-Control-Allow-Headers", "authorization, content-type")
        it.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    }
}
