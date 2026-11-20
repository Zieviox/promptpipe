# 3. Terms (proposal)

The words the refactored app, its guides and its code will use. Standard programming terms
first; each term has one meaning, and each meaning one term. Items marked **Decide** need your
answer before the function list (`4-functions.md`) is written, because every name depends on them.
The recommended answer is listed first.

## 1. The layers

Today "core" means three different things: the Odin program, `ui/core.js`, and plugins tagged
`core`. And the principle "functional core, imperative shell" uses "core" and "shell" again.

| Layer | What it is | Today | Proposed |
|---|---|---|---|
| Odin program | HTTP server, files, plugin store, verification, bridge, local API | core | **core** |
| Kotlin app | starts the core, browser views, OS services | shell | **host** (the native host app) |
| `ui/core.js` | state, plugin loader, events, `PP` | the core (JS) | **runtime** |
| Plugins tagged `core` | the app's own logic and screen | core plugins | **Decide 1** |
| `ppext/content.js` | runs in each site page, drives it | page script | **page script** |
| A provider's `content.js` | the provider's additions in the page | content script | **content script** |
| `chat-ui` | everything you see | the screen | **screen** |

- **Decide 1**, the tag for the app's own plugins: (a) `app` ("app plugins: the app itself"),
  which ends the clash with the core; (b) keep `core`. With (b), "core plugins" and "the core"
  stay two different things.
- "Host" also frees "shell" for its standard meaning (the effects layer of a function, and the
  command shell in Termux).

## 2. Naming rules

- **Functions**: `noun_verb`, or `noun_noun_verb` when needed: `chat_save`, `plugin_files_list`,
  `page_option_set`. The noun is the module (and the file name); the verb comes from the closed
  list below.
- **Decide 2**, casing: (a) `snake_case` for the app's functions and data fields in every
  language (Odin, JS, Kotlin adapters' app-facing side, JSON files), so the same name is found
  everywhere with one search; (b) each language's own convention (`chat_save` in Odin,
  `chatSave` in JS and Kotlin, camelCase in JSON). With (a), plugin.json and config fields
  change too (`content_script`, `min_app`, `plugin_settings`); saved config is migrated, plugin
  files need no compatibility (alpha).
- **Records** (the shapes of data): `PascalCase` (`Chat`, `Turn`, `Block`, `Manifest`).
- **Constants**: `UPPER_SNAKE` (`PAGES_MAX`).
- **Events**: `noun_past_tense` (`chat_saved`, `page_loaded`), or `noun_changed` for a value that
  changed (`reply_changed`, `config_changed`).
- **Hooks** (stages plugins add to a sequence): named by their point in it, noun first:
  `send_before`, `reply_after`, `block_text`, `chat_route`, `turn_render`, `toggle_render`,
  `menu_items`.
- **Plugin surface**: every function plugins may use sits on `PP` under its full name
  (`PP.chat_save`), so typing `PP.chat_` lists the chat functions. No bare top-level names
  shared between plugins.
- **Routes** mirror the function: `/api/chat/save` ↔ `chat_save`.

## 3. Verbs (closed list)

Each verb has one meaning. A new verb is added here first.

| Verb | Meaning | Example |
|---|---|---|
| `get` | a value from data, no effects | `profile_get(state, id)` |
| `set` | data with one value changed, or the one place that writes it | `toggle_set` |
| `list` | every record of a kind | `plugin_list` |
| `find` | the records that match a query | `chat_find(query)` |
| `read` / `write` | raw text or bytes at a location (adapters) | `file_read`, `file_write` |
| `load` / `save` | read and parse / format and write a record | `config_load`, `chat_save` |
| `create` / `delete` | a standalone record (and its storage) | `chat_create`, `profile_delete` |
| `add` / `remove` | into or out of a container | `block_add`, `tag_remove`, `plugin_remove` |
| `move` / `rename` / `copy` | place, name, duplicate | `chat_move`, `plugin_copy` |
| `parse` / `format` | text to data / data to text, pure | `chat_parse`, `chat_format` |
| `build` | assemble from parts, pure | `message_build` |
| `validate` | the problems in data, pure | `manifest_validate` |
| `verify` | integrity or authenticity | `plugin_verify` (hash, signature) |
| `compare` | order two values | `version_compare` |
| `apply` | a change record to state | `state_apply` |
| `migrate` | old saved data to the current format | `config_migrate` |
| `open` / `close` | something shown or held open | `page_open`, `sheet_close` |
| `start` / `stop` | a process, stream, job or service | `job_start`, `reply_stop` |
| `send` | hand a message to a provider, page or the host | `page_send` |
| `fetch` | an HTTP request through the host (any method) | `http_fetch` |
| `run` | execute hooks, a job or a command | `hooks_run` |
| `emit` / `on` / `off` | events | `event_emit`, `event_on` |
| `install` / `update` | software: put in / replace with a newer version | `plugin_install` |
| `encode` / `decode` | change a representation | `base64_encode` |
| `encrypt` / `decrypt` | only inside the secure-storage adapter | |
| `render` | data to screen elements, pure | `turn_render` |

