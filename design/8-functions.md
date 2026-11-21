# 8. The function list (stage 8, 2026-11-21)

Every function of the remade app, per layer and module: its job, what goes in and comes out,
whether it is **pure** (data in, data out) or an **effect** (it calls out through the port, or
touches a library inside an adapter), the call it answers or uses, and its estimate in lines of
code. Each module's lines add up to its budget in `6-architecture.md` (3,540 for the app); the
check at the end adds them up again. Names follow `3-terms.md` (`noun_verb`, the closed verb list).

Columns: **Function** · **Job** · **In → out** · **Kind** (P pure, E effect) · **Call** (the call it
answers, or the calls it uses) · **Lines**.

## Core (Odin) — 580

### core · server (130)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `server_start` | listen on 127.0.0.1, one thread per connection, one arena per request | port → error | E | — | 30 |
| `request_read` | read one HTTP/1.1 request (header ≤ 64 KB, body ≤ 64 MB) | socket → `Request` | E | — | 35 |
| `response_write` | write a response, never cached | socket, `Response` → done | E | — | 20 |
| `stream_open` | open the event stream for the screen (server-sent events) | request → stream | E | events | 20 |
| `event_send` | send one event to the screen's stream | event → done | E | `job_received` | 10 |
| `core_start` | read the folders and the key, make the folders, start the server | args → exit code | E | — | 15 |

### core · router (110)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `host_verify` | the Host header is 127.0.0.1 or localhost with our port (S1) | request → bool | P | — | 8 |
| `key_verify` | the key from the cookie or the header, compared in constant time (S1) | request, key → bool | P | — | 15 |
| `session_open` | `/open?key=…` sets the cookie and goes to the screen | request → response | E | — | 12 |
| `envelope_parse` | an `Envelope` from a request body | text → `Envelope`, error | P | every call | 15 |
| `envelope_format` | a reply or an error as JSON | `Envelope` → text | P | every call | 10 |
| `call_validate` | the call is in the core's table and its data has the fields it needs | `Envelope`, table → `Error` | P | every call | 20 |
| `call_run` | route a call to its function; `unimplemented` for anything else (P5) | `Envelope` → `Envelope` | E | every call | 30 |

