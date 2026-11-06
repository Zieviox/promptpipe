package ppcore

// Installing plugins: from a link, from a file's bytes, or the plugin bundle of
// the latest release. The core has no TLS of its own: downloads go through the
// shell's fetch (a page-bridge call), which every platform provides.

import "core:bytes"
import "core:compress/zlib"
import "core:encoding/base64"
import "core:encoding/endian"
import "core:encoding/json"
import "core:fmt"
import "core:strings"
import "core:time"

File_Data :: struct {
	path: string,
	data: []byte,
}

Plugin_Files :: struct {
	id:    string,
	files: []File_Data,
}

// ---------- fetch (shell primitive) ----------

fetch_url :: proc(url: string) -> (data: []byte, err: string) {
	if !strings.has_prefix(url, "https://") do return nil, "only https links can be fetched"
	result, cerr := shell_call("fetch", fmt.tprintf(`{{"url":%s}}`, quote(url)), 90 * time.Second)
	if cerr != "" do return nil, cerr
	o, _ := parse_obj(transmute([]byte)result)
	status := get_int(o, "status")
	if status < 200 || status > 299 do return nil, fmt.tprintf("HTTP %d for %s", status, url)
	decoded, derr := base64.decode(get_str(o, "base64"))
	if derr != nil do return nil, "the download came back garbled"
	return decoded, ""
}

// ---------- zip (stored and deflated entries) ----------

unzip :: proc(z: []byte) -> (out: []File_Data, err: string) {
	// End of central directory: last 22+ bytes, signature PK\5\6.
	eocd := -1
	for i := len(z) - 22; i >= max(0, len(z) - 22 - 65535); i -= 1 {
		if z[i] == 'P' && z[i + 1] == 'K' && z[i + 2] == 5 && z[i + 3] == 6 {
			eocd = i
			break
		}
	}
	if eocd < 0 do return nil, "not a zip file"
	count := int(endian.unchecked_get_u16le(z[eocd + 10:]))
	at := int(endian.unchecked_get_u32le(z[eocd + 16:]))
	files := make([dynamic]File_Data)
	for _ in 0 ..< count {
		if at + 46 > len(z) || endian.unchecked_get_u32le(z[at:]) != 0x02014b50 do return nil, "broken zip directory"
		method := endian.unchecked_get_u16le(z[at + 10:])
		csize := int(endian.unchecked_get_u32le(z[at + 20:]))
		usize := int(endian.unchecked_get_u32le(z[at + 24:]))
		nlen := int(endian.unchecked_get_u16le(z[at + 28:]))
		xlen := int(endian.unchecked_get_u16le(z[at + 30:]))
		clen := int(endian.unchecked_get_u16le(z[at + 32:]))
		local := int(endian.unchecked_get_u32le(z[at + 42:]))
		name := string(z[at + 46:at + 46 + nlen])
		at += 46 + nlen + xlen + clen
		if strings.has_suffix(name, "/") do continue
		if local + 30 > len(z) do return nil, "broken zip entry"
		lname := int(endian.unchecked_get_u16le(z[local + 26:]))
		lextra := int(endian.unchecked_get_u16le(z[local + 28:]))
		start := local + 30 + lname + lextra
		if start + csize > len(z) do return nil, "broken zip entry"
		raw := z[start:start + csize]
		switch method {
		case 0:
			append(&files, File_Data{name, raw})
		case 8:
			buf: bytes.Buffer
			if zlib.inflate(raw, &buf, raw = true, expected_output_size = usize) != nil do return nil, fmt.tprintf("can't unpack %s", name)
			append(&files, File_Data{name, bytes.buffer_to_bytes(&buf)})
		case:
			return nil, fmt.tprintf("%s uses a zip method this app can't unpack", name)
		}
	}
	return files[:], ""
}

// ---------- writing plugins ----------

// target "user": into your plugins folder (each plugin replaced whole).
// target "updates": replaces the whole downloaded bundle; `bundle_json` is saved.
install_plugins :: proc(plugins: []Plugin_Files, target: string, bundle_json := "{}") -> (ids: []string, err: string) {
	if len(plugins) == 0 do return nil, "no plugins given"
	for p in plugins {
		if !safe_name(p.id) do return nil, fmt.tprintf("bad plugin id '%s'", p.id)
		has_json := false
		for f in p.files {
			if !safe_rel(f.path) do return nil, fmt.tprintf("bad file path '%s'", f.path)
			if f.path == "plugin.json" do has_json = true
		}
		if !has_json do return nil, fmt.tprintf("%s has no plugin.json", p.id)
	}
	base: string
	switch target {
	case "user": base = plugins_dir()
	case "updates":
		base = strings.concatenate({updates_dir(), ".new"})
		os_remove_all(base)
	case: return nil, "target is user or updates"
	}
	out := make([dynamic]string)
	for p in plugins {
		dir := join(base, p.id)
		if target == "user" do os_remove_all(dir)
		for f in p.files do if !write_bytes(join(dir, f.path), f.data) do return nil, fmt.tprintf("could not write %s/%s", p.id, f.path)
		append(&out, p.id)
	}
	if target == "updates" {
		if !write_text(join(base, "bundle.json"), bundle_json) do return nil, "could not write bundle.json"
		os_remove_all(updates_dir())
		if !os_rename(base, updates_dir()) do return nil, "couldn't move the plugin update into place"
	}
	return out[:], ""
}

