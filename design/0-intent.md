# 0. Intent and UX/UI (pass 0, inside-out)

The remake starts from what survives (principles: only the intent and the UX/UI). This file
says what the app is for, who and what it deals with, and every goal a person can reach in it;
`ux/` holds the screens. Everything after this (ports, structure, code) is derived from here,
from the inside out: first what the app needs, then the wrappers that provide exactly that
(Ports and Adapters, Cockburn; the dependency rule, Martin; role interfaces, Fowler).

## Intent

promptpipe is a chat app for Android on top of the AI services you already use. You chat in one
place, in a touch-first screen; the app sends your messages to the AI website you're logged in to
(or to an AI API with your key), shapes every message with your profile (System prompts and
plugins, top to bottom), reads the reply as it streams, and keeps every chat as a Markdown file
on your phone, with its history. Everything the app does can be changed or extended with plugins,
which update without a new app version. Your chats stay yours: plain files, a git history, an
optional push to your own remote.

## Actors (outside the app)

| Actor | Direction | What passes |
|---|---|---|
| **You** (touch, a hardware keyboard, sharing from other apps) | drives the app | every use case below |
| **Other apps on the phone** | drive the app | OpenAI-style requests to `127.0.0.1:7790/v1` with the API token |
| **AI websites** (DeepSeek, Qwen, …) | driven | a logged-in page: type, send, read the reply, options, models, its chat list |
| **AI APIs** (OpenAI first, any later) | driven | HTTPS requests with a key, streamed replies |
| **Phone storage** | driven | chat files, the prompt library, settings, plugins; readable by you with any app |
| **Your git remote** | driven | push and pull of the chats' history, with a token |
| **Plugin sources** (the official catalogue on GitHub, others you add) | driven | the catalogue, plugin files, the release bundle |
| **The phone's system** | driven | notifications and staying alive, clipboard, vibration, share, opening links, file access, the key store |
| **Plugin authors** | extend the app | plugins: blocks, providers, themes, the app's own parts |

## Use cases

Every goal a person can reach. Each becomes a driving port later. "→" is the result.

### Chatting
- **UC1** Send a message → it goes out shaped by the profile; the reply streams in; thinking is
  kept, folded above the reply ("Thought for Ns").
- **UC2** Send more while a reply is coming → the messages queue under the chat and go in order;
  a queued message can be moved up, edited or removed.
- **UC3** Stop waiting for a reply → the app gives up on it (no limit otherwise, unless set).
- **UC4** Recover a send that failed or looks failed → **Check** keeps what the site shows,
  **Retry** sends again, **Edit** puts it back in the box; the reason is shown.
- **UC5** Edit and resend your last message.
- **UC6** Reuse text: swipe a reply right to quote it, left to copy it; copy a code block, your
  message or the thinking; select text (long press, or a box for picking a part).
- **UC7** Write long text: the big message box; Enter sends (optional); put text files in the box.
- **UC8** Read a new reply without losing your place → replies never scroll the chat; "↓ 1 new"
  jumps to the start of it.
- **UC9** Choose the provider: tap its name in the header → switch provider, open its site, log
  in once.
- **UC10** Choose the model and the provider's options (Thinking, Search) → set before each
  message; "Choose on the site" when the list can't be read.
- **UC11** Turn blocks on or off for this chat (Quick edit; plugin toggles in the header or
  toolbar).
- **UC12** See the site's pages (site view): tabs, a new page, the address bar, reload, back.
- **UC13** Bring the site's own chats in: list them, open one and continue it here, paste a chat
  link, import a site chat's earlier messages, add the page's newest reply to this chat.
- **UC14** Share text from another app (or select text → "Send to promptpipe") → a new chat with it.
- **UC15** Chat through an AI API with your key (OpenAI first) → the same chat, profile and history
  as a website.
- **UC48** Attach files or images to a message (added in stage 2) → kept with the chat, sent to
  providers that accept them.

### Chats
- **UC16** Start a new chat; open your chats: pinned first, then by day, then folders.
- **UC17** Organise chats: pin, move (drag or "Move to"), rename, delete (kept in the history),
  select several; create, rename, delete folders.
- **UC18** Find text in every chat: plain text, `#tag`, `in:folder`, `"exact phrase"`, `is:you`,
  `is:ai`.
- **UC19** See a chat's details: title, chat tags, provider and model, its history (commits).
- **UC20** Tag a chat (every message gets the tags) or one message; a tag ending in `#` counts up
  (`part#` → `part1`, `part2`).
- **UC21** Copy or share a whole chat.

### Profiles and prompts
- **UC22** Pick the active profile; make a new one from a template; rename, duplicate, delete.
- **UC23** Edit a profile's blocks: add a System prompt (own text or linked from the library), a
  plugin or a plugin's text block; reorder; turn on or off; choose what a plugin works on (above,
  your message, picked blocks); open a block's page.
- **UC24** Group blocks under one toggle.
- **UC25** Preview what a profile will send.
- **UC26** Keep System prompts in the prompt library: add, edit, pin, link into a profile (one edit
  changes every profile that links it).
- **UC27** Export and import profiles and the library; choose what happens on a name clash.

