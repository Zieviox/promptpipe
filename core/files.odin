package ppcore

// Files under named roots (app, chats, built_in, device) with one path check, and the change
// check (D7): every write, move and delete compares the file with the revision the app last wrote
// (its SHA-256) and answers an outside change instead of overwriting it. Writes go to a temporary
// file first, then rename (D4). core:os is used as it is.

import "core:crypto/hash"
import "core:encoding/base64"
import "core:io"
import "core:encoding/hex"
import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:slice"
import "core:strings"
import "core:sync"
import "core:time"

LOG_MAX :: 64_000

revisions: map[string]string // full path → SHA-256 in hex, what the app last wrote
revisions_mu: sync.Mutex

// ---------- paths ----------

join :: proc(parts: ..string) -> string {
	return strings.join(parts, "/")
}

// The chats folder in use and the default one, for the app (the core owns the default).
chats_folder_get :: proc() -> (string, Error) {
	return fmt.tprintf(
		`{{"folder":%s,"default":%s}}`,
		quote(chats_dir()),
		quote(join(S.app_dir, "chats")),
	), {}
}

// The chats folder: the setting `storage.chats_folder` in config.json, else <app>/chats.
chats_dir :: proc() -> string {
	data, err := os.read_entire_file(join(S.app_dir, "config.json"), context.allocator)
	if err == nil {
		if config, ok := object_parse(data); ok {
			folder := text_get(object_get(config, "settings"), "storage.chats_folder")
			if folder != "" {
				return folder
			}
		}
	}
	return join(S.app_dir, "chats")
}

// A path inside its root: no "..", no empty parts, no backslashes; device paths are absolute.
path_verify :: proc(root, path: string) -> (full: string, err: Error) {
	bad := strings.contains(path, "\\") || strings.contains(path, "//") || slice.contains(
		strings.split(path, "/"),
		"..",
	)
	if bad do return "", {"invalid_argument", fmt.tprintf("bad path: %s", path)}
	switch root {
	case "app":      return path == "" ? S.app_dir : join(S.app_dir, path), {}
	case "chats":    return path == "" ? chats_dir() : join(chats_dir(), path), {}
	case "built_in": return join(S.assets_dir, "plugins", path), {}
	case "device":
		if !strings.has_prefix(path, "/") {
			return "", {"invalid_argument", "a phone path starts with /"}
		}
		return path, {}
	}
	return "", {"invalid_argument", fmt.tprintf("no root %q", root)}
}

// Make a folder and the ones missing above it, one at a time: Android refuses to open /data or
// /storage, so walk up to the first folder that exists (a stat is allowed) instead.
folder_make :: proc(path: string) {
	if path == "" || os.is_dir(path) do return
	folder_make(path[:max(0, strings.last_index_byte(path, '/'))])
	os.make_directory(path)
}

// ---------- revisions (D7) ----------

revision_get :: proc(data: []byte) -> string {
	return string(hex.encode(hash.hash_bytes(.SHA256, data)))
}

revisions_load :: proc() {
	data, err := os.read_entire_file(join(S.private_dir, "revisions.json"), heap())
	if err != nil do return
	value, _ := json.parse(data, allocator = heap())
	for path, rev in value.(json.Object) or_else nil {
		revisions[path] = string(rev.(json.String) or_else "")
	}
}

revision_set :: proc(full, rev: string) {
	sync.guard(&revisions_mu)
	if old, ok := revisions[full]; ok do delete(old, heap())
	if rev == "" do delete_key(&revisions, full)
	else do revisions[strings.clone(full, heap())] = strings.clone(rev, heap())
	b := strings.builder_make()
	strings.write_byte(&b, '{')
	i := 0
	for path, r in revisions {
		fmt.sbprintf(&b, "%s%s:%s", i > 0 ? "," : "", quote(path), quote(r))
		i += 1
	}
	strings.write_byte(&b, '}')
	text_write(join(S.private_dir, "revisions.json"), transmute([]byte)strings.to_string(b))
}

revision_recorded :: proc(full: string) -> string {
	sync.guard(&revisions_mu)
	return revisions[full] or_else ""
}

