# 2. Requirements (stage 2, from the use cases)

Two parts: **what each use case must do** (its acceptance criteria, numbered under the use case
of `0-intent.md`), and **the constraints** every part must keep (numbered by area). Sources:
a user decision (U, with the date), a bug number (#), or a behaviour of the current app (F).
Requirements win over the screenshots (U 2026-11-21).

## Part 1. The use cases

### Chatting

- **UC1 Send a message**
  1. What is sent is built from the active profile's blocks, top to bottom, with this chat's
     toggles, then the plugins' before-send hooks; the same for web and API providers
     (U 2026-11-20: "Same as site").
  2. The reply streams in live, for web and API providers (U 2026-11-20); then the plugins'
     after-reply hooks run on it, and the chat is saved.
  3. The model's thinking is read and kept in full, above the reply ("Thought for Ns"), folded
     or open as set in Settings (folded by default, as today) (F, U 2026-11-21).
  4. Several pages answer at once, shared by your chats, plugins' side requests and other apps'
     requests; how many is a setting (default 5), with a warning above 5 (each page uses memory,
     and many at once can look like a bot to the site); no hard maximum (F, U 2026-11-21).
  5. A refusal, a human check or an error from the site ends the send at once, with the reason in
     plain words (F, #245, #247); no connection, a wrong address or a refused certificate is said
     at once, not after a wait (#241).
  6. Waiting limits are optional: idle and total, in minutes, 0 = none (F).
- **UC2 Send while a reply is coming**: the message waits in the chat's queue, shown under the
  chat; queued messages go in order and can be moved up, edited or removed (F).
- **UC3 Stop waiting**: gives up on the reply at once; the page is told to stop (F).
- **UC4 Recover a failed send**: the failed message shows its reason with Check (keep what the
  page shows), Retry, Edit (back into the box) and Dismiss (F).
- **UC5 Edit and resend** your last message (F).
- **UC6 Reuse text**: swipe a reply right to quote it into the box, left to copy it; copy a code
  block, your message, the thinking; select text by long press, or in a box made for picking a
  part (F).
- **UC7 Write long text**: a big message box; Enter sends when set (Shift+Enter a new line); text
  files go into the box, with no size limit and a warning on very large ones (F, U 2026-11-21).
- **UC8 Read without losing your place**: replies never scroll the chat for you; "↓ 1 new" jumps
  to the start of the new reply; "Stay at the bottom while a reply comes in" applies only if you
  were already at the bottom (F).
- **UC9 Choose the provider**: the provider's name in the header (with its state dot) opens the
  provider menu: switch provider, open its site, log in once (F).
- **UC10 Model and options**: the model list and the provider's options are read from the site
  and set before each message; "Choose on the site" when the list can't be read (F).
- **UC11 Toggles for this chat**: Quick edit next to the message box turns blocks on or off for
  this chat; a plugin's toggle can also sit in the header or the toolbar (F).
- **UC12 Site view**: tabs, each showing its own page (#236); closing a tab closes its page, any
  tab can be closed and a page opens again when one is needed (#242); pages opened for side
  requests show as tabs marked as side requests and close when the request is done (#242); a new
  page;
  the address bar can be typed in and isn't overwritten while you type (#240, #251); reload; back
  inside the site (#243); sign-in pop-ups get their own view and are closed when done (#244);
  Back closes the site view when nothing is on top of it (#239).
- **UC13 The site's own chats**: list the site's sidebar chats, open one and continue it here,
  paste a chat link, import a site chat's earlier messages, add the page's newest reply to this
  chat (F).
- **UC14 Share in**: text shared from another app (or "Send to promptpipe" on selected text)
  starts a new chat with it (F).
- **UC15 Chat through an API**: providers of type api call an AI API with a key from secure
  storage; OpenAI first, any other later, each as a plugin, and a new API needs no new APK
  (U 2026-11-20). Later: a reminder to turn on Memory when it's off for an API chat (N3).

### Chats

- **UC16 New chat, the chats list**: pinned first, then by day, then folders (F).
- **UC17 Organise**: pin, move (drag, or "Move to"), rename, delete (the chat stays in the
  history), select several by long press; create, rename, delete folders (F).
- **UC18 Find**: text in every chat, with `#tag`, `in:folder`, `"exact phrase"`, `is:you`,
  `is:ai` (F); fast with thousands of chats, without reading every file in full each time (#212).
- **UC19 Chat details**: title, chat tags, provider and model, the chat's history (F).
- **UC20 Tags**: a chat tag goes on every message; a message tag on one; a tag ending in `#`
  counts up (`part#` → `part1`, `part2`) (F).
- **UC21 Copy or share a chat** (F).

### Profiles and prompts

- **UC22 Profiles**: pick the active one; make one from a template (Plain, Writing feedback,
  Dialogue & Role play, Story & Prose); rename, duplicate, delete (F).
- **UC23 Blocks**: a profile is an ordered list of blocks plus its plugins' settings. Block
  types: System prompt (its own text, or linked from the prompt library), plugin (with an optional
  text block, and what it works on: the blocks above, your message, or picked blocks), Your
  message. Add, reorder, turn on or off, open a block's page (F).
- **UC24 Groups**: several blocks under one toggle (F). Later: a group shared by several profiles
  (#255, N3).
- **UC25 Preview** what a profile will send (F).
- **UC26 Prompt library**: add, edit, pin System prompts; link one into a profile; a linked block
  sends the library's current text, so one edit changes every profile that links it (F).
- **UC27 Export and import** profiles and the library; on a name clash: ask, keep both or replace,
  as set in Settings (F).

### Plugins

- **UC28 See the plugins**: the profile's blocks, and the catalogue with each plugin's type
  ("Plugin · provider · web", "Plugin · provider · api", "Plugin · theme", …) (U 2026-11-20).
- **UC29 Get and manage**: get a provider or plugin from the catalogue; a plugin's page with
  Update, Roll back, Remove, Copy; your copy replaces the app's, and which copy runs (built-in,
  updated, yours) is visible (F, U).
- **UC30 Install other ways**: from a link, a zip, or the files of an AI's answer; add a source
  (a GitHub repository); copy the plugin-writing instructions for an AI (F).
- **UC31 Stay up to date**: Update all; an automatic check, off, daily or weekly as set (default
  daily), that fails quietly (a check you start says what happened); the release bundle as an
  opt-in fallback (F, U 2026-11-21).
- **UC32 Plugin settings**, per profile, declared by the plugin and drawn by the screen (F).
- **UC33 Safe mode**: when one of your runtime plugins fails to load, the app starts with the
  app's own plugins only and says which failed; start in safe mode by hand; leave it (F).

### Settings and help

- **UC34 Look**: light or dark (or the system's), accent, UI scale, text size, themes (plugins),
  quick actions under replies, stay at the bottom while a reply comes in, Enter sends, thinking
  folded or open (F).
- **UC35 Sites**: pages at once (default 5, a warning above 5), waiting limits (F).
- **UC36 Chats and storage**: move the chats folder (with or without copying), back to the
  default; all-files access; a storage check, step by step with the system's reason; git: remote,
  token (from secure storage), push, pull, auto-push (F, U).
- **UC37 Local API**: the address, the token (make a new one; kept in secure storage), how apps
  use it, the folder for their chats (F, U).
- **UC38 Advanced**: reset to first launch (chats, profiles, prompts and plugins stay); the app's
  own plugins (copy one, pick which screen runs); safe mode; the core log; stop the background
  service; the version (F).
- **UC39 Help**: the ? mode explains what you tap; first-time guides for each place (and showing
  them again); the shortcuts list; the quick start; each plugin's guide and the plugin-writing
  guide open in the app (F).
- **UC40 Secure storage**:
  1. One store for any sensitive data (API keys, tokens, passwords, notes), with free tags
     (U 2026-11-20).
  2. Each secret is write-only (plugins can use it, never read it back) or read-write (plugins can
     read it); write-only is the default (U).
  3. A write-only secret is bound to exact hosts, a header name and a prefix; it is added only to
     requests to those hosts (U, best practice).
  4. You add, replace and remove secrets; the list shows name, tags, type, host and the last 4
     characters (U).
  5. The git token and the local API token live here (U).
  6. Connections for API providers: a name, a base URL, a model, which secret (U).

### Other apps

- **UC41 Local API**: OpenAI-style at `127.0.0.1:7790/v1`, reachable only from the phone, the
  token always required (F); model = a profile name; each request is a new chat, or continues a
  saved chat with `"chat"` (F); real streaming, keep-alive while waiting, a closed connection
  cancels the job, a retried request joins the running one (#209); the answer says which chat it
  went to and what was sent (F).

### Plugin authors

- **UC42 Extend the app**:
  1. One plugin format: a manifest whose tags say the type: none (a block plugin with a toggle),
     `provider` + `web` or `api`, `theme`, `passive` (menu entries only), `runtime` (part of the
     app; + `ui` for the screen), `driver` (page commands for every provider) (U 2026-11-20).
  2. Hooks: add a block's text, change the message before sending, work on the reply after it,
     pick the profile and site chat (route), draw a turn or a toggle, add menu entries (F).
  3. Side requests: ask the provider something in a fresh, unsaved chat (F).
  4. A plugin's own sheets and settings (F).
  5. A plugin that needs a newer app says so (minimum app version) (F).
  6. `PP` is the only way in: named, versioned, documented; a plugin says which `PP` version it
     was made for, and no two plugins can break each other through shared names (#210).
  7. Web providers are mostly selectors, plus an optional content script for the site's quirks;
     the page offers ready building blocks so a content script stays small (F).

- **UC48 Attach files** (added in stage 2, U 2026-11-21): attach files or images to a message
  (an attach button, sharing files in, pasting an image); they're kept in the app's hidden folder
  (D6) and linked from the chat file; each provider says which types and how many it accepts, and
  the screen says when the active one doesn't; other apps' requests can carry image and file parts
  (UC41). The app supports it end to end; teaching each provider plugin to upload comes later.

### Built-in plugins (use cases added in stage 2)

- **UC43 Long chats keep their context** (Memory): older turns are summarised in a side request
  before the limit, and the summaries are sent with new messages (F).
- **UC44 A long chat continues in a new site chat** (Sub-chats); the chat file stays one (F).
- **UC45 Encode and decode** (Base64): the message is encoded, the reply decoded (F).
- **UC46 Report a site's page** (Page report) to fix a provider when the site changes (F).
- **UC47 Themes**: Ember and Paper (F).

## Part 2. Constraints

### P. Platforms and layers

- **P1** The core is portable: one code base (Odin) that every platform starts; Android now, a
  desktop platform later (F).
- **P2** Platform code holds no app logic: only the adapters that must be native (U 2026-11-20:
  "Unless you REALLY can't do without APK, do NOT put into APK code").
- **P3** Everything that can be a plugin is one, updatable without a new APK (F, #206).
- **P4** One source for plugins: the plugins repository; the APK carries a copy of the built-in
  ones made at build time (U 2026-11-20, #206).
- **P5** A missing platform feature is never hidden: the call fails with "not supported on this
  platform" and why (F).
- **P6** The page side works on any browser engine that can inject a script into a page; the
  engine-specific part is the platform's adapter (F).

### D. Data

- **D1** Every chat is a Markdown file with a header, in the chats folder on shared storage,
  readable with any app (F, intent).
- **D2** Every change to the chats folder is a commit in its repository (F).
- **D3** The prompt library is kept with the chats, in the app's hidden folder (D6) (F).
- **D4** Files are written safely: a cut-off write never leaves a broken file (#211).
- **D5** Replies are shown in full: tables, images (as links), strike-through, nested lists (#214).
- **D6** The chats folder shows only the chat files. Everything else the app keeps there (the
  history repository, the prompt library, attachments, indexes, backups) is in one hidden folder
  (`.promptpipe/`, with a `.nomedia` marker), so the system's media index and file managers'
  "Recent" lists skip it; checked on the phone (U 2026-11-21).

### S. Security

- **S1** Every call to the core needs the security key; the Host header is checked (F).
- **S2** The platform checks it talks to its own core (a challenge, never sending the key), and
  says so when another app holds the port (#203).
- **S3** Every plugin download is checked against the catalogue's hash (#201); the catalogue is
  signed and the signature checked (#202). The checks are not updatable by plugins.
- **S4** Plugins and settings stay on shared storage (your copies editable with a file manager);
  the app records each file's hash, shows anything changed outside the app, and asks before
  running an app plugin that changed (#204; decided 2026-11-21).
- **S5** Plain HTTP only to 127.0.0.1 (#215).
- **S6** Zips are checked before unpacking: broken offsets refused, and an unpacked size far beyond
  any real plugin (500 MB) refused as a zip bomb (#213). Downloads go straight to a file, with no
  size limit (#216 was an artifact of the old core) (U 2026-11-21).
- **S7** Secrets are encrypted with the platform's key store, excluded from backups, and never in
  exports, settings, the repository or logs (U, best practice).
- **S8** Releases are release builds with their own signing key, starting with the first release
  of the remade app (one reinstall for everyone, once); the browser engine's version is pinned
  (#207, #208; decided 2026-11-21). The catalogue's signing key is made on the phone and kept
  there, with a copy in a password manager; the APK holds two public keys (main and backup)
  (#202; decided 2026-11-21).

### R. Reliability

- **R1** After a reboot the app waits for storage and never starts the core on a bad path (#237).
- **R2** A background service keeps the app and its pages alive, with its notification (F).
- **R3** Pages the system stopped are reloaded (F).
- **R4** Redraws never lose typing, the keyboard's word in progress, the cursor, a selection or a
  scroll position (F, #249 to #252).
- **R5** Back always closes what is on top (#239).
- **R6** The core log can be read in the app (F).

### Q. Quality

- **Q1** The screen matches the screenshots in `design/ux/` (look, layout, gestures, wording),
  except where a requirement changes something (U 2026-11-21).
- **Q2** Touch first; every action has a button; keyboard shortcuts for a hardware keyboard:
  Ctrl+Enter, Ctrl+K, Ctrl+B, Ctrl+F, Ctrl+M, Ctrl+E, Ctrl+/, Ctrl+?, Alt+S (F).
- **Q3** Accessible: every icon button has a label, alerts have their role, every theme has
  readable contrast.
- **Q4** About 3,000 lines of clean, comfortable code for the app (core, platform, loader, page
  script, runtime plugins with the screen); the optional plugins ideally inside it too; no packed
  lines, no cut features; libraries behind adapters are not counted (U 2026-11-20).

### W. Words

- **W1** One glossary for the app, the guides and the code; standard programming terms first, no
  invented words (U 2026-11-20).
- **W2** Renames are deterministic and checked by terms-check (U).
- **W3** `snake_case`, noun first (`file_write`), in every language (U 2026-11-20).

### B. Building and checking

- **B1** The app builds on the phone (Termux + proot) and on a PC; nothing is installed on the
  user's side for the cloud checks (U).
- **B2** Version codes never go down; the build refuses a lower one (F, #248).
- **B3** The core targets the current Odin release (dev-2026-11); the phone's compiler matches
  (`odin version`).
- **B4** Every part has its checks from its first commit: the application's tests with stand-in
  ports, the adapters' tests, terms-check, clone-detection, the size count, the screenshots.
- **B5** The screen can run in a desktop browser without the phone, for its checks (F).

### X. The remake

- **X1** A full remake from the design: only the intent and the UX/UI survive; old code is not
  reused unless stuck, and then it's reported (U 2026-11-20, 2026-11-21).
- **X2** The design comes from the requirements and the screenshots, not from the code
  (U 2026-11-21).
- **X3** Both repositories are remade: the core, the platform, the loader, the page script and
  every plugin.
- **X4** The old app stays usable until the new one passes every requirement; then the old code is
  removed in one change.
- **X5** Your content from the old app (chats, prompt library, profiles) is imported once on the
  new app's first start (decided 2026-11-21).

### N. Not now (YAGNI)

- **N1** A desktop or iOS platform (only the ports are kept ready).
- **N2** A fingerprint lock and spending hints for keys (U 2026-11-20).
- **N3** Shared groups across profiles (#255) and the Memory reminder for API chats.
- **N4** Sync other than git; several users; cloud services (kept as not now, 2026-11-21).

## Where the earlier ids went

A1–A8 → P1–P6 (A6 → UC29); B1–B13 → UC1–UC15; C1–C9 → UC11, UC22–UC27; D1–D13 → UC28–UC33,
UC39, UC42, S3; E1–E9 → UC14, UC16–UC21, UC36, D1–D5; F1–F5 → UC43–UC47; G1–G4 → UC41; H1–H7
→ UC40, S7, N2; I1–I8 → UC6, UC8, UC34, UC39, Q2, Q3, R4, R5; J1–J7 → S1–S8; K1–K6 → R1–R3,
R6, UC31, X5; L1–L4 → B1–B5; M1–M3 → W1–W3; O1–O6 → X1–X5, Q1, B3; N1–N4 → N1–N4.

## Decided in stage 2 (2026-11-21)

The limits review: thinking folded or open as a setting; pages at once a setting with a warning,
no hard maximum; the automatic update check a setting; no size limit on text files or downloads;
zips only guarded against zip bombs; any tab can be closed; side-request pages show as marked tabs.
Your old content imported once; plugins and settings stay on shared storage with a hash check;
release builds with the first remade release, the catalogue key on the phone with a backup;
the app's own files in a hidden folder (D6); attachments supported (UC48).

## Open

1. The name for "secure storage" and "secret" (see the stage 2 review).