### core · files (160)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `path_verify` | a path stays inside its root; no `..`, no absolute paths, no backslashes | root, path → full path, error | P | — | 15 |
| `revision_get` | a file's revision (SHA-256 of its bytes) | bytes → `Revision` | P | — | 8 |
| `revisions_load` / `revisions_save` | the revision record (app-private) | → map / map → done | E | — | 15 |
| `file_read` | files by path or pattern, each with its revision and whether it changed outside the app | root, path → files | E | `file_read` | 22 |
| `file_write` | write to a temporary file, then rename (D4); refuse when the expected revision differs (D7) | root, path, data, expected → revision, `Outside_Change` | E | `file_write` | 25 |
| `file_move` | move a file or folder with the same check; make the folders it needs one at a time (Android) | root, from, to, expected → revision | E | `file_move` | 18 |
| `file_delete` | delete with the same check | root, path, expected → done | E | `file_delete` | 10 |
| `file_list` | names, folders, sizes, times; hidden names left out | root, folder → entries | E | `file_list` | 15 |
| `file_find` | the turns that match a query, with their lines (#212) | root, query → matches | E | `file_find` | 22 |
| `log_read` | the last 64,000 characters of the core log, never starting inside a character | → text | E | `log_read` | 10 |

### core · plugins (110)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `catalogue_verify` | the catalogue's ed25519 signature against the two public keys (S3, S8) | data, signature → `Catalogue`, error | E | `catalogue_verify` | 25 |
| `plugin_list` | every copy (built-in, updated, yours), its manifest, which runs, changed outside (S4) | → plugins | E | `plugin_list` | 30 |
| `plugin_write` | each file's hash against the entry, then write the plugin whole; keep the replaced one | plugin, files, entry → plugin | E | `plugin_write` | 35 |
| `plugin_remove` | remove one copy (yours or an update) | plugin, copy → done | E | `plugin_remove` | 20 |

### core · local API (70)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `api_token_verify` | the Bearer token against `api_token_hash` (trusted only at the revision the core wrote, D7) | request → bool | E | — | 12 |
| `api_request_run` | `/v1/models` and `/v1/chat/completions` (CORS, errors in OpenAI's shape) to a `Job`, sent as `job_received` | request → stream | E | `job_received` | 35 |
| `job_answer_write` | write `job_changed` parts to the caller as they come (streaming, keep-alive), and stop the job when the caller leaves (#209) | job, part → done | E | `job_changed` | 23 |

## Platform (Kotlin) — 520

### platform · start (60)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `core_start` | wait for storage (R1), start the core with a new key, restart it when it stops (1 s doubling to 30 s, R8), keep its log | → process | E | — | 35 |
| `core_verify` | check with a challenge that the port is our core (S2), never sending the key | → bool | E | — | 15 |
| `screen_open` | "Starting…", then the screen with the key; the reason and "Try again" when the core doesn't answer (R8) | → done | E | — | 10 |

### platform · activity (60)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `activity_start` | the window, edge to edge, the screen view, the service | → done | E | — | 20 |
| `insets_set` | keep the screen and the pages clear of the bars, the cutout and the keyboard (R7) | insets → done | E | — | 10 |
| `intent_parse` | text and files shared in, or selected text sent to the app | intent → event | E | `share_received` | 15 |
| `back_run` | Back: ask the screen first (R5), close a pop-up, then the site view, then to the background | → done | E | `back_pressed` | 15 |

### platform · pages (140)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `page_open` | a session for a page, its provider and content scripts handed to its page script (S9) | url, provider → `Page` | E | `page_open` | 30 |
| `page_close` | close a page; its waiting calls fail plainly | page → done | E | `page_close` | 10 |
| `page_navigate` | a url, back, or reload | page, to → done | E | `page_navigate` | 10 |
| `view_set` | show a page in the region the screen names; others move off screen at their real size (R3, #236); focus moves only on open, close or a tab picked (#240) | page, region → done | E | `view_set` | 30 |
| `page_start` | reopen and reload a page Android stopped or that crashed, also on coming back (R3) | page → done | E | `page_changed` | 25 |
| `popup_open` | a sign-in window over the site, closed when the site closes it or with Back (#244) | session → done | E | `page_changed` | 20 |
| `page_changed_send` | report a page's status, address, title, pop-up and errors in plain words (#241) | page → event | E | `page_changed` | 15 |

### platform · port (60)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `port_open` | the built-in extension and its port for the screen and each page | → done | E | — | 25 |
| `envelope_send` / `envelope_parse` | the envelope over the port | `Envelope` ↔ message | E | every call | 15 |
| `call_run` | route a call to its handler; `unimplemented` for anything else (P5) | `Envelope` → `Envelope` | E | every call | 20 |

### platform · repository (50)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `repo_commit` | add the touched paths, pick up moves and deletes, commit if anything changed | paths, message → commit | E | `repo_commit` | 15 |
| `repo_push` / `repo_pull` | with the git token from credentials as `x-access-token` | → done | E | `repo_push`, `repo_pull` | 20 |
| `commit_list` | commits for a chat's files or for everything | path, count → commits | E | `commit_list` | 15 |

### platform · credentials and fetch (90)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `credential_create` / `credential_delete` | encrypt with the Keystore key, kept out of backups (S7) | fields, value → credential | E | `credential_create`, `credential_delete` | 25 |
| `credential_list` | the listing, never values | → credentials | E | `credential_list` | 8 |
| `credential_read` | a read-write credential's value; the API token for Show and Copy | name → value | E | `credential_read` | 7 |
| `http_fetch` | a request (https only, S5), streamed, saved to a file if asked, a write-only credential added only for its hosts, a cut connection tried once, errors with the host (UC1.5) | request → response, parts | E | `http_fetch`, `http_received` | 50 |

### platform · services and keep-alive (60)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `clipboard_write` / `clipboard_read` | on the main thread | text → done / → text, image | E | `clipboard_*` | 8 |
| `content_export` | share or save a file the user keeps | content, to → done | E | `content_export` | 7 |
| `picker_open` | the system's file picker | types, many → files | E | `picker_open` | 7 |
| `url_open`, `storage_access_open` | a link in the browser; the all-files access screen | → done | E | `url_open`, `storage_access_open` | 5 |
| `vibration_start`, `bars_set` | a short tick; the bars' colours and icons | → done | E | `vibration_start`, `bars_set` | 8 |
| `app_get`, `app_start`, `app_close` | version, platform, its calls, safe mode; restart (normal or safe); to the background | → … | E | `app_*` | 10 |
| `service_start` / `service_stop` | the background service and its notification (R2) | → done | E | `service_stop` | 15 |

## Loader — 180

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `call_send` | send a call to whichever side registered it (core over HTTP, platform over the port, the application in-process) and wait for its reply | name, data → result, `Error` | E | every call | 25 |
| `call_add` | a side's calls into the table (the routing and the boundary check) | names, handlers → done | E | — | 10 |
| `event_on` / `event_send` | listen to and send events (the core's stream, the port's events) | name, handler | E | `event_on`, every event | 15 |
| `state_apply` | the next `State` from a change record (the only writer) | state, change → state | P | — | 15 |
| `state_set` | apply a change and ask the screen to redraw | change → done | E | — | 15 |
| `plugin_list_load` | the runtime plugins in order, then the others; a failing one of yours restarts in safe mode (UC33) | plugins → loaded | E | `plugin_list`, `app_start` | 30 |
| `plugin_load` | one plugin's files in its own scope; its error kept on it | plugin → `Plugin` | E | `file_read` | 20 |
| `content_read` | a plugin's content files (prose, decided F) | plugin, name → text | E | `file_read` | 5 |
| `hook_run` | a hook over the active plugins in profile order, each output feeding the next, with its trace entry and notes | hook, input, context → output | E | hooks | 25 |
| `pp_build` | the `PP` object: the calls marked P, `html`, the hooks, events | → `PP` | P | — | 20 |

## Page side — 200

### page script, in the APK (40)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `port_open` | join the platform's port once per top page; retry while the page has none | → done | E | — | 15 |
| `script_run` | run the content scripts the app handed this page (S9), each stage replacing the default one | scripts → stages | E | — | 15 |
| `call_run` | a `site_*` call to its stage | `Envelope` → `Envelope` | E | `site_*` | 10 |

### the default routine (a runtime plugin's content script, 160)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `element_find` | the first visible match of a selector list | selectors → element | E | — | 8 |
| `error_find` | a refusal, a human check or a login button on the page (old errors don't count) | provider, old → `Error` | E | — | 15 |
| `text_write` | type into the box the way a keyboard does, then wait for Send to be ready | element, text → done | E | — | 15 |
| `site_send` | type, press Send (or the button after the box, or Enter), confirm it went, try once more; then `reply_read` with the limits | page, text, limits → done | E | `site_send` | 30 |
| `reply_read` | watch the reply: new text, thinking, Stop; finished when settled; stuck after 45 s; the numbers-only log; progress as `reply_changed` | provider, before, limits → reply | E | `site_read`, `reply_changed` | 35 |
| `reply_format` | the reply's HTML as Markdown, thinking and citations removed (Turndown with GFM) | element → text | E | — | 10 |
| `site_read` | the newest reply, or every turn in page order; waiting for it to finish if asked | page, which, wait → turns | E | `site_read` | 12 |
| `site_model_list` / `site_model_set` | read the model picker and the options; set a model and the options | page → models / page, model, options → state | E | `site_model_*` | 20 |
| `site_chat_list` | the site's chats from its links | page → chats | E | `site_chat_list` | 5 |
| `site_report_build` | the provider's own report, else the page walked around the reply, the box and open panels | page → report | E | `site_report_build` | 10 |

## Runtime (the application) — 700

### runtime · send (170)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `message_send` | make a `Send`, queue it behind the chat's send on its way (UC2), start it | draft → `Send` | E | `message_send` | 15 |
| `queue_run` | start the next queued send of each chat that has none on its way | state → sends | E | — | 10 |
| `pool_remove` / `pool_add` | take a free page (preferring the chat's link, then the site), opening one up to the setting, or wait; give it back | send → page / page → done | E | `page_open` | 20 |
| `send_run` | the sequence: route, build, the provider (`site_model_set` and `site_send`, or `http_fetch`), the reply's hooks, save (strategy 8) | send → turn | E | `site_*`, `http_fetch` | 40 |
| `reply_apply` | a streaming reply's parts into the send (`reply_changed`, `http_received`) | send, part → send | P | — | 10 |
| `turn_save` | the turn with the chat's tags, the chat's name from the first line, the chat's link; saved, committed, a tick, marked unseen | send → chat | E | `file_write`, `repo_commit`, `vibration_start` | 25 |
| `send_set` | a send's status and `Error` (UC4); a cut-off reply keeps what came | send, change → send | P | — | 10 |
| `send_stop` | stop a send (UC3) | send → done | E | `send_stop`, `site_stop` | 8 |
| `failure_resolve` | Retry, Check (wait for the page's reply), Edit (back to the draft), Dismiss | send, choice → done | E | `failure_resolve`, `site_read` | 17 |
| `job_run` | a job as a send (a `models` job answers the profiles' names), its parts as `job_changed` | job → done | E | `job_run`, `job_changed` | 15 |

### runtime · chats (160)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `chat_format` | a chat as its readable Markdown: header, turns, the plugins' folded sections (D1, strategy 12) | chat, sections → text | P | `record_export` | 30 |
| `chat_parse` | an edited readable file back into the chat and the plugins' sections | text → chat, sections | P | `change_resolve` | 30 |
| `tag_build` | a tag as stored: spaces to dashes, `name#` numbered from its counter (UC20) | tag, counters, scope → tag, counters | P | — | 15 |
| `tag_add` / `tag_remove` | on a chat (every new message) or a turn (one number per counter) | target, tag → done | E | `record_set` | 15 |
| `chat_find` | parse the query (`"phrase"`, `#tag`, `in:folder`, `is:you`, `is:ai`) and ask the core | query → matches | E | `chat_find`, `file_find` | 20 |
| `folder_move` | move chats and folders, keeping each folder's order and the pinned order (UC17) | items, place → done | E | `file_move`, `record_set` | 15 |
| `site_chat_open` | the chat already linked to a site chat, or a new one (UC13) | provider, url → chat | E | `site_chat_open` | 10 |
| `site_chat_import` | the page's turns into the chat, or the newest reply decoded as a preview | chat, page, which, save → turns | E | `site_chat_import`, `site_read` | 12 |
| `attachment_add` | copy files into the chat's `attachments/`, listed on the draft (UC48) | chat, files → attachments | E | `attachment_add` | 8 |
| `chats_folder_move` | move, use or merge a chats folder (UC36) | folder, how → done | E | `chats_folder_move`, `file_*` | 5 |

### runtime · profiles (110)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `message_build` | the blocks top to bottom with the chat's toggles: System prompts by their rule, your message, plugins' text and changes by scope, depth prompts, joined (UC1, UC23) | profile, chat, message → text, trace | P (hooks through `hook_run`) | `message_build` | 45 |
| `prompt_send_get` | whether a System prompt goes with this message (every, first, every N, depth, off) | block, count, first → bool | P | — | 10 |
| `preview_build` | what a profile would send, with markers for plugins (UC25) | profile, first → text | P | `message_build` | 20 |
| `profile_create` | a profile from a template, with new block ids | template, name → profile | P | `record_create` | 10 |
| `template_list` | the shipped templates (their texts from content files, X6) and yours | → templates | E | `content_read` | 10 |
| `model_list` | the chat's page's models, its model and the options | chat → models, options | E | `model_list`, `site_model_list` | 15 |

### runtime · plugins (100)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `catalogue_load` | each source's catalogue and signature, verified; offers and updates (a newer version, the app new enough) | source → offers | E | `catalogue_load`, `http_fetch`, `catalogue_verify` | 25 |
| `plugin_install` | from an entry, a link, a zip or an AI's answer's files; asks when the name is taken; a new block plugin goes into the active profile | from → plugin | E | `plugin_install`, `http_fetch`, `plugin_write` | 30 |
| `answer_parse` | an AI's answer as files: each code block belongs to the name on the line before it | text → files | P | — | 12 |
| `zip_read` / `zip_write` | files from a zip (with the zip-bomb check, S6) and a zip of files (fflate) | bytes ↔ files | E | — | 13 |
| `plugin_update` | update one or all, or back to the previous copy | plugins → plugins | E | `plugin_update` | 12 |
| `plugin_copy` | a built-in plugin into your folder | plugin → copy | E | `plugin_copy` | 8 |

### runtime · settings and records (90)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `value_get` | the value that applies: the chat's own, the profile's, the provider's, the default (D8) | state, key, chat → value | P | — | 15 |
| `schema_get` | a collection's schema (fields, rules, storage, commands) | collection → schema | P | — | 5 |
| `record_validate` | a record against its schema | record, schema → problems | P | — | 10 |
| `record_list` … `record_delete` | the seven record operations, generic over the schema (strategy 1) | collection, … → records | E | `record_*` | 30 |
| `record_export` / `record_import` | a collection's file form both ways; name clashes as set (UC27) | collection, … → done / records | E | `record_export`, `record_import` | 15 |
| `store_load` / `store_save` | load and save per storage form (one file, a file per record, the chat's data folder), with the expected revision | form, data → done | E | `file_read`, `file_write` | 15 |

### runtime · change, credentials, storage (70)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `change_resolve` | an `Outside_Change` answered in the shared dialog: theirs, ours, both; keeping an edited readable file parses it back | change, choice → done | E | `change_resolve` | 25 |
| `api_token_create` | a new token, its hash in the settings, the value in credentials | → token | E | `api_token_create`, `credential_create` | 10 |
| `connection_verify` | a connection's provider, address and credential exist | connection → problems | P | — | 5 |
| `storage_verify` | make a folder, write in it, write beside the chats; each step with the system's answer | → steps | E | `storage_verify`, `file_*` | 15 |
| `app_start_run` | the first things after loading: the provider's page in the background, the daily catalogue check | state → done | E | `page_open`, `catalogue_load` | 15 |

## Screen — 1,360

### screen · logic (120)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `query_parse` | Find's words, phrases, tags, folder and side | text → query | P | — | 15 |
| `result_compare` | Find's ranking: name starts with a word 4, a later word 3, inside 2, the place 1; commands before chats | a, b, words → order | P | — | 20 |
| `snippet_build` | 40 characters before the first match, 140 after, matches marked | text, words → parts | P | — | 15 |
| `unseen_set` | a new reply you aren't looking at, for "↓ 1 new" (UC8) | state, turn → state | P | — | 10 |
| `scroll_get` | stay at the bottom only if you were there and the setting is on; never move otherwise (UC8) | view, setting → position | P | — | 10 |
| `fold_get` | folded unless active (Q5): streaming thinking, the open chat's folder, what you unfolded | item, state → bool | P | — | 10 |
| `tour_set` | the guide's next stage when its command ran; seen marks | state, command → state | P | — | 20 |
| `swipe_get` | a swipe right (quote) or left (copy) from a touch track | track → action | P | — | 10 |
| `drop_get` | where a dragged item lands: before, after, into a folder, onto Pinned | position, items → place | P | — | 10 |

### screen · data (300)

| Item | Job | Lines |
|---|---|---|
| collection schemas | the 16 collections' fields, labels, rules, storage, order, commands | 140 |
| the settings schema | every app setting's `Setting_Def` | 50 |
| the command table | every command: label, icon, key, place, when, the call it runs | 80 |
| guide stages | each guide's stages: the command that ends it, its words' content file | 30 |

### screen · drawing, through Preact with htm (940)

| Function | Job | In → out | Kind | Call | Lines |
|---|---|---|---|---|---|
| `screen_render` | the whole screen from `State`: banner, header, chat, new-reply button, message box, site view bar, layers | state → view | P | — | 20 |
| `list_render` | a collection as a list: keyed items, sections, folding, select mode, a badge or a switch, drag (SortableJS adapter) | schema, records, ui → view | P | — | 80 |
| `form_render` | a record as a form: toggle, choice, text, number, credential, list, link, linked-or-own marks (D8) | schema, record → view | P | — | 70 |
| `sheet_render` | the sheet stack: title, back, help, close; a plugin's own sheet | ui → view | P | `sheet_open` | 30 |
| `sortable_open` | the SortableJS adapter: a drop put back and sent as `record_move` | list → done | E | `record_move` | 15 |
| `dropdown_render` | a list that opens in place (the profile picker, accents) | options → view | P | — | 15 |
| `chat_render` | the turns, the failed and queued sends, dividers from plugins (`turn_render`) | chat, sends → view | P | — | 40 |
| `turn_render` | your message (folded when long), thinking, the reply's Markdown (markdown-it adapter), trace, tags, the reply's actions | turn, ui → view | P | — | 80 |
| `reply_live_render` | a reply coming in: the thinking's newest line, the reply so far, progress | send → view | P | — | 25 |
| `failure_render` | a failed send's reason and its actions (Open the site, Copy page report for site errors) | send → view | P | — | 15 |
| `markdown_render` | the markdown-it adapter: escaped, tables, code with Copy (S10, D5) | text → view | P | — | 15 |
| `composer_render` | the message box: Quick edit, the box, bigger and smaller, Send or Stop, attachments | draft, ui → view | P | — | 45 |
| `composer_key_run` | Enter or Ctrl+Enter sends, ↑ in an empty box edits the last message | key, state → command | P | — | 20 |
| `header_render` | the chat's name, the provider with its model and state dot, Find, ? | state → view | P | — | 25 |
| `provider_menu_render` | switch provider, open its site | state → view | P | — | 20 |
| `site_bar_render` | the site view's bar: back, tabs with their state, close, +, the address bar, the linked chat | pages, ui → view | P | `view_set` | 35 |
| `find_render` | the box, Recent and Try, Chats, Functions, Messages with snippets | query, results → view | P | — | 60 |
| `dialog_render` / `toast_render` | the app's own confirm and text prompt; toasts with their `Error` | ui → view | P | — | 25 |
| `menu_render` | a ⋯ or long-press menu from the command table and plugins' `menu_items` | commands → view | P | — | 25 |
| `key_run` | a key to its command (Q2) and Escape's order | key, state → command | P | — | 25 |
| `help_card_render` | help mode's card: what it does (content file), where it lives, its key, Do it | element, commands → view | P | — | 30 |
| `spotlight_render` | the guide's card, the lit control, "Take me there" when it isn't on screen | tour, state → view | P | — | 50 |
| `screen_adapter_run` | Preact's render into the page, events to commands, focus and scroll kept | view → done | E | — | 15 |
| CSS | design tokens, component classes, the chat (1.45) | — | — | — | 160 |

## Optional plugins — 550, and the import — 130

| Plugin | Functions | Lines |
|---|---|---|
| Memory | `memory_build` (pinned facts, summaries, recent lines, the block's text and its four texts), `summary_plan_build` (levels of detail, pure), `summary_create` (a side request per side), `summary_format`/`summary_parse` (its folded section, D1), `line_format`, `seen_get`, the sheet | 220 |
| Sub-chats | `chat_route` (new, back, stay), `segment_list` (pure), `branch_get` (what a branch sees, pure), the divider and the sheet | 80 |
| Base64 | `base64_encode`, `base64_decode` (the repairs and the readable-text check, pure), the hooks, "Decode base64" | 40 |
| Page report | the menu item over `site_report_build` | 10 |
| OpenAI provider | `chat_send` over `http_fetch` with the connection's credential, the stream parsed | 60 |
| DeepSeek | its `Provider_Def` and its `error_find` stage | 30 |
| Qwen Chat | its `Provider_Def` and its send, thinking and report stages | 90 |
| Ember, Paper | design tokens | 20 |
| Old-content import (X5, removable) | `backup_create`, `marker_write`, `chat_migrate`, `profile_migrate`, `prompt_migrate`, `config_migrate`, `summary_migrate` (each pure over the old shape), `import_run` | 130 |

## Coverage

Every use case and requirement maps to functions (the calls of `4-ports.md` map the same way).

| Use case | Functions |
|---|---|
| UC1 send | `message_send`, `send_run`, `message_build`, `hook_run`, `site_send`, `reply_read`, `reply_format`, `turn_save` |
| UC2 queue | `message_send`, `queue_run`, `record_move` and `record_delete` on `sends` |
| UC3 stop | `send_stop`, `key_run` (Escape) |
| UC4 failed | `send_set`, `failure_resolve`, `failure_render`, `site_report_build`, `view_set` |
| UC5 resend | `message_send` (`replaces`), `composer_key_run` |
| UC6 reuse text | `swipe_get`, `record_export`, `clipboard_write`, `turn_render` |
| UC7 long text | `composer_render`, `record_set` on `drafts`, `picker_open` |
| UC8 new reply | `unseen_set`, `scroll_get`, `reply_live_render` |
| UC9–UC10 provider, model | `header_render`, `provider_menu_render`, `model_list`, `site_model_list`, `site_model_set`, `value_get` |
| UC11 toggles | `form_render`, `record_set` on `chats`, `value_get` |
| UC12 site view | `site_bar_render`, `page_open`, `page_close`, `page_navigate`, `view_set`, `popup_open`, `page_start` |
| UC13 site chats | `site_chat_list`, `site_chat_open`, `site_chat_import`, `site_read` |
| UC14 share in | `intent_parse`, `record_create` on `chats`, `record_set` on `drafts` |
| UC15 API | `send_run` over `http_fetch`; the OpenAI provider |
| UC16–UC17 chats | `list_render`, `drop_get`, `sortable_open`, `folder_move`, `record_*` on `chats` and `folders` |
| UC18 find | `query_parse`, `result_compare`, `snippet_build`, `find_render`, `chat_find`, `file_find` |
| UC19 details | `form_render`, `commit_list` |
| UC20 tags | `tag_build`, `tag_add`, `tag_remove` |
| UC21 copy, share | `chat_format`, `record_export`, `content_export` |
| UC22–UC25 profiles | `profile_create`, `template_list`, `message_build`, `prompt_send_get`, `preview_build`, `list_render`, `form_render` |
| UC26–UC27 prompts, import, export | `record_*`, `record_export`, `record_import` |
| UC28–UC31 plugins | `catalogue_load`, `plugin_install`, `answer_parse`, `zip_read`, `plugin_update`, `plugin_copy`, `plugin_write`, `catalogue_verify` |
| UC32 plugin settings | `form_render`, `value_get`, `record_set` on `plugin_settings` |
| UC33 safe mode | `plugin_list_load`, `app_start` |
| UC34–UC35 look, sites | `form_render`, `bars_set`, CSS tokens |
| UC36 storage, git | `chats_folder_move`, `storage_verify`, `file_list`, `repo_push`, `repo_pull`, `commit_list` |
| UC37 local API settings | `api_token_create`, `credential_read` |
| UC38 advanced | `plugin_copy`, `log_read`, `app_start`, `service_stop`, `app_get` |
| UC39 help | `help_card_render`, `spotlight_render`, `tour_set`, `menu_render`, `key_run`, `content_read` |
| UC40 credentials | `credential_create`, `credential_list`, `credential_delete`, `connection_verify` |
| UC41 other apps | `api_token_verify`, `api_request_run`, `job_run`, `job_answer_write` |
| UC42 plugin authors | `pp_build`, `hook_run`, `plugin_load`, `sheet_render`, `event_on` |
| UC43–UC47 built-in plugins | the optional plugins above |
| UC48 attachments | `attachment_add`, `composer_render`, `site_send` |

| Requirement | Functions |
|---|---|
| P5 not supported | `call_run` (core, platform), `call_send` |
| D1, D7 readable file, change check | `chat_format`, `chat_parse`, `file_write`, `revision_get`, `change_resolve` |
| D2 history | `turn_save`, `repo_commit` |
| D4 safe writes | `file_write` |
| D5, S10 replies shown in full and safely | `markdown_render`, `reply_format` |
| D6 hidden data | `store_save`, the chats' schemas |
| D8 linked or own | `value_get`, `form_render` |
| S1, S2 key, host, challenge | `host_verify`, `key_verify`, `session_open`, `core_verify` |
| S3, S8 verification | `catalogue_verify`, `plugin_write` |
| S4 changed outside | `plugin_list`, `plugin_list_load` |
| S5 HTTPS only | `http_fetch` |
| S6 zips | `zip_read` |
| S7 credentials | `credential_*`, `http_fetch` |
| S9 code in pages | `page_open`, `script_run` |
| R1, R8 start | `core_start` (platform), `core_verify`, `screen_open` |
| R2 background | `service_start` |
| R3 pages | `page_start`, `view_set` |
| R4 redraws | `screen_adapter_run`, keyed lists in `list_render` |
| R5 Back | `back_run`, `key_run` |
| R6 core log | `log_read` |
| R7 keyboard | `insets_set` |
| Q1 look and behaviour | the screen's drawing, CSS, the content files |
| Q2 keys | `key_run`, `composer_key_run`, the command table |
| Q5 folding | `fold_get` |
| X5 old content | the import plugin |
| N5 branching later | `Turn.id` (in the schemas) |

## The check

| Layer | Modules | Budget | Listed |
|---|---|---|---|
| core | server 130, router 110, files 160, plugins 110, local API 70 | 580 | 580 |
| platform | start 60, activity 60, pages 140, port 60, repository 50, credentials and fetch 90, services 60 | 520 | 520 |
| loader | one module | 180 | 180 |
| page side | page script 40, default routine 160 | 200 | 200 |
| runtime | send 170, chats 160, profiles 110, plugins 100, settings and records 90, change and the rest 70 | 700 | 700 |
| screen | logic 120, data 300, drawing 940 | 1,360 | 1,360 |
| **App** | | **3,540** | **3,540** |

The services module took the keep-alive's 15 lines (as in stage 6). The runtime's "change,
credentials, storage" module holds stage 6's change (25), jobs moved into send, credentials and
connections (20), and the storage check and the start's first things that stage 6 left unnamed.
The numbers are estimates per function; the build (stage 9) measures each module with `sloc.py`,
and a module over its line returns here.

## Measured in the build (stage 9)

The application layer (the runtime plugins), measured with `sloc.py` after Prettier at width 100:

| Module | Budget | Measured | What took the room |
|---|---|---|---|
| runtime · settings and records | 90 | 238 | the generic operations over every collection, validation, the linked-or-own getters, saving with the change check, applying and committing in one place (`record_apply`) |
| runtime · chats | 160 | 323 | the text form both ways, counting tags, Find's query and filters, folder moves with your order and pins, site chats, attachments, the chats folder, loading a chat's turns |
| runtime · profiles | 110 | 168 | `message_build` with every scope and the depth prompts, the preview, templates and profiles made from them |
| runtime · send | 170 | 313 | the queue and the page pool (with the pages being opened counted), the sequence for web and API providers, saving the turn, cut-off replies, failures, side requests, jobs |
| runtime · plugins | 100 | 180 | catalogues, installing from four kinds of source, zips with the S6 check, updates, copies |
| runtime · change, credentials, storage | 70 | 118 | the shared dialog's three answers, the API token, connections, the storage check, the start |
| **runtime** | **700** | **1,340** | 26 tests, all passing, without a phone |

The budgets were about half of what clean code needs (decided 2026-11-21: keep building, measure
every module, re-estimate the total from real numbers; no packed lines, no cut features).

## Next

Stage 9: the build, on the fresh `rewrite` branch in both repositories, one layer per stage:
the application first (pure, tested without the phone), then the core, the platform, the loader,
the page side, the screen, and the optional plugins.
