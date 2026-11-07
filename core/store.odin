package ppcore

// Settings, secrets, plugins and chat history on disk.

import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:strconv"
import "core:strings"
import "core:sync"

history_default :: proc() -> string {return join(S.data_dir, "history")}
history_dir :: proc() -> string {return S.history_override != "" ? S.history_override : history_default()}
// The chosen chats folder is kept in the app-only folder; the shell reads the same file for git.
history_pointer :: proc() -> string {return join(S.private_dir, "history-folder")}
plugins_dir :: proc() -> string {return join(S.data_dir, "plugins")}
updates_dir :: proc() -> string {return join(S.private_dir, "plugin-updates")}
// The copy of a plugin of yours that an install replaced, kept so it can be rolled back to.
previous_dir :: proc() -> string {return join(S.data_dir, "plugins-previous")}

// ---------- config ----------

read_config :: proc() -> string {
	return read_text(join(S.data_dir, "config.json")) or_else "{}"
}

write_config :: proc(text: string) -> bool {
	if _, ok := parse_obj(transmute([]byte)text); !ok do return false // refuse broken JSON
	return write_text(join(S.data_dir, "config.json"), text)
}

config_obj :: proc() -> json.Object {
	o, _ := parse_obj(transmute([]byte)read_config())
	return o
}

// ---------- secrets (private folder, owner-only file) ----------

secrets_mu: sync.Mutex

secret_get :: proc(key: string) -> string {
	sync.guard(&secrets_mu)
	text := read_text(join(S.private_dir, "secrets.json")) or_else "{}"
	o, _ := parse_obj(transmute([]byte)text)
	return get_str(o, key)
}

secret_set :: proc(key, value: string) -> bool {
	sync.guard(&secrets_mu)
	text := read_text(join(S.private_dir, "secrets.json")) or_else "{}"
	o, ok := parse_obj(transmute([]byte)text)
	if !ok || o == nil do o = make(json.Object)
	o[key] = json.String(value)
	return write_text(join(S.private_dir, "secrets.json"), to_json(o), private = true)
}

SECRET_KEYS :: [?]string{"gitToken", "apiToken"}

secret_known :: proc(key: string) -> bool {
	for k in SECRET_KEYS do if k == key do return true
	return false
}

// ---------- plugins ----------
// Order of use: your plugins folder, then a newer downloaded update, then the
// one that came with the app. Safe mode (builtin=1) uses only the last.

version_newer :: proc(a, b: string) -> bool {
	x, y := strings.split(a, "."), strings.split(b, ".")
	for i in 0 ..< max(len(x), len(y)) {
		p := i < len(x) ? (strconv.parse_int(x[i]) or_else 0) : 0
		q := i < len(y) ? (strconv.parse_int(y[i]) or_else 0) : 0
		if p != q do return p > q
	}
	return false
}

manifest_version :: proc(dir: string) -> (string, bool) {
	text, ok := read_text(join(dir, "plugin.json"))
	if !ok do return "", false
	o, _ := parse_obj(transmute([]byte)text)
	return get_str(o, "version"), true
}

// The update folder for `id` when it is newer than the built-in plugin.
update_dir :: proc(id: string) -> (string, bool) {
	dir := join(updates_dir(), id)
	v, ok := manifest_version(dir)
	if !ok do return "", false
	b, has_builtin := manifest_version(join(S.assets_dir, "plugins", id))
	if !has_builtin || version_newer(v, b) do return dir, true
	return "", false
}

has_manifest :: proc(dir: string) -> bool {
	return os.is_file(join(dir, "plugin.json"))
}

