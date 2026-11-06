package ppcore

// Routes. Order: Host check, then the key (or the API token for /v1).

import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:strconv"
import "core:strings"
import "core:sync"
import "core:time"

route :: proc(req: ^Request) -> Response {
	if !host_ok(req) do return text(403, "wrong host")
	p := req.path
	switch {
	case p == "/open": return open_session(req)
	case strings.has_prefix(p, "/v1/"): return openai(req)
	case strings.has_prefix(p, "/shell/"):
		if !shell_ok(req) do return json_error(401, "missing or wrong key")
		return shell_route(req)
	}
	if !key_ok(req) do return text(401, "missing or wrong key: open promptpipe from the app")
	switch {
	case p == "/": return asset("ui/index.html")
	case strings.has_prefix(p, "/ui/"), strings.has_prefix(p, "/docs/"): return asset(p[1:])
	case strings.has_prefix(p, "/plugins/"): return plugin_asset(p[len("/plugins/"):], req.query["builtin"] == "1")
	case strings.has_prefix(p, "/builtin/"): return plugin_asset(p[len("/builtin/"):], true)
	case strings.has_prefix(p, "/api/v1/"): return json_error(404, "the simple API is gone: use the OpenAI-style API at /v1 (it takes an optional \"chat\" field)")
	case strings.has_prefix(p, "/api/"): return api_route(req)
	}
	return text(404, "not found")
}

@(private = "file")
serve_file :: proc(path: string, name: string) -> Response {
	data, err := os.read_entire_file(path, context.allocator)
	if err != nil do return text(404, strings.concatenate({"not found: ", name}))
	return Response{status = 200, type = mime_for(name), body = data}
}

@(private = "file")
asset :: proc(rel: string) -> Response {
	if !safe_rel(rel) do return text(404, "not found")
	return serve_file(join(S.assets_dir, rel), rel)
}

@(private = "file")
plugin_asset :: proc(rest: string, builtin_only: bool) -> Response {
	slash := strings.index_byte(rest, '/')
	if slash <= 0 do return text(404, "not found")
	path, ok := plugin_file(rest[:slash], rest[slash + 1:], builtin_only)
	if !ok do return text(404, "not found")
	return serve_file(path, rest)
}

// ---------- the shell's side ----------

@(private = "file")
shell_route :: proc(req: ^Request) -> Response {
	body, ok := parse_obj(req.body)
	if !ok do return json_error(400, "body is not JSON")
	switch req.path {
	case "/shell/hello":
		// {platform, modules: [...], missing: {module: why}}
		sync.guard(&S.mu)
		S.platform = strings.clone(get_str(body, "platform"), heap())
		clear(&S.modules)
		for m in get_arr(body, "modules") do append(&S.modules, strings.clone(string(m.(json.String) or_else ""), heap()))
		clear(&S.missing)
		for k, v in get_obj(body, "missing") do S.missing[strings.clone(k, heap())] = strings.clone(string(v.(json.String) or_else ""), heap())
		S.shell_poll = time.now()
		return json_ok()
	case "/shell/next":
		return json_res(200, shell_next(25 * time.Second))
	case "/shell/done":
		found := answer(get_str(body, "id"), get_bool(body, "ok", true), to_json(body["result"] or_else nil), get_str(body, "error"))
		return found ? json_ok() : json_error(404, "nobody waits for that id")
	case "/shell/emit":
		emit(to_json(get_obj(body, "event")))
		return json_ok()
	case "/shell/status":
		// The shell's view of the site pages, shown in /api/app.
		sync.guard(&S.mu)
		delete(S.site_json, heap())
		delete(S.pages_json, heap())
		S.site_json = strings.clone(to_json(body["site"] or_else nil), heap())
		S.pages_json = strings.clone(to_json(body["pages"] or_else nil), heap())
		return json_ok()
	}
	return json_error(404, "unknown shell route")
}

// ---------- the app screen's API ----------

