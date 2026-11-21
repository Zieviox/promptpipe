# 9. Build notes (stage 9)

One note per layer as it's built on the `rewrite` branch (both repositories), with its size
against the budget, its checks, and where it differs from the function list.

## The application layer (runtime plugins), 2026-11-21

In `promptpipe-plugins`, branch `rewrite`: `runtime-records`, `runtime-chats`,
`runtime-profiles`, `runtime-send`, `runtime-plugins`, `runtime-storage`, and `test/` (Node's
test runner with stand-in calls: `npm test`).

**Checks**: 26 tests pass without a phone; terms-check 0; every line within 100 characters
(Prettier 3.3.3, run from a temporary download, nothing added to the project).

**Size**: 1,340 lines against a budget of 700 (see `8-functions.md`, "Measured in the build").

**Re-estimate** (decided 2026-11-21: from real numbers): the application came out at 1.9 times its
budget. If the other layers overrun the same way, the app is about 6,700 lines; adapters are
thinner than deciding code, so the expected range is **5,000–6,000** lines, every feature kept,
against today's 9,226. Each layer's note updates this.

**Where it differs from the function list** (each also written into the design files):

- Flat records: every collection is one list and a child names its parent (`3-terms.md`).
- `value_get` became small getters (`setting_get`, `provider_get`, `profile_get`, `model_get`,
  `options_get`, `block_on_get`, `plugin_setting_get`): one per question, simpler to read.
- `record_apply` applies an operation to the State as it is now, saves what it touched and
  commits it (D2), so saving and committing happen in one place.
- Tags: `chat_tag_build`, `turn_tag_build`, `turn_tags_build` (pure) instead of `tag_add` and
  `tag_remove` (records do the rest).
- `query_parse` lives in `runtime-chats` and the screen uses it too (it was listed twice).
- `chat_load` (a chat's turns into the State once), `chat_files_build` (a chat's files for
  saving), `chat_file_build` (a safe, unique file name) were missing from the list.
- The chats folder's place is the setting `storage.chats_folder`; copying a folder is `file_move`
  with `copy` (`4-ports.md`).
- Counter tags' numbers are saved as `counters.json` with the chats (the State's `counters`).
- The State counts the pages being opened (`opening`), so two sends can't both open the last page.
- A side request's answer is what `message_send` returns; nothing else carries it.
- `plugin_write` also goes back to the previous copy (`previous`) and writes your copy of a
  built-in plugin (`copy: "yours"`) (`4-ports.md`).

**Carried over as content, not code** (X6): the eight template texts, word for word, as Markdown
files in `runtime-profiles/templates/`.

**Libraries**: fflate 0.8.3 in `runtime-plugins/vendor/` (with its licence), not counted.

**Next layer**: the core (Odin), compile-checked here with the dev-2026-11 compiler.
