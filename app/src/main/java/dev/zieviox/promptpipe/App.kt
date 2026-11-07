package dev.zieviox.promptpipe

import android.app.Application
import android.os.Build
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import java.io.File

// One per app process. GeckoView starts extra processes (tabs, GPU) that also
// create an Application, so everything is only set up in the main process.
class App : Application() {
    lateinit var runtime: GeckoRuntime
    lateinit var store: Store
    lateinit var hub: Hub
    lateinit var core: Core
    lateinit var shell: Shell

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
        // The core first: it serves the app screen that Hub opens.
        core = Core(this)
        core.start()
        hub = Hub(this)
        shell = Shell(this)
        shell.start()
    }

    // The core starts before Hub exists and may report to it early.
    fun hubOrNull(): Hub? = if (this::hub.isInitialized) hub else null

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