list_plugins :: proc(builtin_only: bool) -> string {
	ids := make(map[string]bool)
	for id in list_dirs(join(S.assets_dir, "plugins")) do if has_manifest(join(S.assets_dir, "plugins", id)) do ids[id] = true
	if !builtin_only {
		for id in list_dirs(updates_dir()) do if has_manifest(join(updates_dir(), id)) do ids[id] = true
		for id in list_dirs(plugins_dir()) do if has_manifest(join(plugins_dir(), id)) do ids[id] = true
	}
	sorted := make([dynamic]string)
	for id in ids do append(&sorted, id)
	sort_strings(sorted[:])

	b := strings.builder_make()
	strings.write_byte(&b, '[')
	for id, i in sorted {
		if i > 0 do strings.write_byte(&b, ',')
		builtin := join(S.assets_dir, "plugins", id)
		user := join(plugins_dir(), id)
		is_user := !builtin_only && has_manifest(user)
		upd, is_upd := "", false
		if !is_user && !builtin_only do upd, is_upd = update_dir(id)
		dir := is_user ? user : (is_upd ? upd : builtin)
		strings.write_string(&b, `{"id":`)
		jstr(&b, id)
		strings.write_string(&b, is_user ? `,"source":"user"` : `,"source":"builtin"`)
		if is_user && (has_manifest(builtin) || os.is_dir(join(updates_dir(), id))) do strings.write_string(&b, `,"overrides":true`)
		if is_upd do strings.write_string(&b, `,"updated":true`)
		if is_user {
			if v, ok := manifest_version(join(previous_dir(), id)); ok {
				strings.write_string(&b, `,"previous":`)
				jstr(&b, v)
			}
			// The version a plugin of yours hides: the app's own, or its newer downloaded one.
			shadow := builtin
			if u, ok := update_dir(id); ok do shadow = u
			if v, ok := manifest_version(shadow); ok {
				strings.write_string(&b, `,"shadows":`)
				jstr(&b, v)
			}
		}
		text, _ := read_text(join(dir, "plugin.json"))
		if m, ok := parse_obj(transmute([]byte)text); ok && m != nil {
			strings.write_string(&b, `,"manifest":`)
			strings.write_string(&b, to_json(m))
		} else {
			strings.write_string(&b, `,"error":"plugin.json is not valid JSON"`)
		}
		strings.write_byte(&b, '}')
	}
	strings.write_byte(&b, ']')
	return strings.to_string(b)
}

plugin_file :: proc(id, rel: string, builtin_only: bool) -> (string, bool) {
	if !safe_name(id) || !safe_rel(rel) do return "", false
	if !builtin_only {
		user := join(plugins_dir(), id)
		if os.is_dir(user) do return join(user, rel), true
		if upd, ok := update_dir(id); ok do return join(upd, rel), true
	}
	return join(S.assets_dir, "plugins", id, rel), true
}

// Copy a built-in (or updated) plugin into your plugins folder to edit it.
fork_plugin :: proc(id: string) -> (string, string) {
	if !safe_name(id) do return "", "bad plugin id"
	dest := join(plugins_dir(), id)
	if os.exists(dest) do return "", strings.concatenate({"plugins/", id, " already exists"})
	src, ok := update_dir(id)
	if !ok do src = join(S.assets_dir, "plugins", id)
	if !has_manifest(src) do return "", strings.concatenate({"no built-in plugin '", id, "'"})
	if !copy_tree(src, dest) do return "", "copy failed"
	return dest, ""
}

// Swap your plugin with the copy the last install replaced (swapping again goes forward).
rollback_plugin :: proc(id: string) -> (version: string, err: string) {
	if !safe_name(id) do return "", "bad plugin id"
	cur, prev, tmp := join(plugins_dir(), id), join(previous_dir(), id), join(previous_dir(), strings.concatenate({".swap-", id}))
	if !has_manifest(prev) do return "", "there is no earlier version of this plugin to go back to"
	os_remove_all(tmp)
	if has_manifest(cur) && !os_rename(cur, tmp) do return "", "couldn't move the current version aside"
	os_remove_all(cur)
	if !os_rename(prev, cur) do return "", "couldn't put the earlier version back"
	if os.exists(tmp) do os_rename(tmp, prev)
	v, _ := manifest_version(cur)
	return v, ""
}

bundle_info :: proc() -> string {
	return read_text(join(updates_dir(), "bundle.json")) or_else "{}"
}

// ---------- chat history ----------

