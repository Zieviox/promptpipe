package dev.zieviox.promptpipe

import android.app.Application
import android.os.Build
import android.util.Log
import fi.iki.elonen.NanoHTTPD
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import java.io.File

// One per app process. GeckoView starts extra processes (tabs, GPU) that also
// create an Application, so everything is only set up in the main process.
class App : Application() {
    lateinit var runtime: GeckoRuntime
    lateinit var store: Store
    lateinit var hub: Hub
    lateinit var server: Server

    override fun onCreate() {
        super.onCreate()
        if (processName() != packageName) return
        instance = this
        System.setProperty("user.home", filesDir.absolutePath) // JGit looks for ~/.gitconfig
        store = Store(this)
        runtime = GeckoRuntime.create(
            this,
            GeckoRuntimeSettings.Builder().consoleOutput(true).build(),
        )
        // Server first: the UI page that Hub opens is served by it.
        server = Server(this)
        try {
            server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, true)
        } catch (e: Exception) {
            Log.e(TAG, "local server failed to start on port $PORT", e)
        }
        hub = Hub(this)
    }

    private fun processName(): String =
        if (Build.VERSION.SDK_INT >= 28) getProcessName()
        else try {
            File("/proc/self/cmdline").readText().trim('\u0000', ' ')
        } catch (e: Exception) {
            packageName
        }

    companion object {
        const val PORT = 7790
        const val TAG = "promptpipe"
        lateinit var instance: App
        val base get() = "http://127.0.0.1:$PORT"
    }
}