### Plugins
- **UC28** See the plugins: the profile's blocks, and the catalogue with each plugin's type.
- **UC29** Get a provider or plugin from the catalogue; open a plugin's page: update, roll back,
  remove, copy it ("your copy" replaces the app's).
- **UC30** Install from a link, a zip or an AI's answer; add a source; copy the plugin-writing
  instructions for an AI.
- **UC31** Keep plugins up to date: update all, a daily check, the release bundle as a fallback.
- **UC32** Change a plugin's settings (per profile).
- **UC33** Recover from a broken plugin: safe mode starts with the app's own plugins only and says
  which failed; leave safe mode.

### Settings and help
- **UC34** Look: theme, light or dark, accent, UI scale, text size, quick actions under replies,
  staying at the bottom while a reply comes in.
- **UC35** Sites: how many pages at once, waiting limits.
- **UC36** Chats and storage: the chats folder (move with or without copying, back to the default),
  all-files access, the storage check, git (remote, token, push, pull, auto-push).
- **UC37** Local API: the address, the token (make a new one), how apps use it, the folder for
  their chats.
- **UC38** Advanced: reset to first launch, the app's own plugins (copy one, pick the screen),
  safe mode, the core log, stop the background service, the version.
- **UC39** Help: the ? mode that explains what you tap, the first-time guides (and showing them
  again), the shortcuts, the quick start, the plugin guide.
- **UC40** Keep secrets (API keys, tokens, passwords) in secure storage: add, see the list (name,
  tags, host, last 4), remove; connections for API providers.

### Other apps
- **UC41** Another app asks through `/v1` (model = a profile) → a new chat, or a saved chat
  continued with `"chat"`; the answer streams back and says which chat it went to.

### Plugin authors
- **UC42** Extend the app: a block (add text, change the message, work on the reply), a provider
  (web or API), a theme, a side request to the provider, an own sheet, a header toggle, menu
  entries; or replace one of the app's own parts.

### Built-in plugins (added in stage 2)
- **UC43** Long chats keep their context (Memory): older turns summarised before the limit.
- **UC44** A long chat continues in a new site chat (Sub-chats); the file stays one.
- **UC45** Encode the message and decode the reply (Base64).
- **UC46** Report a site's page to fix a provider (Page report).
- **UC47** Themes: Ember and Paper.

## UX/UI reference

`design/ux/` has a screenshot of every screen and state (63 states, 126 images), light and dark, on a phone-sized screen
(412 × 915), made by `node scripts/ux/capture.js` from the current app in the stand-in with
seeded chats, folders, tags, profiles and prompts. File names: `<state>-light.png`,
`<state>-dark.png`.

| Area | States |
|---|---|
| Chat | `chat-empty`, `chat`, `chat-composer-big`, `chat-message-menu`, `chat-select-text`, `chat-info`, `chat-history`, `chat-move`, `chat-failed`, `chat-queued`, `chat-streaming` |
| Chats | `drawer`, `drawer-select`, `drawer-folder-open`, `drawer-site-chats`, `find` |
| Provider | `provider-menu`, `provider-sheet`, `models`, `quick-edit`, `site-view` |
| Profiles | `profiles-new`, `profile-editor`, `profile-add-block`, `profile-block-page`, `profile-groups`, `profile-preview`, `profile-import` |
| Prompt library | `prompt-library`, `prompt-page`, `prompt-editor` |
| Plugins | `plugins`, `plugins-catalogue`, `plugins-providers`, `plugins-install`, `plugins-add-source`, `plugins-guide`, `plugin-page`, `plugin-settings` |
| Settings | `settings`, `settings-look`, `settings-look-accent`, `settings-sites`, `settings-waiting`, `settings-storage`, `settings-folder`, `settings-git`, `settings-import-export`, `settings-local-api`, `settings-api-token`, `settings-api-how`, `settings-advanced`, `settings-storage-check`, `settings-core-log`, `settings-help` |
| Help | `help-menu`, `help-mode`, `quick-start-list`, `tour-setup`, `tour-chat` |
| Feedback | `dialog-confirm`, `dialog-text`, `toast-error` |

The screenshots show today's app with its bugs too (the reply's table shows as raw `|` lines,
#214). Where a requirement fixes something, the requirement wins over the screenshot (decided
2026-11-21). There is no separate mockup: the screenshots are the visual reference.

Not in screenshots, kept as written:

- **Gestures**: swipe a reply right (quote) or left (copy); long-press a chat (select mode) or text
  (select); drag a grip to reorder; Back closes what is on top.
- **Keys**: Ctrl+Enter send · Ctrl+K commands · Ctrl+B chats · Ctrl+F search · Ctrl+M model ·
  Ctrl+E big box · Ctrl+/ thinking · Ctrl+? all shortcuts · Alt+S site page.
- **Wording**: the texts on these screens are the reference copy; changes go through the glossary.
- **New screens** (secure storage, connections, the catalogue's "provider · web/api" types) are
  designed in the style of these screenshots.

## The stages, rebuilt inside-out

| # | Stage | From |
|---|---|---|
| 0 | Intent, actors, use cases, UX/UI (this file) | — |
| 1 | Principles, adding Ports and Adapters, the dependency rule, role interfaces, the anti-corruption layer | `1-principles.md` revisited |
| 2 | Requirements: the use cases plus the constraints (security, platforms, size, checks) | `2-requirements.md` revisited |
| 3 | The application's model: its records (data) and its words | `3-terms.md` revisited |
| 4 | Ports: one driving port per use case; driven ports named by role from what the use cases need, each with only the calls one interaction needs | new |
| 5 | Strategies, checked against the ports | `4-strategies.md` revisited |
| 6 | Adapters, layers and the line budget in three lines: application, ports, adapters | `5-architecture.md` redone |
| 7 | Standards and a KISS/DRY review of the whole design | new |
| 8 | Function list | new |
| 9 | Build, layer by layer, against the screenshots and the checks | — |
| 10 | Parity and switch | — |

Decisions already made carry over (the remake rules, the terms, `snake_case`, the catalogue,
libraries behind adapters, the 3k scope); each stage revisits its file and keeps what still fits.
