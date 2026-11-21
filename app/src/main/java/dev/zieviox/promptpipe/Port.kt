package dev.zieviox.promptpipe

import android.util.Log
import org.json.JSONObject
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.WebExtension
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit

// A call the platform refuses or can't do, with a gRPC status code (errors are data).
class Refusal(val code: String, message: String) : Exception(message)

// The one port to the screen and the site pages: the built-in extension's native port carries
// the envelope { type: call | reply | event, name, data, id, error }. The platform answers its own
// calls from `handlers`, passes `site_*` calls on to the page named in their data, and sends events.
class Port(private val app: App) {
    var extension: WebExtension? = null
    @Volatile private var screen: WebExtension.Port? = null
    private val waiting = ConcurrentHashMap<String, CompletableFuture<JSONObject>>()
    val handlers = ConcurrentHashMap<String, (JSONObject) -> Any?>()
    private val ready = CompletableFuture<WebExtension>()

    init {
        app.runtime.webExtensionController
            .ensureBuiltIn("resource://android/assets/ppext/", "promptpipe@zieviox.dev")
            .accept({ ext -> extension = ext; ready.complete(ext) }, { e -> Log.e(Core.TAG, "the extension failed", e) })
    }

    // Listen to the extension's port in a session: the screen's, or a site page's.
    fun session_listen(session: GeckoSession, on_message: (JSONObject, WebExtension.Port) -> Unit, on_close: () -> Unit) {
        ready.thenAccept { ext ->
            app.main.post {
                session.webExtensionController.setMessageDelegate(ext, object : WebExtension.MessageDelegate {
                    override fun onConnect(port: WebExtension.Port) {
                        port.setDelegate(object : WebExtension.PortDelegate {
                            override fun onPortMessage(message: Any, port: WebExtension.Port) {
                                (message as? JSONObject)?.let { on_message(it, port) }
                            }
                            override fun onDisconnect(port: WebExtension.Port) = on_close()
                        })
                    }
                }, "pp")
            }
        }
    }

    fun screen_listen(session: GeckoSession) = session_listen(session, { m, p -> screen = p; screen_message(m) }, { screen = null })

    private fun screen_message(m: JSONObject) {
        val id = m.optString("id")
        when (m.optString("type")) {
            "reply" -> waiting.remove(id)?.complete(m)
            "call" -> app.workers.execute { reply_send(id, m.optString("name"), m.optJSONObject("data") ?: JSONObject()) }
        }
    }

    private fun reply_send(id: String, name: String, data: JSONObject) {
        val out = JSONObject().put("type", "reply").put("id", id)
        try {
            val handler = handlers[name]
            val result = when {
                handler != null -> handler(data)
                name.startsWith("site_") -> app.pages.call_forward(name, data)
                else -> throw Refusal("unimplemented", "$name is not supported on this platform (android)")
            }
            out.put("data", result ?: JSONObject.NULL)
        } catch (e: Refusal) {
            out.put("error", JSONObject().put("code", e.code).put("message", e.message))
        } catch (e: Exception) {
            out.put("error", JSONObject().put("code", "internal").put("message", e.message ?: e.toString()))
        }
        app.main.post { screen?.postMessage(out) }
    }

    fun event_send(name: String, data: JSONObject) {
        val event = JSONObject().put("type", "event").put("name", name).put("data", data)
        app.main.post { screen?.postMessage(event) }
    }

    // A call to the screen (Back: whether it closed something), answered or not within a second.
    fun screen_call(name: String, data: JSONObject = JSONObject()): JSONObject? {
        val port = screen ?: return null
        val id = UUID.randomUUID().toString()
        val done = CompletableFuture<JSONObject>().also { waiting[id] = it }
        app.main.post { port.postMessage(JSONObject().put("type", "call").put("name", name).put("data", data).put("id", id)) }
        return try {
            done.get(1, TimeUnit.SECONDS).optJSONObject("data")
        } catch (e: Exception) {
            null
        } finally {
            waiting.remove(id)
        }
    }
}
