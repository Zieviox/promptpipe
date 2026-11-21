package dev.zieviox.promptpipe

import android.app.Application
import android.os.Handler
import android.os.Looper
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors

// One per app process. The browser engine starts processes of its own that also make an
// Application, so the platform is set up only in the main one.
class App : Application() {
    lateinit var runtime: GeckoRuntime
    lateinit var core: Core
    lateinit var port: Port
    lateinit var pages: Pages
    lateinit var credentials: Credentials
    val main = Handler(Looper.getMainLooper())
    val workers = Executors.newCachedThreadPool()

    override fun onCreate() {
        super.onCreate()
        if (getProcessName() != packageName) return
        app = this
        runtime = GeckoRuntime.create(this, GeckoRuntimeSettings.Builder().consoleOutput(true).build())
        core = Core(this)
        port = Port(this)
        pages = Pages(this)
        credentials = Credentials(this)
        Repo(this)
        Services(this)
        core.start()
    }

    // Run on the main thread and wait for the answer (GeckoView and views want the main thread).
    fun <T> main_run(work: () -> T): T {
        if (Looper.myLooper() == Looper.getMainLooper()) return work()
        val done = CompletableFuture<T>()
        main.post {
            try {
                done.complete(work())
            } catch (e: Throwable) {
                done.completeExceptionally(e)
            }
        }
        return done.get()
    }

    companion object {
        const val PORT = 7790
        lateinit var app: App
    }
}