// What a chats folder allows, step by step, with the system's own reason.
// Returns the JSON for the screen and whether every step worked.
storage_check :: proc(base: string) -> (json_text: string, all_ok: bool) {
	dir := join(base, ".pp-check")
	top := join(base, ".pp-check.txt")
	os_remove_all(dir)
	os_remove_all(top)
	all_ok = true
	b := strings.builder_make()
	fmt.sbprintf(&b, `{{"path":%s,"steps":[`, quote(base))
	n := 0
	step :: proc(b: ^strings.Builder, n: ^int, all_ok: ^bool, name, why: string) {
		if n^ > 0 do strings.write_byte(b, ',')
		n^ += 1
		if why != "" do all_ok^ = false
		fmt.sbprintf(b, `{{"name":%s,"ok":%v,"why":%s}}`, quote(name), why == "", quote(why))
	}
	ferr := os.make_directory(dir)
	step(&b, &n, &all_ok, "make a folder", ferr == nil ? "" : fmt.tprintf("%v", ferr))
	if ferr == nil {
		step(&b, &n, &all_ok, "write a file in it", write_bytes_why(join(dir, "a.txt"), transmute([]byte)string("ok")))
	}
	step(&b, &n, &all_ok, "write a file beside the chats", write_bytes_why(top, transmute([]byte)string("ok")))
	os_remove_all(dir)
	os_remove_all(top)
	strings.write_string(&b, "]}")
	return strings.to_string(b), all_ok
}

// The folders inside `path`, for the folder picker (hidden ones left out).
list_folder :: proc(path: string) -> string {
	names := make([dynamic]string)
	for d in list_dirs(path) do if !strings.has_prefix(d, ".") do append(&names, d)
	sort_strings(names[:])
	b := strings.builder_make()
	fmt.sbprintf(&b, `{{"path":%s,"parent":%s,"dirs":[`, quote(path), quote(path == "/" ? "" : parent(path) == "" ? "/" : parent(path)))
	for d, i in names {
		if i > 0 do strings.write_byte(&b, ',')
		strings.write_string(&b, quote(d))
	}
	strings.write_string(&b, "]}")
	return strings.to_string(b)
}

// Use `path` as the chats folder ("" = the default one). The chats already in the
// old folder are copied over when asked; the old folder itself stays as it was.
choose_history_folder :: proc(path: string, copy: bool) -> (copied: int, err: string) {
	target := path == "" ? history_default() : strings.trim_right(path, "/")
	if target != history_default() {
		if !strings.has_prefix(target, "/") || strings.contains(target, "/../") || strings.has_suffix(target, "/..") do return 0, "give a full folder path that starts with /"
		if strings.has_prefix(target, plugins_dir()) || strings.has_prefix(target, S.private_dir) do return 0, "that folder is the app's own"
	}
	if os.is_file(target) do return 0, "that is a file, not a folder"
	if merr := os.make_directory_all(target); merr != nil && !os.is_dir(target) do return 0, fmt.tprintf("could not make %s (%v)", target, merr)
	if report, ok := storage_check(target); !ok do return 0, fmt.tprintf("the phone won't let the app write in %s: %s", target, report)
	old := history_dir()
	if copy && old != target && os.is_dir(old) {
		before := count_files(old, ".md")
		if !copy_tree(old, target) do return 0, "copying the chats stopped part way; the old folder is untouched"
		copied = before
	}
	if target == history_default() {
		os_remove_all(history_pointer())
		S.history_override = ""
	} else {
		if !write_text(history_pointer(), target, private = true) do return 0, "could not save the choice"
		S.history_override = strings.clone(target, heap())
	}
	return copied, ""
}

history_path :: proc(rel: string) -> (string, bool) {
	if !safe_rel(rel) do return "", false
	return join(history_dir(), rel), true
}

// Every chat with the first part of its text (enough for the header), plus
// all folders so empty ones show too. Dot folders (.git, .memory) are skipped.
history_tree :: proc() -> string {
	files, folders := strings.builder_make(), strings.builder_make()
	strings.write_byte(&files, '[')
	strings.write_byte(&folders, '[')
	nf, nd := 0, 0
	for e in walk(history_dir()) {
		if e.dir {
			if nd > 0 do strings.write_byte(&folders, ',')
			jstr(&folders, e.rel)
			nd += 1
		} else if strings.has_suffix(e.rel, ".md") {
			text, _ := read_text(join(history_dir(), e.rel))
			if nf > 0 do strings.write_byte(&files, ',')
			strings.write_string(&files, `{"path":`)
			jstr(&files, e.rel)
			strings.write_string(&files, `,"head":`)
			jstr(&files, utf8_prefix(text, 1500))
			strings.write_string(&files, `,"mtime":`)
			strings.write_i64(&files, e.mtime)
			strings.write_byte(&files, '}')
			nf += 1
		}
	}
	strings.write_byte(&files, ']')
	strings.write_byte(&folders, ']')
	b := strings.builder_make()
	strings.write_string(&b, `{"files":`)
	strings.write_string(&b, strings.to_string(files))
	strings.write_string(&b, `,"folders":`)
	strings.write_string(&b, strings.to_string(folders))
	strings.write_string(&b, `,"root":`)
	jstr(&b, history_dir())
	strings.write_byte(&b, '}')
	return strings.to_string(b)
}