// ---------- the calls ----------

// To a temporary file, then rename over the old one (D4).
text_write :: proc(full: string, data: []byte) -> os.Error {
	folder_make(full[:max(0, strings.last_index_byte(full, '/'))])
	temp := fmt.tprintf("%s.writing", full)
	os.write_entire_file(temp, data) or_return
	return os.rename(temp, full)
}

data_format :: proc(data: []byte, encoding: string) -> string {
	return quote(encoding == "base64" ? base64.encode(data) : string(data))
}

// One file by path, or every file matching a pattern: "*" stands for any characters within one path
// part ("chats/*/meta.json", "chats/abc/*.json"), never a "/".
file_read :: proc(d: Object) -> (string, Error) {
	root, encoding := text_get(d, "root"), text_get(d, "encoding")
	pattern := text_get(d, "pattern", text_get(d, "path"))
	paths := strings.contains(pattern, "*") ? pattern_expand(root, pattern) : []string{pattern}
	b := strings.builder_make()
	strings.write_byte(&b, '[')
	n := 0
	for path in paths {
		full, perr := path_verify(root, path)
		if perr.code != "" do return "", perr
		data, err := os.read_entire_file(full, context.allocator)
		if err != nil do continue
		rev := revision_get(data)
		changed := revision_recorded(full) != "" && revision_recorded(full) != rev
		fmt.sbprintf(
			&b,
			`%s{{"path":%s,"data":%s,"revision":%s,"changed":%v}}`,
			n > 0 ? "," : "",
			quote(path),
			data_format(data, encoding),
			quote(rev),
			changed,
		)
		n += 1
	}
	strings.write_byte(&b, ']')
	return strings.to_string(b), {}
}

// Whether a name matches one pattern part, "*" standing for any characters ("*.json", "lod*.md").
part_match :: proc(part, name: string) -> bool {
	pieces := strings.split(part, "*", context.temp_allocator)
	if !strings.has_prefix(name, pieces[0]) do return false
	at := len(pieces[0])
	for piece, i in pieces[1:] {
		if i == len(pieces) - 2 {
			return len(name) - at >= len(piece) && strings.has_suffix(name, piece)
		}
		found := strings.index(name[at:], piece)
		if found < 0 do return false
		at += found + len(piece)
	}
	return at == len(name)
}

pattern_expand :: proc(root, pattern: string) -> []string {
	found: [dynamic]string
	append(&found, "")
	for part in strings.split(pattern, "/") {
		next: [dynamic]string
		for base in found {
			if !strings.contains(part, "*") {
				append(&next, base == "" ? part : join(base, part))
				continue
			}
			full, _ := path_verify(root, base)
			entries, _ := os.read_all_directory_by_path(full, context.allocator)
			for e in entries do if part_match(part, e.name) {
				append(&next, base == "" ? e.name : join(base, e.name))
			}
		}
		found = next
	}
	return found[:]
}

// An outside change: the file isn't what the app expects (D7).
change_format :: proc(path, ours, theirs: string) -> string {
	return fmt.tprintf(
		`{{"outside_change":{{"path":%s,"ours":%s,"theirs":%s}}}}`,
		quote(path),
		quote(ours),
		quote(theirs),
	)
}

file_write :: proc(d: Object) -> (string, Error) {
	root, path, expected := text_get(d, "root"), text_get(d, "path"), text_get(d, "expected")
	full, perr := path_verify(root, path)
	if perr.code != "" do return "", perr
	if root == "device" && !strings.has_suffix(path, "/.nomedia") {
		return "", {"permission_denied", "only a .nomedia marker can be written there"}
	}
	if root == "built_in" {
		return "", {"permission_denied", "the app's own files can't be changed"}
	}
	old, read_err := os.read_entire_file(full, context.allocator)
	if read_err == nil {
		theirs := revision_get(old)
		check := expected != "" ? expected : revision_recorded(full)
		if expected == "none" || (check != "" && check != theirs) {
			return change_format(path, check, theirs), {}
		}
	}
	text := text_get(d, "data")
	data := transmute([]byte)text
	if text_get(d, "encoding") == "base64" do data, _ = base64.decode(text)
	if err := text_write(full, data); err != nil {
		return "", {"permission_denied", fmt.tprintf("could not write %s (%v)", path, err)}
	}
	rev := revision_get(data)
	revision_set(full, rev)
	return fmt.tprintf(`{{"revision":%s}}`, quote(rev)), {}
}

