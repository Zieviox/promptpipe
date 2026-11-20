# Accepted duplicates ("Leave")

Found by a run, read, and kept on purpose. Don't report these again unless the code changed so the reason no longer holds.

| Where | Why it stays |
|---|---|
| `core/jsonx.odin` get_str / get_int / get_bool / get_arr / get_obj | Typed getters, alike by design |
| `core/bridge.odin` poll_events, shell_next, the relay wait | Each long-poll has its own state and lock use; small |
| `core/http.odin` the header and body read loops | Two phases of one read; small |
| `core/store.odin` history_save mkdir / delete / move loops | One per operation, each with its own error text |
| try → `api(...)` → toast → catch toast, in about 8 chat-ui actions | A common idiom, not copied knowledge (a helper is optional) |
| `textOf` in content.js, ui.js (core log), memory (summary text) | Same name, three different jobs, local scope |
| Local names `go`, `flip`, `pick`, `done`, `move`, `end`, `up`, `cancel` | Short local names, different jobs |
| `scripts/ux/standin.js` vs the core | A test double: reimplements the core on purpose |
| addTagPrompt / addChatTagPrompt; copyChat / shareChat (chat-ui) | Small, different targets |
| useFolder / copyOldChats (settings.js) | Same shape, different API calls and messages |
| Hub.kt `esc`, md.js `esc`, jsonx.odin `quote` | Different languages and outputs (HTML page, Markdown HTML, JSON) |
| help.js click handler / tour.js tourBlock | Two features that both intercept taps, different rules |
