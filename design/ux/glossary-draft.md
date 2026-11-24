# Screen words: draft glossary (for Gtex to decide, 2026-11-24)

One word per thing on screen. Code names are already settled in `3-terms.md`; this is only what
you read in the app. For each: what the screens say now, a recommendation, and why. Mark each row
**yes**, or write your word. Decided words go into `3-terms.md` (a "Screen words" part) and into
`terms-check.py`, so a retired word on screen fails the check; then every screen, Find, the help
cards and the guides are renamed, and only then is Settings rearranged with these words.

How a word is picked: the word you already use for it; else Android's or common chat apps' word;
else the plainest English. One meaning per word: if a word already means something else, it isn't
used again.

## 1. Who answers, and where

| # | The thing | On screen now | Recommend | Why |
|---|---|---|---|---|
| 1 | Who answers your message: a website (Qwen Chat, DeepSeek) or an API (OpenAI-style), and the plugin for it | "Provider" ("Switch provider", "No provider", "Provider for new chats", the "Providers" chip), "Site" (Settings › "Sites"), "AI site" (help texts) | **Provider** | Covers sites *and* APIs; "site" can't (the OpenAI-style one has no site). Already the most used (40 places). |
| 2 | A provider's web page (where you log in, what the app types into) | "site", "AI site", "AI page", "page", "site page" | **site** (the provider's site) | Only for the web page itself: "Open the site", "site chat", "Check against the site". Never for the provider as a whole. |
| 3 | The screen that shows the site | "AI page" (its title, the header button "Show AI page"), "site view" (code, notices), "Show the page" | **Site view** (button: "Show the site") | One name; "AI page" says neither *site* nor *view*. |
| 4 | One open tab inside the site view | "page", "site page", "Pages at once" | **page** | Already the setting's word ("Pages at once"); a site view holds pages. |
| 5 | A conversation on the site that a chat is linked to | "site chat", "linked site chat" | **site chat** | Already consistent; keep. |
| 6 | The model a provider uses | "model" | **model** | Keep. |
| 7 | A provider's switches (Thinking, Search) | "options" ("Model and options") | **options** | Keep; never used for anything else (see 17). |

## 2. Chats and messages

