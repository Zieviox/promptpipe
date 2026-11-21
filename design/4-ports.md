# 4. Ports (stage 4)

Inside-out: the application sits in the middle (sending, chats, profiles, prompts, plugins,
settings, credentials, jobs). **Driving ports** are how the outside starts something in it;
**driven ports** are what it needs from the outside, named by role, each with only the calls the
use cases need (role interfaces). Built from `0-intent.md`, `2-requirements.md` and
`3-terms.md` only. Records in `Ada_Case` are the ones defined in `3-terms.md`.

## Who drives the application

| Driver | Through | Starts |
|---|---|---|
| You | the screen (a driving adapter: it calls driving ports and draws the `State`) | almost every use case |
| Other apps | the core's local API (a driving adapter: it turns a request into `job_run`) | UC41 |
| The phone | the platform (it forwards sharing, Back, start) | UC14, UC48, R5 |
| Plugins | `PP` (the driving port for plugin authors) | UC42–UC47 |

## Driving ports

### A. Records: one set of operations for every collection (S1)

Most of what you manage is a collection of records. One set of operations covers all of them;
each collection's schema (its fields, labels, rules and where it's stored) says the rest.

| Call | Does |
|---|---|
| `record_list(collection, filter)` | the records, in order |
| `record_get(collection, id)` | one record |
| `record_create(collection, fields, at)` | a new record, at a place in the order |
| `record_set(collection, id, fields)` | change fields |
| `record_move(collection, id, to)` | change its place (order, folder or group) |
| `record_copy(collection, id)` | duplicate it |
| `record_delete(collection, id)` | delete it (the schema says what must be asked first) |

| Collection | Use cases | Notes |
|---|---|---|
| `chats` | UC16, UC17, UC19, UC20 | rename, pin, tags, move between folders; saving rebuilds the readable file |
| `folders` | UC17 | |
| `turns` (of a chat) | UC20 | message tags |
| `profiles`, `templates` | UC22 | a new profile is `record_copy` of a template |
| `blocks`, `groups` (of a profile) | UC23, UC24 | toggles' defaults, "send it", scope, picked blocks |
| `prompts` | UC26 | add, edit, pin, delete |
| `connections`, `sources` | UC40.6, UC30 | |
| `queue` | UC2 | move up, edit, remove |
| `failed` | UC4 | Dismiss is `record_delete` |
| `drafts` | UC7 | the message box's text, per chat |
| `settings` | UC34–UC39 | the settings map: `record_set("settings", key, value)`; the schema gives defaults and limits |
| `plugin_settings` | UC32 | per profile and plugin |
| `toggles` (of a chat) | UC11 | |

### B. Operations with their own behaviour

**Sending** (UC1–UC5, UC15, UC48)
- `message_send(chat, text, attachments)`: builds, runs hooks, picks the provider, sends (or
  queues when the chat is busy); progress comes back as events.
- `send_stop(send)`: UC3.
- `failed_retry(id)`, `failed_check(id)`, `failed_edit(id)` (back into the draft): UC4.
- `turn_resend(chat, text)`: replace your last message and send again (UC5).
- `attachment_add(chat, files)`: into the draft, from a pick, a share or a paste (UC48).
- `message_preview(profile, chat)`: what would be sent (UC25).

**Provider, model, pages and the site's chats** (UC9–UC13)
- `provider_choose(chat, provider)` (UC9).
- `model_list(chat)`, `model_choose(chat, model)`, `option_list(chat)`, `option_set(chat, name, on)`
  (UC10).
- `page_open(provider, url)`, `page_close(page)`, `page_show(page)`, `page_navigate(page, to)`
  (UC12; `to` is an address, `"back"` or `"reload"`).
- `site_chat_list(provider)`, `site_chat_open(provider, url)`, `chat_link_page(chat, page)`,
  `site_chat_import(chat, page)`, `page_reply_add(chat, page)` (UC13).

**Chats** (UC14, UC16, UC18, UC19, UC21)
- `chat_create(folder, text)`: also for shared text (UC14).
- `chat_open(chat)`, `chat_find(query)` (UC18), `chat_history(chat)` (UC19).
- `chat_export(chat)` (its text, for copy), `chat_share(chat)` (UC21).

**Profiles and prompts** (UC23, UC26, UC27)
- `block_link_save(profile, block)`: save a System prompt's own text to the library and link it.
- `prompt_link(profile, prompt)`: add a linked block before Your message.
- `profile_export(ids)`, `profile_import(file)`, `prompt_export(ids)`, `prompt_import(files)`.

**Plugins** (UC28–UC33)
- `catalogue_load()`: every source's catalogue, verified.
- `plugin_install(from)`: `from` is a catalogue entry, a link, a zip or an AI answer's files.
- `plugin_update(id)`, `plugin_update_all()`, `plugin_rollback(id)`, `plugin_remove(id)`,
  `plugin_copy(id)` (your copy).
- `update_check()`: the automatic check (as set) and the one you start.
- `plugin_guide_copy()`: the plugin-writing instructions for an AI (UC30).
- `app_restart(safe)`: safe mode on or off (UC33).

