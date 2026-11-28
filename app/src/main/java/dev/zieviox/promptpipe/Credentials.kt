package dev.zieviox.promptpipe

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.net.ssl.SSLException

// Credentials (UC40): values encrypted with a key in the Android Keystore, kept in a file that
// backups leave out, never in exports, settings, the history or logs (S7). A write-only one never
// leaves the platform: `http_fetch` adds it to requests for its hosts only. `http_fetch` is the
// platform's HTTPS client (S5): streamed, a cut connection tried once, errors in plain words
// with the host (UC1.5). A download is saved with the core's `file_write`, its one write check.
class Credentials(private val app: App) {
    private val file get() = File(app.noBackupFilesDir, "credentials.json")

    init {
        app.port.handlers.apply {
            put("credential_create") { d -> credential_create(d) }
            put("credential_list") { _ -> credential_list() }
            put("credential_delete") { d -> store_save(store_load().apply { remove(d.getString("name")) }); null }
            put("credential_read") { d -> credential_read(d.getString("name")) }
            put("http_fetch") { d -> http_fetch(d) }
        }
    }

    private fun key_get(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val spec = KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build()
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply { init(spec) }.generateKey()
    }

    @Synchronized
    private fun store_load(): JSONObject = if (file.exists()) JSONObject(file.readText()) else JSONObject()

    @Synchronized
    private fun store_save(store: JSONObject) = file.writeText(store.toString())

    private fun encrypt(text: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key_get()) }
        return Base64.encodeToString(cipher.iv + cipher.doFinal(text.toByteArray()), Base64.NO_WRAP)
    }

    private fun decrypt(text: String): String {
        val bytes = Base64.decode(text, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key_get(), GCMParameterSpec(128, bytes, 0, 12))
        return String(cipher.doFinal(bytes, 12, bytes.size - 12))
    }

    private fun credential_create(d: JSONObject): Any {
        val value = d.getString("value")
        val entry = JSONObject(d.toString()).apply {
            remove("value")
            put("access", d.optString("access", "write_only"))
            put("last4", value.takeLast(4))
            put("secret", encrypt(value))
        }
        store_save(store_load().put(d.getString("name"), entry))
        return listing(entry)
    }

    private fun listing(entry: JSONObject) = JSONObject(entry.toString()).apply { remove("secret") }

    private fun credential_list(): Any = JSONArray().also { a ->
        val store = store_load()
        store.keys().forEach { a.put(listing(store.getJSONObject(it))) }
    }

    // A read-write credential's value (and the local API token, for Show and Copy).
    private fun credential_read(name: String): Any {
        val entry = store_load().optJSONObject(name) ?: throw Refusal("not_found", "no credential \"$name\"")
        if (entry.optString("access") != "read_write") throw Refusal("permission_denied", "\"$name\" is write-only")
        return decrypt(entry.getString("secret"))
    }

    // For the platform's own use (the git token): the value, whatever its access.
    fun value_read(name: String): String {
        val entry = store_load().optJSONObject(name) ?: throw Refusal("failed_precondition", "add the credential \"$name\" first")
        return decrypt(entry.getString("secret"))
    }

    private fun http_fetch(d: JSONObject): Any {
        val url = d.getString("url")
        if (!url.startsWith("https://")) throw Refusal("invalid_argument", "only https links can be fetched")
        val host = URL(url).host
        for (attempt in 1..2) {
            try {
                return request_run(d, url, host)
            } catch (e: Exception) {
                val cut = (e.message ?: "").contains("end of stream")
                if (cut && attempt == 1) continue
                throw Refusal("unavailable", when {
                    e is Refusal -> e.message ?: ""
                    e is UnknownHostException -> "$host wasn't found (no internet, or the address is wrong)"
                    e is SocketTimeoutException -> "$host didn't answer in time"
                    e is SSLException -> "the secure connection to $host failed (${e.message})"
                    cut -> "the connection to $host was cut off, twice. Try again in a moment"
                    else -> "couldn't reach $host (${e.message})"
                })
            }
        }
        throw Refusal("unavailable", "couldn't reach $host")
    }

    private fun request_run(d: JSONObject, url: String, host: String): JSONObject {
        val c = URL(url).openConnection() as HttpURLConnection
        c.requestMethod = d.optString("method", "GET")
        c.connectTimeout = 20_000
        c.readTimeout = 120_000
        c.setRequestProperty("User-Agent", "promptpipe")
        c.setRequestProperty("Connection", "close")
        d.optJSONObject("headers")?.let { h -> h.keys().forEach { c.setRequestProperty(it, h.getString(it)) } }
        d.optString("credential").takeIf { it.isNotBlank() }?.let { name ->
            val entry = store_load().optJSONObject(name) ?: throw Refusal("failed_precondition", "no credential \"$name\"")
            val hosts = entry.optJSONArray("hosts") ?: JSONArray()
            val allowed = (0 until hosts.length()).any { hosts.getString(it) == host }
            if (!allowed) throw Refusal("permission_denied", "the credential \"$name\" isn't for $host")
            val prefix = entry.optString("prefix", "Bearer")
            c.setRequestProperty(entry.optString("header", "Authorization"), "$prefix ${decrypt(entry.getString("secret"))}".trim())
        }
        d.optString("body").takeIf { it.isNotEmpty() }?.let { body ->
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray()) }
        }
        val status = c.responseCode
        val input = if (status >= 400) c.errorStream else c.inputStream
        val out = JSONObject().put("status", status).put("url", c.url.toString())
        if (d.optBoolean("stream")) {
            val text = StringBuilder()
            input?.bufferedReader()?.forEachLine { line ->
                text.append(line).append('\n')
                app.port.event_send("http_received", JSONObject().put("request", d.optString("id")).put("part", line))
            }
            return out.put("body", text.toString())
        }
        val bytes = input?.use { it.readBytes() } ?: ByteArray(0)
        val body = if (d.optString("encoding") == "base64") Base64.encodeToString(bytes, Base64.NO_WRAP) else String(bytes)
        return out.put("body", body)
    }

    companion object { const val ALIAS = "promptpipe-credentials" }
}
