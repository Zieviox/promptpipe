# 4. The port and the calls (stage 4)

Inside-out: the application sits in the middle (sending, chats, profiles, prompts, plugins,
settings, credentials, jobs). Everything between the application and the outside goes through
**one port each way**, carrying one envelope (`3-terms.md`):

- **In**: the outside calls the application (the screen, plugins through `PP`, other apps through
  the core's local API, the phone through the platform).
- **Out**: the application calls the outside (files, pages, sites, HTTP, credentials, the
  repository, plugin installs, the phone's services). It doesn't know which layer answers.

There are no per-topic ports: a port is the message protocol, and what was a "port" per topic is
only a group of call names. **One table of calls is the contract.** It is data, and the same data
is the routing (each layer registers the calls it answers), the check at the boundary, the "not
supported on this platform" answer for a call nobody registered (P5), and the stand-ins used to
test the application without a phone. Each use case uses only the calls it needs, which the
coverage table shows (role separation without separate ports).

Built from `0-intent.md`, `2-requirements.md` and `3-terms.md` only.

## The calls

Grouped by who answers. "Callers" says who may call it: **S** the screen, **P** plugins (through
`PP`), **A** the application, **C** the core's local API.

### Answered by the application

**Records**: one set of operations for every collection (reuse first, DRY). Each collection's schema gives its
fields, labels, rules, and where it's stored.

| Call | In → out | Callers |
|---|---|---|
| `record_list` | collection, filter → records | S, P |
| `record_get` | collection, id → record | S, P |
| `record_create` | collection, fields, place → record | S, P |
| `record_set` | collection, id, fields → record (a field set to none goes back to linked, D8) | S, P |
| `record_move` | collection, id, place → record | S, P |
| `record_copy` | collection, id → record | S, P |
| `record_delete` | collection, id → done | S, P |

Collections: `chats` (rename, tags, folder, site chat link, and its own provider, profile,
model, options and toggles, D8),
`provider_choices` (the model and options saved for each provider),
`folders` (rename, delete, and your order of each folder and of the pinned chats), `turns` (message tags), `profiles`, `templates`, `blocks`, `groups`, `prompts`,
`connections`, `sources`, `sends` (queued messages: move up, edit, remove), `drafts`,
`settings`, `plugin_settings`.

**Everything with its own behaviour**

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `message_send` | a `Send` draft (`chat`, `message`, `attachments`, and when needed `profile`, `saved`, `replaces`) → `Send` | S, P, A | UC1, UC2, UC5, UC15, UC42.3, UC43, UC44 |
| `message_build` | profile, chat → the text that would be sent | S, P, A | UC1, UC25 |
| `send_stop` | send → done | S, P | UC3 |
| `failure_resolve` | send, choice (`retry` · `check` · `edit` · `dismiss`) → done | S | UC4 |
| `attachment_add` | chat, files → the draft's attachments | S | UC48 |
| `model_list` | chat → models | S | UC10 |
| `option_list` | chat → options | S | UC10 |
| `site_chat_open` | provider, url → chat | S | UC13 |
| `site_chat_import` | chat, page, which (`all` · `newest`) → turns | S | UC13 |
| `chat_create` | folder, text → chat | S, A | UC14, UC16 |
| `chat_open` | chat → chat with its turns | S, P | UC16 |
| `chat_find` | query → matching messages (the screen adds matching commands and settings from its own tables) | S, P | UC18 |
| `commit_list` | chat, or none for every commit → the history | S | UC19, UC36 |
| `chat_export` | chat, to (`clipboard` · `share` · `file`) → done | S | UC6, UC21 |
| `profile_export` | profiles, to → done | S | UC27 |
| `profile_import` | a file or pasted text → profiles | S | UC27 |
| `prompt_export` | prompts, to → done | S | UC26, UC27 |
| `prompt_import` | files → prompts | S | UC27 |
| `catalogue_load` | → offers and available updates, verified | S | UC28, UC31 |
| `plugin_install` | from (a catalogue entry, a link, a zip, an AI answer's files) → plugin | S | UC29, UC30 |
| `plugin_update` | plugins, or all; or back to the previous version → plugins | S | UC29, UC31 |
| `plugin_copy` | plugin → your copy | S | UC29, UC38 |
| `chats_folder_move` | folder, copy → done | S | UC36 |
| `storage_verify` | → each test with the system's answer | S | UC36 |
| `api_token_create` | → the new token | S | UC37 |
| `change_resolve` | change, choice (`theirs` · `ours` · `both`) → done | S | D7 |
| `job_run` | job → the job's results, as `job_changed` events | C | UC41 |
| `plugin_set` | the plugin's definition (its hooks and commands, and its section of the readable chat file with how to read it back, D1) | P | UC42.2 |
| `chat_data_read` | chat → the plugin's data for it | P | UC43, UC44 |
| `chat_data_write` | chat, data → done | P | UC43, UC44 |
| `sheet_open` | the sheet's definition → done | P | UC42.4 |
| `event_on` | event name, handler | P | UC42 |

### Answered by the core

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `file_read` | root, path or pattern → files, each with its revision and whether it changed outside the app | A | UC16 and every saved record |
| `file_write` | root, path, data, expected revision → the new revision, or an `Outside_Change` | A | D4, D7 |
| `file_move` | root, from, to, expected revision → the new revision, or an `Outside_Change` | A | UC17, UC36 |
| `file_delete` | root, path, expected revision → done, or an `Outside_Change` | A | UC17 |
| `file_list` | root, folder → names, whether each is a folder, sizes, times | A | UC16, UC36 |
| `file_find` | root, query → matching files and lines | A | UC18 |
| `catalogue_verify` | data, signature → `Catalogue`, or an error | A | S3 |
| `plugin_list` | → installed copies, versions, changed-outside status | S, A | UC28, UC29, S4 |
| `plugin_write` | plugin, files, catalogue entry → plugin (each file's hash checked against the entry) | A | UC29–UC31, S3 |
| `plugin_remove` | plugin, copy → done | S | UC29 |
| `log_read` | → the core log | S | UC38 |

Roots: `app`, `chats`, `built_in` (read-only), `device` (the phone's shared storage: list, read and
make folders, for picking the chats folder and copying chats in, UC36; and for the old app's folders
only, the `.nomedia` marker and, when you ask, deleting them, X5). The change check is the expected revision on every
write, move and delete: one mechanism for every file (D7).

### Answered by the platform

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `page_open` | url → `Page` | S, A | UC9, UC12, UC13 |
| `page_close` | page → done | S, A | UC12 |
| `page_navigate` | page, to (a url · `back` · `reload`) → done | S | UC12 |
| `view_set` | page, or none → done (the site view's region) | S | UC4, UC9, UC12 |
| `http_fetch` | request (url, method, headers, body, credential name, streaming, file to save to) → response; parts as `http_received` events | A, P | UC15, UC29–UC31 |
| `credential_create` | fields, value → credential | S | UC40 |
| `credential_list` | → credentials (no values) | S, A | UC40 |
| `credential_delete` | name → done | S | UC40 |
| `credential_read` | name → value (read-write credentials only; the local API token for the screen's Show and Copy) | S, P | UC37, UC40.2 |
| `repo_commit` | paths, message → commit | A | D2 |
| `repo_push` | → done (the token comes from the credential named in settings) | S, A | UC36 |
| `repo_pull` | → done | S | UC36 |
| `commit_list` | path, count → commits (the repository's side of the same call above) | A | UC19 |
| `clipboard_write` | text → done | S, A | UC4, UC6 |
| `clipboard_read` | → text or an image | S | UC6, UC48 |
| `content_export` | content (text or file), to (`share` · `file`) → done | A | UC21, UC26, UC27 |
| `picker_open` | types, many → files | S | UC7, UC27, UC30, UC48 |
| `url_open` | url → done | S | UC9, UC39 |
| `vibration_start` | → done | S | UC1 |
| `bars_set` | colours → done | S | UC34 |
| `storage_access_open` | → done (the system's file access screen) | S | UC36 |
| `app_get` | → version, platform, the calls it answers, safe mode | S, A | P5, UC38 |
| `app_start` | mode (`normal` · `safe`) → done | S | UC33 |
| `app_close` | → done (to the background) | S | UC38 |
| `service_stop` | → done | S | UC38 |

### Answered by the page script (through the platform)

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `site_send` | page, text, attachments, model, options → done; progress as `reply_changed` | A | UC1, UC48 |
| `site_stop` | page → done | A | UC3 |
| `site_read` | page → the newest reply and thinking | A | UC4, UC13 |
| `site_model_list` | page → models | A | UC10 |
| `site_option_list` | page → options | A | UC10 |
| `site_chat_list` | page → the site's own chats | S, A | UC13 |
| `site_report_build` | page → the page report | S | UC4, UC46 |

One generic routine answers these from the provider's `Provider_Def`; a content script replaces
single stages of it (UC42.7).

## The events

| Event | From | Data | Listened to by |
|---|---|---|---|
| `page_changed` | platform | page, status (`loading` · `ready` · `busy` · `failed`), url, title, error (an `Error`: no connection, address not found, certificate refused) | application (UC12, #241) |
| `popup_changed` | platform | page, open or closed | application (UC12, #244) |
| `reply_changed` | page script | page, text and thinking so far, status (`streaming` · `finished` · `failed`), error (an `Error`) | application (UC1, UC1.5) |
| `http_received` | platform | request, the part received | application, plugins (UC15) |
| `share_received` | platform | text or files | application (UC14, UC48) |
| `back_pressed` | platform | — (answered: handled or not) | screen (R5) |
| `app_resumed` | platform | — | application (R3) |
| `job_received` | core | `Job` | application (UC41) |
| `job_changed` | application | job, a part of the answer, status | core (UC41) |

The screen needs no events of its own: it draws the `State` after every change.

## Coverage

| Use case | Calls |
|---|---|
| UC1 send | `message_send` → `message_build`, `site_send` or `http_fetch`, `file_write`, `repo_commit` |
| UC2 queue | `record_move`, `record_set`, `record_delete` on `sends` |
| UC3 stop | `send_stop` → `site_stop` |
| UC4 failed | `failure_resolve` → `site_read`; for site errors also `view_set` (Open the site) and `site_report_build`, `clipboard_write` (Copy page report) |
| UC5 resend | `message_send` with `replaces` (or unchanged, as a new send) |
| UC6 reuse text | `chat_export`, `clipboard_write` |
| UC7 long text | `record_set` on `drafts`, `picker_open` |
| UC8 new reply | the screen alone |
| UC9 provider | `record_set` on `chats` (own) or `settings` (the default), `page_open`, `view_set`, `url_open` |
| UC10 model, options | `model_list`, `option_list` → `site_model_list`, `site_option_list`; `record_set` on `provider_choices` (linked) or `chats` (own) |
| UC11 toggles | `record_set` on `chats` (own) or `blocks` (the profile's default) |
| UC12 site view | `page_open`, `page_close`, `page_navigate`, `view_set`; `page_changed`, `popup_changed` |
| UC13 site chats | `site_chat_list`, `site_chat_open`, `site_chat_import`, `record_set` on `chats` (link to the page) |
| UC14 share in | `share_received` → `chat_create` |
| UC15 API | `message_send` → `http_fetch` with a credential |
| UC16–UC17 chats | `chat_create`, `chat_open`, `record_*` on `chats` and `folders` → `file_*`, `repo_commit` |
| UC18 find | `chat_find` → `file_find` |
| UC19 details | `record_get`, `commit_list` |
| UC20 tags | `record_set` on `chats` and `turns` |
| UC21 copy, share | `chat_export` → `clipboard_write`, `content_export` |
| UC22–UC24 profiles, blocks, groups | `record_*` on `profiles`, `templates`, `blocks`, `groups` |
| UC25 preview | `message_build` |
| UC26 prompts | `record_*` on `prompts` and `blocks`, `prompt_export` |
| UC27 export, import | `profile_export`, `profile_import`, `prompt_export`, `prompt_import` → `content_export`, `picker_open` |
| UC28–UC31 plugins | `catalogue_load`, `plugin_install`, `plugin_update`, `plugin_remove` → `http_fetch`, `catalogue_verify`, `plugin_write`; Reload plugins: `app_start` |
| UC32 plugin settings | `record_set` on `plugin_settings` |
| UC33 safe mode | `app_start` |
| UC34–UC35 look, sites | `record_set` on `settings`, `bars_set` |
| UC36 storage, git | `file_list` on `device`, `chats_folder_move`, `storage_verify`, `storage_access_open`, `record_set` on `settings`, `repo_push`, `repo_pull`, `commit_list` |
| UC37 local API | `api_token_create` → `credential_create`, `record_set` on `settings` (the token's hash); `credential_read` (Show, Copy) |
| UC38 advanced | `record_delete` on `settings` (reset to defaults), `plugin_copy`, `log_read`, `app_close`, `service_stop`, `app_get` |
| UC39 help | the screen, `record_set` on `settings` |
| UC40 credentials | `credential_create`, `credential_list`, `credential_delete`, `record_*` on `connections` |
| UC41 other apps | `job_received` → `job_run` → `job_changed` (a `models` job answers with the profiles' names) |
| UC42 plugin authors | `plugin_set`, `sheet_open`, `event_on`, and the calls marked P |
| UC43–UC47 built-in plugins | `message_send` (unsaved), `chat_data_read`, `chat_data_write`, `site_report_build`, hooks |
| UC48 attachments | `attachment_add`, `picker_open`, `clipboard_read`, `share_received`, `site_send` |
| X5 the old app's content | the application's first start (no call of its own): `file_list` and `file_read` on `device`, the zip made in the runtime, `file_write` (the backup, the marker, the imported records); deleting the old folders later: `file_delete` on `device` |
| D7 change check | `change_resolve`; the expected revision on `file_write`, `file_move`, `file_delete` |

## What this leaves out on purpose

- Per-topic ports, wrappers and documents: one port each way, one table.
- File watching: the change check runs on write, move and delete (D7).
- A notification call: the keep-alive notification is the platform's own (R2).
- Download and zip calls: downloads are `http_fetch` with a file to save to; zips are read and
  made in the runtime (plugin zips handed to `plugin_write`, the old app's backup to `file_write`).
- Time and ids: given to the pure functions as inputs by the loader; not calls to the outside.
- Per-device conveniences: the screen's own business, not the application's.

## In numbers

- One port each way, one envelope.
- 7 record operations for 15 collections; 32 more calls answered by the application (5 of them
  only for plugins).
- 11 calls answered by the core, 25 by the platform, 7 by the page script.
- 9 events.
