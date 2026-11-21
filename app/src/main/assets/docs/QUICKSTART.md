# promptpipe quick start

promptpipe is a chat app on top of the AI web chats you already use. You log in to the site once
inside the app; promptpipe types your messages there, reads the replies, runs them through your
plugins, and keeps every chat as a Markdown file on your phone, with its history in git. Nothing
leaves your phone except what the site itself receives.

## 1. First start

1. Allow notifications: the app keeps running in the background with one.
2. Allow all files access when asked (Settings › Chats and storage), so your chats live in
   `Documents/PromptPipe`, where other apps can see them. Without it they stay in the app's own
   folder.
3. Tap the provider's name at the top (DeepSeek, Qwen, …) and **Open its site**. Log in once;
   **‹** brings you back. The dot beside the name is green when the site's chat box shows.
4. If you used the old app, its chats, profiles, prompt library and settings come in by
   themselves on the first start, after its folders are backed up into `.promptpipe/backups/`.

## 2. Chatting

- Type and tap **↑** (or Ctrl+Enter). The reply comes back through your plugins.
- **Thought for Ns** above a reply: tap it to see the thinking.
- Swipe a reply **right** to quote it, **left** to copy it. A code block has its own **Copy**.
- **↑** in an empty message box puts your last message back to edit and send again.
- **⤢** makes the message box big for long text.
- Send more while a reply is coming: the messages **queue** under the chat and go out in order;
  each can be moved up, edited or removed.
- A failed send says why: **Check** keeps the reply the site is giving anyway, **Retry** sends
  again, **Edit** puts it back in the box, and for a site problem **Open the site** or **Copy page
  report**.
- **■** stops waiting for a reply.
- A reply that finishes while you've scrolled up shows **↓ 1 new**; the chat doesn't jump.

## 3. Chats

- **☰** opens your chats: pinned first, then your folders and chats in your order. Drag the
  grips to reorder; **Select** to pin, move or delete several.
- Tap the chat's name at the top for its sheet: rename, tags, pin, move, copy or share the whole
  chat, its history, delete (it stays in the history).
- **On the site…** lists the site's own chats; tap one to continue it here. In the provider's
  sheet: **Link this chat to the open page**, **Import messages from the linked site chat**,
  **Add the page's newest reply**.
- **⌕** (Ctrl+K) finds chats, messages and every function by name. In messages: `"exact
  phrase"`, `#tag`, `in:folder`, `is:you`.

## 4. Tags

- A chat's tags (its sheet, or Ctrl+T) go on every new message in it.
- One message's tag: **⋯** under the reply › **Tag this message**.
- A tag ending in `#` counts: `part#` becomes `part#1`, `part#2`, … (within each chat, or across
  all chats: Settings › Chats).

## 5. Profiles, models and plugins

- A **profile** is a list of blocks sent top to bottom: System prompts, plugins, and your
  message. **≡** beside the message box (**Quick edit**) turns this chat's blocks on or off and
  adds text files or attachments; **Edit profile** changes the profile itself.
- The **Prompt library** (Settings) keeps System prompts; a block that links one sends the
  library's text, so one edit changes every profile that links it.
- **Model and options** (the provider's sheet, or Ctrl+M): the site's models and options
  (Thinking, Search), saved for the provider and set on the page before each message.
- **Plugins** (Settings, Ctrl+Shift+P): what's installed, the catalogue, and installing from a
  link, a zip or an AI's answer.

## Advanced

### Git history and backup

Every change is a commit in your chats folder. Settings › Git: your name and email and a remote
(e.g. a private GitHub repository); in Settings › Credentials, add its token named `git token`
for the host `github.com`. Then **Push now**, or turn on automatic pushes.

### The local API for other apps

While promptpipe runs, apps on this phone (and pages in its browser) can use it like an OpenAI
API: base URL `http://127.0.0.1:7790/v1`, model = a profile's name, API key = the token in
Settings › Local API (always required). Each request is a new chat, or add `"chat": "<chat id>"`
to continue one. Replies stream; the answer says which chat it went to.

### Safe mode

If a plugin of yours stops the app from starting, it opens in **safe mode** with only the
built-in plugins, and says which one failed. Settings › Advanced leaves it.

### Keys

Ctrl+N new chat · Ctrl+B chats · Alt+↑/↓ previous/next chat · Alt+S the AI page · Ctrl+K find ·
Ctrl+M model · F2 chat details · Ctrl+T chat tag · Ctrl+/ fold thinking · Ctrl+E bigger box ·
Ctrl+P next profile · Ctrl+, settings · Ctrl+= / Ctrl+- / Ctrl+0 UI size · Ctrl+? all of them ·
Escape or Back closes what's on top.
