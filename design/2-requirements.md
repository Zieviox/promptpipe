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
     after-reply hooks run on it, and the chat is saved. A message's trace shows what went out and
     what came back before the plugins changed it (F, seen in `chat-message-menu`).
  3. The model's thinking is read and kept in full, above the reply ("Thought for Ns"); open while
     the reply streams, folded once it's done (Q5) (F, U 2026-11-21).
  4. Several pages answer at once, shared by your chats, plugins' side requests and other apps'
     requests; how many is a setting (default 5), with a warning above 5 (each page uses memory,
     and many at once can look like a bot to the site); no hard maximum (F, U 2026-11-21).
  5. A refusal, a human check or an error from the site ends the send at once, with the reason in
     plain words (F, #245, #247); no connection, a wrong address or a refused certificate is said
     at once, not after a wait (#241).
  6. Waiting limits are optional: idle and total, in minutes, 0 = none (F).
  Also: a short vibration when a reply arrives; replies are read from the page as Markdown (lists, headings, code, tables kept), with thinking kept out of the reply's text; a site that shows a "Log in" or "Sign in" button ends the send with "log in on the site"; errors already on the page before a send belong to an earlier message, and a human check over the whole page stops the send at once; a wait of 30 s or more keeps a numbers-only diagnosis with the message (when the page's stop signal and the reply's length changed, no text), so a wait that never ends can be looked into without sharing the chat; links in replies open in the phone's browser, not inside the app (F, from the old app's code).
- **UC2 Send while a reply is coming**: the message waits in the chat's queue, shown under the
  chat; queued messages go in order and can be moved up, edited or removed (F).
  While a reply is coming and the box is empty, Send becomes Stop; typing turns it back into Send, and the message queues (F, from the old app's code).
  A chat never has two sends at once; different chats are answered side by side (F, from the old app's code).
- **UC3 Stop waiting**: gives up on the reply at once; the page is told to stop (F).
  Esc does the same when nothing else is open (F, from the old app's code).
- **UC4 Recover a failed send**: the failed message shows its reason with Check (keep what the
  page shows), Retry, Edit (back into the box) and Dismiss (F). When the error involves a site (a
  refusal, a human check, a page that didn't load, the page not behaving as the provider expects),
  two more actions sit under the message: **Open the site** (shows that page in the site view, to
  deal with it there) and **Copy page report** (U 2026-11-21).
- **UC5 Edit and resend** your last message, or send a message again unchanged (F, seen in
  `chat-message-menu`).
- **UC6 Reuse text**: swipe a reply right to quote it into the box, left to copy it; copy a code
  block, your message, the thinking; select text by long press, or in a box made for picking a
  part (F).
- **UC7 Write long text**: a big message box; Enter sends when set (Shift+Enter a new line); text
  files go into the box, with no size limit and a warning on very large ones (F, U 2026-11-21).
  Each chat keeps its own draft (text and attachments), saved on this device so it survives a
  restart, never in the chat's files or the history (F; per chat, U 2026-11-21).
- **UC8 Read without losing your place**: the app never moves your scroll position by itself: not
  for redraws, opening or closing sheets, or coming back to a chat (each place comes back where you
  left it). New replies show a notice ("↓ 1 new") with a quick scroll to the start of the reply.
  The one exception is yours to choose: "Stay at the bottom while a reply comes in" (on by
  default) keeps the view at the bottom as a reply grows, only if you were already at the bottom
  (F, U 2026-11-21).
- **UC9 Choose the provider**: the provider's name in the header (with its state dot) opens the
  provider menu: switch provider, open its site, log in once (F).
  The header shows the provider, its model (marked as wanted until the page shows it), a state dot (replying, ready, idle) and a dot when the provider's plugin has an update; getting a provider shows the advice to use a separate account on the site (F, from the old app's code).
  The provider's site loads in the background when the app starts, ready to log in or send (F, from the old app's code).
- **UC10 Model and options**: the model list and the provider's options are read from the site
  ("Read the page again" re-reads them), saved for that provider, and set on the page before each
  message; "Choose on the site" when the list can't be read (F, seen in `models`).
- **UC11 Toggles for this chat**: Quick edit next to the message box turns blocks on or off for
  this chat (each toggle linked to the profile's default, or the chat's own, D8); a plugin's toggle can also sit in the header or the toolbar (F).
- **UC12 Site view**: tabs, each showing its own page (#236); closing a tab closes its page, any
  tab can be closed and a page opens again when one is needed (#242); pages opened for side
  requests show as tabs marked as side requests and close when the request is done (#242); a new
  page;
  the address bar can be typed in and isn't overwritten while you type (#240, #251); reload; back
  inside the site (#243); sign-in pop-ups get their own view and are closed when done (#244);
  Back closes the site view when nothing is on top of it (#239).
  Layout: back, "AI page · provider", the provider sheet's button; one item per page with its chat and state dot, close, and + for a new page; the address bar; a strip saying which chat the page is linked to; a page showing a site chat that isn't one of yours offers to bring it in (F, from the old app's code).
- **UC13 The site's own chats**: list the site's sidebar chats, open one and continue it here,
  paste a chat link, link this chat to the open page, import a site chat's earlier messages, add
  the page's newest reply to this chat (F).
  Also: decode the page's newest reply with the after-reply hooks, as a preview, without sending (F, from the old app's code).
- **UC14 Share in**: text shared from another app (or "Send to promptpipe" on selected text)
  starts a new chat with it (F).
  If the open chat has messages, a new chat starts; the shared text goes into the message box, not sent (F, from the old app's code).
- **UC15 Chat through an API**: providers of type api call an AI API with a key from secure
  storage; OpenAI first, any other later, each as a plugin, and a new API needs no new APK
  (U 2026-11-20). Later: a reminder to turn on Memory when it's off for an API chat (N3).

### Chats

- **UC16 New chat, the chats list**: pinned first, then by day, then folders (F).
  Each chat shows whether it is being answered or has a reply you haven't seen; the search box filters the list, with tag chips under it, most used first (F, from the old app's code).
- **UC17 Organise**: pin, move (drag, or "Move to"), rename, delete (the chat stays in the
  history), select several by long press; create, rename, delete folders (F).
  Dragging a chat's grip moves it into a folder, onto Pinned (pins it) or to another place in the order; dragging one selected chat moves all the selected ones; a folder is renamed with its pencil and shows how many chats it holds (F, from the old app's code).
  An empty folder is kept, in the history too (F, from the old app's code).
  The list keeps your own order (each level: folders and chats) and the pinned chats keep theirs;
  both are saved with the chats, by chat id; what you never placed keeps the default order (folders
  by name, then chats newest first) (F, from the old app's code).
- **UC18 Find**: text in every chat, with `#tag`, `in:folder`, `"exact phrase"`, `is:you`,
  `is:ai` (F); fast with thousands of chats, without reading every file in full each time (#212).
  The same search finds the app's commands and settings (F, seen in the shortcuts list).
  Ctrl+K, Ctrl+F and F3 open it; a command or setting result says where it lives ("Settings › Look") and its shortcut, and picking it opens that place and briefly highlights the control (F, from the old app's code).
- **UC19 Chat details**: title, chat tags, provider and model, the chat's history (F).
- **UC20 Tags**: a chat tag goes on every message; a message tag on one; a tag ending in `#`
  counts up (`part#` → `part1`, `part2`) (F); whether the count runs within each chat or across all
  chats is your choice in Settings (default: within each chat) (U 2026-11-21).
  A message holds one number per counter; the chip's +1 moves it to the next free number (F, from the old app's code).
- **UC21 Copy or share a chat** (F).

### Profiles and prompts

- **UC22 Profiles**: pick the active one; make one from a template (Plain, Writing feedback,
  Dialogue & Role play, Story & Prose); rename, duplicate, delete (F).
  The profile list marks the active one (●), with Edit, Use, + New, Import, Export this, Export all; a renamed profile is still found by the chats that used its old name (F, from the old app's code).
- **UC23 Blocks**: a profile is an ordered list of blocks plus its plugins' settings. Block
  types: System prompt (its own text, or linked from the prompt library), plugin (with an optional
  text block, and what it works on: the blocks above, your message, or picked blocks), Your
  message. Add, reorder, turn on or off, open a block's page (F). A System prompt is sent: every
  message, on the first message of a site chat, every N messages, at depth N (N messages up in the
  earlier chat), or off; its own text can be saved to the library and linked (F, seen in
  `profile-block-page`).
- **UC24 Groups**: several blocks under one toggle (F). Later: a group shared by several profiles
  (#255, N3).
- **UC25 Preview** what a profile will send (F).
- **UC26 Prompt library**: add, edit, pin System prompts; link one into a profile; a linked block
  sends the library's current text, so one edit changes every profile that links it; a prompt's page
  shows which profiles link it, and can add it to the active profile, pin it, copy its text, export
  it as Markdown, or delete it (F, seen in `prompt-page`).
- **UC27 Export and import** profiles and the library (a profile also from pasted text); on a name clash: ask, keep both or replace,
  as set in Settings (F).
  An exported profile holds its blocks, groups, plugin settings, the library prompts its linked blocks use, and the plugins it needs (not providers); importing shows what the file holds, whether the plugins are here, and on a name clash: keep both ("Name (2)"), replace or skip (F, from the old app's code).

### Plugins

- **UC28 See the plugins**: the profile's blocks, and the catalogue with each plugin's type
  ("Plugin · provider · web", "Plugin · provider · api", "Plugin · theme", …), its source, whether
  the source is the official one, and whether one with the same name is installed; filtered by
  source and by type (U 2026-11-20; F, seen in `plugins-catalogue`).
  The Profile tab shows a dot when one of its plugins has an update; each source shows how many plugins it offers, when it was checked, its switch, and remove (not the official one) (F, from the old app's code).
- **UC29 Get and manage**: get a provider or plugin from the catalogue; a plugin's page with
  Update, Roll back, Remove, Copy; your copy replaces the app's, and which copy runs (built-in,
  updated, yours) is visible (F, U).
  Getting a plugin whose name is already taken (another source, the app's own, yours) asks first; a new block plugin goes into the active profile, on; when your copy is older than the app's, the plugin page says so and offers to switch back (F, from the old app's code).
- **UC30 Install other ways**: from a link, a zip, or the files of an AI's answer; add a source
  (a GitHub repository; it must have a catalogue, checked before it's added); copy the
  plugin-writing instructions for an AI (F).
  An AI's answer is read as files: each code block belongs to the file named on the line before it (F, from the old app's code).
- **UC31 Stay up to date**: Update all; an automatic check, off, daily or weekly as set (default
  daily), that fails quietly (a check you start says what happened); the release bundle as an
  opt-in fallback, also downloaded and installed by hand (F, U 2026-11-21; seen in
  `runtime-plugins`).
- **UC32 Plugin settings**, per profile, declared by the plugin and drawn by the screen (F).
- **UC33 Safe mode**: when one of your runtime plugins fails to load, the app starts with the
  app's own plugins only and says which failed; start in safe mode by hand; leave it (F).

### Settings and help

- **UC34 Look**: light or dark (or the system's), accent, UI scale, text size, themes (plugins),
  quick actions under replies, stay at the bottom while a reply comes in (UC8), Enter sends (F).
  Quick actions under replies: on the newest reply only (default), on every reply, or off; a tap shows or hides them on one reply. UI scale: Ctrl+= and Ctrl+- make it bigger or smaller, Ctrl+0 back to 100% (F, from the old app's code).
- **UC35 Sites**: pages at once (default 5, a warning above 5), waiting limits (F).
- **UC36 Chats and storage**: the chats folder is a `chats` subfolder of the app folder by default
  (U 2026-11-21); pick another by browsing the phone's folders or typing a path; move the chats
  folder (with or without copying), back to the
  default; all-files access; a storage check, step by step with the system's reason, copyable; git:
  commit on every save (on by default), author name and email, remote, token (a credential), push,
  pull, push after every commit, the list of all commits (F, U; seen in `settings-git`).
  Chats kept in an earlier folder can be copied into the one in use (existing chats are never overwritten) (F, from the old app's code).
- **UC37 Local API**: the address, the token (make a new one; kept in credentials), how apps
  use it, the folder for their chats (F, U). The token is the one credential the app issues to give
  away: it is shown masked (last 4 characters) with Copy and Show; never in exports, settings, the
  history or logs (U 2026-11-21).
- **UC38 Advanced**: reset to first launch (chats, profiles, prompts and plugins stay); the app's
  own plugins (copy one, pick which screen runs); safe mode; the core log; stop the background
  service; the version (F).
- **UC39 Help**: the ? mode explains what you tap; first-time guides for each place, starting
  with the welcome guide on the first start (pick a site, log in); each place's guide can be played
  again (▷), the quick start lists them with "Seen", and all can be shown again; the shortcuts list; the quick start; each plugin's guide and the plugin-writing
  guide open in the app (F).
  Help mode: tapping something shows a card saying what it does, where it lives, and Do it. A guide lights up the control to use and moves on when it's used; if the control isn't on screen it offers Take me there instead of blocking; while a control is lit only it and the card take taps; Esc ends the guide. The welcome guide fills the screen: pick a site (installed if needed), then log in, with a card saying whether the page sees you logged in (F, from the old app's code).
- **UC40 Credentials**:
  1. One store for any sensitive data (API keys, tokens, passwords, notes), with free tags
     (U 2026-11-20).
  2. Each credential is write-only (plugins can use it, never read it back) or read-write (plugins can
     read it); write-only is the default (U).
  3. A write-only credential is bound to exact hosts, a header name and a prefix; it is added only to
     requests to those hosts (U, best practice).
  4. You add, replace and remove credentials; the list shows name, tags, type, host and the last 4
     characters (U).
  5. The git token and the local API token live here (U).
  6. Connections for API providers: a name, a base URL, a model, which credential (U).

### Other apps

- **UC41 Local API**: OpenAI-style at `127.0.0.1:7790/v1`, reachable only from the phone, the
  token always required (F); model = a profile name, and the model list is the profiles; callable
  from pages in the phone's browser too (CORS), still only with the token; each request is a new
  chat, or continues a saved chat with `"chat"` (F); real streaming, keep-alive while waiting, a closed connection
  cancels the job, a retried request joins the running one (#209); the answer says which chat it
  went to and what was sent (F).

### Plugin authors

- **UC42 Extend the app**:
  1. One plugin format: a manifest whose tags say the type: none (a block plugin with a toggle),
     `provider` + `web` or `api`, `theme`, `passive` (menu entries only), `runtime` (part of the
     app; + `ui` for the screen) (U 2026-11-20; the old `driver` type is gone, see 7).
  2. Hooks: add a block's text, change the message before sending, work on the reply after it,
     pick the profile and site chat (route), draw a turn or a toggle, add menu entries (F).
  3. Side requests: ask the provider something in a fresh, unsaved chat, optionally with a named
     profile and whether that profile's plugins run (F).
  4. A plugin's own sheets and settings (F).
  5. A plugin that needs a newer app says so (minimum app version) (F).
  6. `PP` is the only way in: named, versioned, documented; a plugin says which `PP` version it
     was made for, and no two plugins can break each other through shared names (#210).
  7. Web providers are mostly selectors, plus an optional content script for the site's quirks;
     the page offers ready building blocks so a content script stays small (F). The default way
     of using a site (type, send, wait, read) is itself a content script in an updatable runtime
     plugin, so it improves without a new APK; the APK's page script only loads the code it is
     given (U 2026-11-21: replaces the `driver` type).

- **UC48 Attach files** (added in stage 2, U 2026-11-21): attach files or images to a message
  (an attach button, sharing files in, pasting an image); they're kept in the app's hidden folder
  (D6) and linked from the chat file; each provider says which types and how many it accepts, and
  the screen says when the active one doesn't; other apps' requests can carry image and file parts
  (UC41). The app supports it end to end; teaching each provider plugin to upload comes later.

### Built-in plugins (use cases added in stage 2)

- **UC43 Long chats keep their context** (Memory): older turns are summarised in a side request
  before the limit, and the summaries are sent with new messages (F).
  Pinned facts are always sent first, never summarised; memory can be sent every N messages; below a maximum size everything goes in full; above it, the recent messages stay word for word and older ones go in as summaries at coarser levels the older they are, each summary made once; your side and the AI's side are summarised separately, or together if set; the summary request carries the profile's System prompts, prompts picked for summaries, or none; "only what this site chat hasn't seen" leaves out what a site chat already has; each line names the AI when the chat used more than one site; text the AI wrote can never pose as the summaries' structure (F, from the old app's code).
  The summaries are the plugin's data (JSON, D6) and show in the readable chat file as a folded
  "Memory" section at the end; editing them there and keeping the edit (D7) changes the summaries
  (U 2026-11-21: you can still correct a summary by hand, as in the old app).
- **UC44 A long chat continues in a new site chat** (Sub-chats); the chat file stays one (F).
  Before a message goes out it picks the site chat: the current one, a new one, or an earlier one; another profile can lend only its site and model while the chat's own plugins keep running; dividers between sub-chats and a note on where the next message goes; "New sub-chat here" under a reply starts a sub-chat that sees the chat up to that reply, then only its own messages (a first form of branching, N5) (F, from the old app's code).
- **UC45 Encode and decode** (Base64): the message is encoded, the reply decoded (F).
  Decoding is strict or lenient (lenient decodes what is there and says what it fixed); "Decode base64" is offered under every reply even when the plugin is off (F, from the old app's code).
- **UC46 Report a site's page** (Page report) to fix a provider when the site changes (F).
  A provider's own report, when it has one, wins over the generic one (F, from the old app's code).
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

- **D1** Every chat has one readable Markdown file in the chats folder (a `chats` subfolder of the
  app folder by default), readable with any app. It is built from the chat's data and rebuilt
  whenever the chat changes, so it is always complete and current. If you edit it with another
  app, the change check (D7) asks before anything is overwritten; keeping your edit reads it back
  into the chat (U 2026-11-21). It stays plain Markdown. A plugin may add a folded section of its
  data at the end (Memory's summaries); keeping an edit there gives the plugin its section back to
  read (U 2026-11-21).
- **D2** Every change to the chats folder is a commit in its repository, unless "Commit on every
  save" is turned off (F, seen in `settings-git`).
- **D3** The prompt library is kept with the chats, in the app's hidden folder (D6) (F).
- **D4** Files are written safely: a cut-off write never leaves a broken file (#211).
- **D5** Replies are shown in full: tables, images (as links), strike-through, nested lists (#214).
- **D6** The chats folder shows only the readable chat files. Each chat's data (its turns,
  thinking, plugins' data such as Memory's summaries, attachments) is in its own hidden folder, and
  everything else the app keeps there (the history repository, the prompt library) is hidden too,
  under `.promptpipe/` with a `.nomedia` marker, so the system's media index and file managers'
  "Recent" lists show only the readable chats; checked on the phone (U 2026-11-21).
  A plugin's data for a chat is one JSON file in that chat's hidden folder (U 2026-11-21).
- **D7** **The change check**: one system, reused for every file the app writes on shared storage
  (readable chats, chat data, the prompt library, settings, your plugin copies). The app records a
  hash of what it wrote; before it overwrites or trusts a file again it compares, and if the file
  changed outside the app it asks once, in one dialog used everywhere: keep the outside change,
  keep the app's, or keep both (a copy). Standard name: optimistic concurrency control with content
  hashes as revisions (as HTTP's ETag and If-Match) (U 2026-11-21).
- **D8** **Linked or own** (U 2026-11-21): a chat's provider, profile, model, options and each
  block's toggle are **linked** by default (they follow the shared value: the default provider,
  the active profile, the provider's saved model and options, the profile's default for the block)
  or set as **this chat's own**. The screen shows which, and a value can be made the chat's own or
  linked again at any time. The same holds one level up (a profile's plugin settings are linked to
  the plugin's defaults) and for the app's settings (linked to their defaults). One mechanism,
  the same idea as a linked System prompt. Standard name: cascading settings with local override
  (as git's system, global and local config).
- **D9** **The old app's data**: on the first start of the remade app, the old app's folders
  (`/sdcard/PromptPipe` and the app's own old folder) get a `.nomedia` marker, are zipped whole (git
  history included) into `.promptpipe/backups/old-app-<date>.zip`, then imported: chats (every old
  chats folder, every field of the old chat file), profiles (every earlier shape), the prompt library,
  settings, plugin settings and Memory's summaries. Apart from the `.nomedia` marker the app never
  changes the old folders, and it deletes them only when you ask;
  Settings › Chats and storage shows them with their backup and lets you delete them. An import that
  stops part way loses nothing (U 2026-11-21).

### S. Security

- **S1** Every call to the core needs the security key, made new at every start; the Host header is
  checked (F).
- **S2** The platform checks it talks to its own core (a challenge, never sending the key), and
  says so when another app holds the port (#203).
- **S3** Every plugin download is checked against the catalogue's hash (#201); the catalogue is
  signed and the signature checked (#202). The checks are not updatable by plugins.
- **S4** Plugins and settings stay on shared storage (your copies editable with a file manager);
  the change check (D7) shows anything changed outside the app, and an app plugin that changed
  doesn't run until you choose (#204; decided 2026-11-21).
- **S5** Plain HTTP only to 127.0.0.1 (#215).
- **S6** Zips are checked before unpacking: broken offsets refused, and an unpacked size far beyond
  any real plugin (500 MB) refused as a zip bomb (#213). Downloads go straight to a file, with no
  size limit (#216 was an artifact of the old core) (U 2026-11-21).
- **S7** Credentials are encrypted with the platform's key store, excluded from backups, and never in
  exports, settings, the repository or logs (U, best practice).
- **S8** Releases are release builds with their own signing key, starting with the first release
  of the remade app (one reinstall for everyone, once); the browser engine's version is pinned
  (#207, #208; decided 2026-11-21). The catalogue's signing key is made on the phone and kept
  there, with a copy in a password manager; the APK holds two public keys (main and backup)
  (#202; decided 2026-11-21).
- **S9** Code runs in a site page only when the app hands it over through the platform's extension
  port, never from the website itself; it is plugin code, checked like every plugin (S3, S4, D7);
  credential values never reach it (U 2026-11-21).
- **S10** What comes from a site is shown as text, never run as HTML (the Markdown is escaped first)
  (F, from the old app's code).

### R. Reliability

- **R1** After a reboot the app waits for storage and never starts the core on a bad path (#237).
- **R2** A background service keeps the app and its pages alive, with its notification (F).
- **R3** Pages the system stopped or that crashed are reloaded, also when you come back to the app;
  hidden pages keep running at their real size, so their replies can still be read (F, from the old
  app's code).
- **R4** Redraws never lose typing, the keyboard's word in progress, the cursor, a selection or a
  scroll position (F, #249 to #252).
- **R5** Back always closes what is on top (#239).
- **R6** The core log can be read in the app, and as a file a file manager or Termux can reach (F, from
  the old app's code).
- **R7** The screen fits the visible area above the on-screen keyboard (F, from the old app's code).
- **R8** Starting shows "Starting…"; if the core doesn't answer, the screen says why, never a blank
  page (F, from the old app's code).
- **R9** The core is started again when it stops, waiting longer each time it fails quickly (1 s,
  doubling, at most 30 s) (F, from the old app's code).
- **R10** A download or request that fails says what happened in plain words with the host (not
  found, no answer in time, the secure connection failed, cut off); a connection cut off is tried
  once more (F, from the old app's code).

### Q. Quality

- **Q1** The screen matches the screenshots in `design/ux/` (look, layout, gestures, wording),
  except where a requirement changes something (U 2026-11-21).
- **Q2** Touch first; every action has a button or a gesture; keyboard shortcuts for a hardware
  keyboard, as listed in `help-menu-keys` (Ctrl+Enter, Ctrl+K, Ctrl+B, Ctrl+F, Alt+↑/↓, Alt+S,
  Ctrl+M, F2, Ctrl+T, ↑ in an empty box, Ctrl+E, Ctrl+/, Ctrl+Shift+L, Ctrl+P, Ctrl+Shift+P,
  Ctrl+Shift+R, Ctrl+comma, Ctrl+= and Ctrl+- and Ctrl+0, Ctrl+N, F3, Ctrl+?) (F). Esc closes what is on
  top, in order: a help card, help mode, a menu, a sheet, the chats list; with nothing open it
  stops a reply that is coming (F, from the old app's code). Every command is in the command list
  below.
- **Q3** Accessible: every icon button has a label, alerts have their role, every theme has
  readable contrast.
- **Q4** About 3,000 lines of clean, comfortable code for the app (core, platform, loader, page
  script, runtime plugins with the screen); the optional plugins ideally inside it too; no packed
  lines, no cut features; libraries behind adapters are not counted (U 2026-11-20).
- **Q5** Everything is folded by default unless it's active (U 2026-11-21): thinking, a message's
  trace, "Sent with", long messages, folders in the chats list, sections of a sheet. Active means
  in use right now: the thinking of a reply that is still streaming, the folder of the open chat,
  what you just unfolded. Anything can be unfolded by a tap and stays unfolded until you fold it
  or leave.
- **Q6** The app does everything `design/2b-behaviour.md` lists (behaviour, wording, limits and
  messages the screenshots can't show), except where a requirement changes it; it is the reference
  for parity (X4) (U 2026-11-21: "the functionality needs to carry over").

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
  (U 2026-11-21). The old code may be read to find functionality and layout, never to reuse its
  code or names (U 2026-11-21).
- **X3** Both repositories are remade: the core, the platform, the loader, the page script and
  every plugin.
- **X4** The old app stays usable until the new one passes every requirement; then the old code is
  removed in one change.
- **X5** Your content from the old app is backed up and imported once, on the new app's first
  start (decided 2026-11-21; how: D9).
- **X6** The shipped templates' blocks and texts (Plain, Writing feedback, Dialogue & Role play,
  Story & Prose) and the built-in plugins' wording (Memory's requests and labels, Base64's
  instruction, the providers' messages) carry over word for word, as content (F, U 2026-11-21).

### N. Not now (YAGNI)

- **N1** A desktop or iOS platform (only the ports are kept ready).
- **N2** A fingerprint lock and spending hints for keys (U 2026-11-20).
- **N3** Shared groups across profiles (#255) and the Memory reminder for API chats.
- **N4** Sync other than git; several users; cloud services (kept as not now, 2026-11-21).
- **N5** Branching: continuing a chat from an earlier message (U 2026-11-21: "later"). Kept open
  now by giving every turn a stable id, so either form (a branch inside a chat, or a new chat
  starting from a turn) needs no change to the data format.

## The command list

Every command the person can run (from the old app's code, in the design's words). Menus, Find,
the keys and help all read this one list (Q2); plugins add theirs (`menu_items`).

| Command | Place | Key |
|---|---|---|
| New chat | Chats | Ctrl+N |
| Chats and folders | Chats | Ctrl+B |
| Select chats; New folder | Chats | |
| Previous chat / Next chat | Chats | Alt+↑ / Alt+↓ |
| Show AI page | Chats | Alt+S |
| Open a chat from the site | Chats | |
| Choose model; Model and options | Provider sheet | Ctrl+M |
| Link this chat to the open page; Import messages from the linked site chat; Add the page's newest reply; Decode the page's newest reply (preview) | Provider sheet | |
| Chat details (name, tags, move, export) | Chat | F2 |
| Add chat tag | Chat | Ctrl+T |
| Copy the whole chat; Share or export the whole chat; Move chat to folder | Chat | |
| Fold or unfold all thinking | Chat | Ctrl+/ |
| Edit and resend last message | Message box | ↑ in an empty box |
| Bigger or smaller message box | Message box | Ctrl+E |
| Quick edit; Put a text file in the box; Put several text files in the box | Message box | |
| Edit this profile | Profile | Ctrl+Shift+L |
| Profiles: new, import, export | Profile | |
| Next profile | Profile | Ctrl+P |
| Each block of the active profile; Add a block | Settings › Plugins › Profile | |
| Prompt library; New System prompt in the library | Settings | |
| Each installed plugin's page; Get plugins; Add a source; Install from a file or link; Update plugins | Settings › Plugins › Catalogue | |
| Plugins | Settings | Ctrl+Shift+P |
| Reload plugins | Settings › Plugins | Ctrl+Shift+R |
| Plugin guide | Settings › Plugins | |
| Storage check; Git history | Settings › Chats and storage | |
| Settings | Settings | Ctrl+comma |
| Accent; Bigger UI; Smaller UI | Settings › Look | —; Ctrl+=; Ctrl+- |
| Shortcuts and help | Help | Ctrl+? |
| Quick start | Help | |
| Find | everywhere | Ctrl+K, Ctrl+F, F3 |

## Where the earlier ids went

A1–A8 → P1–P6 (A6 → UC29); B1–B13 → UC1–UC15; C1–C9 → UC11, UC22–UC27; D1–D13 → UC28–UC33,
UC39, UC42, S3; E1–E9 → UC14, UC16–UC21, UC36, D1–D5; F1–F5 → UC43–UC47; G1–G4 → UC41; H1–H7
→ UC40, S7, N2; I1–I8 → UC6, UC8, UC34, UC39, Q2, Q3, R4, R5; J1–J7 → S1–S8; K1–K6 → R1–R3,
R6, UC31, X5; L1–L4 → B1–B5; M1–M3 → W1–W3; O1–O6 → X1–X5, Q1, B3; N1–N4 → N1–N4.

## Decided in stage 2 (2026-11-21)

The limits review: (thinking folded or open as a setting, later replaced by Q5); pages at once a setting with a warning,
no hard maximum; the automatic update check a setting; no size limit on text files or downloads;
zips only guarded against zip bombs; any tab can be closed; side-request pages show as marked tabs.
Your old content imported once; plugins and settings stay on shared storage with a hash check;
release builds with the first remade release, the catalogue key on the phone with a backup;
the app's own files in a hidden folder (D6); attachments supported (UC48).

## Decided after the behaviour inventory (2026-11-21)

`design/2b-behaviour.md` lists everything the old app does. From it: a draft per chat, kept on the
device (UC7); the chats list's order and pinned order saved by chat id (UC16); the API token shown
masked with Copy and Show (UC37); Memory's summaries as JSON shown and edited in a folded section of
the readable file (UC43, D1, D6); the old app's folders marked, backed up and imported (D9); the
templates' and plugins' texts carried over word for word (X6).

## Open

Nothing open. The encrypted store is **Credentials** (one entry: a credential), decided
2026-11-21, renamed everywhere in the design.
