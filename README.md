# promptpipe

A chat app for Android on top of the AI web chats you already use. You log in
to the chat site once, inside the app; promptpipe types your messages there,
reads the replies, runs them through your plugins, and keeps every chat as a
Markdown file on your phone.

- **Plugins for everything**: plugins that work on your message and the reply,
  providers (one per AI website), themes, and the app itself (sending, chat files,
  history, the whole screen) as built-in plugins you can copy and change. Safe
  mode if one breaks; plugin updates download without a new APK.
- **Your chats stay yours**: Markdown files in `/sdcard/PromptPipe/history/`,
  a git repository (optional push to your own GitHub).
- **Tags, folders, full-text search**, per-message tags, counter tags (`part#`).
- **Model thinking kept**, folded under each reply.
- **Local API**: other apps on the same phone can use it like an OpenAI API at
  `http://127.0.0.1:7790/v1`. Only reachable from the phone itself.
- **Chats in parallel**: up to 5 site pages at once (10 if you allow it), for you,
  your plugins and other apps; more messages wait in a queue.
- **Memory**: long chats keep their context; older turns get summarised in a
  side chat before the limit is reached.
- **Profiles**: an ordered list of blocks (System prompts, plugins, your message)
  sent with each message; groups and per-chat toggles; templates to start from.
- **Prompt library**: save and pin System prompts, and link them into profiles:
  one edit changes every profile that links it.
- Touch first, with keyboard shortcuts for a hardware keyboard.

promptpipe ships **without providers** (the plugins for AI websites). Install the
one for the site you use under Plugins › Get providers (or a `.zip` or a link). Using a chat site through automation
may be against that site's terms; it's your account and your call.

## Install

1. Download `promptpipe.apk` from the latest
   [release](../../releases/latest) and open it (allow installs from your
   browser or file manager the first time).
2. Open promptpipe, allow notifications (it keeps running in the background
   with one) and grant file access when asked.
3. ⋯ → **Plugins** → **Get providers** (or install one from a file or a link).
4. Tap the provider's name in the header and log in on the site once.

New versions install over the old one; chats, plugins and logins stay.

## Guides

- [Quick start](app/src/main/assets/docs/QUICKSTART.md): everything from first
  message to tags, profiles, git backup and the local API.
- [Writing plugins](app/src/main/assets/docs/PLUGINS.md): the words (plugins,
  tags, blocks, toggles), plugins for messages, providers and content scripts, themes.

Both are also in the app (⋯ menu).

## Build it yourself

Every plugin, the built-in ones included, lives in
[promptpipe-plugins](https://github.com/Zieviox/promptpipe-plugins): clone it next
to this repo. Each build copies the built-in ones (index.json `"builtin": true`)
into the APK as they are in that checkout; this repo holds no copies.

With the Android SDK and NDK and Odin installed, build the core first, then
the app:

    ANDROID_NDK_HOME=<ndk folder> sh scripts/build-core-android.sh
    python3 scripts/copy-plugins.py   # the built-in plugins, from ../promptpipe-plugins
    gradle assembleDebug   # Gradle 9.8 or newer

The APK lands in `app/build/outputs/apk/debug/`. Put a `debug.keystore` next to
`settings.gradle.kts` to sign every build with the same key (so updates install
over each other); without it Gradle's usual debug key is used.

On the phone itself (Termux + proot), `scripts/build-local.sh <versionName> <versionCode>`
does all of it (the plugin copy included) and copies the APK to `/sdcard/Download/promptpipe.apk`.

### Version codes

An update only installs if its version code is at least the installed one's.
A lower code is refused, and Samsung's installer words it as "App not installed
as package appears to be invalid", which looks like a broken file but isn't.

- The codes so far: alpha3 to alpha41 used 13 to 52; **alpha42 to alpha45 used
  200 to 203** (alpha45 = 203). From there, code = alpha number + 158: alpha46 = 204,
  alpha47 = 205, and so on.
- `build-local.sh` refuses a code lower than the highest APK in `build/`, and
  without a code it takes the next one.
- `python3 scripts/apk-version.py build/*.apk | sort -n` lists the code and name
  of each APK (no aapt2 needed). On the phone, `pm path dev.zieviox.promptpipe`
  gives the installed APK's path to check the same way.
- If an update is refused with the code right, compare the signing key:
  `apksigner verify --print-certs <apk>`. Every local build so far is signed with
  `CN=promptpipe debug`, SHA-256 `9436d54f…a20f8d`.

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
- `app/src/main/assets/plugins/`: the built-in plugins, made by
  `scripts/copy-plugins.py` from promptpipe-plugins at each build (not in git;
  `plugins-revision.txt` next to it says which commit).
- `scripts/terms-check.py`: finds old words from before the rename of 2026-11-20
  (the words are in PLUGINS.md, "Words").
- `scripts/ux/`: the stand-in core for looking at the screen in a desktop browser,
  and the checks run against it (`redraw-check.js`, `migration-check.js`, `morph-test.js`).
- `scripts/plugin-bundle.sh`: makes the release's plugin bundle zip (a fallback for updates).
- `scripts/odin-reference.sh`: downloads the Odin language docs and an index of the core library
  packages the core uses into `build/odin-reference/` (not in git), for one compiler release.
- `.claude/skills/clone-detection/`: a Claude Code skill that finds duplicate code across both
  repos (token-based with jscpd, token-bag for near-miss copies, and a by-hand inventory of jobs
  done twice); `jobs.md` and `accepted.md` hold what earlier runs found and kept.

Built on Odin, GeckoView (Firefox's engine) and JGit.

## License

MIT, see [LICENSE](LICENSE).
