# 9. Build notes (stage 9)

One note per layer as it's built on the `rewrite` branch (both repositories), with its size
against the budget, its checks, and where it differs from the function list.

## The application layer (runtime plugins), 2026-11-21

In `promptpipe-plugins`, branch `rewrite`: `runtime-records`, `runtime-chats`,
`runtime-profiles`, `runtime-send`, `runtime-plugins`, `runtime-storage`, and `test/` (Node's
test runner with stand-in calls: `npm test`).

**Checks**: 26 tests pass without a phone; terms-check 0; every line within 100 characters
(Prettier 3.3.3, run from a temporary download, nothing added to the project).

**Size**: 1,340 lines against a budget of 700 (see `8-functions.md`, "Measured in the build").

**Re-estimate** (decided 2026-11-21: from real numbers): the application came out at 1.9 times its
budget. If the other layers overrun the same way, the app is about 6,700 lines; adapters are
thinner than deciding code, so the expected range is **5,000–6,000** lines, every feature kept,
against today's 9,226. Each layer's note updates this.

**Where it differs from the function list** (each also written into the design files):

- Flat records: every collection is one list and a child names its parent (`3-terms.md`).
- `value_get` became small getters (`setting_get`, `provider_get`, `profile_get`, `model_get`,
  `options_get`, `block_on_get`, `plugin_setting_get`): one per question, simpler to read.
- `record_apply` applies an operation to the State as it is now, saves what it touched and
  commits it (D2), so saving and committing happen in one place.
- Tags: `chat_tag_build`, `turn_tag_build`, `turn_tags_build` (pure) instead of `tag_add` and
  `tag_remove` (records do the rest).
- `query_parse` lives in `runtime-chats` and the screen uses it too (it was listed twice).
- `chat_load` (a chat's turns into the State once), `chat_files_build` (a chat's files for
  saving), `chat_file_build` (a safe, unique file name) were missing from the list.
- The chats folder's place is the setting `storage.chats_folder`; copying a folder is `file_move`
  with `copy` (`4-ports.md`).
- Counter tags' numbers are saved as `counters.json` with the chats (the State's `counters`).
- The State counts the pages being opened (`opening`), so two sends can't both open the last page.
- A side request's answer is what `message_send` returns; nothing else carries it.
- `plugin_write` also goes back to the previous copy (`previous`) and writes your copy of a
  built-in plugin (`copy: "yours"`) (`4-ports.md`).

**Carried over as content, not code** (X6): the eight template texts, word for word, as Markdown
files in `runtime-profiles/templates/`.

**Libraries**: fflate 0.8.3 in `runtime-plugins/vendor/` (with its licence), not counted.


## The core (Odin), 2026-11-21

In `promptpipe`, branch `rewrite`, folder `core/`: `main`, `server`, `router`, `files`,
`plugins`, `api`, and the JSON adapter `json`; `core/test/test_core.py` runs the built core
against real HTTP.

**Checks**: compiles with `odin check -vet -strict-style` (dev-2026-11); the 17 checks of
`test_core.py` pass against the running program (the key, the challenge, writes and outside
changes, paths that can't leave their root, the phone's storage rules, search, pattern reads,
copies, plugin hashes, which copy runs and is served, the catalogue's signature, the token, and a
local API job answered by a stand-in screen); every line within 100 characters (wrapped by hand
and by a small script: Odin's formatter isn't installed here).

**Size**: 1,185 lines against 580 (2.0×): api 241, files 313, json 52, main 62, plugins 247,
router 116, server 154. Wrapping long JSON templates and conditions to 100 characters took about
200 of them.

**Re-estimate**: both layers built so far came out at about twice their budgets. If that holds,
the app is about **6,500–7,000** lines, every feature kept (today: 9,226). The adapters still to
come (platform, loader, page side, screen) decide where it lands.

**Where it differs from the function list** (written into the design files):

- The platform's check (S2) is `/challenge?nonce=…`: the core answers HMAC-SHA256 of the nonce
  with the key, so the key is never sent.