// Plugins found in unzipped files. A bundle (bundle.json + one folder per
// plugin) returns is_bundle and its bundle.json; otherwise the one folder that
// holds plugin.json is the plugin.
plugins_in_zip :: proc(files: []File_Data) -> (plugins: []Plugin_Files, is_bundle: bool, bundle_json: string, err: string) {
	// Allow one wrapping folder (e.g. "promptpipe-plugins-0.7/").
	prefix := ""
	for f in files {
		if f.path == "bundle.json" || strings.has_suffix(f.path, "/bundle.json") && strings.count(f.path, "/") == 1 {
			prefix = f.path[:len(f.path) - len("bundle.json")]
			is_bundle = true
			bundle_json = string(f.data)
		}
	}
	if is_bundle {
		by_id := make(map[string][dynamic]File_Data)
		for f in files {
			if !strings.has_prefix(f.path, prefix) do continue
			rel := f.path[len(prefix):]
			slash := strings.index_byte(rel, '/')
			if slash <= 0 do continue
			id := rel[:slash]
			if !(id in by_id) do by_id[id] = make([dynamic]File_Data)
			append(&by_id[id], File_Data{rel[slash + 1:], f.data})
		}
		out := make([dynamic]Plugin_Files)
		for id, fs in by_id {
			has := false
			for f in fs do if f.path == "plugin.json" do has = true
			if has do append(&out, Plugin_Files{id, fs[:]})
		}
		if len(out) == 0 do return nil, true, "", "the bundle has no plugins"
		return out[:], true, bundle_json, ""
	}
	// One plugin: the shallowest plugin.json decides the folder.
	root, depth := "", 1 << 30
	found := false
	for f in files {
		if f.path == "plugin.json" || strings.has_suffix(f.path, "/plugin.json") {
			d := strings.count(f.path, "/")
			if d < depth {
				depth = d
				root = f.path[:len(f.path) - len("plugin.json")]
				found = true
			}
		}
	}
	if !found do return nil, false, "", "no plugin.json in the zip"
	id := ""
	fs := make([dynamic]File_Data)
	for f in files {
		if !strings.has_prefix(f.path, root) do continue
		rel := f.path[len(root):]
		if rel == "plugin.json" {
			m, _ := parse_obj(f.data)
			id = get_str(m, "id")
		}
		append(&fs, File_Data{rel, f.data})
	}
	if !safe_name(id) do return nil, false, "", "plugin.json needs an id made of letters, digits, - or _"
	one := make([]Plugin_Files, 1)
	one[0] = Plugin_Files{id, fs[:]}
	return one, false, "", ""
}

// A zip (one plugin or a bundle) or a lone plugin.json.
// Returns the plugin id, or "bundle:<version>" for a bundle.
install_bytes :: proc(name: string, data: []byte) -> (id: string, err: string) {
	if len(data) >= 2 && data[0] == 'P' && data[1] == 'K' {
		files, e1 := unzip(data)
		if e1 != "" do return "", e1
		plugins, is_bundle, bjson, e2 := plugins_in_zip(files)
		if e2 != "" do return "", e2
		if is_bundle {
			_, e3 := install_plugins(plugins, "updates", bjson)
			if e3 != "" do return "", e3
			b, _ := parse_obj(transmute([]byte)bjson)
			emit(fmt.tprintf(`{{"type":"pluginBundle","version":%s}}`, quote(get_str(b, "version"))))
			return strings.concatenate({"bundle:", get_str(b, "version")}), ""
		}
		_, e4 := install_plugins(plugins, "user")
		if e4 != "" do return "", e4
		return plugins[0].id, ""
	}
	m, ok := parse_obj(data)
	if !ok || m == nil do return "", fmt.tprintf("%s is neither a .zip nor a plugin.json", name)
	pid := get_str(m, "id")
	if !safe_name(pid) do return "", "plugin.json needs an id made of letters, digits, - or _"
	for k in ([]string{"main", "siteScript", "css"}) {
		if get_str(m, k) != "" do return "", fmt.tprintf("this plugin.json needs %s too: pick the plugin's .zip instead", get_str(m, k))
	}
	_, e5 := install_plugins([]Plugin_Files{{pid, []File_Data{{"plugin.json", data}}}}, "user")
	if e5 != "" do return "", e5
	return pid, ""
}

