# Reply Guard

Chat sites sometimes reload while they are answering, cut the reply off,
re-render it shorter, or hand back the answer to your *previous* message.
When you aren't logged in, a reload can wipe the site's chat altogether.
Reply Guard makes sure the reply you watched being written is the reply you
keep.

## What it does

1. **While the site writes**, the app shows the reply so far ("writing… N
   chars"). Reply Guard keeps the **longest** of those versions for each
   message, in the app and in a small store on this phone.
2. **When the reply is done**, it compares the page's final reply with the
   longest version seen. It steps in when the final reply is:
   - **empty**,
   - **clearly shorter** (⚙ *at least 20 characters missing* and *under 90 %*
     of the longest seen), or
   - **the previous reply again** (the wrong message was read).
3. It then keeps the longer version as the reply, saved in the chat file. A
   line under the message says so, with **Use the page's version** to switch
   back (and **Use the longer version** to switch again).
4. **If the send fails halfway** (the page reloaded, the app lost the page),
   the message goes to the chat's failed list as usual, but what was written
   so far is kept: ⋯ → **Reply Guard: saved replies** → *Add to the open chat*
   or *Copy*.
5. Thinking the page no longer shows at the end is kept as well.

## Set up

Turn **Guard** on in the profile (Plugins, or the stack next to the message
box; installing it from a file or link turns it on for you). Put its row
**first** among the steps in ⋯ → Pipeline if you use steps that change the
reply (Base64 ...), so they work on the kept version. Anywhere else still
works: when Reply Guard keeps the longer version, the reply starts again from
that version.

## Lock a reply

Message menu → **Lock / unlock this reply**. A locked reply can't be replaced
by a shorter one (by another plugin's message action, for example): Reply
Guard puts the locked text back.

## Settings (⚙)

- **When the page's reply is shorter**: keep the longer one (default), or keep
  the page's and only offer the longer one.
- **Characters missing / %**: how much shorter counts as cut off. The final
  reply is read as Markdown and the one seen while writing as plain text, so
  they never match exactly; the defaults leave room for that.
- **Catch a reply that is the previous reply again**: on by default. With no
  other version seen, the message is only marked, so you know to look.
- **Saved replies to keep**: how many recent replies stay in ⋯ → Reply Guard.

## Good to know

- The version seen while writing is plain text: if Reply Guard has to use it,
  bold, headings and tables may be lost, but every word is there.
- A site plugin whose own script doesn't report the reply while it writes
  gives Reply Guard nothing to compare. It can still catch a repeated reply.
- Saved replies stay on this phone only (the app's browser storage). Your
  chats themselves are in `/sdcard/PromptPipe/history/` as always.
