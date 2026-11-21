# 2b. Behaviour inventory (from the old app, line by line)

Everything the old app does, in the design's words, so the remake carries it all over
(U 2026-11-21: "This app has been through heavy R&D and UX/UI refinement and the functionality needs
to carry over"). Read from the old code for functionality and layout only (X2); no code or old names
carry over. Each item points to its use case or constraint. Where an item and a later decision
differ, the decision wins and the item says so.

Numbers, texts and limits are kept exactly; texts in quotes are the screen's words.

## 1. The screen

### 1.1 Look (UC34, UC47)

- Accents: "Warm orange" (default), "Blue", "Green", "Rose", "Violet".
- Light or dark: the system's (default), dark, light. A theme plugin sets its own colours; then
  light or dark can't be chosen ("The theme X sets its own colours").
- The system bars and the area behind the pages follow the theme: its background colour, and
  light or dark worked out from it (dark when 0.299·R + 0.587·G + 0.114·B < 140). A change of the
  system's light or dark is followed at once.
- UI scale: 60% to 200%, in whole percent; changing it says "UI scale N%". The Look page offers
  90%, 100%, 115%, 130%; keys step it by 5% (Ctrl+=, Ctrl+-) and Ctrl+0 goes back to 100%.

### 1.2 Model and options (UC10)

- Opening it reads the page: "Reading the site's model list…" until it answers.
- If the page can't be read: "Couldn't read the page" with the reason and "tap to try again". If
  the model list can't be read but the page answers, the provider's options are still listed
  (as off).
- The models as a radio list; the one the page shows is marked "On the page now". The chosen one
  is the saved choice, else the page's.
- Picking a model saves it for the provider and sets it on the page at once ("Model: X"; an error
  says why). Turning an option on or off saves it and sets it on the page at once.
- No model list: "Couldn't read the model list" — "Pick it on the site itself; the app then
  leaves the model alone. On the page now: X".
- An option the page doesn't show: "Not found on the page".
- More: "Choose on the site" (forgets the chosen model and shows the page), "Don't choose a model"
  ("Use whatever the site has", only when one is chosen), "Read the page again".
- Footnote: "Saved for <provider> and set on the page before each message."
- ‹ goes back to the provider sheet.

### 1.3 Small parts

- A chat link to open: only `http(s)://`; otherwise "Paste a chat link (https://…)". Its name is the
  site list's name for it, else the link's path.
- A tag box: Enter adds the tag and empties the box; Escape leaves it; known tags are suggested.

### 1.4 Layers and redraws (R4, R5, UC8)

- From bottom to top: the safe-mode banner, the header, the chat, the "new reply" button, the
  message box, the site view, the chats list (with a dimmed backdrop), the provider's menu, the
  sheet, a guide, help mode.
- A sheet or the chats list slides in only when it opens, never again on a redraw.
- Each sheet starts at its top with empty fields; the same sheet keeps its place and fields
  through redraws.
- "At the bottom" means within 80 px of it. Stay at the bottom while a reply comes in (on by
  default) applies only then; anywhere above, the place never moves.
- Safe mode banner: "Safe mode: only built-in plugins are on." with "Leave safe mode".

### 1.5 New replies and the "new reply" button (UC8)

- The button shows when there are unseen replies, or when you are more than 60 px above the
  bottom. With unseen replies: "N new reply ↓" / "N new replies ↓" (hint "Go to the new reply"):
  a tap scrolls smoothly to the start of the first unseen reply and clears them. Otherwise:
  "Jump to latest ↓" (hint "Jump to the newest message"): a tap scrolls smoothly to the bottom.
- A reply counts as seen once its top is in view (at least 60 px above the chat's bottom edge).
- The line under the message box: what the app is doing, and "N reply / replies coming in other
  chats", joined by " · ".

### 1.6 A reply on its way (UC1, R4, Q5)

- Thinking while it streams: one line, "Thinking · <the last line of the thinking so far>" (markup
  removed, at most its last 120 characters) with a pulsing mark; once the reply itself starts, the
  line says "Thought". A tap unfolds it; your choice for that reply is kept while it streams.
  (Q5: the thinking of a streaming reply is active, so it shows unfolded.)
- The reply so far, as Markdown, then a progress line (what is happening, or "…") with "Stop
  waiting" (hint "Stop waiting for this reply") while a page is answering it.
- The streaming reply is updated in place: an unfolded part stays unfolded, its scroll stays, and
  while you are selecting text in it nothing changes until the selection ends; then it catches up.
- While it grows, the view stays at the bottom only if you were at the bottom (and the setting is on).

### 1.7 The provider's state, in one set of words (UC9, UC12)

- "No provider", "Busy" (a page is answering), "Page not open", "Page on another site" (the page
  is on another host than the provider's), "Ready". The same words and dot colours in the header,
  the provider sheet and the site view.

### 1.8 The header (UC9, UC16, UC19)

- Left: the chats button (hint "Chats · Ctrl+B"), with a dot when another chat has a reply ready.
- The chat's name and "▾" (hint "Chat actions · F2"), or "New chat": opens Chat details.
- The provider button: the state dot, the provider's first word, " · " and the model in short (the
  part after the model family's name and digits: "Qwen3-Max" → "Max"), "⚠" when the page shows
  another model than the one picked (the hint says "the page shows X, you picked Y"), " · N
  replying" when more than one reply is coming, and a dot when the provider has an update. The
  model shown is the page's, else the one picked.
- Then the plugins' header toggles, the search button and the ? button.

### 1.9 The provider's menu (UC9)

- Each provider (● the chat's, ○ the others) with its model under it: the page's for the chat's
  provider, else the one picked, else "Model: as the site has it"; then "Provider, model and
  profile…" (or "Get providers…" when none is installed).
- Picking one moves this chat to it (saved), says "This chat uses X", and starts loading its site.
- The advice shown when getting a provider: "Use a separate account on the AI website (a throwaway
  Gmail works), not an important one: promptpipe drives the site for you and isn't built for
  account security. You can also sign in by hand on the site."

### 1.10 The provider sheet ("Profile and provider") (UC9–UC13, UC46)

- No provider: "Get providers" first ("No provider yet").
- An update for the provider: "<name> <version> is available" — "Updates on its own; tap to do it
  now" → "<name> updated to <version>".
- Profile: the profile list (1.x).
- "Provider (for this chat)": its name, "Switch provider" (or "The only provider installed", which
  opens Get providers); "Show the page" — "<name> · <state> · <address>"; the model ("Choose a
  model" when none) — "Model and options" (+ " · you picked X" when the page differs), Ctrl+M.
- "This chat and the page": "Link this chat to the open page", "Import messages from the site
  chat", "Add the page's newest reply".
- "Pages": "N replies at once at most" — "n page(s) open", "Change" (opens Sites).
- "Providers": "Get providers", "<name> settings".
- "Developer": the page report's entries, "Decode the newest reply (preview)".
- The header's search button (hint "Find chats and functions · Ctrl+K or F3") and ? button.

### 1.11 Icons and sheet items (Q1)

- Line icons drawn in the text colour, 20 px, stroke 1.7, round ends: menu, search, more, send,
  stop, layers, settings, pin, check, trash, folder, plus, close, copy, edit, grip, right, up, quote,
  add-to-stack, expand, shrink, down, share, chat, history, back, help, play, plugins, prompt, look,
  sites, storage, import/export, API, advanced, retry, select.
- A sheet item: an optional icon, a label with a small second line, and at the end one of: a key,
  a badge, a value, a switch, a radio (● / ○), a chevron (›). Main items are highlighted; dangerous
  ones are red. Plugins draw their sheets with the same items.

### 1.12 Tags as chips (UC20)

- "#tag". A counter template shows as "#name#n" (hint "Each new message gets the next number").
  Tags a message has from the chat's tags are dimmed (hint "From the chat tags"). A counter tag has
  "+1" (hint "Next number"); a tag of the message's own has "✕" (hint "Remove tag").

### 1.13 The chat (UC1–UC4, UC13, UC42)

- An empty chat says only what's needed to start: with no provider, "No provider yet. PromptPipe
  talks to the AI chat website you log in to, through a provider plugin." with "Get providers" and
  "Install from a file"; linked to a site chat, "Linked to <address>. Your message continues that
  chat." with "Import its earlier messages".
- Plugins may draw above or under any message; a plugin's error shows on the plugin, never breaks
  the chat.
- A failed message: "✕ Not sent: <reason>" with Check (hint "The site may be answering anyway: wait
  for that reply and keep it"), Retry, Edit, Dismiss (and for site errors Open the site and Copy
  page report, UC4).
- A queued message: "Queued i of n · goes out after the reply above", with ↑ (send earlier: swaps
  with the one before), Edit (out of the queue, into the box), Remove.

### 1.14 A message's menu (UC5, UC6, UC20, UC42)

- At the top, the reply quoted (its first 240 characters, "…" when longer).
- "Copy the reply" (swipe ←), "Quote it in your next message" (swipe →), "Select text", "Copy your
  message", "Copy the thinking" (when there is some), "Send your message again", "Edit and send
  again" (the last message only, ↑), then each plugin's message actions as "<action> · <plugin>".
- "Tags": the message's own (✕, and +1 for counters), the chat's dimmed, and "+ tag".
- "What was sent": "Show the trace (what went out, what came back)": You, Sent, Received, Shown;
  for a message sent since the app started, every plugin stage with its notes and errors; then the
  plugins' notes.
- A plugin's message action works on the received reply and replaces the shown one; its notes are
  added as "<plugin>: <note>"; it's saved ("<action>: <chat> (#n)"); an error says "<action>:
  <reason>".
- Quoting puts the first 6 lines in the box, each starting with "> ", and "> …" when there are more.
- Quick actions under replies: on the newest reply (default), every reply, or off; a tap on one
  reply's toggle overrides it for that reply.

### 1.15 A message in the chat (UC1, UC5, UC6, UC20, UC25, Q5)

- Your message, with its full date and time as a hint; under it Copy ("Copy your message") and
  Edit ("Edit and send again": puts it in the box). A long one (more than 8 lines or 600
  characters) is tucked to a few lines with "Show more" / "Show less"; opened stays opened.
- The reply: "<AI name> · <model>" above it, the reply as Markdown, "✕ <reason>" under it when it
  ended badly.
- The fold line under the reply: "Thought for N s · sent with N", "Thought · sent with N" or "Sent
  with N" (N = the blocks that were on, plus your message). Unfolded: "Thinking" (as Markdown), then
  "Sent with": "Profile: <name> · <model>", "· <block>" for each block that was on, "· Your
  message"; then "Show the full text", which opens "The full text that was sent" (the trace).
- The reply's footer, folded: ⋯ ("Show actions"), the time (hh:mm), "#N" when the message has N tags
  of its own. Unfolded: ↑ ("Hide actions"), the time; Copy, Quote, Send again, Select text, and
  More ("More: what was sent, plugin actions") when plugins add actions; the message's tags, the
  chat's tags dimmed, and "+ tag" ("Tag for this message", Add).
- A message found with Find is highlighted.
- With a mouse, a right-click on a reply opens its menu; on a phone a long press selects text, so
  the menu is the ⋯ button.
- Swiping a reply (not while text is selected): the reply follows the finger at half the distance,
  at most 60 px; moving more than 40 px up or down cancels; letting go past 90 px quotes it (right)
  or copies it (left).
- Every code block has "Copy" ("Code copied").

### 1.16 Plugin toggles (UC11, D8)

- One toggle per plugin block of the profile that has one (a plugin can say it has none), in the
  order of the blocks, in the toolbar under the message box (default) or in the header, as the
  plugin says. The label is the plugin's toggle label, else its name.
- Its state is this chat's (linked to the profile's, D8). The hint says "Alt+N toggles it." for the
  first nine, then the plugin's description. A gear opens the plugin's settings. A plugin with an
  error shows its toggle as broken. A plugin may draw its own toggle, given its state, a flip, its
  settings and the standard toggle to build on.

### 1.17 The message box (UC2, UC3, UC7)

- Quick edit ("Quick edit and add"), the box ("Message"), bigger or smaller ("Bigger message box
  (Ctrl+E)" / "Smaller…"), Send.
- What you type is kept as a draft that survives a restart (on this device).
- The box grows with the text up to 40% of the screen's height; bigger mode takes most of the
  screen and gets the focus.
- Send: "Send · Ctrl+Enter" (+ " (it waits its turn)" when a reply is coming). With a reply coming
  and the box empty it is Stop ("Stop waiting for the reply · Esc") → "Stopped waiting".
- Ctrl+Enter always sends; Enter sends when "Enter sends" is on (Shift+Enter makes a new line).

### 1.18 Sending from the screen (UC1, UC4, UC5, UC13)

- An empty box: "Type a message first". Sending empties the box and its draft, remembers the text
  among your recent messages, and scrolls smoothly to your message going out (your own action; the
  reply then waits for you to look). A failure: "Not sent: <reason>" (unless it was a stop).
- Check (a failed message): takes the reply the page is giving for it; a failure says "Check:
  <reason>".
- "Add the page's newest reply": takes it as a message of this chat → "Added the page's newest reply".
- Putting text in the box (edit, quote, share, recent messages): replaces the text, or is added
  after a blank line ("append"); the draft follows; the cursor goes to the end and the box gets the
  focus.
- "Edit and send again" (↑ in an empty box): the last failed message, else your last message, into
  the box → "Edit it and send again (the site keeps the old one)"; none: "No message to edit".

### 1.19 Asking (D7, every confirm)

- The app's own dialogs (the app's browser has none): a sheet over everything.
- A question: "Are you sure?", the question, then the action (red when it destroys something, its
  own word, e.g. "Delete", else "Yes") and "Cancel".
- Asking for text: the question as the title, a box, OK (or its own word) and Cancel. Enter is OK,
  Escape or a tap outside is Cancel; the field (or the main button) gets the focus.

### 1.20 Sheets (R5, Q1)

- A card that rises from the bottom over a dimmed backdrop (a tap on it closes the sheet); tall by
  default, short when asked. Its bar: ‹ (when it has somewhere to go back to), the title (with a
  small line under it when it has one; tapping it renames, "Tap to rename", where that applies),
  any extra buttons, ?, and ✕ ("Close (Esc)").
- Opening a sheet closes the site view (one or the other, #239) and any open drop-down list.
- A sheet's field gets the focus when the sheet opens, not again on redraws.
- A command picked in a sheet (a menu, Find) closes it and may open the next one.
- Back (the phone's or the browser's) closes the top layer: the sheet, else the chats list. The
  sheet and the chats list share one history entry, which exists exactly while either is open, so
  Back never closes a sheet that has just opened.

### 1.21 A plugin's settings (UC32, D8)

- Drawn from the plugin's settings description: on/off as a switch (with its help line), a choice as
  a radio list, a long text as a 5-line box, a number or short text as a field, each with its help
  under it; hidden settings are the plugin's own. None: "This plugin has no settings".
- Title "Settings", under it "<plugin> · every chat on this site" for a provider, "<plugin> ·
  profile <name>" for the others; ‹ goes to the plugin's page; a plugin that didn't load shows "It
  didn't load" with the reason first.
- Saved per provider for providers, per profile for the others (D8).

### 1.22 Your copy of a plugin (UC29, UC38)

- When your copy is older than the app's (it hides the app's), the plugin says so: "Your copy is
  vX; the app's is vY, and yours is hiding it." with "Use the app's", which asks "Remove your copy
  of <plugin> (vX) and use the app's vY? Your copy's files are deleted." ("Use the app's") → "Now
  using <plugin> vY", and the plugins reload.
- Copy (a built-in plugin, not in safe mode; hint "Copy into your plugin folder to edit it") →
  "Copied to <folder>", and the plugins reload.
- Reloading the plugins: "Plugins reloaded (N)", plus ", M with errors" (then as an error).

### 1.23 Guides and selecting text (UC6, UC39)

- A guide opens as a sheet with the document drawn as Markdown; a missing one says "Guide not
  found."; the plugin-writing guide is "Writing plugins".
- "Select text": for the reply, the thinking (when there is some) and your message, each in a
  read-only box with "Select all" and "Copy selection" (copies the selected part, or all: "Copied
  selection" / "Copied all").

### 1.24 Copying and sharing a chat (UC21)

- The whole chat as its readable Markdown (from the chats list too, without opening it). Empty:
  "Nothing in this chat yet". "Whole chat copied"; failures: "Couldn't copy the chat: <reason>",
  "Couldn't share the chat: <reason>".

### 1.25 Git history (UC19, UC36)

- The commits first (each: its message, then date and time · its id), read once when the sheet
  opens: "Loading…", "No commits yet", or "No history here" with the reason.
- "Backup": "Commit on every save" (switch; "In <folder>. Git works there from Termux too."),
  "Author name" (default "promptpipe"), "Author email" (default "promptpipe@localhost"), "Remote
  URL" ("None · for example https://github.com/you/chat-history.git"), "Token" ("Saved" / "Not set"
  · "kept inside the app, not in the folder"; asking "GitHub token with repo access (empty removes
  it)" → "Token saved" / "Token removed"), "Push after every commit" (switch), "Push now", "Pull
  now" ("push: <result>" or "push failed: <reason>"; the list reloads). Each text is asked with
  Save.
- ‹ goes to "Chats and storage".

### 1.26 Look page (UC34)

- "Light or dark": System, Dark, Light (disabled with "The theme X sets its own colours").
- "Accent" (its current name) → the accent list (radio).
- "UI scale" — "Text and controls. Applies at once." (+ " Now N%." when not one of the four):
  90%, 100%, 115%, 130%.
- Then "Quick actions under replies", "Stay at the bottom while a reply comes in", "Enter sends".

### 1.27 Runtime plugins and plugin updates (UC31, UC33, UC38)

- The intro: "The app is made of plugins too: sending, chat files, history, the local API and this
  screen. Copy one to change it; your copy replaces the built-in one when the app restarts. If
  yours breaks, the app opens in safe mode with only built-in plugins."
- Each runtime plugin: its name, then "<id> · v<version> · built-in / updated / your copy / yours"
  (+ " · not loaded"), its error, the stale-copy note (1.22), Copy.
- With more than one screen installed: "App screen" (a list) → "Restart the app to switch".
- "Plugin updates": the bundle's version and plugin count ("Newer ones than the app's are used"),
  else "Plugins update from the catalogue. The release bundle is a fallback."; " Last checked
  <date and time>."; an error: "✕ <reason>. Download the zip, then install it from the file.";
  "Update plugins" ("Checking…"; not in safe mode), "Download the zip" (opens the release page),
  "Install the zip" (picks a file); the automatic check (UC31, now off/daily/weekly); "Also download
  the release's plugin bundle (a fallback when the catalogue can't reach GitHub)".
- "Restart app"; "Restart in safe mode" ("Start with only built-in plugins"), or in safe mode
  "Leave safe mode".

### 1.28 Storage check and core log (UC36, R6)

- Storage check: "Checking…", then the chats folder's path and each test with ✓ or ✕ and the
  phone's own reason ("make a folder", "write a file in it", "write a file beside the chats"; when
  the core can't be reached: "reach the app's core"). After a failure: "The phone said no. If Allow
  all files access isn't on for this app, turn it on in Settings › Chats and storage and restart
  the app. Otherwise copy this and send it to whoever helps you." Copy (as text: "Chats folder:
  <path>" then "ok / FAILED: <test> (<reason>)" per line) and "Check again". ‹ goes to Settings.
- Core log: its file's path, Copy ("Log copied"), Refresh; the text scrolled to its end; "(empty)",
  "No log file yet.", or "Couldn't read the log: <reason>".

### 1.29 Shortcuts & help (UC39, Q2)

- "Everything has a button or a gesture; keys are extras for a hardware keyboard."
- Touch: "Swipe a reply right" — quote it in your message; "Swipe a reply left" — copy it;
  "Long-press any text" — select it (or Options › Select text); "Press and hold a chat in the list"
  — start selecting chats (then Pin, Move…, Delete); "Drag the ⋮⋮ grip of a chat or folder" — move
  it into a folder, reorder it, or onto Pinned to pin it; "Tap the title" — Chat details: name,
  tags, copy, share, pin, move, history; "Tap the magnifier" — Find: chats, messages, every function
  and setting; "Tap '● provider · model' at the top" — the provider sheet: status, model, profile,
  pages, providers; "⋯ under a reply, or long-press it" — the message menu: copy, quote, select, send
  again, tags, what was sent, plugin actions; "Tap a reply" — shows Copy and Quote under it; "The
  layers button next to the box" — quick edit and add: turn blocks on or off, reorder them, put in a
  text file; "■ (Send while a reply is coming)" — stop waiting; type to queue a message instead; "⤢
  next to Send" — big message box.
- Keys: "Find — Ctrl+K · F3 · Ctrl+F", then every command that has a key (the command list).

### 1.30 Other commands (UC13, UC16)

- Fold or unfold all thinking (Ctrl+/): all at once.
- Previous / next chat (Alt+↑ / Alt+↓): through the chats list as it is filtered now, wrapping
  around.
- "Import messages from the linked site chat": needs a linked site chat ("Link this chat to a site
  chat first"); says "Reading the site chat…"; opens that site chat on the page if it shows
  another; takes the site chat's messages after the ones the chat already has; runs the after-reply
  hooks on each reply and on each of your messages (so encoded messages are decoded too); each is
  noted "imported from the site"; a chat still called "New chat" (or untitled, or named like an
  address) takes its first message as its name (60 characters); saved ("import: <chat> (N
  messages)") → "Imported N messages" / "Nothing new to import".
- "Link this chat to the open page": the page's address becomes the chat's site chat, with the
  provider; saved ("link: <chat>") → "Linked to <address>".
- "Decode the newest reply (preview)": the page's newest reply through the after-reply hooks, in a
  sheet "Newest reply on the page" with the result, its "Trace" ("Reply on page" and each plugin
  stage), and Copy; none: "no reply found on the AI page".

### 1.31 The chats list: order, pins, moves (UC16, UC17) — model gap

- One compact list: "Pinned" (a header that folds; whether it's open is remembered on the device),
  then the top level: folders and the chats that aren't pinned (a pinned chat shows only under
  Pinned), in **your own order**. What you never placed keeps the default: folders by name, then
  chats newest first. Pinned chats keep **their own order** too.
  - **Model gap**: the order of the list and of the pinned chats must be stored (with the chats,
    by chat id), not only a pinned flag. To fix in the model.
- Dropping chats: on the Pinned header (pinned, at the top), among pinned chats (pinned, at that
  place), into a folder, before or after a row (moved into that row's folder, at that place), or to
  the top level. A folder only reorders within its own level (it never goes into Pinned or into
  another folder by dragging). Two chats with the same name in one place: "\"<name>\" already
  exists. Rename one of the chats first."
- Renaming a folder: a name only ("Type a folder name (a name only; use Move for another place)");
  a name can't start with "." or be ".."; a taken name: "\"<name>\" exists already". Its chats and
  subfolders follow, with their pins and order.
- Deleting a folder: its chats move to the top level (a clash: "Can't empty the folder: \"<name>\"
  already exists at the top level"); its subfolders go too.
- When the phone refuses a change: "The phone won't let PromptPipe change your chats folder. Allow
  all files access? Android opens its settings page: switch it on, come back, then restart the
  app." (Allow); with all files access already on: "The phone still refuses, even with all files
  access on. Run the storage check to see which step it refuses?" (Run the check). Other failures:
  "Couldn't do that: <reason>"; a history failure: "Not saved to git: <reason>".
- After a change the open chat, the open folders and the folder new chats go into follow it;
  folders that no longer exist are closed; Find's index is rebuilt.
- Moving chats is saved as "move: N chat(s) -> <folder> / (top)". Pinning puts chats at the top of
  Pinned; unpinning takes them out.
- Selecting: pressing and holding a row for 450 ms (moving more than 8 px cancels) starts selecting
  with that row; in select mode a folder row selects or unselects all the chats directly in it
  (not the pinned ones).
- Dragging: the grip ("Drag to move") picks the row up; it follows the finger; the row under the
  finger shows where it would land: a line above (upper half) or below (lower half), or a frame for
  "into this folder" (a chat over the lower three quarters of a folder) or "pin it" (a chat over the
  Pinned header). Near the list's top or bottom edge (36 px) the list scrolls by itself so far rows
  can be reached. Letting go applies it; a folder dropped into opens so you see where it went.
  Dragging a selected chat moves all the selected ones.

### 1.32 The chats list's rows (UC16, UC17, UC18)

- A chat: its name (else its file name), its plain tags (not counter templates), its state ("Reply
  ready" highlighted, or being answered), a pin button ("Pin to top" / "Unpin", lit when pinned),
  the grip; the open chat is marked; indented under its folder (16 px per level). In select mode a
  check box replaces the pin; in search results a pin mark shows which are pinned. A tap opens it
  (or selects it, in select mode). Enter or Space opens it from the keyboard.
- A folder: ▸/▾, its name, how many chats it holds (not counting pinned ones), a pencil ("Rename or
  delete folder <name>"), the grip. A tap opens or closes it (remembered on the device) and makes it
  the folder new chats go into. Open and empty: "Empty. Drag chats here."
- The pencil opens a panel under the folder: its name in a box (Enter renames), "Rename", "Delete"
  (asks "Delete the folder \"<name>\"? Its N chat(s) move(s) to the top level." or "It is empty.",
  "Delete folder"), "Cancel".
- Filtering (the search box, "Search chats, #tag"): every word must match; "#word" matches the
  start of a chat tag; other words match the name or a tag. The three most used tags show as chips
  under the box (sorted by name); a tap searches for that tag, again clears it.
- "+ Folder": a box "Folder name (use / for a subfolder)" (filled with the current folder and "/"),
  "Create" (Enter too); a new folder goes first at its level; a failure: "Couldn't create the
  folder: <reason>" (or the storage access question).
- Select mode's bar: "N selected. Drag one to move them all."; "Pin" / "Unpin" (Unpin when all
  selected are pinned), "Move…" (then "Top level" and each folder → "Moved to the top level" /
  "Moved to <folder>"), "Delete" (asks "Delete N chat(s)? They stay in git history." → "Deleted N";
  the open chat, if deleted, becomes a new chat), "Done". Closing the chats list ends select mode.
- Opening the chats list closes the site view (one or the other, #239).

### 1.33 The chats list's top and the site's chats (UC13, UC16)

- Its bar: "Chats", select ("Select chats" / "Done selecting", lit while selecting), ?, ✕.
- "+ New chat" (Ctrl+N; "+ New chat in <folder>" when a folder is current) and "+ Folder". With a
  current folder: "New chats go to <folder> · use the top level".
- The search box: typing filters at once; Enter opens the first chat shown; ↓ moves to the list.
  Searching shows a flat list of matching chats (no dragging), or "No chats match.".
- Not searching: "Pinned" with its count and pin icon (folds; empty: "Drag chats here to pin
  them."), then the folders and chats.
- "Chats on <provider>" (or "the AI website"): "Refresh the list"; each site chat: its name — "Already
  here · opens it" or "Opens it here, linked to the site chat"; none yet: "Tap Refresh to list the
  chats from the site's sidebar."; "Or paste a link" (1.3).

### 1.34 The site view (UC12, UC13)

- Its bar: ‹ ("Back to chat (Alt+S)"), "AI page · <provider>" (or "no site"), and "Profile and site"
  (opens the provider sheet).
- One tab per page: the state dot (replying, ready, idle), the linked chat's name, else the page's
  title, else its host, else "Page N"; a page linked to a chat and not replying has a close button.
  Choosing a page opens its linked chat. "+" ("New page: a new chat"): a new chat on a page that
  isn't replying or showing another chat (the chosen one last); none free: "Every page is in use.
  More: Settings › Sites › Max replies at once"; no provider: "Get a provider first".
- Closing a page frees it (it goes back to the site's start page) and keeps the chat: "Page closed.
  The chat is kept." (Now UC12: closing a tab closes its page.)
- The address bar: Enter (or leaving it) loads the address (https:// is added when missing); a
  reload button ("Reload the page").
- Under the bar: "Linked to chat: <name>" with "Open chat"; or, when the page shows a site chat
  that isn't one of yours, "Import this chat" (a new chat linked to it, then its messages imported).
- The page itself sits under all that ("The site page shows here."); other parts may add a strip
  under it (the welcome's login card).
- Opening the site view or choosing a page gives the page the focus; the page only moving (the
  keyboard, turning the phone) never takes the focus (#240). The platform's own Back, Alt+S and
  sign-in pop-ups open or close it too, and the screen follows. A page loading or changing address
  updates the tabs and the address bar.

### 1.35 Find (UC18)

- One box ("Find chats and functions"; hint 'Also "phrase", #tag, in:folder, is:you'), focused and
  selected when it opens; results follow 120 ms after typing stops.
- Nothing typed: "Recent" (the last 3 commands or settings picked) and "Try": model, profile,
  plugin, prompt, export, folder (a tap puts the word in the box).
- What it finds: every command (the command list, plugins' menu entries, each block of the active
  profile, each installed plugin's page), every settings group and every setting by its label, and
  every chat by name ("Chat" or "Chat in <folder>"). The same name in the same place is one entry
  (keeping a shortcut if one has it).
- Ranking: every word must be in the name or the place; a word the name starts with counts 4, a
  word starting a later word in the name 3, inside the name 2, in the place 1; ties put commands
  before chats. Words starting with #, in: or is: don't rank commands.
- Shown: "Chats" (up to 8), then "Functions" (up to 25), each with its place and shortcut; then,
  from 2 characters on, "Messages (N)": every chat's messages are read once ("Reading chats…"; a
  failure: "Couldn't read the chats"), searched, newest first, up to 200: "<chat> · #<n> · <date and
  time>  #tags" with a snippet (40 characters before the first match, 140 after, "…" when cut,
  matches marked); none: "No message matches".
- Message search: "exact phrase" (quoted), #tag (the start of a message's tag, chat tags
  included), in:folder (chats in that folder), is:you / is:ai (only your messages / only replies);
  other words must all be in the chat's name, your message or the reply.
- ↓ / ↑ move a highlight through the results, Enter picks it.
- Picking a command or setting remembers it in Recent, runs it, and for a setting highlights its
  control for about 2 seconds once its page is open (scrolled to the middle). Picking a message
  opens its chat, scrolls the message to the middle and highlights it for 2.5 seconds.

### 1.36 Quick edit and add (UC7, UC11, UC22, D8)

- Title: the chat's profile name (tap: rename the profile); under it "Quick edit · tap the name to
  rename"; at the top right "Edit profile" (opens the profile editor).
- First row: the profile picker ("This chat's profile · tap to switch"), switching this chat's
  profile in place.
- Note: "Toggles are this chat's own; a new chat starts with the profile's. Drag to reorder the
  profile."
- One row per block of the profile, in order: a grip (drag to reorder), the block's name with a
  short line ("Your text goes here", "System prompt" (+ " · linked"), "Plugin", "Plugin not
  installed", + " · its group is off"), Move up / Move down, and a switch (not for the message
  block). A block that won't be sent (off, its group off, its plugin missing) is dimmed. The
  switch changes this chat only (D8 "own"); reordering changes the profile.
- "Use the profile's toggles" ("1 toggle differs in this chat" / "N toggles differ …") when the
  chat has its own toggles: back to linked.
- "Add to your message": "Text file" ("Put its text in the box") and "Several text files" ("One
  after another, in the box"): text files only, each under 2 MB ("A file is over 2 MB; paste the
  part you need"), added to the end of the box, separated by a blank line; toast "Added <name> (N
  characters)" / "Added N files".
- Then every plugin menu entry marked for this sheet.
- A chat's own toggles are saved with the chat ("toggles: <chat>" in the history); a chat not saved
  yet keeps them until its first message.
- Dragging a grip (here, in the profile editor and the prompt library): the row follows the finger,
  a line shows where it would land (above or below the target), releasing outside the list puts
  it first or last, a cancelled drag changes nothing.

### 1.37 The chat sheet (UC17, UC19, UC20, UC21, UC44)

- Opened by tapping the title (or F2). Rows: the chat's name ("Rename"; "New chat" when it has
  none); its tags as chips with ✕ and "+ tag" ("Tag for every message in this chat (name# numbers
  them)"; counting tags marked); "Actions": "Copy the whole chat", "Share or export…", "Pin to
  top" ("Pinned" / "Not pinned", a radio mark; a chat not saved yet: "Send a message first"),
  "Move to folder…" (its folder: "In <folder>" / "Top level"), "Sub-chats" when that plugin is on;
  "History": "Saved <time> · N messages" or "Not saved yet".
- "Move to folder": a radio list, "Top level (no folder)", each folder, "New folder…" (opens the
  chats list with the new-folder box). A chat not saved yet is saved there with its first message.
- "History": the chat's commits (read when it opens), or "Not saved yet · Saved after the first
  message". Both pages have a back row to the chat sheet.
- Renaming is committed ("rename: <name>").

### 1.38 Help mode (UC39)

- The ? button in the header (hidden by the setting "help.button"), pressed while on.
- On: a bar "Help mode. Tap anything to see what it does." with "Quick start" and "Done". A tap
  on any control explains it instead of doing it: a card with its name, what it does, "Where:
  <place> · <shortcut>" (from Find's list), "Got it" and "Do it" (leaves help mode and does it).
- The explanation: the app's own text for the main controls (chats, find, quick edit, message,
  send, stop, bigger/smaller box, close, back, the provider, jump to latest, the chat title, show /
  hide actions, copy, quote, send again, select text, copy your message, edit and send again, drag
  to reorder, move up / down), else the row's own line, else "Tap it normally to use it. Its screen
  explains the options."
- With a mouse: a small ? appears on whatever the pointer rests on; clicking it shows the card.

### 1.39 Quick start: the first-time guides (UC39, UC9, UC22, UC31)

- Four guides of three steps each, kept as data. Each opens by itself the first time you reach its
  place (never over help, a question or another guide), and is marked seen (setting
  "help.seen.<place>") when it opens:
  - **Welcome and log in** ("Pick a site and log in"), full screen, on first launch:
    1. "Welcome to PromptPipe": what the app does, "Three quick steps to get going.", "Start".
    2. "Pick a site": the providers installed ("Installed") and the ones the official catalogue
       offers ("Tested" or "Opt in", or the entry's note), then "Later" ("Add one in Settings ›
       Sites"); "Loading the sites…"; a failure: "Couldn't load the list: <why>. Install a site from
       a file later in Settings › Sites." Picking one installs it if needed ("Couldn't get <name>.
       Pick it again or choose Later.") and makes it the chat's provider.
    3. "Log in to your site": why logging in is needed; three numbered lines (Tap "Open <site>",
       log in like normal, come back); "Open <site>" opens the site view; the note "You log in on
       the site's own page, not in a PromptPipe form. Use an account you can afford to lose. Sites
       may limit automated use."; with no site: "No site yet. Add one any time in Settings ›
       Sites, then log in there." The state: "Not logged in" / "Waiting for you…" / "Logged in".
       While you log in on the site view, a card under the page says "Waiting for you to log in…"
       or "Logged in. I can see the chat box." (the page is asked every 2 s whether its chat box
       shows), with "I am logged in" (by hand) and "Done" ("Logged in to <site>"). Ending the
       welcome goes back to the chat.
  - **Chatting** ("Send, find, quick edit"), on the chat: "Say hello" (pick a starter profile when
    you have only the first one: Plain "Just your message", Writing feedback, Dialogue & Role play,
    Story & Prose, each made from its template the first time and found by name after; done when
    a message is sent), "Find anything" (done when Find opens), "Quick edit" (done when it opens).
  - **Chat list** ("Pin, select, search"), the first time the list opens with a chat: "Pin a chat"
    (done when one more is pinned, or all are), "Select several" (done in select mode), "Search"
    (done when you type).
  - **Plugins** ("Updates and repos"), the first time Plugins opens: "Open the Library", "Update
    everything" (done when nothing is left to update), "Plugins from friends" with the warning "Only
    add repos from people you trust. Plugins are code. They can read your chats. Never add one from
    a random site." (done when Get plugins opens).
- A step lights up its control: the rest is dimmed (a picture with a hole; it never takes a tap)
  and only the lit control and the card take taps. The control is scrolled into view once. If it
  isn't on screen (or something covers it), nothing is dimmed or blocked and the card says "That
  control is not on this screen." with "Take me there". The card moves to the top when the control
  is in the lower half. "Try it now: use the lit control" (or the step's own hint).
- Using the control moves the guide on (tidying up after, e.g. closing Find); the last step ends it
  with "<guide> guide done".
- The card: step dots (tap to jump), the title and lines, "Skip guide", "Back", and "Next" (or the
  step's word), or "Skip step" / "Finish" for a step that waits for the control. Esc ends the guide.
  While the site view is open, a guide other than the welcome waits.
- Help › Quick start: the four guides ("<sub> · 3 steps", "Seen" or "New"), each replayed from its
  place; "Show every guide again" ("They open the first time you visit each place.").

### 1.40 Settings (UC34–UC38, UC27, UC39)

- One page of groups, each with an icon and a line: Plugins ("Profile blocks and the plugin
  library"; with updates, a badge with their number instead of the arrow), Prompt library ("System
  prompts you keep and link"), Look ("Theme, accent, quick actions"), Sites ("Pages at once,
  waiting for replies"), Chats and storage ("Chat folder, move chats, Git"), Import and export
  ("Profiles, prompts, name clashes"), Local API ("Address, token, folder"), Advanced ("Reset,
  safe mode, core log"), Help ("Shortcuts, quick start"). Plugins and Prompt library open their own
  screens; the others a page with "‹ Settings".
- **Look**: the Look controls (1.26); "Quick actions under replies": Newest reply only → Every
  reply → Collapsed (a tap goes to the next); "More": "Stay at the bottom while a reply comes in"
  ("Only if you were already there. Scrolled up, your place never moves."), "Enter sends"
  ("Shift+Enter makes a new line").
- **Sites**: "Max replies at once: N" ("How many chats can be answered at the same time. Memory
  and Sub-chats use extra ones. Tap to change."): a tap goes 1, 2, … 5 and round; past 5 it asks
  "More than 5 replies at once uses a lot of memory, and many messages on one account can look
  like a bot to the site. Unlock up to 10?" ("Unlock up to 10"), then up to 10. "Waiting for
  replies" ("Give up after…"): "In minutes. 0 = no limit. Stop on a reply that's coming always
  works.", two numbers: "Give up after this long with no activity on the page", "Give up after
  this long in total".
- **Chats and storage**: "Chat folder" (its path, "Checking…"), "Move all chats to another
  folder…", "Use the default folder" (when a chosen folder is in use, copying the chats). Chats
  found in another known folder: "N chats found in another folder" (its path) with "Use it" and
  "Copy here" ("N chats added here; the old folder is untouched"; existing chats are never
  overwritten). "Git history and backup". "More": "N chats · a folder you chose / the default
  folder" ("Markdown files in a git repository, so other apps (a file manager, Termux) can reach
  them."), "App folder" (path, and either "Plugins and settings live here, so Termux and Neovim can
  reach them." or "The app can't use /sdcard yet, so files are in its own folder."), "Allow all
  files access" ("Then restart the app") when it isn't allowed, "Storage check".
  - The folder picker ("Chats folder"): "Pick the folder for your chats (and their git history).
    It can be a new folder: type its path, then Use this folder."; a path box with "Go" (Enter),
    "Up", the folders in it ("No folders in here."), "Copy my chats into it (the old folder stays
    as it is)" (on by default), "Use this folder". Done: "Chats folder: <path> (N chats copied; the
    old folder is untouched)". Refused for lack of access: offers the storage access.
  - **Gap to carry:** the remake changes the files' layout, so finding the old app's chats (its two
    old folders and today's chats folder) must bring them into the new layout (an import), not
    only point at them.
- **Import and export**: "Profiles": "Export all profiles", "Import a profile…"; "Prompt
  library": "Export the whole library", "Import prompts…"; "When a name already exists":
  "Importing a name you already have": "Ask each time (keep both is preselected)" → "Always keep
  both" → "Always replace".
- **Local API**: "Address" (`http://127.0.0.1:<port>/v1`, a tap copies), "API token" ("Copy or
  make a new one": shows it, "Send it as: Authorization: Bearer <token>", "Copy", "Make a new
  token" ("Apps using the old one need the new one"; asks "Make a new API token? Apps using the old
  one stop working until you give them the new one."; "New API token made")); "More": "How apps
  use it" (the text on base URL, model = a profile name, the token always required, one new chat
  per request unless `"chat": "<path>.md"` continues a saved one (then only its last message is
  sent), the `promptpipe` part of every reply saying which chat and what was sent, requests at the
  same time running in parallel on the site's pages, the rest waiting; "Try it": a curl command
  with the real port, token and profile, "Copy the command"); "Folder for chats made through the
  API" ("Top level" when empty).
- **Advanced**: "Reset to first launch" ("Shows the welcome again. Chats, profiles and plugins
  stay."; asks "Reset the app to first launch? Your chats, profiles, prompts and plugins stay.";
  clears every guide's seen mark and starts the welcome), "Core plugins" ("The app itself:
  sending, history, this screen"), "Safe mode" ("On: only built-in plugins" when on; a tap
  restarts in it), "Core log", "Stop background service" ("A notification keeps the AI page and
  the API alive in the background"), "Version" ("<app> · core <core>", a tap copies).
- **Help**: "Show the ? button" ("Tap ?, then tap anything to see what it does"), "Shortcuts"
  ("Keyboard and touch"), "Quick start" ("Short guides, three steps each. Replay any time."),
  "Plugin guide".

### 1.41 Profiles (UC22–UC25, UC27, UC32)

- **The profile picker** (in the provider sheet, Quick edit and the editor): closed, the profile's
  name ("Active profile · tap to switch or edit" / "Not the active profile", or the place's own
  line) with "Edit" beside it; open, every profile (● the one shown, "Active" under the active
  one) each with "Edit" (or "Use" where editing isn't offered and it isn't active), then "+ New",
  "Import…", "Export this", "Export all". It opens in place (not the system's popup), and stays
  open across redraws until something else opens.
- **Switching** makes it the active profile (new chats start with it) and the open chat's profile;
  the chat's own toggles start over from the new profile's; toast "Profile: <name>"; the site page
  is warmed up. A shortcut moves to the next profile.
- **Renaming**: "Rename the profile"; a name already used: "There is already a profile “<name>”".
  Chats saved with the old name still find it (the profile keeps its earlier names).
- **New profile**: a name ("New profile" when empty; "Name (2)" when taken) and a template, each
  with its number of blocks: Plain, Writing feedback, Dialogue & Role play, Story & Prose; "Make the
  profile" opens it in the editor.
- **The editor** (the Plugins screen's Profile tab): the picker ("Editing the active profile · tap to
  change" / "Editing · not the active profile"), "Sent top to bottom", one row per block (grip, name
  — a tap opens its page —, a line: what it is (1.36's longer words: "Your text goes here. Move it
  anywhere.", "Adds text · System prompt", "Adds text", "Changes text", "Works on replies", "Plugin
  not installed"), when it is sent if not every message, "empty, not sent", its group (+ " (off)"),
  Move up / down, a switch); "Add a block" ("System prompts and plugins"); "This profile": "Use this
  profile" (when not active), "Rename", "Duplicate" ("A copy to change", "<name> copy"), "Groups"
  (their names, or "One toggle for several blocks"), "What will be sent" ("The message these blocks
  make"), "Delete this profile" (when there is more than one; asks; the active one falls back to the
  first).
- **A block's page**: "This block isn't in the profile any more" when it was removed meanwhile.
  - Your message: "Your text goes here. Move it to put blocks before or after it."
  - Every other block: "On" ("Its group is off" when that stops it).
  - A System prompt, linked: "Linked from the prompt library": the prompt (snippet, "tap to edit it
    in the library (every profile that links it changes)") or "No longer in the library" ("It sends
    nothing. Take it out, or link another prompt."); "Make it this profile's own copy" ("Unlinks it:
    later changes in the library don't reach it").
  - A System prompt, own: "Name", "Text" ("What to send. An empty one isn't sent."), "Save to the
    library and link it" ("Then other profiles can link it too, and one edit changes them all";
    empty: "Write something first").
  - A System prompt's "Send it": when (every message, the first, every N, at a depth, …, the list in
    the profiles plugin); for every N: "Every how many messages" ("The first message of a site chat
    always gets it.", 1 or more); for a depth: "Messages up from the newest" ("Inside the earlier
    chat Memory sends (0 = right after it). Without it, just before your message.", 0 or more).
  - A plugin: its name and description ("This plugin isn't installed, so the block is skipped.");
    a plugin that changes the message: "It changes": "Everything above it", "Only your message",
    "Only the blocks I pick" ("Blocks above it, and your message", then a switch for each); one
    that adds text: "Its text goes where this block is."; otherwise "It doesn't change the message
    (it works on replies or chats), so its place doesn't matter."; "Plugin settings".
  - Every block: "Group" ("No group" or a group, "Off" under an off one); "More": "Copy the text"
    (System prompts), "Take … out of this profile" (asks "Take “<name>” out of this profile?").
- **Groups**: "A group's toggle turns all its blocks on or off. Put a block in a group from its
  page."; each group: name ("N blocks · tap to rename"), delete ("Delete the group “<name>”? Its
  blocks stay, without a group."), a switch; "Add a group" ("Group N").
- **What will be sent**: "First message" / "A later one", the message the blocks make, "(nothing)".
- **Add a block**: "System prompts": "New system prompt" ("Write one for this profile", opens its
  page), "New prompt in the library" ("Written once, linked here, ready for other profiles"), then
  "From the prompt library (linked: edit it once, every profile changes):" each prompt, pinned
  first (📌); "Plugins": every block plugin and every plugin text block ("Already in this profile"
  instead of adding it twice); none: "No plugins yet · Get them in the Library". A System prompt
  goes just above your message; a plugin at the end (a plugin that changes text works on what's
  above it, Base64 on your message only); toast "Added to the profile".
- **Export**: one profile (`<name>.profile.json`) or all (`profiles.json`), holding each profile's
  blocks, groups, plugin settings, the library prompts its linked blocks use, and the plugins it
  needs (providers belong to chats, so none is in it).
- **Import a profile**: "Pick a file…" ("A .profile.json or profiles.json from Export") or paste
  the text ("Import the pasted text"); wrong files: "That is not a profile file (it isn't JSON)",
  "That is not a promptpipe profile file". The review: each profile ("N blocks", " · the name
  exists"), "Plugins it uses" ("Installed" / "Not installed: its block stays, and does nothing
  until you get the plugin"), on a clash (when set to ask): "A profile named “<name>” already
  exists": "Keep both" ("Adds the new one as “Name (2)”", preselected), "Replace it", "Skip", and
  "Don't ask again (keep both every time; change it in Settings › Import and export)"; "Import".
  The library prompts it brings are added when missing (same id). Done: opens the first in the
  editor, "Imported N profiles" / "Nothing imported".
- **Gap to carry:** the old app's profile files (both its versions) must still import into the new
  profile format.

### 1.42 The Plugins screen (UC28–UC31)

- Two tabs: **Profile** (the editor, 1.41; a dot when a plugin it uses has an update) and
  **Library** (a badge with the number of updates). A ▶ button at the top starts the plugins guide.
- Every plugin's type is "Plugin · <its tags>"; the Library filters by tag: All, Providers, Themes,
  Passive. The app's own plugins are left out of the Library unless they have an update.
- **Library**: "Update all" ("N updates available", "Checking…"; not in safe mode) when there are
  updates; the installed plugins, updates first then by name: name, "<type> · <version> → <new>",
  "update needs app <version>" when the app is too old for it, where it came from ("updated with
  the app", "Third party", "your copy", "yours"), an "Update" badge; none: "Nothing installed yet"
  / "Nothing with this tag yet" ("Get plugins below"). "Manage": "Reload plugins" (Ctrl+Shift+R),
  "Get plugins" ("From N sources"), "Install from a file or link", "Plugin guide" ("Writing plugins,
  copy instructions for AI"), "Check for app updates" ("The app's own plugins and parts", "Checking…",
  "Last check: <error>"). "Sources": each source, then "Add a source" ("Another GitHub repo with
  plugins").
- **A source**: "<repo> · <branch>" (when not main), its state ("Off", "Checking…", "Couldn't load:
  <why>", "N plugins · checked HH:MM", "Not checked yet") and " · Official" / " · Third party"; tap:
  check again; remove (not the official one: "Remove <repo>? Plugins you installed from it stay.");
  a switch (an off source offers nothing; what came from it stays).
- **Add a source**: "owner/repo or https://github.com/…" (a branch folder link names the branch);
  "Check and add": a bad name "Give a GitHub repo like owner/name", "That source is already here",
  no catalogue "No plugin catalogue there: <why>"; then asks "Add <repo> as a plugin source?" with
  the third-party warning ("This source isn't checked by PromptPipe. A plugin can read your chats
  and run code in the AI website pages you are logged in to. Only use sources you trust.") and "Add
  it"; "Added <repo>". Note: "The repo needs a plugin catalogue (index.json). The app checks this
  first."
- **Get plugins**: chips "All sources" and each source; an optional tag filter chip ("Providers only
  ✕"); each offer: name, "<type> · <version> · <note>", "From <repo> · Official/Third party (· same
  name installed)" or its install error, and "Get" ("…", then "Installed"); "Checking the sources…";
  "Couldn't load <repo>" ("<why> · tap to try again"); "Nothing new to get" ("Everything the sources
  offer is installed"); "Install from a file or link". The catalogue's default plugins are
  preselected.
- **An offer's page**: name, "<type> · version <v> · from <repo>", its note, the third-party warning,
  for a provider "Use a spare account" (the safety text), "Get it" ("Installing…").
- **Installing**: a plugin of the same name from elsewhere asks "<name> is already here (from <source>
  / built into the app / put there by you). Replace it with the one from <source>?" ("Replace"). The
  official catalogue must give its hash ("<name> has no hash in the official list"); the file must
  match it. A new plugin that can be a block goes into the active profile, on. Toasts: "Installed or
  updated N plugins", "Installed N of M; the others say why", "Nothing installed"; after Update all:
  "Updated N plugins. Restart the app to use them." "Check for updates" says "Checking for plugin
  updates…" then "N updates available: tap Update all" or "Everything is up to date". The sources are
  read when the app starts (unless updates are off) and when the Library opens.
- **Install a plugin**: "Pick a file…" ("A .zip or plugin.json"); a link ("GitHub folder,
  plugin.json or .zip"; empty: "Paste a link first"; a release bundle link installs the bundle);
  "Paste an AI's answer" ("Made with the Plugin guide"). Done: "Installed <id>" and its page; failed:
  "Install failed: <why>".
- **Paste an AI's answer**: each fenced block is the file named on the line before it (also "File:
  name", bold or code-marked names); the line under the box says "Paste the AI's whole answer. Each
  file needs its name on the line before its code block." / "Found: <files>" / "Found <files> but
  no plugin.json." / "No files found yet."; "Install" ("No plugin.json in that answer").
- **A plugin's page**: name, "<type> · version <v> (· <new> available)"; "It didn't load" (its
  error); the stale-copy note; "Update to <v>" ("<name> updated"); a provider: "Providers belong to
  chats" ("Pick it from the pill in the header. Profiles do not change the provider."); a block
  plugin: "On" ("A block of the profile “<name>”"); a theme: "Use this theme"; "Settings" ("This
  plugin's options") when it has visible settings; "Roll back to the previous version" ("Version
  <v>") or "Go forward to version <v>" ("Now on v<v>"); a built-in one: "Copy to edit" ("Into your
  plugin folder; your copy replaces this one"; not in safe mode); "About" (description and where it
  came from: "built in", "built in, updated with the app", "from <source>", "your copy (it replaces
  the built-in one)", "yours", "· advanced"; folded to a few lines, a tap unfolds); "Remove" for
  yours ("Remove <name>? The app's own v<v> comes back." when it is your copy; "Removed <name>"), or
  "Built in" ("Built-in plugins can't be removed. Take them out of a profile instead."). Gone: "This
  plugin isn't installed any more".
- **Plugin guide**: "How a plugin is built" (the guide), "Copy instructions for AI" ("Guide + a
  request template to paste into any AI": the request text, the guide, "First ask me what the plugin
  should do, then write it.", and how to answer (each file's name on the line before its block,
  always plugin.json, small, two sentences after); "Copied. Paste it into an AI and say what you
  want"; missing: "The guide wasn't found in the app"), "Install the result".
- An app version is compared as major.minor.patch then the alpha number (a release beats any alpha);
  a plugin needing a newer app is offered as "update needs app <v>" instead of updating.

### 1.43 The prompt library (UC26, UC27)

- "System prompts you keep. A profile links one as a block: change it here and every profile that
  links it sends the new text." A search box ("Search prompts", name and text) when there are more
  than 4. Each prompt: 📌 when pinned (pinned first), its name (or the start of its text), a
  snippet (90 characters, "…"). None: "No prompts yet." "Manage": "New system prompt", "Import
  prompts…" (".md or .txt files, or a library file"), "Export the whole library" (when not empty).
- **A prompt's page**: the snippet ("Tap to edit · every profile that links it changes"); "Linked
  by" (the profiles, or "No profile yet."); "Use": "Add to “<profile>”" ("As a linked block, before
  Your message" / "Already linked there; adds it once more"; "Linked in <profile>"), "Pin to the
  top" / "Unpin", "Copy the text", "Export as Markdown" (`<name>.md`), "Delete from the library"
  (asks; when profiles link it: "… N profiles link it: they keep the text as their own copy." and
  their blocks become own copies). Gone: "This prompt isn't in the library any more".
- **The editor** ("New system prompt" / "Edit prompt"): "Name (optional)", the text ("The prompt"),
  "Linked by <profiles>: they send the new text.", "Save" (empty: "Write something first"). What is
  typed survives redraws. New prompts go first.
- Every change is committed ("added", "edited", "pinned", "unpinned", "deleted <name>", "imported
  N").
- **Import**: .md / .txt files (the name from the file name, - and _ as spaces) or a library file
  (also the old app's System prompt plugin's file); not one: "<file> is not a prompt library file";
  empty texts skipped. A name clash follows the setting: replace, keep both ("Name (2)"), or ask "A
  prompt named “<name>” is already in the library. Replace it? (Cancel keeps both.)". Toast
  "Imported N new, replaced M" / "Nothing to import".
- **Export**: the whole library (each prompt's name, text and pin) as `prompt-library.json`.

### 1.44 Redraws keep what you are doing (R4, R5)

- The screen is drawn whole from the state and applied by changing only what differs. Elements
  still wanted stay the same elements, so typing (with the keyboard's word in progress), a
  selection, the cursor, focus, scroll positions and opened folds survive any redraw.
- Rows are matched by a stable key (records by id); a list without keys may hand one row's scroll
  or fold to its neighbour, so every list that changes has keys.
- What you changed in a field (typed text, a ticked box, an opened fold) stays until the app asks
  for a different value; the field you are typing in is never written to while it has the focus
  (the app's value applies once you leave it).
- The live reply's text is updated in place by its own code, not by the redraw.
- Short-lived marks (a drag's, a highlight) survive redraws until their code removes them.

### 1.45 The look's values (UC34, UC47; the reference is `chat-ui/ui.css` and the screenshots)

- One column, at most 820 px wide, centred; 14 px text (line height 1.35), the system font; code
  12.5 px monospace; small text 12 px; section labels 11 px upper case with letter spacing.
- Every colour is a variable a theme can change. Dark: background #17181d, raised #20222a /
  #2a2c35, lines #2b2d35, text #ece9e4, muted #8f8b85, accent #f0a068, ok #5fcf8c, error #ff8f87,
  warning #e8b04b. Light: background #faf8f5, raised #efebe6 / #e5e0da, lines #ddd7d0, text
  #1d1b19, muted #6b645d, accent #c4521a, ok #1d7348, error #b8322a, warning #8a6100. Accents (dark /
  light): blue #8fa8ff / #3557c9, green #7fd1a3 / #1d7348, rose #f28bab / #b1365f, violet #b69cff /
  #6a45c9; each passes AA on its background.
- Rows: raised cards, radius 12, padding 11×12, a muted second line; switches 38×22; round icon
  buttons 34 px; the send button a 30 px accent circle (stop: text-coloured); the message box a
  raised bar with radius 22; your messages raised bubbles (radius 16, at most 80% wide, long ones
  folded to 6 lines with a fade); replies without a bubble.
- Sheets rise from the bottom (radius 22 at the top, 0.18 s, with a dim behind); the chats list
  slides from the left, at most 420 px wide; the provider's menu is a 250 px card under the header;
  dropdowns open in place (at most 176 px tall, scrolling).
- The provider's dot: ok green, busy accent (pulsing), off warning, none error.
- Toasts: a pill above the message box (an error one in the error colour, less round), stacked.
- Highlights (Find, a guide): an accent outline with a pulsing glow. Search matches: a soft warning
  background.
- Reduced motion turns every animation off.
