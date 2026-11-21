# 3. The application's model: records and words (stage 3)

Designed from `0-intent.md`, `2-requirements.md` and `design/ux/` only. Part 1 is the data: every
record the application keeps or passes around, its fields, its one owner (the only part that
writes it), where it is stored and how long it lives. Part 2 is the words used for it.

Field names are `snake_case`; record names are `Ada_Case` (one name in every layer; single-word
names look the same either way). Every library sits behind an adapter, Odin's included; inside an
adapter, the library (the adaptee) is used as it is, with its own names (U 2026-11-21).
Shapes are plain JSON-like data: strings, numbers, booleans, lists, maps; records refer to each
other by id, never by holding each other. Every collection is one flat list; a child names its
parent (a block its `profile`, a turn its `chat`), as in a database (decided 2026-11-21, in the
build: it removed the nested-list code).

## Part 1. Records

### Where data lives

```
<app folder>/                      shared storage
  .promptpipe/                     hidden, .nomedia
    config.json                    Config
    plugins/<id>/                  your copies of plugins
    backups/old-app-<date>.zip     the old app's folders, backed up before the import (X5)
    drafts.json                    the drafts, one per chat (UC7); on this device, never in the history
  chats/                           the chats folder (default; can be moved, UC36)
    Trip ideas.md                  the readable chat: built from its data, the only files in "Recent"
    food/Recipe notes.md           folders hold readable chats
    .promptpipe/                   hidden, .nomedia; moves with the chats
      chats/<chat id>/
        meta.json                  Chat (everything but the turns): small, read for the chats list
        turns.json                 the turns
        attachments/               UC48
        <plugin id>.json           a plugin's data for this chat (Memory's summaries, ...)
      prompts.json                 the prompt library
      folders.json                 Folder records: your order in each folder, and of the pinned chats
      counters.json                counter tags' last numbers (State `counters`)
      repo/                        the history repository (its working tree is the chats folder)
<app-private storage>              updated plugins, the revision record (D7), where the chats folder is,
                                   the core's key, the core log
<the platform's credential store>  credentials, encrypted with the key store (S7)
<the APK>                          the built-in plugins, the loader, the page script (read-only)
<memory>                           the screen's State, lost on restart by design
```

- **The chat's data is the source; the readable `.md` is built from it** (D1, D6), so the readable
  file can stay clean and the data can hold what doesn't belong in it (plugins' data, attachments'
  details). The app reads a `.md` back only when you edited it outside the app and chose to keep
  your edit (the change check, D7).
- `meta.json` holds the path of its readable file; a readable file's first lines carry the chat's
  id, so a file moved or renamed with a file manager is found again.
- The repository commits both the data and the readable files, so a pushed remote is readable too.

### Your content (saved, in the chats folder's `.promptpipe/`)

**`Chat`**: one conversation: `meta.json` (all fields but `turns`) and `turns.json`, plus its
readable `.md` built from them. Owner: the runtime's chats module.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | stable id; names the chat's data folder, and heads its readable file |
| `file` | path | its readable `.md`, relative to the chats folder (the folder is part of it) |
| `name` | string | shown in the list and the header |
| `created`, `updated` | time | |
| `own` | map | the values this chat sets as its own (D8): `provider`, `profile`, `model`, `options` (map option → on), `toggles` (map block id → on). A value that isn't here is linked |
| `site_url` | string | the site chat this chat continues (UC13) |
| `tags` | list of strings | chat tags, put on every new message (UC20) |
| `turns` | list of `Turn` | in order |

The folder is part of `file`, not a field of its own (not stored twice). Whether a chat is pinned is
its place in the top-level `Folder`'s `pinned` (not stored twice). The readable file's form
(a short header, one section per turn, then the plugins' folded sections, D1) is settled in the
function list.

**`Folder`**: a folder of the chats folder (UC16, UC17). The folder itself is the file system's (an
empty one holds a marker file so the history keeps it); its record keeps only what the file system
can't: `path` ("" for the top level), `order` (your order of its entries: chat ids and folder names;
what isn't listed keeps the default order), and for the top level `pinned` (chat ids, in order). All
in `folders.json`; moving or renaming a folder moves its record. Owner: the runtime's chats module.

