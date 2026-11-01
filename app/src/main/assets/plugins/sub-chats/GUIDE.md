# Sub-chats

Start a new chat on the AI site **inside** the chat you're in, on any profile:
another site, another model, or just a fresh chat when the old one got long.
Your promptpipe chat stays one conversation. A divider marks where each
sub-chat starts, and Memory sends the new site chat everything before it.

## Set up

1. Plugins → turn **Sub-chats** on in every profile you'll use it with.
2. Turn **Memory** on too (in those profiles), or the new site chat starts
   with no idea what came before.

## Use it

- **Start a sub-chat:** tap *New sub-chat here* under any reply, the ☰ on the
  Sub-chats pill, or ⋯ → *Sub-chats*. Pick a profile. A note under the last
  message says what your next message will do; *Cancel* takes it back.
- **Send as usual.** The next message opens a fresh chat on that profile's
  site. Later messages stay in that sub-chat.
- **Go back:** tap a divider (or the ☰), then *Continue there* next to an older
  sub-chat. *Open* shows that site chat in the browser.
- **Switch profile at the top:** the next message goes through the new
  profile. Same site: it stays in the same site chat. Another site: a new
  sub-chat starts by itself.

## What's saved

Every message keeps a small note in the chat file (its `pp:turn` line):

```json
"data": { "sub-chats": { "seg": 1, "url": "https://chat.deepseek.com/a/chat/s/…", "profile": "DeepSeek", "active": "Qwen" } }
```

`seg` is the sub-chat, `url` the site chat it went to, `profile` the profile
it went through, and `active` the profile that was picked at the top when you
sent it. Nothing else is stored; the dividers and the list are worked out from
these notes. Chats from before Sub-chats count as one sub-chat.

## Good to know

- Sub-chats only steers messages while it's on in the profile picked at the
  top. A message sent through a profile where it's off still lands in the
  current sub-chat.
- System prompt's "only with the first message" means the first message of
  the whole chat, not of each sub-chat. Use Memory's pinned facts for things
  every site chat must know.
- With Memory set to *Only what this site chat hasn't seen*, a sub-chat gets
  the messages from the other sub-chats, not its own (the site already has
  those).

## For plugin writers

Sub-chats uses the app's `route`, `afterReply` (`ctx.url`, `ctx.setTurnData`)
and `renderTurn` hooks; see the plugin guide. It also sets
`PP.subChats = { segments, segIndex, siteLabel, sameUrl }`:
`PP.subChats.segments(chat)` returns
`[{ seg, from, to, count, url, profile, at }]`.
