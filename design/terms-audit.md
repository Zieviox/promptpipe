# Stray terms in the code (audit, 2026-11-24)

Names in both repos (`promptpipe` and `promptpipe-plugins`, branch `rewrite`) that aren't agreed
in `3-terms.md`: a verb outside the closed list, a noun nobody decided, a saved field or setting
key missing from the records, an event outside the seven. Many came in during the phone fixes of
the last sessions without being checked against the lists (Claude's, not a design decision).

Allowed and not listed: hooks named by their place (`send_before`, `reply_after`, `block_text`,
`chat_route`, `turn_render`), the seven events, adapter words inside their adapter (`session` in
the Kotlin GeckoView code, `html` = htm), and small helpers inside one function.

Nothing is renamed until the words are decided. Each rename then goes through `terms-check.py`,
which gets the retired names so they can't come back.

## 1. Verbs outside the closed list

The closed list is in `3-terms.md` (Verbs). Proposed replacements use only listed verbs; where no
listed verb fits, the question is whether to add one.

| Stray verb | Where (examples) | Proposed | Note |
|---|---|---|---|
| `check` | `attachments_check`, `turn_check`, `record_check`, `response_check` | `validate` (attachments, record, response); `compare` (turn against the site) | `check` is named in the list as *not used* ("validate or verify") |
| `put` | `changes_put`, `files_put`, `folder_put`, `list_put`, `path_put` | `set` (data), `add` (files into the site's upload input) | |
| `of` | `path_of`, `kind_of`, `chat_of`, `key_of`, `provider_of`, `update_of` | `get` | |
| `show` | `version_show`, `popup_show`, `reply_show` | `set` (version), `open` (popup) | `show` is named as *not used* (open/close) |
| `toggle` | `fold_toggle`, `select_toggle`, `site_view_toggle` | `set` | `toggle` is a noun in the list (a block's on/off) |
| `make` | `folder_make` (core), `part_make`, `summaries_make` (Memory) | `create` (folder), `build` (summaries) | `make` is named as *not used* |
| `ask` | `chats_delete_ask`, `send_dismiss_ask`, `summary_ask` | `dialog_open` with the action; Memory's `summary_send` | or add `ask` (open a question) |
| `try` | `apply_try`, `call_try` | add? They run a change or a call and toast its failure | decide: a listed verb, or a rule for wrappers |
| `undo` / `redo` | `record_undo`, `record_redo`, `turn_redo` | add `undo` / `redo` to the list | no listed verb fits |
| `pause` | `queue_pause` | add `pause` / `resume`, or `waiting_stop` / `waiting_start` | `queue` isn't agreed either (see 2) |
| `now`, `dismiss` | `send_now`, `send_dismiss` | `send_start` (send a waiting one now), `send_remove` | |
| `type` | `draft_type` | `draft_set` (with its quiet flag) | |
| `sync`, `watch`, `size` | `box_sync`, `box_watch`, `box_size` | `box_set`, `box_on` (width changes), `box_size_set` | `box` isn't agreed either |
| `search` | `find_search` | `find_run` | |
| `attach` | `files_attach` | `attachment_add` | the agreed verb for this |
| `same` | `url_same`, `words_same` | `compare` | |
| `shown` | `turns_shown`, `page_shown` | `turns_shown_get` → `path_get` (the versions shown) | |
| `words`, `svg`, `ref` | `error_words`, `icon_svg`, `focus_ref`, `sortable_ref` | `error_text_get`, `icon_render`; refs: a rule for Preact ref callbacks | |
| `pick`, `link`, `fill` | `profile_pick`, `chat_link`, `order_fill` | `profile_set`, `chat_link_set`, `order_build` | |
| `serve` | `asset_serve`, `file_serve` (core) | `send` | |
| `listen`, `forward`, `wake`, `hand` | Kotlin: `session_listen`, `call_forward`, `sessions_wake`, `scripts_hand` | `on`, `send`, `start`, `send` | |

The `PP` surface (what plugins call, so public): 33 of 175 functions end in an unlisted verb.
`runtime-screen`: apply_try, box_size, box_sync, box_side_width, call_try, chat_link,
chats_delete_ask, draft_type, error_words, files_attach, find_search, focus_ref, icon_svg,
order_fill, profile_pick, sortable_ref, toast. `runtime-send`: attachments_check, queue_pause,
send_dismiss, send_now, turn_check, turn_redo. `runtime-records`: changes_put, record_redo,
record_undo. `runtime-chats`: path_of, turns_shown, turns_tree, url_same, version_show.

## 2. Nouns nobody decided

| Stray noun | Where | Means | Proposed |
|---|---|---|---|
| `version` (for a turn) | `versions_get`, `version_show`, screen "‹ 2/2 ›" | another take on a message | **conflict**: `3-terms.md` reserves `version` for SemVer. Code: `branch`; screen: glossary row 10 |
| `parent` | `Turn.parent`, `Send.parent` | the turn a version hangs from | add to `Turn` (branches) |
| `queue` | `queue_pause`, `queue_run`, `queue_bar_render` | the waiting sends | `waiting` (the agreed `Send.status`) |
| `hold`, `held` | `hold_get`, `hold_set`, `Send.held` | why waiting sends don't go | decide a word (`hold`?) and add it |
| `outbox` | `outbox.json`, `outbox_load`, `outbox_save` | sends kept until saved | decide: `outbox`, or `sends` (the record's name) |
| `raw` | `raw_get`, `raw_set`, `Chat.own.raw` | the profile off for a chat | decide: `raw` or `profile_off` |
| `site_ref` | `Turn.site_ref`, `site_ref_get`, `ref_find` | the reply's element id on the site | add to `Turn` |
| `box` | `box_size`, `box_sync`, `box_text`, `.boxscroll` | the message box | add `box` (the message box) to the screen's parts |
| `keyboard`, `selection_ordered` | `keyboard_set`, `Keyboard.kt` | how a selection reaches the keyboard | add `keyboard` (platform) |
| `snapshot`, `pool`, `answer`, `draft` | `snapshot_take`, `pool_add`, `answer_parse`, `draft_get` | what was on the page before; the pages in use; an AI's answer of files; the box's text | `draft` is agreed (`drafts`); the others: add or rename |

## 3. Saved fields and setting keys not in the records

- **`Turn`**: `parent`, `site_ref`.
- **`Send`**: `held`, `force`, `regenerate`, `plain`, `progress`, `updates_got`, `thinking_at`,
  `writing_at` (`replaces`, `turn`, `status` are agreed).
- **Setting keys**: `look.theme`, `look.text`, `look.quick_actions`, `look.selection_ordered`,
  `updates.checked`, `help.seen`, `screen.plugin`. And the `look` group itself was never agreed
  (glossary row 29).
- **Setting sections** in `schemas.json`: "Chats" and "Plugins" sections exist, but no screen shows
  them (Provider for new chats, Active profile, Counting tags count, Check for plugin updates,
  Also download the release's plugin bundle are unreachable). A bug either way.

## 4. Events outside the seven

- `send_failed` (runtime-send to the screen, with the message and error). Either one of the
  `_changed` events with a status (the rule: "a record's changes are one `_changed` event with a
  status field") or added to the list.

## To decide

1. Verbs to **add** to the closed list (`undo`, `redo`, `pause`/`resume`, `ask`?), and a rule for
   wrappers (`apply_try`, `call_try`) and Preact refs (`focus_ref`).
2. The nouns in part 2: each kept and added to `3-terms.md`, or renamed.
3. `version` vs `branch` for a message's versions (code), with glossary row 10 (screen).
4. Then the renames, both repos at once, with `terms-check.py` extended, the tests passing, and the
   plugin guide (`PLUGINS.md`) updated for the `PP` names that change.