Not used, to keep one word per meaning: fetch-as-read, show/hide (use open/close), remove-as-delete,
check (use validate or verify), make, do, handle, process, manage, util/helper.

## 4. Nouns (modules and records)

| Noun | Meaning | Notes |
|---|---|---|
| `app` | version, start, restart, safe mode | |
| `config` | the settings file | |
| `state` | a process's state record | one per process |
| `event` / `hook` | as in the naming rules | |
| `file` / `folder` | raw storage | adapters |
| `secret` | an entry in secure storage | write-only or read-write |
| `chat` | one conversation, one Markdown file | |
| `turn` | your message and its reply | fields below |
| `message` | the text built from the blocks and sent | |
| `reply` / `thinking` | what came back | |
| `tag` | chat and message tags, counter tags | |
| `repo` | the chats folder's repository (commit, log, push, pull) | today "git" in code; git is the adapter |
| `profile` / `block` / `group` / `toggle` / `template` | as in the glossary | |
| `prompt` | a System prompt in the prompt library | the library is `prompt_list` |
| `plugin` / `manifest` | a plugin / its plugin.json | |
| `catalog` | the list of plugins a source offers (index.json) | **Decide 3** |
| `source` | where plugins come from (official, a repo) | |
| `bundle` | the release's zip of built-in plugins | |
| `provider` | a plugin that talks to an AI service (`web` or `api`) | |
| `site` | the website a web provider drives | |
| `page` | one open page of the site | the pool is `page_*` |
| `option` / `model` | a provider's settings / its model | |
| `connection` | an API endpoint: name, base URL, model, which secret | for api providers |
| `queue` | messages waiting for a page | |
| `job` | a request from another app (local API) | |
| `http` | requests through the host | |
| `version` | app and plugin versions | |
| `screen` and its parts: `sheet`, `drawer`, `menu`, `toast`, `dialog`, `item` | | |
| `theme` | colours | |
| `log` | the core log | |

**Turn fields** (today `you`, `reply`, ...): `turn.message` is what you typed (the "Your
message" block), `turn.sent` what was sent after blocks and hooks, `turn.reply`, `turn.thinking`,
`turn.tags`, `turn.error`.

- **Decide 3**, the plugins' list of sources and their plugins: today the screen calls it
  "Library", next to "Prompt library". (a) **Catalog** in code and screen ("Plugins ›
  Catalog"); (b) "Catalogue" (British spelling) everywhere; (c) keep "Library".

## 5. Events (first list)

`app_started`, `plugins_loaded`, `config_changed`, `chat_opened`, `chat_saved`, `turn_added`,
`reply_changed` (streaming), `reply_finished`, `reply_failed`, `page_loaded`, `page_navigated`,
`page_closed`, `pages_changed`, `job_received`, `plugin_installed`, `plugin_failed`,
`bundle_installed`, `secret_changed`, `error_raised`. The function list settles the full set.

## 6. Screen words that change

- "pill" → "the provider's name in the header" (and terms-check learns it).
- "Words" section of PLUGINS.md → "Glossary".
- Plugins › "Library" → per Decide 3.
- Settings › "Core plugins" → per Decide 1 ("App plugins" with (a)).
- Plugin types in the catalog: "Plugin · provider · web", "Plugin · provider · api".

## 7. Adapters (agnostic name outside, library inside)

| Adapter | App-facing noun | Inside (today) |
|---|---|---|
| browser views and pages | `page`, `view` | GeckoView |
| repository | `repo` | JGit |
| secure storage | `secret` | Android Keystore |
| HTTP out | `http` | HttpURLConnection |
| OS services | `clipboard`, `vibration`, `share`, `notification` | Android APIs |
| core HTTP server | (routes) | Odin `core:net` |
| screen elements | `h`, `render`, `morph` | the browser's DOM |
| page access | page script helpers | the site's DOM |
| local storage in the screen | `store_local` | localStorage |

## Decisions

1. Tag for the app's own plugins: `app` or keep `core`.
2. Casing: `snake_case` everywhere, or each language's convention.
3. The plugins' list: "Catalog", "Catalogue", or keep "Library".

Also confirm or change: "host" for the Kotlin app, "runtime" for `ui/core.js`, `repo` for git,
the turn fields (`message`, `sent`), and the verb list.
