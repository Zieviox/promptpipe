# 2. Requirements

Everything the refactored app must do, and the constraints it must keep. Each line has an id
(for the function list and the checks to point at) and, where it helps, its source: a user
decision (U, with the date), a bug number (#), or a current feature (F).

Words in this file are today's glossary words; `3-terms.md` proposes the final ones.

## A. Platforms and layers

- **A1** The core is portable: one code base (Odin) that every platform's shell starts. Today
  Android; a desktop shell later (F, core/README).
- **A2** Platform code lives only in the shell (Kotlin on Android): starting the core, the
  browser engine views (the screen and site pages), OS services (files permission, notifications
  and keep-alive, clipboard, vibration, share, secure storage, the repository library).
- **A3** The shell holds no app logic. The APK changes only when native code must (U 2026-11-20:
  "Unless you REALLY can't do without APK, do NOT put into APK code").
- **A4** Everything that can be a plugin is a plugin, updatable from the catalogue without a new
  APK: the screen, sending, chat files, history, profiles, markdown, jobs, providers (F, #206).
- **A5** One source for plugins: the plugins repo. The APK carries a copy of the built-in ones,
  made at build time (U 2026-11-20, #206).
- **A6** The layering of a plugin's copies stays and is visible: built-in, updated, your copy
  (your copy wins) (U).
- **A7** A missing platform feature is never hidden: the call fails with "not supported on this
  platform" and why (F, core/README).
- **A8** The page script works on any browser engine that can inject a script into a page; the
  engine-specific part is in the shell's adapter.

## B. Chatting with a provider

- **B1** Providers drive an AI service. Two types: **web** (drives the site in a page the app
  keeps open; selectors and an optional content script) and **api** (calls an HTTP API with a
  key) (U 2026-11-20: tags `provider`+`web`, `provider`+`api`).
- **B2** API providers: OpenAI first, any other later, all as plugins; a new API needs no APK
  (U 2026-11-20).
- **B3** Replies stream live, for web and API providers (U 2026-11-20).
- **B4** What is sent is built the same way for both types (profile blocks, hooks) (U 2026-11-20:
  "Same as site"). Later: a reminder to turn on Memory when it's off for an API chat (U, later).
- **B5** Up to 5 pages at once (10 if allowed), shared by the user, plugins (side requests) and
  other apps (local API); more messages wait in a queue; queued messages can be moved, edited,
  removed (F).
- **B6** Thinking is read and kept, folded under the reply (F).
- **B7** Model and options: read the list from the site and set them before each message;
  "choose on the site" when the list can't be read (F).
- **B8** A send can be stopped (Stop waiting), checked (keep what the site shows), retried, or
  edited and resent; your last message can be edited and resent (F).
- **B9** The site's refusals, human checks and errors end the send at once with the reason
  (F, #245, #247). No connection: say why at once (#241).
- **B10** Waiting limits are optional (idle and total, minutes; 0 = none) (F).
- **B11** Site chats: list the site's own chats, open one, continue it here, import its earlier
  messages, add the page's newest reply (F).
- **B12** Side requests (`PP.ask`): a plugin asks the provider something in a fresh, unsaved chat
  (F).
- **B13** The site view shows the pages: tabs that each show their own page (#236), closing a tab
  closes its page (#242), back inside the site (#243), sign-in pop-ups in their own view (#244),
  the address bar can be typed in (#240, #251).

## C. Profiles, blocks and the prompt library

- **C1** A profile is an ordered list of blocks sent top to bottom, plus its plugins' settings (F).
- **C2** Block types: System prompt (own text, or linked from the prompt library), plugin (with an
  optional text block and a scope: above / message / picked blocks), Your message (F).
- **C3** Groups: several blocks under one toggle (F). Later: a group shared by several profiles
  (#255).
- **C4** Toggles: the profile has the defaults, each chat keeps its own; a plugin's toggle can
  sit in the header or the toolbar (F).
- **C5** Templates: ready-made profiles to copy from (F).
- **C6** The prompt library: saved, pinned System prompts; a linked block sends the library's
  text (F). Stored as `prompt-library.json` with the chats (F).
- **C7** Export and import of profiles and the library; a name clash asks, keeps both or replaces,
  as set (F).
- **C8** Quick edit: toggle blocks for this chat next to the message box (F).
- **C9** Preview: what a profile sends, before sending (F).

## D. Plugins

- **D1** One plugin format: `plugin.json` with `tags` deciding the type: none (block plugin with a
  toggle), `provider` (+`web` or `api`), `theme`, `passive`, `core` (+`ui`), `driver` (F, U).
- **D2** The files that make up a plugin are defined once (#1 of the duplicates report).
- **D3** Plugin hooks: text (adds a block's text), before send (changes the message), after reply
  (works on the reply), route (picks profile and site chat), render (draws a turn or a toggle),
  menu (adds entries) (F).
- **D4** Plugin settings per profile, declared in plugin.json and shown by the screen (F).
- **D5** Sources: the official catalogue, other GitHub repos, a link, a zip, files from an AI's
  answer (F).
- **D6** Install, update (one, all, daily check), roll back, remove, copy ("your copy") (F).
- **D7** A plugin that needs a newer app says so (`minApp`) (F).
- **D8** Every download is checked against the catalogue's hash (#201), and the catalogue is
  signed (#202). The release bundle is an opt-in fallback (F).
- **D9** Safe mode: if a core plugin of yours fails to load, start with built-in plugins only, say
  which failed (F).
- **D10** The plugin surface (`PP`) is the only way in: named, versioned, documented; a plugin
  says which version it was made for (#210).
- **D11** No two plugins can break each other through shared names (#210, the LIB clash).
- **D12** Plugin guides (each plugin's GUIDE.md) and the plugin-writing guide open in the app (F).
- **D13** Writing a plugin with an AI: copy the instructions, install the answer (F).

## E. Chats and history

- **E1** Every chat is a Markdown file with a header, in the chats folder on shared storage; the
  user can read them with any app (F).
- **E2** Folders, pinned chats, move, rename, delete (deleted chats stay in the repository's
  history) (F).
- **E3** Chat tags, message tags, counter tags (`part#` → `part1`, `part2`) (F).
- **E4** Search over all chats: text, `#tag`, `in:folder`, `"exact phrase"`, `is:you`, `is:ai` (F),
  without reading every file in full each time (#212).
- **E5** Every change is a commit in the chats folder's repository; optional push and pull to the
  user's remote with a token, optional auto-push; a chat's history (F).
- **E6** The chats folder can be moved (with or without copying), checked step by step (F).
- **E7** Share into the app: shared text starts a new chat (F).
- **E8** Tables, images (as links), strike-through and nested lists are shown, not just read (#214).
- **E9** Files are written safely: a cut-off write never leaves a broken file (#211).

## F. Built-in block plugins

- **F1** Memory: long chats keep their context; older turns are summarised in a side chat before
  the limit (F).
- **F2** Sub-chats: a chat continues in a new site chat when it gets long, the file stays one (F).
- **F3** Base64: encodes the message and decodes the reply (F).
- **F4** Page report: a report of the site's page for fixing a provider (F).
- **F5** Themes: Ember, Paper (F).

## G. Local API for other apps

- **G1** OpenAI-style API at `127.0.0.1:7790/v1`, reachable only from the phone, token always
  required (F).
- **G2** Model = a profile name; each request is a new chat, or continues a saved chat with
  `"chat"` (F).
- **G3** Real streaming, keep-alive while waiting, a closed connection cancels the job, a retried
  request joins the running job (#209).
- **G4** The reply says which chat it went to and what was sent (F).

## H. Secure storage

- **H1** One secure storage for any sensitive data (API keys, tokens, passwords, notes), with free
  tags (U 2026-11-20).
- **H2** Each secret is write-only (plugins can use it, never read it back) or read-write
  (plugins can read it); write-only is the default (U).
- **H3** A write-only secret is bound to exact hosts, a header name and a prefix; the shell adds
  it to requests to those hosts only (U, best practice).
- **H4** Encrypted with the platform's key store (Android Keystore), excluded from backups,
  never in exports, config, git or logs (U, best practice).
- **H5** The user enters, replaces and removes secrets in the app; listing shows name, tags, type,
  host and the last 4 characters (U).
- **H6** The git token and the local API token move into it (U).
- **H7** Not now: fingerprint lock, spending-limit hints (U 2026-11-20: "Don't add those for now").

## I. Screen and use

- **I1** Touch first; every action has a button; keyboard shortcuts for a hardware keyboard (F).
- **I2** Redraws never lose typing, the keyboard's suggestion, the cursor, a selection or a
  scroll position (F, #249 to #252).
- **I3** Replies don't scroll the chat for you; "↓ 1 new" jumps to it (F).
- **I4** Look: themes (plugins), UI scale, text size, accent, light/dark, Enter sends (F).
- **I5** Help (?), a first-run tour, the quick start, shortcuts list (F).
- **I6** Sheets, the chats drawer and the site view: Back closes what is on top (#239).
- **I7** Copy, quote (swipe), select text, share a chat, copy a code block (F).
- **I8** Accessible: labels on icon buttons, roles on alerts, readable contrast in every theme.

## J. Security

- **J1** Every call to the core needs the security key; the Host header is checked (F).
- **J2** The shell checks it talks to its own core (challenge, not sending the key); "port in
  use" is reported (#203).
- **J3** Code and settings on shared storage are checked: a plugin or config changed outside the
  app is shown, core plugins wait for a tap (#204, decision pending).
- **J4** Plain HTTP only to 127.0.0.1 (#215).
- **J5** Zips are checked before unpacking, with size and count limits (#213).
- **J6** Releases are release builds with their own signing key; the engine version is pinned
  (#207, #208; timing pending).
- **J7** Downloads over 45 MB are refused with a clear reason (#216).

## K. Reliability

- **K1** The app waits for storage after a reboot and never starts the core on a bad path (#237).
- **K2** A background service keeps the core and pages alive, with its notification (F).
- **K3** Pages Android stopped are reloaded (F).
- **K4** Old saved data (config, chat files, library) is moved to the current format on start;
  plugin files need no backwards compatibility in the alpha (U).
- **K5** Automatic update checks fail quietly; a check the user starts reports (F).
- **K6** The core log can be read in the app (F).

## L. Building and checking

- **L1** The app builds on the phone (Termux + proot) and on a PC; no build environment is
  installed for the user (U).
- **L2** Version codes never go down; the build refuses a lower one (F, #248).
- **L3** Checks: terms-check (0), clone-detection, core route tests, the stand-in checks
  (redraw, migration, morph); later CI (#205).
- **L4** A stand-in core lets the screen run in a desktop browser without the phone (F).

## M. Words

- **M1** One glossary for the app, guides and code; standard programming terms first, no invented
  words (U 2026-11-20).
- **M2** Renames are deterministic (a table, applied everywhere) and checked by terms-check (U).
- **M3** Function names put the noun first (`file_write`) for sorting and autocomplete (U 2026-11-20).

## O. The rewrite itself

- **O1** The new app is written from zero from the design; the current code is read-only reference
  and nothing is copied from it (U 2026-11-20: "start fresh. From zero. Not edit").
- **O2** Both repos are rewritten: the core, the host, the runtime, the page script, and every
  plugin (core plugins, providers, block plugins, themes).
- **O3** The user's saved data opens in the new app: chat files, config, prompt library,
  profiles, plugin settings (K4).
- **O4** The old app stays usable until the new one passes every requirement; then the old code is
  removed in one change.
- **O5** The core targets the current Odin release (dev-2026-11 today); the phone's compiler must
  match (`odin version`).

## N. Not now (YAGNI)

- **N1** A desktop or iOS shell (only the boundaries are kept ready).
- **N2** Fingerprint lock, spending hints for keys (H7).
- **N3** Shared groups across profiles (#255) and the Memory reminder for API chats (B4) come
  after the refactor.
- **N4** Sync other than git; several users; cloud anything.

## The flows the design must make clear

The main sequences (each becomes one readable chain of calls in the function list):

1. **Start**: the shell waits for storage, starts the core, checks it's its own core, opens the
   screen; the screen loads config, migrates saved data, loads plugins (core plugins in order, then
   the rest), draws.
2. **Send**: message → build from the profile's blocks → before-send hooks → route (profile, site
   chat) → provider (web: page from the pool, set options, type, send, stream the reply; api: the
   shell's keyed request, stream the reply) → after-reply hooks → format the chat file → save
   (write, commit) → draw.
3. **Side request**: a plugin asks; the same provider path with a fresh, unsaved chat.
4. **Job** (local API): request → job → the send flow with the job's profile → stream back.
5. **Plugin install and update**: catalogue → files list → fetch → verify (signature, hash) →
   write → reload.
6. **History**: save → commit; push and pull with the token from secure storage.
7. **Secure storage**: add, list, use (keyed request), remove.

Everything else (a reply grew, a page loaded or changed address, a plugin was installed, the
config changed, a job arrived, an error happened) is an event.