- The port over HTTP is `POST /call` (an envelope in, an envelope out) and `POST /event` (the
  app's `job_changed`); `GET /events` is the event stream (server-sent events, the last 200 kept
  for a reconnect).
- The phone's storage (`device`) is read and listed; the only write is a `.nomedia` marker and the
  only delete a folder named `PromptPipe` (the old app's, X5).
- `file_read` takes a `pattern` (`*` for one path part) to read every chat's `meta.json` at once.
- A job the caller leaves is cancelled with `job_received` and `request: "cancel"`; the runtime
  stops its send.
- The catalogue's two public keys are placeholders until the key is made on the phone (S8); until
  then no catalogue is accepted (safe by default).
- Plugin copies: built-in in the APK's `plugins/`, updates in app-private `plugins/`, yours in the
  app folder's `.promptpipe/plugins/`, each with a `-previous` folder for going back.

**Not reused**: nothing from the old core; only the Odin library's own API was looked up.

**Next layer**: the platform (Kotlin), which can't be compiled here: you build it on the phone.

## The platform (Kotlin), 2026-11-21

In `promptpipe`, branch `rewrite`: `app/` (Gradle files, the manifest, the launcher icons carried
over as part of the look) and `app/src/main/java/dev/zieviox/promptpipe/`: `App`, `Core` (the app
folder, starting and checking the core, R1, R8, S2), `Port` (the envelope over the extension's
port; the platform's calls; `site_*` passed on to pages), `Pages` (sessions, page scripts,
recovery, pop-ups, `page_changed`), `MainActivity` (the views, the region, Back, Alt+S, sharing in,
the picker), `Repo` (JGit), `Credentials` (Keystore, `http_fetch`), `Services`, `KeepAlive`;
`core/android/shim.c`; `scripts/build.sh`, `scripts/plugins_copy.py`.

**Checks**: none possible here (no Android build environment, as agreed): it's compiled on the
phone. Written against the APIs the old app already builds with (GeckoView 144, JGit 5.13).

**Size**: 959 lines against 520 (1.8×).

**Where it differs or needs your decision**:

- **The app folder is `Documents/PromptPipe`** (or the app's own external folder without
  all-files access), not `/sdcard/PromptPipe`: that's the old app's, which the new one only
  imports (X5). Documents is Android's standard place for documents you make.
- Alt+S while a page has the focus reaches the screen as `back_pressed` with `key: "Alt+S"`.
- The application names the chats folder, the author and the remote in each git call.

**Reused because there's no other way** (reported, X1): the Bionic shim's three no-op pthread
calls and its 64-aligned thread-local, and the build steps for linking Odin against the NDK.

## The loader and the page side, 2026-11-21

**Loader** (`promptpipe` `rewrite`: `app/src/main/assets/ui/index.html`, `loader.js`): routes each
call (the application's in this page, the core's over `POST /call`, the platform's and `site_*`
over the relay), carries events (the core's `/events` stream, the port's events; `job_changed`
goes to the core's `POST /event`), holds the one `State` (`state_get`, `state_set(change)` then a
redraw through `redraw_set`), loads plugins (runtime first by `order`; safe mode: built-in copies
only; a failing runtime plugin of yours restarts in safe mode naming it; `.css` joins the page,
`.js` runs in its own scope with its own `PP`, everything else and the `content_script` files are
content for `content_read`), runs hooks (`chat_route`, `block_text`, `send_before`, `reply_after`
for the plugins with a live block in the chat's profile; the rest for every plugin), and starts:
`app_get` → plugins → `state_load` → `app_start_run` → draw. 197 lines (budget 180).

Plugins register with `PP.plugin_set({ functions, calls, events, hooks })`: functions join `PP`
under their names, calls join the application's part of the call table, events and hooks are
listened to.

**Page side**: in the APK, `ppext/` (manifest; `relay.js` on the app's own screen;
`page.js` in site pages: joins the port, says hello, runs the scripts the app hands it with
`script_run` (each returns stages; `PP.stages` live, `PP.defaults` the ones before it), answers
`site_*`, reports `page_changed` with `ready` when the chat box shows); 70 lines (budget 40). In
the plugins repo, `runtime-site` (the default routine as a content script, with Turndown 7.2.5 and
turndown-plugin-gfm 1.0.2 in `vendor/`): `site_send`, `reply_read`, `reply_format`, `site_read`,
`site_model_list`, `site_model_set`, `site_chat_list`, `site_report_build`, `ready_get`; the
runtime's `provider_build` hands it (then the provider's own script) to each page. Tested in
Chromium against a stand-in site (sending, streaming, a table read as GFM, a refusal, every turn).
503 lines (budget 160): Prettier spreads its long object literals.

**Running total so far** (lines of code): runtime 1,424, site 503, core 1,185, platform 959,
loader 197, page script 70 = **4,338**, before the screen (budget 1,360).

**Still to build** at that point: the screen, the optional plugins, the old-content import, the
catalogue, and this note (all below).

## The screen, 2026-11-21

`runtime-screen` (tags `runtime`, `ui`; order 90) in the plugins repo. Preact 10.29.8 and htm
3.1.1 draw the screen from the `State`: every component is a plain function of its inputs with no
state of its own, so the State is the only state. markdown-it 15.0.3 shows replies, with HTML
escaped (S10), tables (D5) and a Copy button on code. SortableJS 1.15.7 reorders lists: a drop is
undone on the page and sent as a record move, so Preact stays the only thing changing the page.
All four are pinned in `vendor/` behind `view.js`, the adapter.

- `commands.js`: the command table (strategy 2) that the menus, keys, Find, help mode and guides
  read. `RUNS` holds what a dialog's OK or a sheet's item runs with data; those aren't listed in
  Find.
- `chat.js`: the header with the provider, model and status dot, and the provider menu. The turns:
  long messages folded, thinking folded, reply actions, swipe right to quote and left to copy.
  Sends on their way, queued (Move up, Edit, Remove) and failed (Check, Retry, Edit, Dismiss, Open
  the site, Copy page report). "↓ 1 new", and the message box (Enter or Ctrl+Enter, ↑ edits the
  last message, bigger box, Stop).
- `lists.js`: the chats list (pinned, your order of folders and chats, empty folders as `Folder`
  records, search, tag chips, select, drag), the site view's bar (tabs, address bar, linked chat),
  and Find (chats, functions, messages; ranked; snippets with the matches marked).
- `sheets.js`: Settings drawn from the schemas, with each section's extra rows and any plugin
  command placed in that section. The chat sheet, moving chats, model and options, Quick edit,
  profiles and blocks, adding a block, the preview, the prompt library, plugins with the catalogue
  and installing, plugin settings, credentials, the storage check, history, the core log, help,
  quick start, guides, site chats, a turn's details, and the outside-change dialog (D7). What a
  sheet reads when it opens (models, history, log) is read once per opening, into `ui.loads`.
- `actions.js`: linking a chat to the page, importing from it, export and import, chat and message
  tags, renaming, deleting chats (they stay in the history), folders, text files, attachments,
  another page, the page report, credentials.
- `screen.js`: the root draw (one frame at most), the theme (mode, accent, theme plugin, scale,
  text size; the system bars follow), staying at the bottom, marking finished replies as new, keys
  and Back (Escape closes what's on top first; `back_pressed` is answered here), shared text and
  files, help mode, and the guides (the welcome guide on a first start).

**Checks**: `test/test_screen.js` runs the real loader and every runtime plugin in Chromium
against a stand-in core. It covers the welcome guide, the chats list, Settings and its sections,
the plugins sheet, Find by key, a first message making a new chat whose files are saved, and no
page errors. Screenshots were checked in light and dark.

**Size**: 3,011 lines with its CSS (budget 600). Most of it is the sheets: Prettier puts each
item's fields on their own lines.

## The optional plugins, the old app's import and the catalogue, 2026-11-21

- **Memory** (UC43): pinned facts, then the earlier chat; below the maximum everything in full.
  Above it, recent turns stay word for word and older ones go in as summaries, coarser the older
  they are, each made once in the background by a side request. Your side and the AI's go apart
  or together. "Only what this site chat hasn't seen", the AI named per line when the chat used
  more than one site, and the profile's "at depth N" prompts go among the messages. Text from the
  chat can't pose as memory's own structure. The summaries are chat data (D6), shown and edited as
  the chat file's folded "Memory" section. Its labels, request and sent text are the old app's
  words (X6).
- **Sub-chats** (UC44): a run of turns with one site chat is a sub-chat (the turn's `page_url`).
  `chat_route` sends the next message to a new site chat on the provider you pick, back to an
  earlier one, or where it was. "New sub-chat here" under a reply branches: the branch sees the
  chat up to that reply, then only its own turns (Memory asks `sub_chat_turns_get`). Dividers and
  a "Next message" note are drawn through the `turn_render` hook.
- **Base64** (UC45): encoding, the instruction word for word, lenient or strict decoding that says
  what it fixed, and "Decode base64" under every reply even when the plugin is off.
- **OpenAI-style API** (an `api` provider): the address, a credential name (the platform adds the
  key for its hosts only), real streaming, and the service's model list.
- **DeepSeek** and **Qwen Chat**: selectors and options as data, plus small content scripts
  (DeepSeek: refusals and the human check; Qwen: refusals, the model list that opens by itself,
  the folded thinking card). **Ember** and **Paper**: colour tokens only.
- **Page report**: there's no separate plugin. The generic report is `runtime-site`'s
  `site_report_build` (a provider's own `report_build` wins), and the screen copies it from the
  provider sheet and from a failed send.
- **The old app's import** (`old-app-import`, removable, X5): on the first start it marks
  `/sdcard/PromptPipe` and the old app's own folder with `.nomedia`, zips each whole (git history
  included) into `.promptpipe/backups/`, then imports:
  - config.json: settings, profiles in every earlier shape (blocks, `pipe.rows`, the plugins that
    were on, the System prompt plugin's stack as linked blocks), plugin settings under their new
    keys through `old_keys`, and provider settings;
  - the prompt library (both file names);
  - every chat file with all its fields;
  - Memory's summary files.

  Chats already here are skipped, so an import that stops part way picks up again at the next
  start. Settings › Chats and storage gets "Delete the old app's folders" (asks first; the core
  deletes only folders named PromptPipe there) and "Import again".
- **Catalogue**: `catalogue.json` lists every plugin with its version, path, built-in flag and the
  SHA-256 of each file. `scripts/catalogue_build.py` writes it. `scripts/catalogue_sign.py
  --new-key` makes the ed25519 key on the phone: the private key goes to
  `~/.promptpipe/catalogue.key`, you copy it to your password manager, and the public key is
  printed for `PUBLIC_KEYS` in `core/plugins.odin`. `scripts/catalogue_sign.py` then writes
  `catalogue.json.sig`. Checked against the core's `catalogue_verify` with a throwaway key: signed
  is accepted, changed is refused.

**Refinements to the earlier layers made while building these** (reuse rather than additions):

- The loader applies an application call's `{ state, targets }` answer through `record_apply`, so
  calls that change records are saved wherever they're called from. `plugin_set` also takes
  `commands` and `sheets`.
- `record_export` and `record_import` are built (`runtime-records/export.js`), and so is the
  shared `repo_commit`.
- Each chat's plugin data is loaded with the chat (`chat_data_get`, `chat_data_set`). An edited
  section goes back to its plugin through `chat_section_parse`.
- A side request can go out `plain` (without the profile's blocks), and a route can lend only a
  provider.
- Three hooks were added: `turn_render`, `model_list` (API providers) and `app_start`.
- The core's `file_list` can include hidden entries.

**Checks**:
- 35 tests pass (`npm test`, the screen's and the page side's in Chromium).
- 17 core checks pass, plus the catalogue's signature check.
- The call contract: 74 calls (73, plus `chats_folder_get` from the duplicate check) and 7 events, names checked.
- The terms check is clean (only the vendored libraries' own words).

**Measured** (lines of code, comments and blank lines not counted; Prettier at width 100 for JS):

| Part | Lines | Budget |
|---|---|---|
| runtime (records, chats, profiles, send, plugins, storage) | 1,608 | 700 |
| runtime-site | 503 | 160 |
| runtime-screen | 3,011 | 600 |
| core | 1,190 | 580 |
| platform | 963 | 520 |
| loader | 242 | 180 |
| page script | 70 | 40 |
| optional plugins | 608 | 550 |
| **the app** | **8,195** | **3,540** |
| old app import (removable) | 421 | — |
| scripts (catalogue, plugins copy) | 106 | — |

That is 2.3 times the budget and above the re-estimate of 6,500–7,000. The screen alone is 2,400
over. No features were cut and nothing was packed (decided G).

## What needs the phone

1. **Build it**: `python3 scripts/plugins_copy.py` (it reads the plugins repo's catalogue), then
   the Gradle build. The Kotlin platform has never been compiled; expect a round of compile
   errors.
2. **Make the keys, once**: `sh scripts/keys_make.sh` (on the phone or computer you build on). It
   makes the APK's release key, which by default is your `debug.keystore`'s key under a new
   password, so the new app installs over the old one with nothing uninstalled. It also makes the
   catalogue's keys 1 (everyday) and 2 (backup), puts both public keys into `core/plugins.odin`
   and key 1's into the plugins repo's `catalogue.pub`, and prints what goes into your password
   manager. Then commit both, sign with `scripts/catalogue_sign.py`, and build with
   `sh scripts/build.sh <name> <code> release`. Until the keys are made no catalogue is
   accepted; the built-in plugins and installing from a link, zip or AI answer work anyway.
3. **Stage 10, parity**: walk the old app's behaviour (2b) on the phone. Also try DeepSeek and Qwen
   on the real sites (their selectors are from November's page reports) and the old app's import
   on your real data. The import only reads the old folders, apart from the marker.

## Decisions to confirm

- The app folder is `Documents/PromptPipe` (the old `/sdcard/PromptPipe` is only imported).
- Preact 10.29.8, not 11: 11 ships no file that works without a bundler.
- Every plugin is built in, providers included, so a fresh install works before the catalogue is
  signed.
- Sub-chats picks a provider for a new sub-chat, not a profile: profiles no longer hold the site.
- Memory's "summary request carries" is the old switch "Run the profile's plugins on the summary
  request". "Prompts picked for summaries" isn't built.
- Renaming a chat keeps its file's name.
- Attachments added before a chat's first message are kept under `new/`.
- The old app's folder order and pins aren't imported (its order file wasn't found in the old
  code).
- Icons are text glyphs for now, not drawn to match the screenshots.

**Other sources** (added after the note above): another repository's catalogue is checked against
its own key, which it publishes as `catalogue.pub`. You see the key and accept it once when you
add the source in Plugins › Catalogue › Sources; from then on that source must be signed with that
key. The official source uses the keys built into the app.

**Reused from the old code** (reported, X1): the Bionic shim and NDK steps (above), and data rather
than code: the DeepSeek and Qwen selectors, Ember's and Paper's colours, Memory's and Base64's
wording (X6), and the old file shapes the import reads.

## The duplicate check and its merges, 2026-11-21

The clone-detection skill on the remake (vendored libraries and tests left out): 8,632 lines, 0.42%
duplicated (JS 0.29%, Odin 0.51%, Kotlin 1.08%, its import lists). Merged:

- **Opening a site page**: one `page_add` in `runtime-send` (the pool): within "Pages at once",
  counting pages being opened, tracked. Model and options, the first start and the site view's ＋
  use it. Fixed: Model and options opened an untracked page past the limit.
- **Creating a chat**: one `chat_create` in `runtime-chats`, used by the screen, the local API's
  jobs and site chats. Fixed: chats from other apps had no creation time.
- **Adding profiles with new ids**: the old app's import goes through the profile import
  (`record_import`, one clash rule: "Name (2)"), which now also says which new id each profile and
  block got, so imported chats keep their toggles.
- **Comparing site chat links** (`url_same`) and **a site's short name** (`site_name_get`):
  `runtime-chats` owns them; Sub-chats and Memory use them.
- **Base64 to bytes and back**: `PP.base64_decode` and `PP.base64_encode` in the loader.
- **Visibility and an element's text in site pages**: `runtime-site` exposes `visible` and
  `text_get` to providers' scripts (DeepSeek keeps its stricter check on purpose).
- **The default chats folder**: the core owns it and answers `chats_folder_get`.

Left as they are (in the skill's `accepted.md`): the core's JSON readers, the phone-path write and
delete rules, the HTTP read loops, the send queue's loops, the record lookups, sheets that look
alike, Kotlin import lists. 37 tests and the core's checks pass.

## The first run on the phone, 2026-11-22

Built and installed on the phone (Android 16, a Samsung A15). What it found, and the fixes:

- **Install refused** ("problem parsing the package"): the phone had 336 MB free. Not the APK.
- **Crash at start**: the screen's link check waited on GeckoView's main thread
  (`GeckoResult.poll`), which GeckoView forbids. It now answers at once. A crash is now written to
  `Download/promptpipe-crash.txt`.
- **The site view never showed**: the screen sent its place in pixels, the platform read
  fractions. The contract's `view_set` row now names the fields (`l`, `t`, `r`, `b`, fractions).
- **Pages never updated** (no address, title or ready state; closed tabs stayed): nothing listened
  to `page_changed`. The pool keeps its pages from it now, and a closed page is reported.
- **The old chats didn't come in**: the backup read the whole old folder (git history included)
  into the screen and sent it as one zip; the core refuses a request over 64 MB, so the import
  stopped each time. Now the core copies the folder itself, file by file in 1 MB pieces, into
  `.promptpipe/backups/old-app-shared` (a folder, not a zip: deviation from X5's "zipped", since
  copying needs no zip writer in the core and goes on where it stopped), only when the phone has
  room for it plus 500 MB; otherwise the import goes ahead without a backup and says why. The
  import shows a report of what it brought in. A chat file written by the old app's own code is
  now a test fixture (`test/fixtures/old-chat.md`).
- Gradle could not find the pinned GeckoView (a version from memory): the build uses the cached
  one, as the old build did.
- **The screen is watered down**: paused at your request; the parity walk comes next.

Every message between the layers was checked against the contract (app to platform, app to core,
app to page): the two above were the only mismatches.

## The screen against the spec and the wireframe, 2026-11-22

After the first phone run showed a watered-down screen, the screen was rebuilt in four steps
against `ux/SPEC.md` and `ux/wireframe.html` (`ux/spec-diff.md` has the list and what's still
open). Each step: build, test in Chromium with the stand-in core, screenshot with
`scripts/screens.js`, compare side by side with the wireframe's own screenshots, fix the gaps.

- Help mode keeps one line per command in the command table (`HELP` in `commands.js`); controls
  that aren't commands carry `data-help`, icon buttons name their command with `data-command`.
- "Show the page" opens the chat's provider page when none is open (it used to say "Get a
  provider first" with a provider set, one reason the site view seemed missing on the phone).
- The site view's layout follows the wireframe; the native page sits under the site bar
  (`region_get`), over the screen's placeholder card.
- Checks: 42 plugin tests pass (help mode added), the core's checks pass, the terms check's
  remaining hits are in the skills' own lists of old words and `build.sh` ("tool").
- Not run: anything on the phone since the first run. The next build is the check.


## Later: asked for, not now (2026-11-22)

- **An unanswered "Changed outside the app" survives closing the app** (Gtex: "I prefer if it
  saves across closing but it's not a priority"). Today the open questions live only in the
  State; they'd be saved with the app's files and asked again at the next start.
- **Attachments sent to the sites**: no provider plugin uploads them yet. Until one does, the app
  reports it (provider.accepts) instead of sending without them.
- **A backup option** (Gtex, 2026-11-23): everything the app keeps, saved to one file and
  restored from it.
- **The look**: every screen against the wireframe, with before and after pictures.
- **The guides' overhaul** (quick start, log-in help), and **versions and branches** (after the
  release).
- What `ux/spec-diff.md` still lists as open.

## Chat screen conventions, from a UI/UX search (2026-11-23)

Agreed with Gtex, to follow from now on (sources in the conversation: web.dev, Apple HIG, SAP
Fiori, TanStack, Smashing Magazine):

1. Text selection is Android's own: no custom gestures on text (no double tap, no swipes on
   replies); long press stays the platform's.
2. While text is selected, nothing scrolls or redraws under it; the chat follows the bottom only
   when you're already there and never pulls you back.
3. The message box changes size only when its text changes (never on every redraw), so the
   conversation doesn't jump.
4. Buttons (Undo, Redo) stay out of areas that announce changes.

Not taken (Gtex): a visually hidden status for screen readers. Hidden UI is worse UX here;
whatever is announced is also shown.

To do when the fixing resumes, in this order:

1. The four conventions above, in the screen.
2. "Saved, but not added to the history: Exception caught during execution of add command" still
   shows on the phone after the fix that stopped walking the folder: show JGit's underlying cause
   in the message, then fix from it (suspected: the chats folder on shared storage refusing the
   index lock's rename).
3. The imported copies of the old app's nested history folders still sit in the chats folder
   (paths longer than Android allows): offer to remove them.
4. (Settled: no chat was affected; the chats loaded back. A backup option goes to Later.)
5. Remove the Select text button under replies (Gtex: yes).
6. Quick edit shows Edit twice (the "Edit profile" pill and Edit beside the profile dropdown).
7. (Settled: no permanent Undo button for now; the toasts and Find, as now.)
8. Qwen, from Gtex's page reports (2026-11-23): Stop is `button.stop-button` (aria-label Stop;
   the plugin's `#stop-message-button` is gone, so Stop was never seen); your messages are
   `p.user-message-content` (long ones folded with an Expand button, full text on the page);
   in the reply only a status card shows the current step's title
   (`.qwen-chat-thinking-status-card-title-text`, "Thinking completed" at the end); the thinking
   text itself is only in the drawer the card opens (`.ant-drawer`, half height, with
   `button.ant-drawer-close[aria-label=Close]`): `.qwen-chat-thinking-and-sources-content-
   thinking-container`, one `.qwen-chat-thinking-status-card` per step with its
   `.qwen-markdown`. To do: the Stop selector; live step titles; and the full thinking live
   (Gtex chose b): the plugin opens the drawer only while the site view isn't showing that page,
   closes it with its Close button the moment the site view opens (the screen tells the page),
   and never opens it while you're looking; read at the end the same way.
9. (Later: the look, screen by screen against the wireframe, with before and after pictures.)
10. Notices (errors and toasts) close with a tap instead of waiting out their time; one with a
    button (Undo, Redo, Reply ready) closes when its button or the rest of it is tapped.
11. One place for all logs (Gtex: "a global place for all logs"), one list, newest first, each
    entry with its time, kind and details, filterable by kind, with Copy and Clear, kept across
    closing the app: the notices shown (errors marked; a missed one can be read later), failed
    sends and their reasons, history (git) errors, imports' reports, the site pages' events
    (reloaded, crashed, not ready), the core's log (logs/core.log) and the platform's crash
    record (Download/promptpipe-crash.txt). Reached from Find and Settings › Advanced (where the
    core log used to be); an unread error puts a dot on the drawer's Settings button. No new
    buttons (Gtex wary of clutter).

Later (asked for, not now): see "Later: asked for, not now" above.
