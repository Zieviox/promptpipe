# Screen words: glossary draft (for Gtex to decide, 2026-11-24)

One word per thing on screen. Decided words go into `3-terms.md` (a "Screen words" part) and into
`terms-check.py`, so a retired word on screen fails the check; then every screen, Find, the help
cards and the guides are renamed. The arrangement of the screens (Settings, Plugins) is a separate
pass after this one.

**Rules (Gtex, 2026-11-24)**
- The screen uses the **agreed term** (decided in `3-terms.md` or the UX spec), unless it's really
  unclear for the user. A name that's only in the code (a setting key like `look.*`, a sheet's
  name) is not an agreed term.
- **Title Case for every named feature, screen and section** (Site View, Quick Start, Prompt
  Library). Ordinary words stay lower case in running text ("open the site", "this chat").
- One meaning per word.

## A. Agreed terms: used as they are

Decided in `3-terms.md` (records, nouns, tags, the name pass) or the UX spec; the screen follows.

| # | The thing | Screen word | Agreed in |
|---|---|---|---|
| 1 | Who answers your message (a website or an API) and its plugin | **Provider** | records (`Provider_Def`), tags |
| 2 | A provider's web page | **site** | nouns: "the website a web provider drives" |
| 3 | The screen that shows the site (now "AI page") | **Site View** | nouns: `view` "the site view" |
| 4 | One open tab in the Site View | **page** | records (`Page`) |
| 5 | The site's conversation a chat is linked to | **site chat** | UC13, `site_chat_list` |
| 6 | The model a provider uses | **model** | nouns |
| 7 | A provider's switches (Thinking, Search) | **options** | nouns: `option` |
| 8 | A conversation in the app | **chat** | records (`Chat`) |
| 9 | What you type / what comes back / its reasoning | **message**, **reply**, **thinking** | records (`Turn`), nouns |
| 12 | Folders in the chats list | **folder** | records (`Folder`) |
| 13 | Words on messages; name# numbers them | **tag**, **chat tag**, **counter tag** (now "Counting tags count") | records (`tags`), "counter tags' numbers" |
| 14 | Messages waiting to go | **waiting** (not "queue") | `Send.status` |
| 16 | A saved arrangement of what goes out | **profile** | records (`Profile`) |
| 17 | One item in a profile | **block** | records (`Block`) |
| 18 | A text block sent as instructions | **System Prompt** | records: `type` "prompt" = System prompt |
| 20 | The block that is your typed text | **Your Message** | records: `type` "message" = Your message |
| 21 | Blocks switched together | **group** | records |
| 22 | Where all chats are kept (now "Chat folder", "chats folder") | **Chats Folder** | nouns: `chats_folder` |
| 31 | Keys, tokens, passwords the app keeps | **Credentials** | records (`Credential`) |
| 32 | The app answering other apps over HTTP | **Local API** | used throughout `3-terms.md` |
| 33 | Tap anything to have it explained | **Help Mode** | UX spec |
| 34 | The guided walkthrough | **Quick Start** | UX spec (naming decided 2026-11-07) |
| 36 | Everything that happened, errors first | **Logs** | nouns: `log` |

## B. Decided today

| # | The thing | Screen word |
|---|---|---|
| 19 | Where System Prompts are kept to reuse | **Prompt Library** |
| 24 | The list of plugins installed and available (the "Library" tab goes) | **Catalogue**, where a title is needed |
| 25 | The plugins the app itself is made of | **Runtime Plugins** |
| 26 | The filter chips, named after the tags (tag-based filters later) | **All, Providers, Message, Themes, Passive** |
| 27 | Where plugins come from | **Plugin Sources**, button **Add Repository** |
| 28 | The guide to writing a plugin | **Plugin Guide** |

## C. Not agreed anywhere: to decide

These names exist only in the code or on screen; nobody decided them. Options, then what I'd pick.

| # | The thing | On screen now | Options | I'd pick |
|---|---|---|---|---|
| 10 | Another take on a message or reply (‹ 2/2 ›) | "version" | **Version**; **Branch** | Version: what sites show; `3-terms.md` reserves `version` for SemVer, so in code it stays branch |
| 11 | A chat's own screen (name, tags, provider, history) | "Chat details", "Chat" | **Chat Details**; **Chat** | Chat Details: "Chat" alone is the conversation itself |
| 15 | The panel above the box for this message's blocks, model and options | "Quick edit" | **Quick Edit**; **This Message**; **Message Settings** | yours: Quick Edit is the old app's and familiar |
| 23 | Earlier states of your chats | "History", "Git history", "All commits" | **History**; **Git History**; **Commits** | History, with Git only in its setup (remote, author) |
| 29 | Theme, accent, sizes, quick actions | "Look" | **Look**; **Appearance**; **Display** | Appearance: Android's word |
| 30 | How big everything is / how big text is | "UI scale", "Bigger UI", "Text size" | **UI Scale**; **Display Size** · **Text Size** | Display Size and Text Size: Android's words |
| 35 | The list of keys | "Shortcuts and help", "Shortcuts" | **Shortcuts**; **Keyboard Shortcuts** | Keyboard Shortcuts |
| 37 | The less used settings | "Advanced" | **Advanced** | Advanced |
| 38 | The sheet a provider's name opens (model, options, site actions) | "Profile and provider", "Provider sheet", "Site, model and profile…" | **Provider** (titled with its name, e.g. "Qwen Chat"); **Provider Settings** | the provider's name as the title; "Provider" in Find |
| 39 | The Settings section with the waiting limits and pages at once | "Sites" | **Sites**; **Site View**; **Pages** | decided in the arrangement pass (it may merge) |

## Not covered

Code words (`3-terms.md`), plugin-specific words (Memory, Sub-chats), and error messages (they go
through `error_words` and follow these words once decided).
