package dev.zieviox.promptpipe

import org.eclipse.jgit.api.Git
import org.eclipse.jgit.lib.PersonIdent
import org.eclipse.jgit.storage.file.WindowCacheConfig
import org.eclipse.jgit.transport.URIish
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

// The history folder as a git repository: every save is a commit. Push/pull
// to a remote (e.g. a private GitHub repo) is optional and uses a token.
class GitStore(private val store: Store) {
    init {
        // JGit's JMX statistics need java.lang.management, which Android lacks.
        try {
            val cfg = WindowCacheConfig()
            cfg.javaClass.getMethod("setExposeStatsViaJmx", Boolean::class.javaPrimitiveType).invoke(cfg, false)
            cfg.install()
        } catch (e: Throwable) {}
    }

    private fun repo(): Git {
        val dir = store.history
        if (!File(dir, ".git").exists()) {
            val g = Git.init().setDirectory(dir).setInitialBranch("main").call()
            g.repository.config.apply {
                setBoolean("core", null, "filemode", false)
                setBoolean("core", null, "symlinks", false)
                save()
            }
            return g
        }
        return Git.open(dir)
    }

    @Synchronized
    fun commit(paths: List<String>, message: String, name: String, email: String): String? = repo().use { g ->
        for (p in paths) g.add().addFilepattern(p).call()
        g.add().setUpdate(true).addFilepattern(".").call() // picks up moves and deletes
        if (g.status().call().isClean) return null
        val who = PersonIdent(name.ifBlank { "promptpipe" }, email.ifBlank { "promptpipe@localhost" })
        g.commit().setMessage(message).setAuthor(who).setCommitter(who).call().name.take(7)
    }

    @Synchronized
    fun log(max: Int, path: String? = null): JSONArray = repo().use { g ->
        val out = JSONArray()
        try {
            val cmd = g.log().setMaxCount(max)
            if (!path.isNullOrBlank()) cmd.addPath(path)
            for (c in cmd.call()) {
                out.put(JSONObject().put("id", c.name.take(7)).put("message", c.shortMessage).put("time", c.commitTime.toLong() * 1000))
            }
        } catch (e: Exception) {} // no commits yet
        out
    }

    private fun creds() = UsernamePasswordCredentialsProvider("x-access-token", store.secret("gitToken"))

    private fun setRemote(g: Git, url: String) {
        if (url.isBlank()) throw IOException("set a remote URL first (Git sheet)")
        val existing = g.remoteList().call().firstOrNull { it.name == "origin" }
        if (existing == null) g.remoteAdd().setName("origin").setUri(URIish(url)).call()
        else if (existing.urIs.firstOrNull()?.toString() != url) g.remoteSetUrl().setRemoteName("origin").setRemoteUri(URIish(url)).call()
    }

    @Synchronized
    fun push(url: String): String = repo().use { g ->
        setRemote(g, url)
        val res = g.push().setRemote("origin").add("main").setCredentialsProvider(creds()).call()
        res.joinToString("\n") { r -> r.remoteUpdates.joinToString { "${it.remoteName}: ${it.status}" } + (r.messages ?: "") }
    }

    @Synchronized
    fun pull(url: String): String = repo().use { g ->
        setRemote(g, url)
        val r = g.pull().setRemote("origin").setRemoteBranchName("main").setCredentialsProvider(creds()).call()
        if (!r.isSuccessful) throw IOException("pull failed: ${r.mergeResult?.mergeStatus ?: r.fetchResult?.messages}")
        r.mergeResult?.mergeStatus?.toString() ?: "ok"
    }
}
