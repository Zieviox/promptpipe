package ppcore

// Plugins: the catalogue's signature (S3, S8), the copies of each plugin (built-in in the APK,
// updated from a catalogue, yours on shared storage), writing a plugin whole after checking every
// file's hash against its catalogue entry, going back to the previous copy, and serving the copy
// that runs. These checks live here, out of plugins' reach.

import "core:crypto/ed25519"
import "core:encoding/base64"
import "core:encoding/hex"
import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:slice"
import "core:strings"

// The catalogue's public keys, main and backup (S8). They're made on the phone; until they are
// set here, no catalogue is accepted.
PUBLIC_KEYS :: [2]string{
	"0000000000000000000000000000000000000000000000000000000000000000",
	"0000000000000000000000000000000000000000000000000000000000000000",
}

Copy :: enum { Built_In, Updated, Yours }

copy_dir :: proc(copy: Copy, previous := false) -> string {
	switch copy {
	case .Built_In: return join(S.assets_dir, "plugins")
	case .Updated:  return join(S.private_dir, previous ? "plugins-previous" : "plugins")
	case .Yours:    return join(
		S.app_dir,
		previous ? ".promptpipe/plugins-previous" : ".promptpipe/plugins",
	)
	}
	return ""
}

COPY_NAMES := [Copy]string{.Built_In = "built_in", .Updated = "updated", .Yours = "yours"}

id_verify :: proc(id: string) -> bool {
	if id == "" || len(id) > 64 do return false
	for c in id {
		letter := c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z'
		if !(letter || c >= '0' && c <= '9' || c == '-' || c == '_') do return false
	}
	return true
}

catalogue_verify :: proc(d: Object) -> (string, Error) {
	data := text_get(d, "data")
	signature, err := base64.decode(text_get(d, "signature"))
	if err != nil || len(signature) != ed25519.SIGNATURE_SIZE {
		return "", {"invalid_argument", "the catalogue's signature is unreadable"}
	}
	// Another source's catalogue is checked against the key you accepted when you added it; the
	// official one against the keys built into the app.
	own := text_get(d, "key")
	official := PUBLIC_KEYS
	keys := own != "" ? []string{own} : official[:]
	for key_hex in keys {
		key_bytes, _ := hex.decode(transmute([]byte)key_hex)
		key: ed25519.Public_Key
		if !ed25519.public_key_set_bytes(&key, key_bytes) do continue
		if ed25519.verify(&key, transmute([]byte)data, signature) {
			if _, parsed := object_parse(transmute([]byte)data); !parsed do break
			return data, {}
		}
	}
	if own != "" do return "", {"permission_denied", "the catalogue's signature doesn't match the key you accepted for this source"}
	return "", {"permission_denied", "the catalogue's signature isn't the official one"}
}

// A plugin folder's revision: every file's name and bytes, in name order (S4).
folder_revision :: proc(dir: string) -> string {
	entries, _ := os.read_all_directory_by_path(dir, context.allocator)
	names: [dynamic]string
	for e in entries do append(&names, e.name)
	slice.sort(names[:])
	all: [dynamic]byte
	for name in names {
		path := join(dir, name)
		if os.is_dir(path) do append(&all, ..transmute([]byte)folder_revision(path))
		else {
			data, _ := os.read_entire_file(path, context.allocator)
			append(&all, ..transmute([]byte)name)
			append(&all, ..data)
		}
	}
	return revision_get(all[:])
}

manifest_read :: proc(dir: string) -> (Object, string) {
	data, err := os.read_entire_file(join(dir, "plugin.json"), context.allocator)
	if err != nil do return nil, ""
	manifest, ok := object_parse(data)
	return manifest, ok ? string(data) : ""
}

