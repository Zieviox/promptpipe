# promptpipe

A chat app for Android on top of the AI web chats you already use. You log in
to the chat site once, inside the app; promptpipe types your messages there,
reads the replies, runs them through your plugins, and keeps every chat as a
Markdown file on your phone.

- **Plugins for everything**: steps before your message and after the reply,
  AI sites, themes. A plugin is a folder with a `plugin.json`.
- **Your chats stay yours**: Markdown files in `/sdcard/PromptPipe/history/`,
  a git repository (optional push to your own GitHub).
- **Tags, folders, full-text search**, per-message tags, counter tags (`part#`).
- **Model thinking kept**, folded under each reply.
- **Local API**: other apps on the same phone can use it like an OpenAI API at
  `http://127.0.0.1:7790/v1`. Only reachable from the phone itself.
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

Android Studio, or with the Android SDK installed:

    gradle assembleDebug   # Gradle 9.8 or newer

The APK lands in `app/build/outputs/apk/debug/`. Put a `debug.keystore` next to
`settings.gradle.kts` to sign every build with the same key (so updates install
over each other); without it Gradle's usual debug key is used.

## Code

- `app/src/main/java/dev/zieviox/promptpipe/`: Kotlin. `Hub` (the two pages
  and the bridge between them), `Server` (local HTTP on 127.0.0.1:7790),
  `Store` (files, plugins), `GitStore` (JGit), `MainActivity`, `KeepAlive`
  (foreground service).
- `app/src/main/assets/ui/`: the chat screen (plain JS).
- `app/src/main/assets/ppext/`: the built-in extension whose content script
  drives the AI page.
- `app/src/main/assets/plugins/`: built-in plugins (Base64, System prompt,
  themes).

Built on GeckoView (Firefox's engine), NanoHTTPD and JGit.

## License

MIT, see [LICENSE](LICENSE).