**Storage, history, local API, app** (UC36–UC38)
- `chats_folder_move(path, copy)`, `storage_check()`.
- `repo_push()`, `repo_pull()`.
- `api_token_create()`.
- `app_reset()`, `log_read()`, `service_stop()`.

**Credentials** (UC40): `credential_add(fields, value)`, `credential_list()`,
`credential_remove(name)`.

**The change check** (D7): `outside_change_resolve(change, choice)`, choice `"theirs"`, `"ours"`
or `"both"`.

**Other apps** (UC41): `job_run(job)`, called by the core's local API adapter.

**Plugin authors** (UC42–UC47): `PP` offers the operations above, plus:
- `plugin_define(definition)`: the plugin's hooks (`block_text`, `send_before`, `reply_after`,
  `chat_route`, `turn_render`, `toggle_render`, `menu_items`) and commands.
- `side_ask(prompt, options)`: a fresh, unsaved request to the provider (UC42.3).
- `chat_data_read(chat)`, `chat_data_write(chat, data)`: the plugin's own data for a chat (Memory's
  summaries).
- `sheet_open(definition)`: the plugin's own sheet, drawn by the generic viewer (UC42.4).
- `event_on(name, handler)`.

## Driven ports (named by role)

Each port lists only the calls the use cases need. A library feature no call needs is not wrapped.

### `for_keeping_files` (the core)

