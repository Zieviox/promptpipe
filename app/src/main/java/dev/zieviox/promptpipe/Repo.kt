package dev.zieviox.promptpipe

import org.eclipse.jgit.api.Git
import org.eclipse.jgit.lib.PersonIdent
import org.eclipse.jgit.storage.file.WindowCacheConfig
import org.eclipse.jgit.transport.URIish
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// The chats folder as a git repository (JGit, used as it is): every save is a commit (D2); push
// and pull to your remote with the git token from Credentials (UC36). The application names the
// folder, the author and the remote in each call.
class Repo(private val app: App) {
    init {
        // JGit's statistics need java.lang.management, which Android lacks.
        try {
            WindowCacheConfig().apply {
                javaClass.getMethod("setExposeStatsViaJmx", Boolean::class.javaPrimitiveType).invoke(this, false)
            }.install()
        } catch (e: Throwable) {
        }
        app.port.handlers.apply {
            put("repo_commit") { d -> repo_commit(d) }
            put("repo_push") { d -> remote_run(d, push = true) }
            put("repo_pull") { d -> remote_run(d, push = false) }
            put("commit_list") { d -> commit_list(d) }
        }
    }

    // The history repository lives in the chats folder's `.promptpipe/repo`, its working tree
    // the chats folder itself.
    @Synchronized
    private fun repo_open(folder: String): Git {
        val tree = File(folder)
        val dir = File(tree, ".promptpipe/repo")
        if (!dir.exists()) {
            Git.init().setDirectory(tree).setGitDir(dir).setInitialBranch("main").call().close()
        }
        return Git.open(dir).also { git ->
            git.repository.config.apply {
                setString("core", null, "worktree", tree.path)
                setBoolean("core", null, "filemode", false)
                save()
            }
        }
    }

    @Synchronized
    fun repo_commit(d: JSONObject): Any? = repo_open(d.getString("folder")).use { git ->
        val paths = d.optJSONArray("paths") ?: JSONArray()
        for (i in 0 until paths.length()) git.add().addFilepattern(paths.getString(i)).call()
        git.add().setUpdate(true).addFilepattern(".").call()
        if (git.status().call().isClean) return@use JSONObject.NULL
        val who = PersonIdent(d.optString("name").ifBlank { "promptpipe" }, d.optString("email").ifBlank { "promptpipe@localhost" })
        val id = git.commit().setMessage(d.optString("message", "update")).setAuthor(who).setCommitter(who).call().name.take(7)
        if (d.optBoolean("auto_push") && d.optString("remote").isNotBlank()) {
            app.workers.execute {
                try {
                    remote_run(d, push = true)
                } catch (e: Exception) {
                    app.port.event_send("page_changed", JSONObject().put("error", JSONObject().put("code", "unavailable").put("message", "Auto push failed: ${e.message}")))
                }
            }
        }
        id
    }

    @Synchronized
    private fun remote_run(d: JSONObject, push: Boolean): Any? = repo_open(d.getString("folder")).use { git ->
        val url = d.optString("remote").ifBlank { throw Refusal("failed_precondition", "set a remote first (Settings › Chats and storage › Git)") }
        val token = app.credentials.value_read(d.optString("credential", "git token"))
        val remote = git.remoteList().call().firstOrNull { it.name == "origin" }
        if (remote == null) git.remoteAdd().setName("origin").setUri(URIish(url)).call()
        else if (remote.urIs.firstOrNull()?.toString() != url) git.remoteSetUrl().setRemoteName("origin").setRemoteUri(URIish(url)).call()
        val login = UsernamePasswordCredentialsProvider("x-access-token", token)
        if (push) {
            git.push().setRemote("origin").add("main").setCredentialsProvider(login).call()
                .joinToString("\n") { r -> r.remoteUpdates.joinToString { "${it.remoteName}: ${it.status}" } }
        } else {
            val r = git.pull().setRemote("origin").setRemoteBranchName("main").setCredentialsProvider(login).call()
            if (!r.isSuccessful) throw Refusal("aborted", "pull failed: ${r.mergeResult?.mergeStatus}")
            r.mergeResult?.mergeStatus?.toString() ?: "ok"
        }
    }

    @Synchronized
    private fun commit_list(d: JSONObject): Any? = repo_open(d.getString("folder")).use { git ->
        val out = JSONArray()
        try {
            val log = git.log().setMaxCount(d.optInt("count", 200))
            d.optString("path").takeIf { it.isNotBlank() }?.let { log.addPath(it) }
            for (c in log.call()) out.put(JSONObject().put("id", c.name.take(7)).put("message", c.shortMessage).put("time", c.commitTime.toLong() * 1000))
        } catch (e: Exception) {
        }
        out
    }
}