// The copy that runs: yours, else an update newer than the built-in one, else the built-in one.
copy_running :: proc(id: string, safe: bool) -> (Copy, bool) {
	if safe do return .Built_In, os.exists(join(copy_dir(.Built_In), id))
	if os.exists(join(copy_dir(.Yours), id)) do return .Yours, true
	updated, _ := manifest_read(join(copy_dir(.Updated), id))
	built_in, _ := manifest_read(join(copy_dir(.Built_In), id))
	updated_version, built_in_version := text_get(updated, "version"), text_get(built_in, "version")
	newer := built_in == nil || version_newer(updated_version, built_in_version)
	if updated != nil && newer {
		return .Updated, true
	}
	return .Built_In, built_in != nil
}

version_newer :: proc(a, b: string) -> bool {
	pa, pb := strings.split(a, "."), strings.split(b, ".")
	for i in 0 ..< 3 {
		x := i < len(pa) ? atoi(pa[i]) : 0
		y := i < len(pb) ? atoi(pb[i]) : 0
		if x != y do return x > y
	}
	return false
}

atoi :: proc(s: string) -> int {
	n := 0
	for c in s {
		if c < '0' || c > '9' do break
		n = n * 10 + int(c - '0')
	}
	return n
}

plugin_list :: proc() -> (string, Error) {
	ids: [dynamic]string
	for copy in Copy {
		entries, _ := os.read_all_directory_by_path(copy_dir(copy), context.allocator)
		for e in entries do if e.type == .Directory && !slice.contains(ids[:], e.name) do append(
			&ids,
			e.name,
		)
	}
	b := strings.builder_make()
	strings.write_byte(&b, '[')
	n := 0
	for id in ids {
		running, ok := copy_running(id, false)
		updated, yours := join(copy_dir(.Updated), id), join(copy_dir(.Yours), id)
		elsewhere := os.exists(updated) || os.exists(yours)
		if !ok && !elsewhere {
			continue
		}
		dir := join(copy_dir(running), id)
		_, manifest := manifest_read(dir)
		others := strings.builder_make()
		for copy in Copy do if copy != running {
			m, _ := manifest_read(join(copy_dir(copy), id))
			if m != nil {
				fmt.sbprintf(
					&others,
					`%s{{"copy":%q,"version":%s}}`,
					strings.builder_len(others) > 0 ? "," : "",
					COPY_NAMES[copy],
					quote(text_get(m, "version")),
				)
			}
		}
		recorded := revision_recorded(dir)
		changed := running == .Yours && recorded != "" && recorded != folder_revision(dir)
		ITEM :: `%s{{"id":%s,"copy":%q,"manifest":%s,"other_copies":[%s],"changed_outside":%v%s}}`
		missing := manifest == ""
		problem := missing ? `,"error":"plugin.json is missing or not JSON"` : ""
		body := missing ? "null" : manifest
		sep := n > 0 ? "," : ""
		copies := strings.to_string(others)
		fmt.sbprintf(&b, ITEM, sep, quote(id), COPY_NAMES[running], body, copies, changed, problem)
		n += 1
	}
	strings.write_byte(&b, ']')
	return strings.to_string(b), {}
}

