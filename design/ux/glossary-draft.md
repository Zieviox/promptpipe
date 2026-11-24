# Screen words: draft glossary (for Gtex to decide, 2026-11-24)

One word per thing on screen. For each: what the screens say now, the word, and why. Decided
words go into `3-terms.md` (a "Screen words" part) and into `terms-check.py`, so a retired word on
screen fails the check; then every screen, Find, the help cards and the guides are renamed. The
arrangement of the screens (Settings, Plugins) is a separate pass after this one.

**The rule (Gtex, 2026-11-24): the screen uses the code's word** (`3-terms.md`, the setting keys,
the tags), **unless it's really unclear for the user.** One meaning per word.

✅ = decided. The rest are proposals by the rule, to confirm.

## 1. Who answers, and where

| # | The thing | On screen now | Word | Why |
|---|---|---|---|---|
| 1 | Who answers your message: a website (Qwen Chat, DeepSeek) or an API (OpenAI-style), and its plugin | "Provider", "Site" (Settings › "Sites"), "AI site" | **Provider** | The code's `provider`; also covers APIs, which have no site. |
| 2 | A provider's web page | "site", "AI site", "AI page", "site page" | **site** | The code's `site` ("the website a web provider drives"); only for the web page itself. |
| 3 | The screen that shows the site | "AI page" (title, "Show AI page"), "site view", "Show the page" | **Site view** | The code's `view` ("the site view"). |
| 4 | One open tab inside the site view | "page", "site page" | **page** | The code's `page`. |
| 5 | The conversation on the site a chat is linked to | "site chat" | **site chat** | Already the code's word. |
| 6 | The model a provider uses | "model" | **model** | Code: `model`. |
| 7 | A provider's switches (Thinking, Search) | "options" | **options** | Code: `option`. |

## 2. Chats and messages

| # | The thing | On screen now | Word | Why |
|---|---|---|---|---|
| 8 | A conversation in the app | "chat" | **chat** | Code: `Chat`. |
| 9 | What you type / what comes back / its reasoning | "message", "reply", "thinking" | **message**, **reply**, **thinking** | Code: `message`, `reply`, `thinking`. |
| 10 | Another take on a message or reply (‹ 2/2 ›) | "version" | **version** | As on screen now. (In code a version of a turn is a branch; `version` there is SemVer. Clear to users, so it stays.) |
| 11 | A chat's own screen of details | "Chat details" (Find), "Chat" (title) | **Chat** | The code's sheet `chat`; title and Find say the same. |
| 12 | Folders in the chats list | "folder" | **folder** | Code: `Folder`. |
| 13 | Words put on messages | "tag", "chat tag", "Counting tags count" (name#) | **tag**, **chat tag**, **counter tag** (name#) | The code's `counter` (`tags.counter_scope`, `counters.json`). |
| 14 | Messages waiting to go | "waiting", "queue" | **waiting** | The code's `Send.status` "waiting". |
| 15 | The panel above the box for this message's blocks, model and options | "Quick edit" | **Quick edit** | The code's `quick_edit`. |

## 3. Profiles

| # | The thing | On screen now | Word | Why |
|---|---|---|---|---|
| 16 | A saved arrangement of what goes out with your message | "profile" | **profile** | Code: `Profile`. |
| 17 | One item in a profile | "block", "System prompts and plugins" | **block** | Code: `Block`. Said once where it's added: "a system prompt or a plugin". |
| 18 | A text block sent as instructions | "System prompt" | **System prompt** | Code: `type: "prompt"` = System prompt. |
| 19 ✅ | Where system prompts are kept to reuse | "Prompt library" | **Prompt Library** | Its name, capitalised as a name; with "Library" gone from Plugins (24), it has one meaning. |
| 20 | The block that is your typed text | "Your message" | **Your message** | Code: `type: "message"` = Your message. |
| 21 | Blocks switched together | "group" | **group** | Code: `group`. |

## 4. Storage and history

| # | The thing | On screen now | Word | Why |
|---|---|---|---|---|
| 22 | Where all chats are kept on the phone | "Chat folder", "chats folder" | **chats folder** | The code's `chats_folder`; "folder" alone is a chats-list folder (12). |
| 23 | Earlier states of your chats | "History", "Git history", "All commits", "Git" | **History** for the list; **Git** for its settings (remote, author, push); **commit** for one entry | The code's sheet `history`, settings `git.*`, and `commit`. |

## 5. Plugins

| # | The thing | On screen now | Word | Why |
|---|---|---|---|---|
| 24 ✅ | The list of plugins installed and available | "Library" (tab) | **Catalogue**, where a title is needed | The code's `catalogue`. The tab goes in the arrangement pass. |
| 25 ✅ | The plugins the app itself is made of | "The app's own parts", "runtime" | **Runtime plugins** | The code's tag `runtime`. |
| 26 ✅ | The filter chips | "All, Providers, Plugins, Themes, Passive" | **All, Providers, Message, Themes, Passive** | Named after the tags (`provider`, `theme`, `passive`; no tag = a message plugin). Filters become tag-based later. |
| 27 ✅ | Where plugins come from | "source", "Add a source…" | **Plugin sources**, button **Add repository** | |
| 28 ✅ | The guide to writing a plugin | "Plugin guide" | **Plugin guide** | |

## 6. Settings and help

| # | The thing | On screen now | Word | Why |
|---|---|---|---|---|
| 29 | Theme, accent, sizes | "Look" | **Look** | The code's `look.*`. |
| 30 | How big everything is / how big text is | "UI scale", "Bigger UI", "Smaller UI", "Text size" | **UI scale**, **Text size** | The code's `look.scale`, `look.text`; "Bigger UI" / "Smaller UI" become "Bigger UI scale" / "Smaller UI scale"? (or keep: they're commands) |
| 31 | Keys, tokens, passwords the app keeps | "Credentials" | **Credentials** | Code: `Credential`. |
| 32 | The app answering other apps over HTTP | "Local API" | **Local API** | Code: `api.*`. |
| 33 | Tap anything to have it explained | "Help mode", "?" | **Help mode** | Code: `help_mode`. |
| 34 | The guided walkthrough | "Quick start" | **Quick start** | Code: `quick_start`. |
| 35 | The list of keys | "Shortcuts and help" (title), "Shortcuts" | **Shortcuts** | Title and row say the same. |
| 36 | Everything that happened, errors first | "Logs" | **Logs** | Code: `log`. |
| 37 | The less used group | "Advanced" | **Advanced** | |
| 38 | The sheet a provider's name opens | "Profile and provider", "Provider sheet", "Site, model and profile…" | **Provider** (titled with the provider's name, e.g. "Qwen Chat") | The code's sheet `provider`. |

## Not covered

Code words themselves (`3-terms.md`), plugin-specific words (Memory, Sub-chats), and error
messages (they go through `error_words` and follow these words once decided).