**`Turn`**: your message and its reply; part of a `Chat`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | stable, so plugin data, sends and later branches (N5) can point to a turn |
| `chat` | chat id | the chat it belongs to |
| `at` | time | when it was sent |
| `message` | string | what you typed (the "Your message" block) |
| `attachments` | list of `Attachment` | UC48 |
| `sent` | string | what actually went out, after blocks and hooks (UC25, UC41) |
| `received` | string | the reply as it came back, before the plugins' after-reply hooks (the trace, UC1.2) |
| `reply` | string | the reply as shown, after the hooks, as Markdown |
| `thinking` | string | the model's thinking, in full (UC1.3) |
| `thought_ms` | number | how long it thought ("Thought for Ns") |
| `tags` | list of strings | message tags (UC20) |
| `profile`, `model`, `page_url` | strings | what it went with |
| `error` | `Error` | why it ended badly, if it did (UC4) |
| `blocks` | list of strings | the names of the blocks that went out ("Sent with 4", UC25) |
| `notes` | list of strings | what plugins noted while working on it ("Base64: fixed 2 characters"), shown in the trace (from the old app) |
| `diagnostics` | list of `{ at_s, stop, reply_length, thinking_length, replies_shown, view_width, view_height, hidden }` | for waits of 30 s or more: the last changes the page showed, numbers and flags only, never text (UC1) |

A plugin's data for a chat is in the chat's data folder, `<plugin id>.json`, keyed by turn when it
needs to be: one place, not a field on every turn.