// Write a plugin whole. From a catalogue entry, every file must match its hash (S3) and the
// plugin goes to the updates; otherwise it is yours. The copy it replaces is kept for going back;
// `previous` swaps them.
plugin_write :: proc(d: Object) -> (string, Error) {
	id := text_get(d, "plugin")
	if !id_verify(id) do return "", {"invalid_argument", fmt.tprintf("bad plugin id %q", id)}
	if flag_get(d, "previous") {
		for copy in ([]Copy{.Yours, .Updated}) {
			current, previous := join(copy_dir(copy), id), join(copy_dir(copy, true), id)
			if !os.exists(previous) do continue
			swap := fmt.tprintf("%s.swap", current)
			os.rename(current, swap)
			os.rename(previous, current)
			os.rename(swap, previous)
			revision_set(current, folder_revision(current))
			return fmt.tprintf(`{{"id":%s}}`, quote(id)), {}
		}
		return "", {"not_found", "there is no earlier version of this plugin to go back to"}
	}
	files := object_get(d, "files")
	if files == nil || "plugin.json" not_in files {
		return "", {"invalid_argument", fmt.tprintf("%s has no plugin.json", id)}
	}
	entry := object_get(d, "entry")
	hashes := object_get(entry, "hashes")
	for name, value in files {
		if strings.contains(name, "..") || strings.has_prefix(name, "/") {
			return "", {"invalid_argument", fmt.tprintf("bad file name %q", name)}
		}
		if entry == nil do continue
		want := text_get(hashes, name)
		got := revision_get(transmute([]byte)string(value.(json.String) or_else ""))
		if want == "" || want != got {
			message := fmt.tprintf("%s/%s doesn't match the catalogue's hash", id, name)
			return "", {"permission_denied", message}
		}
	}
	if entry != nil {
		for name in hashes do if name not_in files {
			return "", {"invalid_argument", fmt.tprintf("%s/%s is missing", id, name)}
		}
	}
	copy: Copy = entry != nil ? .Updated : .Yours
	dir, previous := join(copy_dir(copy), id), join(copy_dir(copy, true), id)
	if os.exists(dir) {
		os.remove_all(previous)
		folder_make(copy_dir(copy, true))
		os.rename(dir, previous)
	}
	for name, value in files {
		text := string(value.(json.String) or_else "")
		if err := text_write(join(dir, name), transmute([]byte)text); err != nil {
			message := fmt.tprintf("could not write %s/%s (%v)", id, name, err)
			return "", {"permission_denied", message}
		}
	}
	revision_set(dir, folder_revision(dir))
	return fmt.tprintf(`{{"id":%s,"copy":%q}}`, quote(id), COPY_NAMES[copy]), {}
}

plugin_remove :: proc(d: Object) -> (string, Error) {
	id := text_get(d, "plugin")
	copy: Copy = text_get(d, "copy") == "updated" ? .Updated : .Yours
	dir := join(copy_dir(copy), id)
	if !id_verify(id) || !os.exists(dir) do return "", {"not_found", "no such copy of that plugin"}
	os.remove_all(dir)
	os.remove_all(join(copy_dir(copy, true), id))
	revision_set(dir, "")
	return `{"done":true}`, {}
}

// ---------- serving files ----------

mime_get :: proc(name: string) -> string {
	switch {
	case strings.has_suffix(name, ".html"): return "text/html; charset=utf-8"
	case strings.has_suffix(name, ".js"):   return "text/javascript; charset=utf-8"
	case strings.has_suffix(name, ".css"):  return "text/css; charset=utf-8"
	case strings.has_suffix(name, ".json"): return "application/json"
	case strings.has_suffix(name, ".md"):   return "text/markdown; charset=utf-8"
	case strings.has_suffix(name, ".svg"):  return "image/svg+xml"
	case strings.has_suffix(name, ".png"):  return "image/png"
	}
	return "application/octet-stream"
}

file_serve :: proc(full, name: string) -> Response {
	data, err := os.read_entire_file(full, context.allocator)
	if err != nil do return text_response(404, "not found")
	return Response{status = 200, type = mime_get(name), body = data}
}

asset_serve :: proc(rel: string) -> Response {
	if strings.contains(rel, "..") do return text_response(404, "not found")
	return file_serve(join(S.assets_dir, rel), rel)
}

// /plugins/<id>/<file> from the copy that runs (safe mode: the built-in one, UC33).
plugin_file_serve :: proc(rest: string, safe: bool) -> Response {
	id, _, file := strings.partition(rest, "/")
	if !id_verify(id) || file == "" || strings.contains(file, "..") {
		return text_response(404, "not found")
	}
	copy, ok := copy_running(id, safe)
	if !ok do return text_response(404, "not found")
	return file_serve(join(copy_dir(copy), id, file), file)
}
