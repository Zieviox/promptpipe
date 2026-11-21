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

**Still to build**: the screen (`runtime-screen`, tags `runtime` and `ui`: schemas are in
`runtime-records/schemas.json`; Preact 11.1.1 and htm 3.1.1 behind its adapter; markdown-it
15.0.3; SortableJS 1.15.7), the optional plugins (Memory, Sub-chats, Base64, Page report, OpenAI,
DeepSeek, Qwen, Ember, Paper), the old-content import (removable), the plugins repo's
`catalogue.json` with hashes (signed on the phone), and the final note.
