# promptpipe core

The portable core of promptpipe, written in Odin. Every platform shell
(Android now, the desktop app later) starts it and talks to it over
local HTTP on 127.0.0.1.

What it does:
- **Server.** It serves the app screen, plugins and the API.
- **Key.** Every call needs the security key. The app screen gets it through
  `/open?key=…`, which sets a cookie. The shell sends it in the `X-PP-Key`
  header. The core checks the Host header on every request.
- **Files.** Settings, chat history and the plugin store.
- **Page bridge.** The core queues work only the shell can do: driving a site
  page, app actions and native modules (git, clipboard, vibration, share). The
  shell picks it up with `/shell/next` and answers with `/shell/done`.
- **Missing modules.** If the shell doesn't have a module, the feature is never
  hidden. The call fails with "not supported on this platform" and a reason.
- **OpenAI API.** The OpenAI-style `/v1` is the only API for other apps. Its
  token is always on. An optional `"chat"` field continues a saved chat, and
  every reply reports the chat file, what was sent and the source site.

The core has no TLS of its own. Downloads (plugin links, release updates) go
through the shell's fetch, which is one more page-bridge call.

```sh
odin build core -out:ppcore
PP_KEY=<48 hex chars> ./ppcore --data <user folder> --private <app-only folder> --assets <app files> [--port 7790]
python3 core/test_core.py ./ppcore   # route checks
```