| # | The thing | On screen now | Recommend | Why |
|---|---|---|---|---|
| 8 | A conversation in the app | "chat" | **chat** | Keep. |
| 9 | What you type / what comes back / its reasoning | "message", "reply", "thinking" | **message**, **reply**, **thinking** | Keep. |
| 10 | Another take on a message or reply (‹ 2/2 ›) | "version", "new version" | **version** | Keep; matches what sites show. |
| 11 | The chat's own screen of details | "Chat details" (Find), "Chat" (its title) | **Chat details** | Title and command say the same. |
| 12 | Folders in the chats list | "folder" ("New folder", "Move to folder") | **folder** | Keep (only for these; see 22). |
| 13 | Words put on messages | "tag", "chat tag", "counting tag" (name#) | **tag**; **chat tag** (on every message of a chat); **numbered tag** (name#) | "Counting tags count" is hard to read; "numbered" says what name# does. |
| 14 | Messages waiting to go | "waiting", "queue", "Send now", "Pause" | **waiting** | One word; "queue" only in code. |
| 15 | The panel above the box for this message's blocks, model and options | "Quick edit" (old app) | *your call*: **Quick edit** (keep) or **This message** | Old app's name; you know it, but it doesn't say what it holds. |

## 3. Profiles

| # | The thing | On screen now | Recommend | Why |
|---|---|---|---|---|
| 16 | A saved arrangement of what goes out with your message | "profile" (old app had "pipeline") | **profile** | Keep; already replaced "pipeline". |
| 17 | One item in a profile (a system prompt, a plugin, Your message) | "block" ("Add a block", "Profile blocks"), "System prompts and plugins", "Sent with N" | **block** (said once where it's added: "a system prompt or a plugin") | 34 places use it; "Sent with N" stays (it counts blocks). |
| 18 | A text block sent as instructions | "System prompt" | **system prompt** | The standard term; keep. |
| 19 | Where you keep system prompts to reuse | "Prompt library" (old app) | **System prompts** (the list), or keep **Prompt library** | "Library" also names the plugin list today (see 24); one of them must go. |
| 20 | The block that is your typed text | "Your message" | **Your message** | Keep. |
| 21 | Blocks switched together | "group" | **group** | Keep. |

## 4. Storage and history

| # | The thing | On screen now | Recommend | Why |
|---|---|---|---|---|
| 22 | Where all chats are kept on the phone | "Chat folder", "chats folder", "Chats and storage" | **chats folder** | One spelling; "folder" alone means a chats-list folder (12). |
| 23 | Earlier states of your chats | "History", "Git history", "All commits", "Git" | **History** (what you see); **Git** only for its setup (remote, author, push) | Most people don't think in commits. |

## 5. Plugins

| # | The thing | On screen now | Recommend | Why |
|---|---|---|---|---|
| 24 | The plugins screen's list of what's installed and what you can get | "Library" (tab); `3-terms.md` decided "Catalogue" (2026-11-20) but the screen never changed | **Installed** and **Get more** (two parts of one list, no tab named "library") | "Library" clashes with the prompt library; "Catalogue" stays the name of the signed list file only. |
| 25 | The app's built-in parts (runtime plugins) | "The app's own parts", "runtime" (shown raw: "Plugin · runtime"), `3-terms.md`: "Runtime plugins" | **App parts** | Plain; never shows "runtime". |
| 26 | Plugin kinds (the filter chips) | "Providers", "Plugins", "Themes", "Passive" (a code tag on screen); the spec said "AI sites, Message plugins, Themes, Tools" | **Providers**, **Message plugins**, **Themes**, **Tools** | "Plugins" inside Plugins says nothing; "Passive" is a code word. |
| 27 | Where plugins come from | "source", "Add a source" | **plugin source** | "source" alone is vague. |
| 28 | The step-by-step guide to writing a plugin | "Plugin guide" | **Plugin guide** | Keep. |

## 6. Settings and help

| # | The thing | On screen now | Recommend | Why |
|---|---|---|---|---|
| 29 | Theme, accent, sizes | "Look" (old app) | **Appearance** | Android's word. |
| 30 | How big everything is / how big text is | "UI scale", "Bigger UI", "Smaller UI", "Text size" | **Display size**, **Text size** | Android's words; "UI" is jargon. |
| 31 | Keys, tokens, passwords the app keeps | "Credentials" ("API keys, tokens, passwords") | *your call*: **Credentials** or **Keys and passwords** | "Credentials" is exact but stiff. |
| 32 | The app answering other apps over HTTP | "Local API" | **Local API** | Technical feature; keep. |
| 33 | Tap anything to have it explained | "Help mode", "?" | **Help mode** | Keep. |
| 34 | The guided walkthrough | "Quick start" | **Quick start** | Keep (decided 2026-11-07). |
| 35 | The list of keys | "Shortcuts and help" (title), "Shortcuts" (row) | **Keyboard shortcuts** | It only lists shortcuts. |
| 36 | Everything that happened, errors first | "Logs", "The core's log", "The crash record" | **Logs** | Keep. |
| 37 | The less used group | "Advanced" | **Advanced** | Keep (Android uses it for 3 or more rarely used items). |
| 38 | The list shown when a provider's name is tapped | "Profile and provider", "Provider sheet" (Find), "Site, model and profile…" | **the provider's name** as its title (e.g. "Qwen Chat") | Three names for one sheet today. |

## Old app names: keep or change?

These came from the old app. Keep the ones you're used to; the rest change as above.

- **Quick edit** (15)
- **Prompt library** (19)
- **Look** (29)
- **Profile** (16): recommended to keep
- **Local API** (32): recommended to keep

## Not covered

Code words (`3-terms.md`), plugin-specific words (Memory, Sub-chats), and error messages (they go
through `error_words` and follow these words once decided).
