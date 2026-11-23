package dev.zieviox.promptpipe

import org.eclipse.jgit.api.Git
import org.eclipse.jgit.lib.PersonIdent
import org.eclipse.jgit.storage.file.WindowCacheConfig
import org.eclipse.jgit.transport.URIish
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider
import org.eclipse.jgit.treewalk.CanonicalTreeParser
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
    fun repo_commit(d: JSONObject): Any? = try {
        commit_run(d)
    } catch (e: Refusal) {
        throw e
    } catch (e: Exception) {
        // JGit wraps the reason ("Exception caught during execution of add command"): every cause
        // goes into the message, for the log.
        throw Refusal("internal", causes_get(e))
    }

    private fun causes_get(e: Throwable): String =
        generateSequence(e) { it.cause }.take(5).mapNotNull { it.message ?: it.javaClass.simpleName }.distinct().joinToString(" ← ")

    private fun commit_run(d: JSONObject): Any? = repo_open(d.getString("folder")).use { git ->
        val tree = File(d.getString("folder"))
        // A save cut short (the app killed mid-commit) leaves the index locked, and every save after
        // it fails. Saves here never overlap (this is synchronized), so an old lock is left over.
        val lock = File(git.repository.directory, "index.lock")
        if (lock.exists() && System.currentTimeMillis() - lock.lastModified() > 10_000) lock.delete()
        val paths = d.optJSONArray("paths") ?: JSONArray()
        // Only the files this save touched (a deleted one recorded as deleted): never a walk over the
        // whole folder, which was slow and failed on paths longer than Android allows (the old app's
        // nested history folders: "Exception caught during execution of add command").
        var staged = 0
        for (i in 0 until paths.length()) {
            val path = paths.getString(i)
            if (path.isBlank() || path.startsWith(".promptpipe/repo")) continue
            if (File(tree, path).exists()) git.add().addFilepattern(path).call()
            else git.rm().setCached(true).addFilepattern(path).call()
            staged += 1
        }
        if (staged == 0) return@use JSONObject.NULL
        // Nothing new against the last commit (staged, compared without walking the folder): no commit.
        val head = git.repository.resolve("HEAD^{tree}")
        if (head != null) {
            val unchanged = git.repository.newObjectReader().use { reader ->
                val last = CanonicalTreeParser().apply { reset(reader, head) }
                git.diff().setCached(true).setOldTree(last).call().isEmpty()
            }
            if (unchanged) return@use JSONObject.NULL
        }
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
