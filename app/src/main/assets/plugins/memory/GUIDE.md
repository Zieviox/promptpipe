# Memory

AI web chats forget, and a fresh chat knows nothing. Memory puts your pinned
facts and the earlier conversation in front of each message, so the AI always
has the context. It works across Sub-chats: a new site chat gets everything
from before it.

## Set up

Turn **Memory** on in the profile. Tap ⚙ for the settings and ☰ for this
chat's summaries and the summary chat's system prompts.

For summaries, set **Settings › Site pages at once** to 2 or more: a summary
is made in its own chat on a second site page while your message holds the
first. With 1 page, Memory clips older messages instead and says so in the
trace.

## What gets sent

1. **Pinned facts** (always, never cut).
2. **The earlier conversation.** Under the max (⚙ *Max characters*) it all
   goes in word for word.
3. **Over the max:** the most recent messages (⚙ *Recent turns*) stay word for
   word, older ones go in as summaries, the oldest at the coarsest level.

Tap *Trace* under a message to see what Memory did, e.g. "messages 1-40 as
summaries (4 at level 1), 6 in full".

## Levels of detail

Summaries are made in fixed parts, so each one is made once and never redone:

| Level | Summarises | With the default part size of 10 |
| --- | --- | --- |
| 0 | the chat itself | every message |
| 1 | parts of messages | messages 1-10, 11-20, ... |
| 2 | parts of level 1 | messages 1-100, 101-200, ... |
| 3+ | the same again | only in very long chats |

When the memory gets too big, level 1 replaces the oldest messages first.
When even that is too big, level 2 replaces the oldest level-1 parts, and so
on.

Summaries are made in the background after a reply, a few messages before the
max is reached (⚙ *Start summarising this many messages before the max*), so
your sends don't wait. If some are still missing at the max, at most 2 are
made while you wait and the rest in the background.

## The files

Each level is a Markdown file next to the chat, in a hidden folder:

```
history/.memory/<folder>/<chat name>/lod1.md
history/.memory/<folder>/<chat name>/lod2.md
```

They move and get deleted with their chat, and git keeps every version. You
can read and edit them in any editor. Keep the `<!-- pp:lod ... -->` line
above each part. ☰ → *View* shows them in the app, and *Forget them* clears
them, to be made again when needed.

Summaries from Memory 2.1 (`memory-summaries.json`) aren't used any more.
They are made again as parts when needed.

## Sub-chats

- **A new site chat always gets the memory,** even when ⚙ *Send memory every
  N messages* would skip it.
- **Names:** once a chat has used more than one site, the AI lines say which
  one answered (`Qwen: ...`, `Deepseek: ...`). Turn it off in ⚙.
- **What to send → Only what this site chat hasn't seen** leaves out the
  messages that already went to this site chat, since it has them. That saves
  a lot of room when you switch between sub-chats.

Memory notes which site chat each message went to in the chat file
(`"data": { "memory": { "url": "..." } }`), so this works even without
Sub-chats.

## Settings (⚙)

| Setting | What it does |
| --- | --- |
| Pinned facts | Always sent first. One fact per line. |
| Send memory every N messages | 1 = every message. New site chats always get it. |
| What to send | Everything, or only what this site chat hasn't seen. |
| Name the AI on each line | When the chat used more than one site. |
| Recent turns sent in full | Kept word for word once over the max. |
| Max characters of memory | Nothing is summarised below this. |
| Start summarising ... before the max | Background summaries ahead of time; 0 = only at the max. |
| Over the max | Summaries in parts, or just clip (no extra chat). |
| Messages per summary part | Size of a part at every level (default 10). |
| Summary request | The instruction sent with each part. |
| Run the profile's plugins on the summary request | For example Base64. |
| Characters kept of each older turn | Used when clipping. |
