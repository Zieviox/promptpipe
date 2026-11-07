# promptpipe quick start

promptpipe is a chat app on top of the free AI web chats you already use. You
log in to the site once inside the app; promptpipe types your messages there,
reads the replies, runs them through your plugins and keeps every chat as a
Markdown file on your phone. Nothing leaves your phone except what the site
itself receives.

## 1. First start

1. Allow notifications (the app keeps running in the background with one).
2. Tap **Grant file access** when asked, so chats and plugins live in
   `/sdcard/PromptPipe/`.
3. Install a site plugin: ⋯ → **Plugins** → **Install from a file** (a `.zip`)
   or paste its link → **Install**. promptpipe ships without site plugins.
4. Tap the site name in the header (green dot) and log in on the site once.
   **← Chat** brings you back.

## 2. Chatting

- Type, tap **↑**. The reply comes back decoded by your plugins.
- **Thought for Ns** above a reply: tap to see the model's thinking.
- Swipe a reply **right** to quote it, **left** to copy it.
- Tap a code block's **Copy** to copy just the code.
- Long-press any text to select it, or open a reply's options › **Select text** for a box where picking a part is easy.
- Your last message: options › **Edit & resend**.
- **⤢** makes the message box big for long text.
- If a send looks failed: **Check** keeps the reply the site is giving anyway,
  **Retry** sends again, **Edit** puts it back in the box.
- **Stop waiting** next to a reply that's coming gives up on it (no time limit otherwise).
- Send more while a reply is coming: they **queue** under the chat and go out
  in order. Queued messages can be moved up, edited or removed.
- Replies never scroll the chat for you. A new one shows as **↓ 1 new** above
  the message box; tap it to jump to the start of that reply.
- **System prompts**: the ☰ on the System prompt switch opens your library.
  Save prompts, **Pin** favourites, **Use** them to stack several (sent in
  order, move with ↑ ↓). The stack is per profile; the library is
  `system-prompts.json` in your history folder.

## 3. Chats

- **☰** opens your chats: pinned first, then by day, then folders.
  Long-press a chat to pin, move or delete it.
- **On <site>** → **Refresh** lists the chats in the site's sidebar; tap one,
  or paste a chat link → **Open**, to continue it here.
- **Import its earlier messages** copies an existing site chat into the app.
- ⋯ → **Add the page's newest reply to this chat** takes whatever the site shows.
- Search (🔍) finds text in every chat: `#tag`, `in:folder`, `"exact phrase"`,
  `is:you`, `is:ai`.

## 4. Tags

- Tap the chat title → add **chat tags**; every message in the chat gets them.
- Per message: **⋯** under it → add tags there.
- A tag ending in `#` counts up by itself: `part#` becomes `part1`, `part2`, …

## 5. Profiles, models and plugins

- The profile name in the header (e.g. **Base64**) opens **Profiles**: each one
  picks a site and which plugins run, with their settings.
- The model name opens the **Model** sheet: pick the model and switches
  (Thinking, Search). If the app can't read the list, **Choose on the site**.
- **Plugins**: switch them on per profile, change their order, open their
  settings (⚙ on a block under the message box).

## Advanced

### Git history and backup
Every change is a git commit in `/sdcard/PromptPipe/history/`. Settings →
**Advanced** → add a GitHub repo URL and token to push/pull (auto-push optional).
The chat info sheet (tap the title) shows a chat's history.

### Local API for other apps
While promptpipe runs, apps on this phone can use it like an OpenAI API:

- Base URL `http://127.0.0.1:7790/v1`, model = a profile name,
  API key = the token from Settings → Advanced (always required).
- Each request is one new chat on the site. Add `"chat": "<path>.md"` to
  continue a saved chat instead (only the last message is sent).
- Every reply says under `"promptpipe"` which chat it went to and what was sent.

Termux test:

    curl -s http://127.0.0.1:7790/v1/chat/completions -H "Authorization: Bearer $TOKEN" \
      -d '{"model":"Base64","messages":[{"role":"user","content":"hi"}]}'

### Share into promptpipe
Share text from any app (or select text → **Send to promptpipe**) to start a
new chat with it.

### Look
Settings → **Look**: UI scale, Enter sends, themes (themes are plugins too).

### Waiting for replies
Settings → **Waiting for replies**: optional limits in minutes; 0 = none.

### Chats in parallel
Settings → **Site pages at once** (1 to 4). Each page is its own copy of the
site, so that many chats get answered at the same time: yours, plugins'
(`PP.ask`) and other apps' (local API). Anything more waits its turn. All
pages share the login. In the site view, **Page 1/2** switches between them;
Check and "Add the page's newest reply" use the page on screen. More pages use
more memory, and many messages at once can look like a bot to the site.

### Writing your own plugins
Settings › Plugins › Library › **Plugin guide** (copy the instructions for an AI, then install its answer), or `docs/PLUGINS.md` in the repo.
A plugin is a folder with `plugin.json` (+ `main.js`); site plugins are mostly
CSS selectors. When a site changes, the Page report plugin shows what to fix.
The app itself is plugins too: Settings › App parts lists them, with **Copy**
to change one and **Restart in safe mode** if one of yours breaks.

### Plugin updates
Settings › **Plugins** (top right: **Update all**) gets the latest plugins without
a new APK. A dot marks a plugin with an update; the app checks once a day. Each
plugin has its own page with **Update**, **Roll back** and **Remove**. Library
sources: the official one is always there; add others by their GitHub link.
If the download fails, use Settings › App parts › **Download the zip** and
**Install the zip**. Restart the app after an app update.

### Keyboard (optional)
Ctrl+Enter send · Ctrl+K commands · Ctrl+B chats · Ctrl+F search · Ctrl+M model ·
Ctrl+E big box · Ctrl+/ thinking · Ctrl+? all shortcuts · Alt+S site page.
Everything also has a button.

### Blank page?
The app reloads a page Android stopped. If something still looks stuck: the
**Reload** button over the site page, or close and reopen the app.
