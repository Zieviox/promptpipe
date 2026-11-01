package dev.zieviox.promptpipe

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

// Files on the phone:
//   PromptPipe/config.json   profiles and settings (edit by hand if you like)
//   PromptPipe/plugins/<id>/ your plugins; same id as a built-in one overrides it
//   PromptPipe/history/      chats as Markdown, a git repository
// PromptPipe is /sdcard/PromptPipe once "All files access" is allowed, and the
// app's own folder until then.
class Store(private val ctx: Context) {
    fun hasAllFiles(): Boolean =
        if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager()
        else ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    val base: File
        get() = (if (hasAllFiles()) File(Environment.getExternalStorageDirectory(), "PromptPipe")
        else File(ctx.getExternalFilesDir(null), "PromptPipe")).also { it.mkdirs() }
    val plugins get() = File(base, "plugins").also { it.mkdirs() }
    val history get() = File(base, "history").also { it.mkdirs() }
    private val config get() = File(base, "config.json")
    private val prefs get() = ctx.getSharedPreferences("private", Context.MODE_PRIVATE)

    fun readConfig(): String = if (config.exists()) config.readText() else "{}"
    fun writeConfig(text: String) {
        JSONObject(text) // refuse broken JSON
        config.writeText(text)
    }

    // Secrets (git token) stay in app-private storage, not on /sdcard.
    fun secret(key: String): String = prefs.getString(key, "") ?: ""
    fun setSecret(key: String, value: String) = prefs.edit().putString(key, value).apply()

    // ---------- plugins ----------
    private fun builtinIds(): List<String> = ctx.assets.list("plugins")?.toList() ?: emptyList()

    fun listPlugins(): JSONArray {
        val out = JSONArray()
        val user = plugins.listFiles()?.filter { File(it, "plugin.json").isFile }?.associateBy { it.name } ?: emptyMap()
        val ids = (builtinIds() + user.keys).distinct().sorted()
        for (id in ids) {
            val dir = user[id]
            val entry = JSONObject().put("id", id).put("source", if (dir != null) "user" else "builtin")
            if (dir != null && id in builtinIds()) entry.put("overrides", true)
            try {
                val text = if (dir != null) File(dir, "plugin.json").readText()
                else ctx.assets.open("plugins/$id/plugin.json").bufferedReader().readText()
                entry.put("manifest", JSONObject(text))
            } catch (e: Exception) {
                entry.put("error", "plugin.json: ${e.message}")
            }
            out.put(entry)
        }
        return out
    }

    fun pluginFile(id: String, path: String): InputStream? {
        if (!safeName(id) || path.split('/').any { it == ".." || it.isEmpty() }) return null
        val f = File(File(plugins, id), path)
        if (File(plugins, id).isDirectory) return if (f.isFile) f.inputStream() else null
        return try {
            ctx.assets.open("plugins/$id/$path")
        } catch (e: IOException) {
            null
        }
    }