**`Attachment`**: `id`, `name`, `mime_type`, `size`, `path` (inside the chat's data folder,
`attachments/`). Part of a `Turn` or a draft. A file is copied into the chat's `attachments/` when
you attach it (so a draft's attachments survive a restart) and removed if the draft drops it before
sending; it enters the history with the message that sends it.

**`Prompt`**: a System prompt in the library (UC26). Fields: `id`, `name`, `text`, `pinned`,
`updated`. All prompts in `prompts.json`. Owner: the runtime's profiles module. Which profiles link
it is derived from the profiles (not stored).

**Linked or own (D8)**: where a value comes from when a chat doesn't set its own. The effective value
is computed (`value_get`, a pure function), never stored.

| Value | Linked to | Own at |
|---|---|---|
| provider | the setting `chats.provider` (the default) | `Chat.own.provider` |
| profile | the setting `chats.profile` (the active profile) | `Chat.own.profile` |
| model, options | `Config.provider_choices[provider]` | `Chat.own.model`, `Chat.own.options` |
| a block's toggle | the profile's `Block.on` (or its group's `on`) | `Chat.own.toggles[block]` |
| a provider plugin's setting | the plugin's `Setting_Def.default` | `Config.provider_choices[provider].settings[key]` (saved per provider, not per profile) |
| another plugin's setting | the plugin's `Setting_Def.default` | `Profile.plugin_settings[plugin][key]` |
| an app setting | the schema's `Setting_Def.default` | `Config.settings[key]` |

### Settings (saved, in the app folder)

**`Config`**: the one settings file. Owner: the runtime's settings module.

| Field | Type | Meaning |
|---|---|---|
| `version` | number | the file's format version |
| `profiles` | list of `Profile` | yours |
| `templates` | list of `Profile` | your templates (the app's come with a runtime plugin) |
| `provider_choices` | map plugin id → `{ model, options, settings }` | the model, options and plugin settings saved for each provider (UC10, D8) |
| `connections` | list of `Connection` | UC40.6 |
| `sources` | list of `Source` | UC30 |
| `api_token_hash` | string | how the core checks the local API token (the token itself is a credential, UC37); the core trusts it only while the file's revision is the one it wrote (D7) |
| `settings` | map setting key → value | only values you changed; the rest are linked to the schema's defaults (`Setting_Def`, D8), so nothing is stored twice |

App settings are keys like `storage.chats_folder` (where the chats folder is, UC36), `chats.provider` (for new chats, UC9), `chats.profile` (the active one, UC22), `look.mode`, `look.accent`, `look.scale`, `sites.pages` (default 5), `sites.idle_min`, `sites.total_min`, `look.enter_sends`, `look.stay_at_bottom` (on),
`git.commit` (on), `git.name`, `git.email`, `git.remote`, `git.auto_push`, `tags.counter_scope` (each chat, all chats), `api.folder`, `updates.check` (off, daily, weekly),
`updates.bundle`, `import.clash`, `help.button`, `help.seen.<place>`. The full list is the schema,
written with the function list.

**`Profile`** (also the shape of a template): `id`, `name`, `plugin_settings` (map plugin id → map key → value: only the values this profile
sets; the rest are linked to the plugin's defaults, D8). Its blocks and groups are the `Block` and
`Group` records that name it, in `Config.blocks` and `Config.groups`. UC22–UC25.

**`Block`**: one line of a profile (UC23); it names its `profile`.

| Field | Type | Meaning |
|---|---|---|
| `id` | string | |
| `type` | `"prompt"` · `"plugin"` · `"message"` | System prompt, plugin, Your message |
| `name`, `text` | strings | a System prompt's own name and text |
| `link` | prompt id | a linked System prompt (sends the library's text) |
| `plugin` | plugin id | a plugin block |
| `text_block` | string | which of the plugin's text blocks, if it has several |
| `scope` | `"above"` · `"message"` · `"picked"` | what a plugin works on |
| `picked` | list of block ids | for `"picked"` |
| `send` | `"every"` · `"first"` · `"every_n"` · `"depth"` · `"off"` | when a System prompt is sent |
| `number` | number | for `"every_n"` and `"depth"` |
| `on` | boolean | the profile's default toggle |
| `group` | group id or `""` | |

**`Group`**: `id`, `profile`, `name`, `on` (UC24).

**`Connection`**: an API endpoint (UC40.6): `id`, `name`, `provider` (the api provider plugin),
`base_url`, `model`, `credential` (the credential's name).

**`Source`**: where plugins come from (UC30): `id`, `url` (a GitHub repository), `on`. The official
source is always there and can't be removed.

### Credentials (the platform's)

**`Credential`**: an API key, token or password (UC40). Owner: the platform. The runtime only ever
sees the listing; a write-only value never leaves the platform.

| Field | Type | Meaning |
|---|---|---|
| `name` | string | unique; what connections and settings refer to |
| `tags` | list of strings | free |
| `access` | `"write_only"` · `"read_write"` | write-only by default |
| `hosts` | list of strings | exact hosts it may be sent to (write-only) |
| `header`, `prefix` | strings | how it's sent (`Authorization`, `Bearer`) |
| `last4` | string | the last 4 characters, for the list |

The local API token is the one credential the app issues to give away: the screen shows it masked
and may show or copy it (UC37).

### Plugins

**`Manifest`**: a plugin's description (`plugin.json`). Owner: the plugin's author.

| Field | Type | Meaning |
|---|---|---|
| `id`, `name`, `version`, `description` | strings | `version` follows SemVer |
| `tags` | list of strings | the type (UC42.1): none, `provider` + `web`/`api`, `theme`, `passive`, `runtime` (+ `ui`) |
| `min_app` | version | UC42.5 |
| `pp` | number | the `PP` version it was made for (UC42.6) |
| `files` | list of paths | **every** file of the plugin, in load order: the one list used to download, hash, copy and load it (`.js` and `.css` are loaded in this order, except the content script) |
| `content_script` | path | the file that runs in the site page: a web provider's stages, or the default way of using a site (a runtime plugin's, UC42.7) |
| `settings` | list of `Setting_Def` | its settings (UC32) |
| `toggle` | `{ place: "header" · "toolbar", label }` | a toggle outside Quick edit (UC11) |
| `provider` | `Provider_Def` | for providers |
| `order` | number | load order of runtime plugins |
| `guide` | path | its guide (UC39) |

**`Provider_Def`**: (web or api is the plugin's tags, not repeated here) `accepts` (`{ types: list of MIME patterns, max:
number }`, UC48); for web: `url`, `chat_urls` (patterns of a site chat's address), `selectors`
(map: `input`, `send`, `stop`, `reply`, `user`, `thinking`, `model`, `error`, …), `model_picker`
(`{ open, items }`), `options` (list of `{ name, selector, text }`), `settle_ms`, `stuck_ms`; for
api: `protocol` (`"openai"` first), `base_url` (the default).

**`Setting_Def`**: one setting, for the app and for plugins alike (D8, DRY): `key`, `type`
(`"toggle"` · `"choice"` · `"text"` · `"number"` · `"credential"` · `"list"`), `label`, `description`,
`default`, `choices` (list of `{ value, label }`), `min`, `max`, `section`, `old_keys` (for the
one-time import, X5).

**`Catalogue`**: what a source offers: `source`, `signature`, `entries` (list of
`Catalogue_Entry`). **`Catalogue_Entry`**: `id`, `name`, `version`, `description`, `tags`,
`min_app`, `path` (in the source), `hashes` (map file → SHA-256), `built_in`. Owner: the source;
the core checks the signature and the hashes (S3).

**`Plugin`**: an installed plugin as the app sees it (derived when plugins load, not saved): `id`,
`manifest`, `copy` (`"built_in"` · `"updated"` · `"yours"`, which one runs), `other_copies`
(list of `{ copy, version }`), `status` (`"loaded"` · `"off"` · `"failed"` · `"changed_outside"`),
`error`. UC29, UC33, S4.

### Live records (memory, the screen's state)

**`State`**: everything the screen process knows, in one place. Owner: the runtime's apply
function (the only writer).

| Field | Type |
|---|---|
| `app` | `{ version, platform, safe_mode, calls }` (`calls`: what the platform offers, P5) |
| `config` | `Config` |
| `prompts` | list of `Prompt` |
| `plugins` | list of `Plugin` |
| `catalogue` | list of `Catalogue_Entry` (with their source) |
| `credentials` | list of `Credential` (the listing) |
| `chats` | list of `Chat` without their turns (what `meta.json` holds) |
| `turns` | list of `Turn` of the chats loaded (`loaded`: their ids) |
| `chat_data` | list of `{ id, chat, plugin, data }` |
| `drafts` | map chat id → `{ text, attachments }` (saved on the device, UC7) |
| `sends` | list of `Send` (queued, on their way and failed alike) |
| `pages` | list of `Page` (and `opening`: how many are being opened) |
| `jobs` | list of `Job` |
| `ui` | `Ui` |

- **`Send`**: one message from the moment you send it until it's saved or dismissed: `id`, `chat`
  (none for side requests and jobs), `turn` (the turn it fills), `message`, `attachments`, `replaces` (the turn it replaces, UC5),
  `status` (`"queued"` · `"waiting"`
  (for a free page) · `"sending"` · `"failed"`), `error` (an `Error`), `provider`, `page` (none for api
  providers), `job`, `at`, `progress`. A send with no `chat` is a side request: it isn't saved. The queue and the failed
  list are views of `sends` by status, not lists of their own (UC1–UC4, UC41, UC42.3).
- **`Page`**: one open site page: `id`, `provider`, `url`, `title`, `status` (`"loading"` ·
  `"ready"` (the chat box shows: logged in, or a guest the site lets in; what the welcome guide
  watches, UC39) · `"busy"` · `"failed"`), `error`. Which send uses a page, and so whether it is a
  side request's page (the send has no chat, UC12), is on the `Send`, not here.
- **`Job`**: a request from another app: `id`, `request` (`"models"` · `"chat"`), `profile`, `chat`
  (to continue, or none), `messages`, `stream`, `status` (UC41). (Its send points to it, not the other way.)
- **`Ui`**: `sheets` (a stack of `{ collection, id }`: a collection, or one record of it; a plugin's
  own sheet by its name; Back takes the top one, R5), `drawer`,
  `site_view` (`{ open, page }`), `selection` (`{ on, ids }`), `query` (Find's), `help` (the ?
  mode), `tour` (`{ place, stop }`), `composer` (`{ expanded }`), `unfolded` (the ids you unfolded, Q5),
  `scroll` (map place → position, so each place comes back where you left it, UC8), `unseen`
  (map chat → the first new reply's turn id, for "↓ 1 new", UC8), `toasts` (list of
  `{ id, text, error }`: `error` is the `Error` when the toast reports one).
- **`Command`**: one action the person can take (screen data): `id`, `label`, `icon`, `key`,
  `when`, `handler`. The one table menus, keys, help and the tour read.

### Records that cross a boundary

- **`Revision`** (D7): what the core recorded when the app last wrote a file: `path`, `hash`
  (SHA-256), `at`. Every write says which revision it expects; a mismatch is an `Outside_Change`.
- **`Outside_Change`**: `path`, `ours` and `theirs` (their revisions; what type of file it is follows
  from the path); answered once in the shared dialog: keep
  theirs, keep ours, keep both.
- **`Envelope`**: every message between the screen, the core, the platform and a page:
  `type` (`"call"` · `"reply"` · `"event"`), `name`, `data`, `id`, `error`.
- **`Error`**: `code` (the standard gRPC status codes in `snake_case`: `permission_denied` (the site
  refused), `failed_precondition` (a human check, a login), `unavailable` (no connection, the page
  didn't load), `not_found` (the page isn't as the provider expects), `deadline_exceeded` (a waiting
  limit), `cancelled` (stopped), `unimplemented` (not supported on this platform), `internal`),
  `message` (what happened and what to do), `page` (the page involved, if any: then the screen
  offers Open the site and Copy page report, UC4).
- Each side's own small state stays private to it: the core's (its key, its folders, the revision
  record, the local API's open requests), the platform's (its views, pop-ups, the credential
  store, the core process), a page script's (its provider description, the send it is watching).

### Who writes what

| Record | The only writer | Stored |
|---|---|---|
| `Chat`, `Turn`, `Attachment`, the readable file | runtime, chats module | the chat's data folder; the readable `.md` |
| a plugin's data for a chat (`chat_data`) | that plugin, through `PP` (`record_set`) | the chat's data folder, `<plugin id>.json` |
| `Prompt` | runtime, profiles module | `.promptpipe/prompts.json` |
| `Config` and everything in it | runtime, settings module | `.promptpipe/config.json` |
| `Credential` | platform | its credential store |
| your plugin copies | runtime (copy) and you (edit) | `.promptpipe/plugins/` |
| updated plugins | core (install, after verifying) | app-private `updates/` |
| the revision record (D7) | core | app-private `revisions.json` |
| counter tags' numbers | runtime, send module (as a turn is saved) | `.promptpipe/counters.json` |
| `Folder` | runtime, chats module | `.promptpipe/folders.json` |
| drafts | runtime, chats module | the app folder's `.promptpipe/drafts.json` |
| the old app's backup | runtime (zipped with the same zip adapter that reads plugin zips) | the app folder's `.promptpipe/backups/` |
| history commits | platform (the repository adapter), on the runtime's call | `.promptpipe/repo/` |
| `State` | runtime, the apply function | memory |

## Part 2. Words

### The layers (decided 2026-11-20)

| Layer | What it is | Term |
|---|---|---|
| The Odin program | files, the local API's HTTP, plugin verification, the security key | **core** |
| The Kotlin app | starts the core; pages and views; the repository, credentials, the phone's services | **platform** |
| The app's own plugins | the application and the screen | **runtime** (tag `runtime`, "runtime plugins") |
| What starts them | the state record, the plugin loader, events and hooks, `PP` | **loader** |
| What runs in each site page | loads the code the app hands it, nothing else (S9) | **page script** |
| Code that drives a site | the default way of using a site (a runtime plugin's), and a provider's stages for its site's quirks | **content script** |
| Everything you see | a runtime plugin tagged `runtime` and `ui` | **screen** |

"Platform" leaves "shell" its standard meanings (the effects layer, and the command shell).

### Naming rules

- **Functions**: `noun_verb` or `noun_noun_verb` (`record_create`, `site_chat_list`). The noun is
  the module; the verb comes from the closed list.
- **Casing** (decided 2026-11-20): `snake_case` for functions and data fields in every language
  and in JSON files. Records `Ada_Case`. Constants `UPPER_SNAKE` (`PAGES_DEFAULT`).
- **The port**: one each way; the calls are named by the rules above, and their noun says what
  they're about (`file_write`, `site_send`). No per-topic ports, no port names to learn (stage 4).
- **Events**: past tense (`job_received`, `back_pressed`) or `_changed` (`reply_changed`).
- **Hooks**: named by their place in a sequence, noun first: `send_before`, `reply_after`,
  `block_text`, `chat_route`, `turn_render`, `toggle_render`, `menu_items` (the ⋯ menu, Quick edit's
  entries and a reply's actions, each item saying its place), `chat_section_format` and
  `chat_section_parse` (a plugin's folded section of the readable chat file, and reading an edit of
  it back, D1).
- **`PP`**: every function plugins may use is on `PP` under its full name (`PP.message_send`); no
  bare names shared between plugins.
- **One name per call across layers**: a call keeps its name from the application through its port
  to its adapter and on the bus.

### Verbs (closed list, decided 2026-11-20; `import`, `export`, `navigate`, `resolve`, `commit`, `push`, `pull` added 2026-11-21)

| Verb | Meaning | Example |
|---|---|---|
| `get` | a value from data, no effects | `record_get` |
| `set` | data with one value changed, or the one place that writes it | `record_set`, `view_set` |
| `list` | every record of one type | `plugin_list`, `commit_list` |
| `find` | the records that match a query | `chat_find(query)` |
| `read` / `write` | raw text or bytes at a location | `file_read`, `file_write` |
| `load` / `save` | read and parse / format and write a record | (inside the application, through `file_read` and `file_write`) |
| `create` / `delete` | a standalone record and its storage | `record_create`, `record_delete` |
| `add` / `remove` | into or out of a container | `attachment_add`, `plugin_remove` |
| `move` / `rename` / `copy` | place, name, duplicate (`copy` only means duplicate; the clipboard is `clipboard_write`) | `record_move`, `plugin_copy` |
| `parse` / `format` | text to data / data to text, pure | (pure functions, e.g. a chat into its readable file) |
| `build` | assemble from parts, pure | `message_build` |
| `validate` | the problems in data, pure | (the boundary check of every call) |
| `verify` | integrity or authenticity | `catalogue_verify`, `storage_verify` |
| `compare` | order two values | `version_compare` |
| `apply` | a change record to state | (the application's apply function) |
| `migrate` | old saved data to the current format | (the one-time import of the old app's content, X5) |
| `open` / `close` | something shown or held open | `page_open`, `page_close`, `picker_open` |
| `start` / `stop` | a process, stream, job or service | `app_start`, `send_stop`, `vibration_start` |
| `send` | hand a message to a provider, page or the platform | `message_send`, `site_send` |
| `fetch` | an HTTP request through the platform (any method) | `http_fetch` |
| `run` | execute hooks, a job or a command | `job_run` |
| `on` | listen to an event | `event_on` |
| `import` / `export` | bring content in from a file or another place / send it out to one | `record_import`, `record_export` |
| `navigate` | move a page to a URL, back, or reload | `page_navigate` |
| `resolve` | answer a pending choice | `failure_resolve`, `change_resolve` |
| `commit` / `push` / `pull` | the repository's own terms (git) | `repo_commit`, `repo_push` |
| `install` / `update` | software: put in / replace with a newer version | `plugin_install`, `plugin_update` |
| `encode` / `decode` | change a representation | (Base64's own functions) |
| `encrypt` / `decrypt` | only inside the credential store's adapter | |
| `render` | data to screen elements, pure | `turn_render` |

Not used, to keep one word per meaning: fetch-as-read, show/hide (open/close), remove-as-delete,
check (validate or verify), make, do, handle, process, manage, util, helper.

### Nouns

The module nouns are the record names in lower case plus these: `app`, `file`, `folder`, `event`,
`hook`, `message` (what you typed; what goes out after the blocks and hooks is `sent`), `reply`, `thinking`, `tag`, `toggle`, `repo`
(the chats' history repository; git is its adapter), `site` (the website a web provider drives),
`option`, `model`, `http`, `version`, `bundle` (the release's zip of built-in plugins), `screen`
and its parts (`sheet`, `drawer`, `menu`, `toast`, `dialog`, `item`), `theme`, `log`, `schema`
(the list of `Setting_Def`), `failure` (a failed send), `change` (an outside change, D7),
`commit`, `view` (the site view), `content` (what's exported), `chat_section` (a plugin's part of the readable chat file), `picker` (the system's file
picker), `clipboard`, `url`, `vibration`, `bars` (the system bars), `storage`, `storage_access`,
`service` (the background service), `api_token`, `chats_folder`, `chat_data`, `catalogue`,
`record` (any record of a collection), `collection`, `popup` (a sign-in window a site opens),
`report` (the page report), `share` (what another app shares in), `back` (the Back button), `value` (a
choice's effective value, linked or own, D8).

### Events

The seven in `4-ports.md`, each coming from the call contract: `page_changed` (a sign-in pop-up
included), `reply_changed`, `http_received`, `share_received`, `back_pressed`, `job_received`,
`job_changed`. A record's changes are one `_changed` event with a status field,
not one event per status. The screen needs no events: it draws the `State` after every change.

### Name pass (2026-11-21)

Every name in the design resolved by the rule (the design's terms and decisions, then the standard,
the screenshots only where the design has no word; one meaning per term):

| Was | Now | Why |
|---|---|---|
| `Version` (D7), "expected version", `versions.json` | `Revision`, "expected revision", `revisions.json` | `version` already means a software version (SemVer) |
| `state` on pages and replies | `status` | sends, jobs and plugins already use `status`; `State` is the process's record |
| `message` = the text built from the blocks | `message` = what you typed; `sent` = what went out | the turn fields decided 2026-11-20 |
| `message_send`'s options, `replace_last` | a `Send` draft; `Send.replaces` (a turn id) | `options` already means a provider's options; reuse the `Send` record |
| `Send.text` | `Send.message` | the same thing as `Turn.message` |
| "address" in call parameters | `url` | the records already say `url` |
| `Chat.title` | `Chat.name` | every other record's display name is `name` |
| `Turn.error` (a string) | `Turn.error` (an `Error`) | one shape for errors |
| `thought_s` | `thought_ms` | `settle_ms`, `stuck_ms` |
| `Setting_Def.sub` | `Setting_Def.description` | the manifest's word |
| `Command.run` | `Command.handler` | `event_on`'s word |
| `Attachment.type` | `Attachment.mime_type` | the standard name; `type` means which variant a record is |
| invented error codes | gRPC status codes | the standard |
| `store_local` | `local_storage` | the Web API's name |
| `Block.n` | `Block.number` | a word, not a letter |
| `Ui.select`, `Ui.find` | `Ui.selection`, `Ui.query` | fields are nouns |
| `chats.enter_sends` | `look.enter_sends` | the design puts it under Look (UC34) |
| examples that weren't real calls | the contract's calls | one set of names |

### Words that differ from the screenshots

- Plugins › "Library" → "Catalogue" (decided 2026-11-20).
- Settings › "Core plugins" → "Runtime plugins".
- The provider's name in the header (never "pill").
- New: Settings › "Credentials", connections, "Plugin · provider · web/api".

### Adapters (the application's word outside, the technology inside)

| Port's word | Technology |
|---|---|
| `page`, `view` | GeckoView (platform) |
| `repo` | JGit (platform) |
| `credential` | Android Keystore (platform) |
| `http` | the platform's HTTP client |
| `clipboard`, `vibration`, `share`, `notification` | Android's services (platform) |
| `file` | the core's files under named folders (Odin `core:os` inside) |
| the local API's HTTP | Odin `core:net` (core) |
| `json`, `hash`, `signature`, `zip` | Odin `core:encoding/json`, `core:crypto/sha2`, `core:crypto/ed25519`, `core:compress/deflate` (core) |
| `render` | the browser's DOM through Preact, with htm for templates (screen; plugins draw with the same, through `PP`) |
| page building blocks | the site's DOM (page script) |
| `local_storage` | the browser's local storage (screen; per-device conveniences only: folds, Find's recent picks) |