// Move a file or folder; with `copy`, copy it instead, and with `overwrite` off, only what isn't
// there yet (a copy says how many chats it copied).
file_move :: proc(d: Object) -> (string, Error) {
	root, from_path := text_get(d, "root"), text_get(d, "from")
	from, from_err := path_verify(root, from_path)
	if from_err.code != "" do return "", from_err
	to, to_err := path_verify(text_get(d, "to_root", root), text_get(d, "to"))
	if to_err.code != "" do return "", to_err
	if flag_get(d, "copy") {
		// A copy into its own folder would copy itself again at every level (the old app's
		// chats folder chooser did this, 2026-11-07).
		if to == from || strings.has_prefix(to, strings.concatenate({from, "/"}, context.temp_allocator)) {
			return "", {"invalid_argument", "a folder can't be copied into itself"}
		}
		copied := tree_copy(from, to, flag_get(d, "overwrite"))
		return fmt.tprintf(`{{"copied":%d}}`, copied), {}
	}
	if root == "device" || root == "built_in" {
		return "", {"permission_denied", "files there are never moved"}
	}
	if data, err := os.read_entire_file(from, context.allocator); err == nil {
		expected := text_get(d, "expected", revision_recorded(from))
		if expected != "" && expected != revision_get(data) {
			return change_format(from_path, expected, revision_get(data)), {}
		}
	}
	if os.exists(to) {
		return "", {"already_exists", fmt.tprintf("%s already exists", text_get(d, "to"))}
	}
	folder_make(to[:max(0, strings.last_index_byte(to, '/'))])
	if err := os.rename(from, to); err != nil {
		return "", {"permission_denied", fmt.tprintf("could not move %s (%v)", from_path, err)}
	}
	revision_set(to, revision_recorded(from))
	revision_set(from, "")
	return `{"done":true}`, {}
}

// Folders deeper than this are left out: a backstop for a copy that reaches itself by another
// spelling of the same path (/sdcard and /storage/emulated/0).
COPY_DEPTH :: 64

tree_copy :: proc(from, to: string, overwrite: bool, depth := 0) -> int {
	if depth > COPY_DEPTH do return 0
	if !os.is_dir(from) {
		if !overwrite && os.exists(to) do return 0
		if !file_copy(from, to) do return 0
		return strings.has_suffix(to, ".md") ? 1 : 0
	}
	copied := 0
	entries, _ := os.read_all_directory_by_path(from, context.allocator)
	for e in entries {
		if join(from, e.name) == to do continue // the copy itself, met while copying
		copied += tree_copy(join(from, e.name), join(to, e.name), overwrite, depth + 1)
	}
	return copied
}

// One file copied in 1 MB chunks, so a large one (a git pack) is never in memory whole.
file_copy :: proc(from, to: string) -> bool {
	src, open_err := os.open(from)
	if open_err != nil do return false
	defer os.close(src)
	folder_make(to[:max(0, strings.last_index_byte(to, '/'))])
	dst, create_err := os.create(to)
	if create_err != nil do return false
	defer os.close(dst)
	chunk := make([]byte, 1024 * 1024, heap())
	defer delete(chunk, heap())
	for {
		n, read_err := os.read(src, chunk)
		if n > 0 {
			if _, write_err := os.write(dst, chunk[:n]); write_err != nil do return false
		}
		if read_err == io.Error.EOF || (read_err == nil && n == 0) do return true
		if read_err != nil do return false
	}
}