    // Copy a built-in plugin into the plugins folder so it can be edited.
    fun fork(id: String): String {
        if (!safeName(id) || id !in builtinIds()) throw IOException("no built-in plugin '$id'")
        val dest = File(plugins, id)
        if (dest.exists()) throw IOException("plugins/$id already exists")
        copyAssetDir("plugins/$id", dest)
        return dest.absolutePath
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

    // Install from a URL: a .zip, a plugin.json (files listed in it are fetched
    // next to it), or a GitHub folder link (.../tree/<branch>/<path>).
    fun install(rawUrl: String, log: (String) -> Unit): String {
        var url = rawUrl.trim()
        Regex("^https://github\\.com/([^/]+)/([^/]+)/tree/([^/]+)/(.+?)/?$").find(url)?.let {
            val (o, r, b, p) = it.destructured
            url = "https://raw.githubusercontent.com/$o/$r/$b/$p/plugin.json"
        }
        if (url.endsWith(".zip")) return installZip(url, log)
        if (!url.endsWith(".json")) url = url.trimEnd('/') + "/plugin.json"
        log("fetching $url")
        val manifest = JSONObject(String(fetch(url)))
        val id = manifest.optString("id")
        if (!safeName(id)) throw IOException("plugin.json needs an id made of letters, digits, - or _")
        val dir = File(plugins, id)
        dir.mkdirs()
        File(dir, "plugin.json").writeText(manifest.toString(2))
        val baseUrl = url.substringBeforeLast('/')
        val files = mutableListOf<String>()
        manifest.optString("main").takeIf { it.isNotEmpty() }?.let { files.add(it) }
        manifest.optString("siteScript").takeIf { it.isNotEmpty() }?.let { files.add(it) }
        manifest.optString("css").takeIf { it.isNotEmpty() }?.let { files.add(it) }
        manifest.optJSONArray("files")?.let { a -> for (i in 0 until a.length()) files.add(a.getString(i)) }
        for (f in files.distinct()) {
            if (f.split('/').any { it == ".." }) continue
            log("fetching $f")
            val target = File(dir, f)
            target.parentFile?.mkdirs()
            target.writeBytes(fetch("$baseUrl/$f"))
        }
        log("installed $id")
        return id
    }

    private fun installZip(url: String, log: (String) -> Unit): String {
        log("fetching $url")
        return installZipBytes(fetch(url), log)
    }

    // A plugin picked from the phone's files: a .zip with plugin.json inside, or a lone plugin.json.
    fun installFile(name: String, bytes: ByteArray, log: (String) -> Unit): String {
        if (bytes.size >= 2 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()) return installZipBytes(bytes, log)
        val manifest = try {
            JSONObject(String(bytes))
        } catch (e: Exception) {
            throw IOException("$name is neither a .zip nor a plugin.json")
        }
        val id = manifest.optString("id")
        if (!safeName(id)) throw IOException("plugin.json needs an id made of letters, digits, - or _")
        val needs = listOf("main", "siteScript", "css").mapNotNull { manifest.optString(it).ifEmpty { null } }
        if (needs.isNotEmpty()) throw IOException("this plugin.json needs ${needs.joinToString()} too: pick the plugin's .zip instead")
        val dir = File(plugins, id)
        dir.mkdirs()
        File(dir, "plugin.json").writeText(manifest.toString(2))
        log("installed $id")
        return id
    }

    private fun installZipBytes(bytes: ByteArray, log: (String) -> Unit): String {
        val tmp = File(ctx.cacheDir, "plugin-unzip").also { it.deleteRecursively(); it.mkdirs() }
        ZipInputStream(bytes.inputStream()).use { zip ->
            while (true) {
                val e = zip.nextEntry ?: break
                if (e.name.split('/').any { it == ".." }) continue
                val f = File(tmp, e.name)
                if (e.isDirectory) f.mkdirs() else {
                    f.parentFile?.mkdirs()
                    f.outputStream().use { zip.copyTo(it) }
                }
            }
        }
        val manifestFile = tmp.walkTopDown().firstOrNull { it.name == "plugin.json" }
            ?: throw IOException("no plugin.json in the zip")
        val id = JSONObject(manifestFile.readText()).optString("id")
        if (!safeName(id)) throw IOException("plugin.json needs a simple id")
        val dest = File(plugins, id)
        dest.deleteRecursively()
        manifestFile.parentFile!!.copyRecursively(dest, overwrite = true)
        tmp.deleteRecursively()
        log("installed $id")
        return id
    }

    private fun fetch(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15000
        c.readTimeout = 30000
        c.instanceFollowRedirects = true
        if (c.responseCode !in 200..299) throw IOException("HTTP ${c.responseCode} for $url")
        return c.inputStream.use { it.readBytes() }
    }

    private fun safeName(s: String) = s.matches(Regex("[A-Za-z0-9_.-]+")) && s != "." && s != ".."

    // ---------- history ----------
    fun file(rel: String): File {
        val f = File(history, rel).canonicalFile
        if (!f.path.startsWith(history.canonicalPath)) throw IOException("path outside history: $rel")
        return f
    }

    // Every chat file with the first part of its text (enough for the header),
    // plus all folders, so empty folders show too.
    fun tree(): JSONObject {
        val root = history.canonicalFile
        val files = JSONArray()
        val folders = JSONArray()
        root.walkTopDown().onEnter { it.name != ".git" }.forEach { f ->
            val rel = f.relativeTo(root).path
            if (rel.isEmpty()) return@forEach
            if (f.isDirectory) folders.put(rel)
            else if (f.name.endsWith(".md")) {
                val head = f.bufferedReader().use { r ->
                    val buf = CharArray(1500)
                    val n = r.read(buf)
                    if (n > 0) String(buf, 0, n) else ""
                }
                files.put(JSONObject().put("path", rel).put("head", head).put("mtime", f.lastModified()))
            }
        }
        return JSONObject().put("files", files).put("folders", folders).put("root", root.path)
    }

    // Full text of every chat, for search.
    fun allChats(): JSONArray {
        val root = history.canonicalFile
        val out = JSONArray()
        root.walkTopDown().onEnter { it.name != ".git" }.filter { it.isFile && it.name.endsWith(".md") }.forEach {
            out.put(JSONObject().put("path", it.relativeTo(root).path).put("text", it.readText()).put("mtime", it.lastModified()))
        }
        return out
    }
}