| Call | In → out |
|---|---|
| `file_read(root, path)` | → `{ data, version, changed_outside }` |
| `file_read_all(root, pattern)` | → many small files at once (every chat's `meta.json`) |
| `file_write(root, path, data, expected)` | → `version`, or an `Outside_Change` if the file changed since `expected` (D7) |
| `file_move(root, from, to, expected)` | → `version` or `Outside_Change` |
| `file_delete(root, path, expected)` | → done or `Outside_Change` |
| `file_list(root, folder)` | → names, kinds, sizes, times |
| `file_find(root, query)` | → the matching files and lines (UC18, fast without reading every file in full) |

Roots: `app`, `chats`, `built_in` (read-only). The change check is part of `file_write`,
`file_move` and `file_delete` (the expected version), not a separate system: one mechanism for
every file (D7). Used by: chats, prompts, settings, plugin copies, attachments, export.

### `for_driving_pages` (the platform)

| Call | In → out |
|---|---|
| `page_open(url, kind)` | → `Page` (`kind`: main or side) |
| `page_close(page)` | |
| `page_show(page)` | shows it in the site view's region, or nothing (`none`) |
| `page_navigate(page, to)` | an address, `"back"` or `"reload"` |

Events: `page_loaded`, `page_navigated`, `page_failed` (with the reason: no connection, address
not found, certificate refused, #241), `page_closed`, `popup_opened`, `popup_closed` (UC12).

### `for_using_a_site` (the page script, reached through the platform)

| Call | In → out |
|---|---|
| `site_send(page, text, attachments, model, options)` | starts; progress as events |
| `site_stop(page)` | |
| `site_read(page)` | → the newest reply and thinking (Check, UC4; add the newest reply, UC13) |
| `site_models(page)`, `site_options(page)` | → what the page offers (UC10) |
| `site_chats(page)` | → the site's own chats (UC13) |
| `site_report(page)` | → the page report (UC46) |

Events: `reply_changed` (text and thinking so far), `reply_finished`, `reply_failed` (refusal,
human check, error, with the reason; UC1.5). One generic routine implements them from the
provider's `Provider_Def`; a content script replaces single stages of it (UC42.7).

### `for_http` (the platform)

| Call | In → out |
|---|---|
| `http_fetch(request)` | `request`: `url`, `method`, `headers`, `body`, `credential` (a name), `stream`, `save_to` (a file) → a response, or `http_chunk` events then `http_done` |

Used by: API providers (UC15), downloads and the catalogue (UC29–UC31). A credential's value is
added inside the platform, only for its hosts (UC40.3).

### `for_credentials` (the platform)

`credential_add(Credential, value)`, `credential_list()` → list of `Credential`,
`credential_remove(name)`. Event: `credential_changed`. Values are used only inside `http_fetch`
and the repository calls.

### `for_history` (the platform)

`repo_commit(paths, message)`, `repo_log(path, count)` → commits, `repo_push(remote, credential)`,
`repo_pull(remote, credential)` (D2, UC19, UC36).

### `for_installing_plugins` (the core: trusted, not updatable)

| Call | In → out |
|---|---|
| `catalogue_verify(data, signature)` | → `Catalogue` or an error (S3) |
| `plugin_install(id, files, entry)` | checks every file's hash against the entry when it came from a catalogue, then writes the copy → `Plugin` |
| `plugin_remove(id, copy)` | |
| `plugin_list()` | → the copies (built-in, updated, yours), their versions, changed-outside status (UC29, S4) |

### `for_answering_apps` (the core's local API)

The core turns a request into `job_received(Job)` (a driving event); the application answers with
`job_reply(job, part)` (`part`: a chunk, the end, or an error). Keep-alive, cancel on a closed
connection and joining a retried request are the core's (UC41).

### `for_phone` (the platform)

`clipboard_copy(text)`, `clipboard_read()`, `share_text(text)`, `share_file(path)`,
`url_open(url)`, `vibration_play()`, `files_access_request()`, `file_pick(types, many)` → files,
`file_save(name, data)` (exports through the system), `bars_set(colours)`, `app_background()`,
`service_stop()`.

Driving events from the phone: `shared_in` (text or files; UC14, UC48), `back_pressed` (answered
with handled or not; R5), `app_resumed`.

### `for_app` (the core and the platform)

`app_info()` → `{ version, platform, calls, safe_mode }` (`calls` lists what this platform offers,
so a missing feature is said, never hidden: P5), `app_restart(safe)`, `log_read()`.

### `for_device` (the screen)

`store_local_get(key)`, `store_local_set(key, value)`: per-device conveniences only (an open
folder, a remembered tab).

### `for_time_and_ids` (every layer)

`clock_now()`, `id_new()`. Given to the pure functions as inputs, so they stay pure and testable.

## Coverage

| Use case | Driving | Driven |
|---|---|---|
| UC1 send | `message_send` | `for_using_a_site` or `for_http`; `for_keeping_files`; `for_history` |
| UC2 queue | `record_*` on `queue` | — |
| UC3 stop | `send_stop` | `site_stop` / closes the stream |
| UC4 failed | `failed_*`, `record_delete` | `site_read` |
| UC5 resend | `turn_resend` | as UC1 |
| UC6 reuse text | (screen), `chat_export` | `clipboard_copy` |
| UC7 long text | `record_set` on `drafts` | `file_pick` |
| UC8 new reply | (screen only) | — |
| UC9 provider | `provider_choose`, `page_show` | `for_driving_pages` |
| UC10 model, options | `model_*`, `option_*` | `site_models`, `site_options` |
| UC11 toggles | `record_set` on `toggles` | — |
| UC12 site view | `page_*` | `for_driving_pages` |
| UC13 site chats | `site_chat_*`, `chat_link_page`, `page_reply_add` | `site_chats`, `site_read`, `page_open` |
| UC14 share in | `chat_create` | `shared_in` |
| UC15 API | `message_send` | `for_http`, `for_credentials` |
| UC16–UC17 chats | `chat_create`, `chat_open`, `record_*` | `for_keeping_files`, `for_history` |
| UC18 find | `chat_find` | `file_find` |
| UC19 details | `record_get`, `chat_history` | `repo_log` |
| UC20 tags | `record_set` | — |
| UC21 copy, share | `chat_export`, `chat_share` | `clipboard_copy`, `share_text` |
| UC22–UC24 profiles, blocks, groups | `record_*` | `for_keeping_files` |
| UC25 preview | `message_preview` | — |
| UC26 prompts | `record_*`, `prompt_link`, `block_link_save`, `prompt_export` | `for_keeping_files`, `file_save` |
| UC27 export, import | `*_export`, `*_import` | `file_save`, `file_pick` |
| UC28–UC31 plugins | `catalogue_load`, `plugin_*`, `update_check` | `for_http`, `for_installing_plugins` |
| UC32 plugin settings | `record_set` on `plugin_settings` | — |
| UC33 safe mode | `app_restart` | `for_app` |
| UC34–UC35 look, sites | `record_set` on `settings` | `bars_set` |
| UC36 storage, git | `chats_folder_move`, `storage_check`, `repo_*` | `for_keeping_files`, `for_history`, `files_access_request` |
| UC37 local API | `api_token_create` | `for_credentials` |
| UC38 advanced | `app_reset`, `log_read`, `service_stop`, `plugin_copy` | `for_app`, `for_phone` |
| UC39 help | (screen), `record_set` on `settings` | — |
| UC40 credentials | `credential_*`, `record_*` on `connections` | `for_credentials` |
| UC41 other apps | `job_run` | `for_answering_apps` |
| UC42 plugin authors | `PP` | — |
| UC43–UC47 built-in plugins | `PP`: `side_ask`, `chat_data_*`, hooks | as UC1 |
| UC48 attachments | `attachment_add`, `message_send` | `file_pick`, `shared_in`, `for_keeping_files` |
| D7 change check | `outside_change_resolve` | `for_keeping_files` |

## What this leaves out on purpose

- No file watching: the change check runs when a file is read or written (D7).
- No notification port: the keep-alive notification is the platform's own business (R2).
- No separate download or zip port: downloads are `http_fetch` with `save_to`; zips are read in
  the runtime and their files handed to `plugin_install`.
- No port for the screen's drawing: the screen is a driving adapter that draws the `State`.

## In numbers

- Driving: 7 record operations for 15 collections, plus about 55 operations with their own
  behaviour (most of them a few lines over a driven call).
- Driven: 11 ports, about 50 calls in all.
- Stage 6 maps each driven call to its adapter and counts the lines.