// From a link: a .zip, a plugin.json (its listed files are fetched next to
// it), or a GitHub folder link (.../tree/<branch>/<path>).
install_url :: proc(raw: string) -> (id: string, err: string) {
	url := strings.trim_space(raw)
	if strings.has_prefix(url, "https://github.com/") {
		parts := strings.split(url[len("https://github.com/"):], "/")
		if len(parts) >= 5 && parts[2] == "tree" {
			path := strings.trim_right(strings.join(parts[4:], "/"), "/")
			url = fmt.tprintf("https://raw.githubusercontent.com/%s/%s/%s/%s/plugin.json", parts[0], parts[1], parts[3], path)
		}
	}
	if strings.has_suffix(url, ".zip") {
		data, e6 := fetch_url(url)
		if e6 != "" do return "", e6
		return install_bytes(url, data)
	}
	if !strings.has_suffix(url, ".json") do url = strings.concatenate({strings.trim_right(url, "/"), "/plugin.json"})
	mdata, e7 := fetch_url(url)
	if e7 != "" do return "", e7
	m, ok := parse_obj(mdata)
	if !ok || m == nil do return "", "plugin.json is not valid JSON"
	pid := get_str(m, "id")
	if !safe_name(pid) do return "", "plugin.json needs an id made of letters, digits, - or _"
	base := url[:strings.last_index_byte(url, '/')]
	names := make([dynamic]string)
	for k in ([]string{"main", "siteScript", "css"}) do if v := get_str(m, k); v != "" do append(&names, v)
	for v in get_arr(m, "files") do if s, is_str := v.(json.String); is_str do append(&names, string(s))
	files := make([dynamic]File_Data)
	append(&files, File_Data{"plugin.json", mdata})
	seen := make(map[string]bool)
	for n in names {
		if n in seen || !safe_rel(n) do continue
		seen[n] = true
		data, e8 := fetch_url(strings.concatenate({base, "/", n}))
		if e8 != "" do return "", e8
		append(&files, File_Data{n, data})
	}
	_, e9 := install_plugins([]Plugin_Files{{pid, files[:]}}, "user")
	if e9 != "" do return "", e9
	return pid, ""
}

// The plugin bundle (promptpipe-plugins-<version>.zip) of `repo`'s latest release.
update_from_release :: proc(repo: string, force: bool) -> (result: string, err: string) {
	parts := strings.split(repo, "/")
	if len(parts) != 2 || !safe_name(parts[0]) || !safe_name(parts[1]) do return "", fmt.tprintf("updates come from owner/repo, not '%s'", repo)
	rdata, e10 := fetch_url(fmt.tprintf("https://api.github.com/repos/%s/releases/latest", repo))
	if e10 != "" do return "", e10
	rel, _ := parse_obj(rdata)
	asset_url, asset_name := "", ""
	for a in get_arr(rel, "assets") {
		ao, _ := a.(json.Object)
		n := get_str(ao, "name")
		if strings.has_prefix(n, "promptpipe-plugins") && strings.has_suffix(n, ".zip") {
			asset_url, asset_name = get_str(ao, "browser_download_url"), n
			break
		}
	}
	if asset_url == "" do return "", fmt.tprintf("release %s has no plugin bundle", get_str(rel, "tag_name"))
	version := strings.trim_suffix(strings.trim_prefix(strings.trim_prefix(asset_name, "promptpipe-plugins-"), "v"), ".zip")
	have_o, _ := parse_obj(transmute([]byte)bundle_info())
	have := get_str(have_o, "version")
	if !force && have != "" && !version_newer(version, have) do return fmt.tprintf(`{{"version":%s,"upToDate":true}}`, quote(have)), ""
	data, e11 := fetch_url(asset_url)
	if e11 != "" do return "", e11
	files, e12 := unzip(data)
	if e12 != "" do return "", e12
	plugins, is_bundle, bjson, e13 := plugins_in_zip(files)
	if e13 != "" do return "", e13
	if !is_bundle do return "", "the release zip has no bundle.json"
	ids, e14 := install_plugins(plugins, "updates", bjson)
	if e14 != "" do return "", e14
	b := strings.builder_make()
	fmt.sbprintf(&b, `{{"version":%s,"updated":true,"plugins":[`, quote(version))
	for id, i in ids {
		if i > 0 do strings.write_byte(&b, ',')
		jstr(&b, id)
	}
	strings.write_string(&b, "]}")
	return strings.to_string(b), ""
}