@(private = "file")
api_route :: proc(req: ^Request) -> Response {
	body, ok := parse_obj(req.body)
	if !ok do return json_error(400, "body is not JSON")
	post := req.method == "POST" || req.method == "PUT"
	q := req.query
	switch req.path {
	case "/api/app": return json_res(200, app_info())
	case "/api/app/action":
		_, err := shell_call("app.action", to_json(body), 10 * time.Second)
		return err == "" ? json_ok() : json_error(502, err)
	case "/api/secret":
		key, value := get_str(body, "key"), get_str(body, "value")
		if !secret_known(key) do return json_error(400, "unknown secret")
		if key == "apiToken" && value == "" do value = new_secret() // the API token is always on
		if !secret_set(key, value) do return json_error(500, "could not save the secret")
		return json_ok()
	case "/api/config":
		if !post do return json_res(200, read_config())
		return write_config(string(req.body)) ? json_ok() : json_error(400, "config is not valid JSON")
	case "/api/events":
		after := strconv.parse_int(q["after"] or_else "0") or_else 0
		return json_res(200, poll_events(after, 25 * time.Second))
	case "/api/plugins":
		return json_res(200, fmt.tprintf(`{{"plugins":%s,"folder":%s}}`, list_plugins(q["builtin"] == "1"), quote(plugins_dir())))
	case "/api/plugins/write":
		ids, err := write_plugins(body)
		return err == "" ? json_res(200, fmt.tprintf(`{{"ok":true,"ids":%s}}`, ids)) : json_error(400, err)
	case "/api/plugins/install", "/api/plugins/update":
		return json_error(410, "the app screen downloads plugin files itself and sends them to /api/plugins/write")
	case "/api/plugins/bundle": return json_res(200, bundle_info())
	case "/api/plugins/fork":
		path, err := fork_plugin(get_str(body, "id"))
		return err == "" ? json_res(200, fmt.tprintf(`{{"path":%s}}`, quote(path))) : json_error(400, err)
	case "/api/site":
		timeout := time.Duration(get_int(body, "timeout", 31 * 60_000)) * time.Millisecond
		return relay("site", to_json(body), timeout)
	case "/api/site/open": return relay("site.open", to_json(body), 60 * time.Second)
	case "/api/site/pages": return relay("site.pages", to_json(body), 10 * time.Second)
	case "/api/history/tree": return json_res(200, history_tree())
	case "/api/history/file":
		rel := q["path"] or_else ""
		path, safe := history_path(rel)
		if !safe do return json_error(400, "bad path")
		content, exists := read_text(path)
		return json_res(200, fmt.tprintf(`{{"path":%s,"text":%s}}`, quote(rel), exists ? quote(content) : "null"))
	case "/api/history/all": return json_res(200, history_all())
	case "/api/history/save": return save(body)
	case "/api/git/log":
		args := fmt.tprintf(`{{"path":%s,"count":%d}}`, quote(q["path"] or_else ""), (q["path"] or_else "") == "" ? 30 : 200)
		return module_relay("git", "log", args)
	case "/api/git/push": return module_relay("git", "push", fmt.tprintf(`{{"remote":%s}}`, quote(get_str(git_cfg(), "remote"))))
	case "/api/git/pull": return module_relay("git", "pull", fmt.tprintf(`{{"remote":%s}}`, quote(get_str(git_cfg(), "remote"))))
	case "/api/module":
		// {module: "clipboard"|"vibration"|"share"|"git", call, args}
		return module_relay(get_str(body, "module"), get_str(body, "call"), to_json(body["args"] or_else nil))
	case "/api/jobs/done":
		found := answer(get_str(body, "id"), true, string(req.body), "")
		return found ? json_ok() : json_error(404, "nobody waits for that job")
	}
	return json_error(404, strings.concatenate({"unknown ", req.path}))
}

@(private = "file")
relay :: proc(kind, data: string, timeout: time.Duration) -> Response {
	result, err := shell_call(kind, data, timeout)
	if err != "" do return json_error(502, err)
	return json_res(200, result == "" || result == "null" ? "{}" : result)
}

@(private = "file")
module_relay :: proc(module, call, args: string) -> Response {
	result, err := module_call(module, call, args, 60 * time.Second)
	if err != "" do return json_error(has_module(module) ? 502 : 501, err)
	return json_res(200, fmt.tprintf(`{{"result":%s}}`, result == "" ? "null" : result))
}

git_cfg :: proc() -> json.Object {
	return get_obj(config_obj(), "git")
}

app_info :: proc() -> string {
	b := strings.builder_make()
	strings.write_string(&b, `{"storage":`)
	jstr(&b, S.data_dir)
	strings.write_string(&b, `,"version":`)
	jstr(&b, S.version)
	fmt.sbprintf(&b, `,"port":%d`, S.port)
	fmt.sbprintf(&b, `,"gitToken":%v`, secret_get("gitToken") != "")
	strings.write_string(&b, `,"apiToken":true,"apiTokenValue":`)
	jstr(&b, secret_get("apiToken"))
	fmt.sbprintf(&b, `,"ui":%v,"shell":%v`, ui_alive(), shell_alive())
	sync.guard(&S.mu)
	strings.write_string(&b, `,"platform":`)
	jstr(&b, S.platform)
	strings.write_string(&b, `,"modules":[`)
	for m, i in S.modules {
		if i > 0 do strings.write_byte(&b, ',')
		jstr(&b, m)
	}
	strings.write_string(&b, `],"missing":{`)
	n := 0
	for k, v in S.missing {
		if n > 0 do strings.write_byte(&b, ',')
		jstr(&b, k)
		strings.write_byte(&b, ':')
		jstr(&b, v)
		n += 1
	}
	strings.write_string(&b, `},"site":`)
	strings.write_string(&b, S.site_json == "" ? "{}" : S.site_json)
	strings.write_string(&b, `,"pages":`)
	strings.write_string(&b, S.pages_json == "" ? "[]" : S.pages_json)
	strings.write_byte(&b, '}')
	return strings.to_string(b)
}

// Write files, apply moves, deletes and folders, then commit them together.
@(private = "file")
save :: proc(body: json.Object) -> Response {
	touched, err := history_save(body)
	if err != "" do return json_error(400, err)
	b := strings.builder_make()
	strings.write_string(&b, `{"ok":true`)
	cfg := git_cfg()
	if get_bool(cfg, "enabled", true) {
		paths := strings.builder_make()
		strings.write_byte(&paths, '[')
		for t, i in touched {
			if i > 0 do strings.write_byte(&paths, ',')
			jstr(&paths, t)
		}
		strings.write_byte(&paths, ']')
		args := fmt.tprintf(`{{"paths":%s,"message":%s,"name":%s,"email":%s,"autoPush":%v,"remote":%s}}`,
			strings.to_string(paths), quote(get_str(body, "message", "update")), quote(get_str(cfg, "name")),
			quote(get_str(cfg, "email")), get_bool(cfg, "autoPush"), quote(get_str(cfg, "remote")))
		result, gerr := module_call("git", "commit", args, 60 * time.Second)
		if gerr != "" {
			strings.write_string(&b, `,"gitError":`)
			jstr(&b, gerr)
		} else {
			strings.write_string(&b, `,"commit":`)
			strings.write_string(&b, result == "" ? "null" : result)
		}
	}
	strings.write_byte(&b, '}')
	return json_res(200, strings.to_string(b))
}
