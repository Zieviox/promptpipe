# promptpipe

A chat app for Android on top of the AI web chats you already use. You log in
to the chat site once, inside the app; promptpipe types your messages there,
reads the replies, runs them through your plugins, and keeps every chat as a
Markdown file on your phone.

- **Plugins for everything**: steps before your message and after the reply,
  AI sites, themes, and the app itself (sending, chat files, history, the
  whole screen) as built-in plugins you can copy and change. Safe mode if one
  breaks; plugin updates download without a new APK.
- **Your chats stay yours**: Markdown files in `/sdcard/PromptPipe/history/`,
  a git repository (optional push to your own GitHub).
- **Tags, folders, full-text search**, per-message tags, counter tags (`part#`).
- **Model thinking kept**, folded under each reply.
- **Local API**: other apps on the same phone can use it like an OpenAI API at
  `http://127.0.0.1:7790/v1`. Only reachable from the phone itself.
- **Chats in parallel**: up to 4 site pages at once, for you, your plugins and
  other apps; more messages wait in a queue.
- **Memory**: long chats keep their context; older turns get summarised in a
  side chat before the limit is reached.
- **System prompt library**: save, pin and stack prompts.
- Touch first, with keyboard shortcuts for a hardware keyboard.

promptpipe ships **without AI site plugins**. Install the one for the site you
use (a `.zip` or a link) under Plugins. Using a chat site through automation
may be against that site's terms; it's your account and your call.

## Install

1. Download `promptpipe.apk` from the latest
   [release](../../releases/latest) and open it (allow installs from your
   browser or file manager the first time).
2. Open promptpipe, allow notifications (it keeps running in the background
   with one) and grant file access when asked.
3. ⋯ → **Plugins** → **Install from a file** (or paste a link) to add a site plugin.
4. Tap the site name in the header and log in on the site once.

New versions install over the old one; chats, plugins and logins stay.

## Guides

- [Quick start](app/src/main/assets/docs/QUICKSTART.md): everything from first
  message to tags, profiles, git backup and the local API.
- [Writing plugins](app/src/main/assets/docs/PLUGINS.md): steps, AI sites,
  site scripts, themes.

Both are also in the app (⋯ menu).

## Build it yourself

With the Android SDK and NDK and Odin installed, build the core first, then
the app:

    ANDROID_NDK_HOME=<ndk folder> sh scripts/build-core-android.sh
    gradle assembleDebug   # Gradle 9.8 or newer

The APK lands in `app/build/outputs/apk/debug/`. Put a `debug.keystore` next to
`settings.gradle.kts` to sign every build with the same key (so updates install
over each other); without it Gradle's usual debug key is used.

## Code

- `core/`: the portable core in Odin: local HTTP on 127.0.0.1:7790 with the
  security key, files, plugin store, page bridge, OpenAI-style API. Every
  platform's shell starts it (see `core/README.md`).
- `app/src/main/java/dev/zieviox/promptpipe/`: the Android shell in Kotlin.
  `Core` (starts the core, hands the key to the app screen), `Shell` (answers
  the core's calls: site pages, app actions, fetch, git, clipboard, vibration,
  share), `Hub` (the pages and the bridge to them), `Store` (folders),
  `GitStore` (JGit), `MainActivity`, `KeepAlive` (foreground service).
- `app/src/main/assets/ui/`: the core (`core.js`): state, plugin loader, app
  events, safe mode. Everything else is a plugin.
- `app/src/main/assets/ppext/`: the built-in extension whose content script
  drives the AI page.
- `app/src/main/assets/plugins/`: built-in plugins: the app parts
  (`core-*`, `chat-ui`), Base64, System prompt, Memory, Page report, themes.
- `scripts/plugin-bundle.sh`: makes the release's plugin bundle zip.

Built on Odin, GeckoView (Firefox's engine) and JGit.

## License

MIT, see [LICENSE](LICENSE).