file_delete :: proc(d: Object) -> (string, Error) {
	root, path := text_get(d, "root"), text_get(d, "path")
	full, perr := path_verify(root, path)
	if perr.code != "" do return "", perr
	if root == "device" && !strings.has_suffix(path, "/PromptPipe") {
		return "", {"permission_denied", "only the old app's folders can be deleted there"}
	}
	if root == "built_in" {
		return "", {"permission_denied", "the app's own files can't be changed"}
	}
	if data, err := os.read_entire_file(full, context.allocator); err == nil {
		expected := text_get(d, "expected", revision_recorded(full))
		if expected != "" && expected != revision_get(data) {
			return change_format(path, expected, revision_get(data)), {}
		}
	}
	if err := os.remove_all(full); err != nil {
		return "", {"permission_denied", fmt.tprintf("could not delete %s (%v)", path, err)}
	}
	revision_set(full, "")
	return `{"done":true}`, {}
}

// A folder's entries, hidden ones left out unless asked for (`hidden`, for a whole backup).
file_list :: proc(d: Object) -> (string, Error) {
	full, perr := path_verify(text_get(d, "root"), text_get(d, "folder"))
	if perr.code != "" do return "", perr
	entries, err := os.read_all_directory_by_path(full, context.allocator)
	if err != nil {
		folder := text_get(d, "folder")
		return "", {"not_found", fmt.tprintf("%s is not a folder the app can open", folder)}
	}
	b := strings.builder_make()
	strings.write_byte(&b, '[')
	n := 0
	hidden := flag_get(d, "hidden")
	for e in entries do if hidden || !strings.has_prefix(e.name, ".") {
		fmt.sbprintf(
			&b,
			`%s{{"name":%s,"folder":%v,"size":%d,"time":%d}}`,
			n > 0 ? "," : "",
			quote(e.name),
			e.type == .Directory,
			e.size,
			time.to_unix_seconds(e.modification_time),
		)
		n += 1
	}
	strings.write_byte(&b, ']')
	return strings.to_string(b), {}
}

// The turns that hold every word and phrase (in the chat's name, the message or the reply), read
// from each chat's turns.json (#212: no readable file is parsed).
file_find :: proc(d: Object) -> (string, Error) {
	wanted: [dynamic]string
	for key in ([]string{"words", "phrases"}) do for w in list_get(d, key) do append(
		&wanted,
		strings.to_lower(string(w.(json.String) or_else "")),
	)
	base := join(chats_dir(), ".promptpipe/chats")
	chats, _ := os.read_all_directory_by_path(base, context.allocator)
	b := strings.builder_make()
	strings.write_byte(&b, '[')
	n := 0
	for chat in chats {
		meta_data, _ := os.read_entire_file(join(base, chat.name, "meta.json"), context.allocator)
		meta, _ := object_parse(meta_data)
		turns_data, err := os.read_entire_file(
			join(base, chat.name, "turns.json"),
			context.allocator,
		)
		if err != nil do continue
		turns, _ := json.parse(turns_data, parse_integers = true)
		for t in turns.(json.Array) or_else nil {
			turn := t.(json.Object) or_else nil
			name := text_get(meta, "name")
			parts := []string{name, text_get(turn, "message"), text_get(turn, "reply")}
			all := strings.to_lower(strings.join(parts, " "))
			if !words_found(wanted[:], all) do continue
			fmt.sbprintf(
				&b,
				`%s{{"chat":%s,"turn":%s}}`,
				n > 0 ? "," : "",
				quote(chat.name),
				value_format(turn),
			)
			n += 1
		}
	}
	strings.write_byte(&b, ']')
	return strings.to_string(b), {}
}

words_found :: proc(words: []string, text: string) -> bool {
	for w in words do if !strings.contains(text, w) do return false
	return true
}

// The end of the core's log (the platform writes it to <app>/logs/core.log, R6), never starting
// inside a character.
log_read :: proc() -> (string, Error) {
	data, err := os.read_entire_file(join(S.app_dir, "logs/core.log"), context.allocator)
	if err != nil do return `{"text":""}`, {}
	text := string(data[max(0, len(data) - LOG_MAX):])
	for len(text) > 0 && (text[0] & 0xC0) == 0x80 do text = text[1:]
	return fmt.tprintf(`{{"text":%s}}`, quote(text)), {}
}