// Full text of every chat, for search.
history_all :: proc() -> string {
	b := strings.builder_make()
	strings.write_string(&b, `{"files":[`)
	n := 0
	for e in walk(history_dir()) {
		if e.dir || !strings.has_suffix(e.rel, ".md") do continue
		text, _ := read_text(join(history_dir(), e.rel))
		if n > 0 do strings.write_byte(&b, ',')
		strings.write_string(&b, `{"path":`)
		jstr(&b, e.rel)
		strings.write_string(&b, `,"text":`)
		jstr(&b, text)
		strings.write_string(&b, `,"mtime":`)
		strings.write_i64(&b, e.mtime)
		strings.write_byte(&b, '}')
		n += 1
	}
	strings.write_string(&b, "]}")
	return strings.to_string(b)
}

// Files that belong to one chat live in .memory/<chat path without .md>/.
companion :: proc(chat: string) -> (string, bool) {
	if !strings.has_suffix(chat, ".md") do return "", false
	for part in strings.split(chat, "/") do if strings.has_prefix(part, ".") do return "", false
	return join(history_dir(), ".memory", chat[:len(chat) - 3]), true
}

// Folders, moves, writes and deletes in one go. Returns the touched paths.
history_save :: proc(body: json.Object) -> (touched: [dynamic]string, err: string) {
	touched = make([dynamic]string)
	for d in get_arr(body, "mkdir") {
		rel := string(d.(json.String) or_else "")
		p, ok := history_path(rel)
		if !ok do return touched, "bad folder path"
		if err := os.make_directory_all(p); err != nil && !os.is_dir(p) {
			return touched, fmt.tprintf("could not make the folder %s (%v)", rel, err)
		}
	}
	for m in get_arr(body, "moves") {
		mo, _ := m.(json.Object)
		from_rel, to_rel := get_str(mo, "from"), get_str(mo, "to")
		from, ok1 := history_path(from_rel)
		to, ok2 := history_path(to_rel)
		if !ok1 || !ok2 do return touched, "bad move path"
		if os.exists(to) do return touched, strings.concatenate({to_rel, " already exists"})
		os.make_directory_all(parent(to))
		if os.rename(from, to) != nil do return touched, strings.concatenate({"could not move ", from_rel})
		append(&touched, to_rel)
		// A chat's companion files (e.g. Memory's summaries) move with it.
		cf, okf := companion(from_rel)
		ct, okt := companion(to_rel)
		if okf && okt && os.is_dir(cf) && !os.exists(ct) {
			os.make_directory_all(parent(ct))
			if os.rename(cf, ct) == nil do append(&touched, ct[len(history_dir()) + 1:])
		}
	}
	for f in get_arr(body, "files") {
		fo, _ := f.(json.Object)
		rel := get_str(fo, "path")
		p, ok := history_path(rel)
		if !ok do return touched, strings.concatenate({"bad file path '", rel, "'"})
		if why := write_text_why(p, get_str(fo, "text")); why != "" do return touched, fmt.tprintf("could not write %s (%s)", rel, why)
		append(&touched, rel)
	}
	for d in get_arr(body, "delete") {
		rel := string(d.(json.String) or_else "")
		p, ok := history_path(rel)
		if !ok do return touched, "bad delete path"
		os.remove(p)
		if c, okc := companion(rel); okc && os.is_dir(c) do os.remove_all(c)
		append(&touched, rel)
	}
	return touched, ""
}

// ---------- small pure helpers ----------

utf8_prefix :: proc(s: string, n: int) -> string {
	if len(s) <= n do return s
	i := n
	for i > 0 && (s[i] & 0xC0) == 0x80 do i -= 1
	return s[:i]
}

sort_strings :: proc(a: []string) {
	for i in 1 ..< len(a) {
		for j := i; j > 0 && a[j] < a[j - 1]; j -= 1 do a[j], a[j - 1] = a[j - 1], a[j]
	}
}

os_remove_all :: proc(path: string) {os.remove_all(path)}
os_rename :: proc(a, b: string) -> bool {return os.rename(a, b) == nil}
