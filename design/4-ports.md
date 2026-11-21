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
| `record_export` | collection, ids, to (`clipboard` · `share` · `file`) → done (the schema gives the file's form: a chat as its readable text, profiles with the prompts they link, prompts as Markdown or the library file) | S |
| `record_import` | collection, a file or pasted text (also the old app's export files) → records (a name clash as set, UC27) | S |

Collections: `chats` (rename, tags, folder, site chat link, and its own provider, profile,
model, options and toggles, D8),
`provider_choices` (the model and options saved for each provider),
`folders` (rename, delete, and your order of each folder and of the pinned chats), `turns` (message tags), `profiles`, `templates`, `blocks`, `groups`, `prompts`,
`connections`, `sources`, `sends` (queued messages: move up, edit, remove), `drafts`,
`settings`, `plugin_settings`, `chat_data` (a plugin's data for a chat, by chat and plugin: Memory's summaries, Sub-chats' notes; callers P).

**Everything with its own behaviour**

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `message_send` | a `Send` draft (`chat`, `message`, `attachments`, and when needed `profile`, `replaces`; no `chat` for a side request) → `Send` (a side request: its answer) | S, P, A | UC1, UC2, UC5, UC15, UC42.3, UC43, UC44 |
| `message_build` | profile, chat → the text that would be sent | S, P, A | UC1, UC25 |
| `send_stop` | send → done | S, P | UC3 |
| `failure_resolve` | send, choice (`retry` · `check` · `edit` · `dismiss`) → done | S | UC4 |
| `attachment_add` | chat, files → the draft's attachments | S | UC48 |
| `model_list` | chat → models, the page's model, and the provider's options with their states | S | UC10 |
| `site_chat_open` | provider, url → chat | S | UC13 |
| `site_chat_import` | chat, page, which (`all` · `newest`), save (off: the newest reply decoded by the after-reply hooks, as a preview) → turns | S | UC13 |
| `chat_find` | query → matching messages (the screen adds matching commands and settings from its own tables) | S, P | UC18 |
| `catalogue_load` | source, or none for every source that is on → offers and available updates, verified (one source: to check it has a catalogue before it's added) | S | UC28, UC30, UC31, UC39 |
| `plugin_install` | from (a catalogue entry, a link, a zip, an AI answer's files) → plugin | S | UC29, UC30 |
| `plugin_update` | plugins, or all; or back to the previous version → plugins | S | UC29, UC31 |
| `plugin_copy` | plugin → your copy | S | UC29, UC38 |
| `chats_folder_move` | folder, how (`move`: copy the chats there and use it · `use`: use it as it is · `merge`: copy its chats into the folder in use, nothing overwritten) → done | S | UC36 |
| `storage_verify` | → each test with the system's answer | S | UC36 |
| `api_token_create` | → the new token | S | UC37 |
| `change_resolve` | change, choice (`theirs` · `ours` · `both`) → done | S | D7 |
| `job_run` | job → the job's results, as `job_changed` events | C | UC41 |
| `plugin_set` | the plugin's definition (its hooks and commands, and its section of the readable chat file with how to read it back, D1) | P | UC42.2 |
| `sheet_open` | the sheet's definition → done | P | UC42.4 |
| `event_on` | event name, handler | P | UC42 |

### Answered by the core

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `file_read` | root, path or pattern → files, each with its revision and whether it changed outside the app | A | UC16 and every saved record |
| `file_write` | root, path, data, expected revision → the new revision, or an `Outside_Change` | A | D4, D7 |
| `file_move` | root, from, to (and `to_root`), expected revision; `copy` (keep the original) and `overwrite` (off: only what isn't there yet) → the new revision, or an `Outside_Change`; a copy says how many chats it copied | A | UC17, UC36 |
| `file_delete` | root, path, expected revision → done, or an `Outside_Change` | A | UC17 |
| `file_list` | root, folder → names, whether each is a folder, sizes, times | A | UC16, UC36 |
| `file_find` | root, query → matching files and lines | A | UC18 |
| `catalogue_verify` | data, signature → `Catalogue`, or an error | A | S3 |
| `plugin_list` | → installed copies, versions, changed-outside status | S, A | UC28, UC29, S4 |
| `plugin_write` | plugin, files, catalogue entry → plugin (each file's hash checked against the entry); or `previous` (swap with the copy the last install replaced); `copy: "yours"` writes your copy of a built-in plugin | A | UC29–UC31, S3 |
| `plugin_remove` | plugin, copy → done | S | UC29 |
| `log_read` | → the core log | S | UC38 |
| `chats_folder_get` | → the chats folder in use and the default one (the core owns the default; added in the build's duplicate check) | S | UC36 |

Roots: `app`, `chats`, `built_in` (read-only), `device` (the phone's shared storage: list, read and
make folders, for picking the chats folder and copying chats in, UC36; and for the old app's folders
only, the `.nomedia` marker and, when you ask, deleting them, X5). The change check is the expected revision on every
write, move and delete: one mechanism for every file (D7).

### Answered by the platform

| Call | In → out | Callers | Use cases |
|---|---|---|---|
| `page_open` | url, provider (its `Provider_Def` and the content scripts to hand the page, S9) → `Page` | S, A | UC9, UC12, UC13 |
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
| `commit_list` | path (a chat's files), or none for every commit; count → commits | S | UC19, UC36 |
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
| `site_send` | page, text, attachments, limits (idle, total) → done; progress as `reply_changed` | A | UC1, UC35, UC48 |
| `site_stop` | page → done | A | UC3 |
| `site_read` | page, which (`newest` · `all`), wait (until the reply on the page is finished) → turns (your message, the reply, the thinking) | A | UC4, UC13 |
| `site_model_list` | page → models, the page's model, options with their states | A | UC10 |
| `site_model_set` | page, model, options → the page's model and options (before a send, and at once when you pick one) | A | UC10 |
| `site_chat_list` | page → the site's own chats | S, A | UC13 |
| `site_report_build` | page → the page report | S | UC4, UC46 |

One generic routine answers these from the provider's `Provider_Def`; a content script replaces
single stages of it (UC42.7).

## The events

| Event | From | Data | Listened to by |
|---|---|---|---|
| `page_changed` | platform (with what the page script reports) | page, status (`loading` · `ready`: the chat box shows · `busy` · `failed`), popup (a sign-in window open or closed, #244), url, title, error (an `Error`: no connection, address not found, certificate refused) | application (UC12, #241) |
| `reply_changed` | page script | page, text and thinking so far, status (`streaming` · `finished` · `failed`), error (an `Error`) | application (UC1, UC1.5) |
| `http_received` | platform | request, the part received | application, plugins (UC15) |
| `share_received` | platform | text or files | application (UC14, UC48) |
| `back_pressed` | platform | — (answered: handled or not) | screen (R5) |
| `job_received` | core | `Job` (`request: "cancel"` when the caller left, #209) | application (UC41) |
| `job_changed` | application | job, a part of the answer, status | core (UC41) |

The screen needs no events of its own: it draws the `State` after every change.

## Coverage

| Use case | Calls |
|---|---|
| UC1 send | `message_send` → `message_build`, `site_model_set` and `site_send`, or `http_fetch`; `file_write`, `repo_commit`, `vibration_start` |
| UC2 queue | `record_move`, `record_set`, `record_delete` on `sends` |
| UC3 stop | `send_stop` → `site_stop` |
| UC4 failed | `failure_resolve` → `site_read` (newest, wait) for Check; for site errors also `view_set` (Open the site) and `site_report_build`, `clipboard_write` (Copy page report) |
| UC5 resend | `message_send` with `replaces` (or unchanged, as a new send) |
| UC6 reuse text | `record_export` on `chats`, `clipboard_write` |
| UC7 long text | `record_set` on `drafts`, `picker_open` |
| UC8 new reply | the screen alone |
| UC9 provider | `record_set` on `chats` (own) or `settings` (the default), `page_open`, `view_set`, `url_open` |
| UC10 model, options | `model_list` → `site_model_list`; `record_set` on `provider_choices` (linked) or `chats` (own) → `site_model_set` |
| UC11 toggles | `record_set` on `chats` (own) or `blocks` (the profile's default) |
| UC12 site view | `page_open`, `page_close`, `page_navigate`, `view_set`; `page_changed` |
| UC13 site chats | `site_chat_list`, `site_chat_open`, `site_chat_import` → `site_read` (all, or newest), `record_set` on `chats` (link to the page) |
| UC14 share in | `share_received` → `record_create` on `chats`, `record_set` on `drafts` |
| UC15 API | `message_send` → `http_fetch` with a credential |
| UC16–UC17 chats | `record_*` on `chats` (`record_get` brings its turns) and `folders` → `file_*`, `repo_commit` |
| UC18 find | `chat_find` → `file_find` |
| UC19 details | `record_get`, `commit_list` |
| UC20 tags | `record_set` on `chats` and `turns` |
| UC21 copy, share | `record_export` on `chats` → `clipboard_write`, `content_export` |
| UC22–UC24 profiles, blocks, groups | `record_*` on `profiles`, `templates`, `blocks`, `groups` |
| UC25 preview | `message_build` |
| UC26 prompts | `record_*` on `prompts` and `blocks`, `record_export` |
| UC27 export, import | `record_export`, `record_import` on `profiles` and `prompts` → `content_export`, `picker_open` |
| UC28–UC31 plugins | `catalogue_load` (one source when adding it, UC30), `plugin_install`, `plugin_update`, `plugin_remove` → `http_fetch`, `catalogue_verify`, `plugin_write`; Reload plugins: `app_start` |
| UC32 plugin settings | `record_set` on `plugin_settings` |
| UC33 safe mode | `app_start` |
| UC34–UC35 look, sites | `record_set` on `settings`, `bars_set` |
| UC36 storage, git | `file_list` on `device`, `chats_folder_move`, `storage_verify`, `storage_access_open`, `record_set` on `settings`, `repo_push`, `repo_pull`, `commit_list` |
| UC37 local API | `api_token_create` → `credential_create`, `record_set` on `settings` (the token's hash); `credential_read` (Show, Copy) |
| UC38 advanced | `record_delete` on `settings` (reset to defaults), `plugin_copy`, `log_read`, `app_close`, `service_stop`, `app_get` |
| UC39 help | the screen, `record_set` on `settings`; the welcome guide: `catalogue_load`, `plugin_install`, `page_open`, `view_set`, `page_changed` (ready = logged in) |
| UC40 credentials | `credential_create`, `credential_list`, `credential_delete`, `record_*` on `connections` |
| UC41 other apps | `job_received` → `job_run` → `job_changed` (a `models` job answers with the profiles' names) |
| UC42 plugin authors | `plugin_set`, `sheet_open`, `event_on`, and the calls marked P |
| UC43–UC47 built-in plugins | `message_send` (no chat), `record_get` and `record_set` on `chat_data`, `site_report_build`, hooks |
| UC48 attachments | `attachment_add`, `picker_open`, `clipboard_read`, `share_received`, `site_send` |
| X5 the old app's content | the application's first start (no call of its own): `file_list` and `file_read` on `device`, the zip made in the runtime, `file_write` (the backup, the marker, the imported records); deleting the old folders later: `file_delete` on `device` |
| D7 change check | `change_resolve`; the expected revision on `file_write`, `file_move`, `file_delete` |

## Screen states (stage 4 check, 2026-11-21)

Every state in `design/ux/`, traced to the calls and records it uses; nothing on a screen is left
without one.

| State | What it shows | Calls and records |
|---|---|---|
| `chat-empty` | a new chat: the header and the message box | `record_create` on `chats`, `record_set` on `drafts`, `message_send` |
| `chat` | header, turns, reply actions, message box | `record_get` on `chats`; `State.chat`, `sends`, `ui.unseen`; `record_export` on `chats`, `clipboard_write` (swipes, Copy); hooks `turn_render`, `menu_items` |
| `chat-composer-big` | the big message box | `Ui.composer`; `record_set` on `drafts` |
| `chat-message-menu` | a reply's menu: copy, quote, send again, tags, trace | `record_export`, `clipboard_write`, `message_send` (`replaces`), `record_set` on `turns` (tags); `Turn.sent`, `received`, `notes`, `blocks` |
| `chat-select-text` | the box for picking a part | `clipboard_write` |
| `chat-info` | the chat sheet: name, tags, actions | `record_set` on `chats` and `folders` (pin), `record_export` |
| `chat-history` | the chat's commits | `commit_list` |
| `chat-move` | move to a folder | `record_move` on `chats`, `record_create` on `folders` |
| `chat-failed` | a failed send with Check, Retry, Edit, Dismiss (and for site errors Open the site, Copy page report) | `Send.status` failed, `Error.page`; `failure_resolve`, `view_set`, `site_report_build`, `clipboard_write` |
| `chat-queued` | queued messages under the chat | `sends` (queued); `record_move`, `record_set`, `record_delete` on `sends` |
| `chat-streaming` | a reply coming in, thinking open | `reply_changed`; `send_stop`; Q5 |
| `drawer` | the chats list: pinned, folders, rows, search, tag chips | `State.chats`, `folders` (order, pinned); `record_move`, `record_set` on `chats` and `folders` |
| `drawer-select` | select mode and its bar | `Ui.selection`; `record_move`, `record_delete` on `chats`, `record_set` on `folders` (pin) |
| `drawer-folder-open` | an open folder | `folders`; `Ui.unfolded` |
| `drawer-site-chats` | the site's own chats, a link box | `site_chat_list`, `site_chat_open` |
| `find` | Find: chats, functions, messages | `chat_find` → `file_find`; the command list; `local_storage` (recent picks) |
| `provider-menu` | switch provider, open its site | `record_set` on `chats` (own) or `settings`; `page_open`, `view_set` |
| `provider-sheet` | profile and provider: model, link, import, add newest reply, decode preview, page report | `model_list`, `site_chat_import` (`save` off for the preview), `record_set` on `chats` (link), `site_report_build` |
| `models` | model and options | `model_list`; `record_set` on `provider_choices` or `chats` → `site_model_set` |
| `quick-edit` | this chat's toggles, text files, plugin entries | `record_set` on `chats` (own toggles), `record_move` on `blocks`, `picker_open`; hook `menu_items` |
| `site-view` | tabs, address bar, the linked chat strip | `page_open`, `page_close`, `page_navigate`, `view_set`; `page_changed` |
| `profiles-new` | a new profile from a template | `record_create` on `profiles` (from `templates`) |
| `profile-editor` | the blocks, top to bottom | `record_*` on `profiles` and `blocks` |
| `profile-add-block` | add a System prompt or a plugin | `record_create` on `blocks`, `record_create` on `prompts` |
| `profile-block-page` | one block: on, when, scope, group | `record_set` on `blocks` |
| `profile-groups` | groups | `record_*` on `groups` |
| `profile-preview` | what will be sent | `message_build` |
| `profile-import` | import a profile | `record_import` on `profiles`, `picker_open` |
| `prompt-library` | the library | `record_list`, `record_import`, `record_export` on `prompts` |
| `prompt-page` | one prompt: linked by, use, pin, copy, export, delete | `record_set`, `record_delete` on `prompts`, `record_create` on `blocks`, `clipboard_write`, `record_export` |
| `prompt-editor` | new or edit a prompt | `record_create`, `record_set` on `prompts` |
| `plugins` | the Profile tab | `record_*` on `blocks`; `State.plugins` |
| `plugins-catalogue` | the Catalogue tab: installed, updates, sources | `catalogue_load`, `plugin_update`, `record_*` on `sources`, `app_start` (Reload) |
| `plugins-providers` | providers on offer | `catalogue_load`, `plugin_install` |
| `plugins-install` | install from a file, a link, an AI's answer | `plugin_install`, `picker_open` |
| `plugins-add-source` | add a source | `catalogue_load` (that source), `record_create` on `sources` |
| `plugins-guide` | the plugin guide, copy for an AI | `file_read` on `built_in`, `clipboard_write` |
| `plugin-page` | one plugin: update, roll back, copy, remove | `plugin_update`, `plugin_copy`, `plugin_remove`, `record_set` on `blocks` or `settings` (on, theme) |
| `plugin-settings` | a plugin's settings | `record_set` on `plugin_settings` or `provider_choices` (D8) |
| `settings` | the groups | the screen |
| `settings-look` | look | `record_set` on `settings`, `bars_set` |
| `settings-look-accent` | accent | `record_set` on `settings` |
| `settings-sites` | pages at once | `record_set` on `settings` |
| `settings-waiting` | waiting limits | `record_set` on `settings` |
| `settings-storage` | chats folder, app folder, old app's folders, storage check | `chats_folder_move`, `storage_access_open`, `file_delete` on `device` (old folders, X5) |
| `settings-folder` | the folder picker | `file_list` on `device`, `chats_folder_move` |
| `settings-git` | git settings, push, pull, commits | `record_set` on `settings`, `credential_create` (token), `repo_push`, `repo_pull`, `commit_list` |
| `settings-import-export` | profiles, library, name clashes | `record_export`, `record_import` on `profiles` and `prompts`, `record_set` on `settings` |
| `settings-local-api` | address, token, folder | `record_set` on `settings`, `clipboard_write` |
| `settings-api-token` | the token, masked, Copy, Show, make a new one | `credential_read`, `clipboard_write`, `api_token_create` (the screenshot shows it unmasked: UC37 wins) |
| `settings-api-how` | how apps use it | the screen, `clipboard_write` |
| `settings-advanced` | reset, runtime plugins, safe mode, log, service, version | `record_delete` on `settings`, `app_start`, `service_stop`, `app_get`, `clipboard_write` |
| `settings-storage-check` | each step and the system's answer | `storage_verify`, `clipboard_write` |
| `settings-core-log` | the core log | `log_read` |
| `settings-help` | help settings | `record_set` on `settings` |
| `runtime-plugins` | the app's own plugins, updates, restart | `plugin_copy`, `plugin_update` (bundle), `plugin_install` (zip), `url_open`, `app_start`, `record_set` on `settings` (screen, updates) |
| `safe-mode` | the safe-mode banner | `app_get` (safe mode), `app_start` (normal) |
| `help-menu` | shortcuts and help | the command list |
| `help-menu-keys` | every key and touch | the command list |
| `help-mode` | the ? mode and its card | `Ui.help`; the command list (where, key) |
| `quick-start-list` | the guides, seen or new | `record_set` on `settings` (`help.seen.*`), `Ui.tour` |
| `tour-setup` | the welcome: pick a site, log in | `catalogue_load`, `plugin_install`, `page_open`, `view_set`, `page_changed` |
| `tour-chat` | a guide over the chat | `Ui.tour` |
| `dialog-confirm` | the app's own confirm | the screen |
| `dialog-text` | the app's own text prompt | the screen |
| `toast-error` | an error toast | `Ui.toasts`, `Error` |

## Stage 4 review (2026-11-21)

Checked against every use case, every constraint that needs a call, the behaviour inventory
(`2b-behaviour.md`) and every screen state. Gaps were closed by refining existing calls, not by
adding new ones (U 2026-11-21):

- `page_open` takes the provider (its `Provider_Def` and the content scripts): the page script gets
  the code to run only from the app (S9); before, no call carried it.
- `site_send` takes the waiting limits (UC35) and no longer the model and options: those are set by
  `site_model_set`, one place for both the send and picking a model at once (UC10).
- `site_model_list` and `site_option_list` became `site_model_list` (models, the page's model, the
  options and their states) and `site_model_set`; `model_list` and `option_list` became one
  `model_list` (the old app read them together too).
- `site_read` takes `which` (newest or all) and `wait` (until the reply is finished): Check (UC4) and
  importing a site chat's earlier messages (UC13) needed both, and no call did it.
- `site_chat_import` takes `save` (off: decode the newest reply as a preview, UC13).
- `chats_folder_move` takes `how` (move, use, merge): "use it as it is" and "copy its chats in" (UC36)
  had no call.
- `catalogue_load` takes an optional source, to check a new source before it's added (UC30).
- `profile_import` reads the old app's export files too (X5); in stage 7 it became `record_import`.
- `page_changed`'s `ready` means the chat box shows; the welcome guide's "logged in" (UC39) reads it.

Every screen state traces to calls and records (above); `chat-empty` was looked at again, and
`settings-api-token` and `settings-storage` against the newest decisions (UC37, X5).

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
- 9 record operations for 16 collections; 21 more calls answered by the application (3 of them
  only for plugins).
- 11 calls answered by the core, 25 by the platform, 7 by the page script: 73 in all.
- 7 events.

## Next

Done: stage 5 (`5-strategies.md`), stage 6 (`6-architecture.md`), stage 7 (`7-review.md`, which
folded eight calls and two events into the ones above). Counting tags restart in each chat by
default (UC20, confirmed 2026-11-21).
