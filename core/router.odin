package ppcore

// The router: the Host check and the key (S1), the platform's challenge (S2), the screen's files,
// and the one port: an envelope in, an envelope out, routed by the core's part of the call table.

import "core:crypto"
import "core:crypto/hash"
import "core:crypto/hmac"
import "core:encoding/hex"
import "core:fmt"
import "core:strings"

Error :: struct {
	code:    string, // a gRPC status code in snake_case
	message: string,
}

host_verify :: proc(req: ^Request) -> bool {
	host := req.headers["host"] or_else ""
	return host == fmt.tprintf("127.0.0.1:%d", S.port) || host == fmt.tprintf(
		"localhost:%d",
		S.port,
	)
}

same :: proc(a, b: string) -> bool {
	if len(a) != len(b) || len(a) == 0 do return false
	return crypto.compare_constant_time(transmute([]byte)a, transmute([]byte)b) == 1
}

key_verify :: proc(req: ^Request) -> bool {
	for part in strings.split(req.headers["cookie"] or_else "", ";") {
		name, _, value := strings.partition(strings.trim_space(part), "=")
		if name == "pp_key" && same(value, S.key) do return true
	}
	return same(req.headers["x-pp-key"] or_else "", S.key)
}

// /open?key=… sets the key as an HttpOnly cookie and goes to the screen.
session_open :: proc(req: ^Request) -> Response {
	if !same(req.query["key"] or_else "", S.key) {
		return text_response(401, "wrong or missing key")
	}
	res := Response{status = 302}
	append(
		&res.headers,
		[2]string{"Set-Cookie", fmt.tprintf("pp_key=%s; Path=/; HttpOnly; SameSite=Strict", S.key)},
	)
	append(&res.headers, [2]string{"Location", "/"})
	return res
}

// The platform checks this is its own core: HMAC-SHA256 of its nonce with the key, so the key
// itself is never sent (S2).
challenge_answer :: proc(req: ^Request) -> Response {
	tag: [32]byte
	hmac.sum(
		hash.Algorithm.SHA256,
		tag[:],
		transmute([]byte)(req.query["nonce"] or_else ""),
		transmute([]byte)S.key,
	)
	return text_response(200, string(hex.encode(tag[:])))
}

route :: proc(req: ^Request) -> Response {
	if !host_verify(req) do return text_response(403, "wrong host")
	p := req.path
	switch {
	case p == "/open":                return session_open(req)
	case p == "/challenge":           return challenge_answer(req)
	case strings.has_prefix(p, "/v1/"): return api_request_run(req)
	}
	if !key_verify(req) {
		return text_response(401, "missing or wrong key: open promptpipe from the app")
	}
	switch {
	case p == "/":                     return asset_serve("ui/index.html")
	case strings.has_prefix(p, "/ui/"), strings.has_prefix(p, "/docs/"): return asset_serve(p[1:])
	case strings.has_prefix(p, "/plugins/"): return plugin_file_serve(
		p[len("/plugins/"):],
		req.query["safe"] == "1",
	)
	case p == "/events":               return stream_open(req)
	case p == "/call" && req.method == "POST":  return call_run(req.body)
	case p == "/event" && req.method == "POST": return event_receive(req.body)
	}
	return text_response(404, "not found")
}

// One call: its envelope parsed, checked against the core's calls, run, and answered.
call_run :: proc(body: []byte) -> Response {
	envelope, ok := object_parse(body)
	if !ok {
		return json_response(
			400,
			error_format("", {"invalid_argument", "the envelope is not JSON"}),
		)
	}
	id := text_get(envelope, "id")
	name := text_get(envelope, "name")
	data := object_get(envelope, "data")
	result: string
	err: Error
	switch name {
	case "file_read":        result, err = file_read(data)
	case "file_write":       result, err = file_write(data)
	case "file_move":        result, err = file_move(data)
	case "file_delete":      result, err = file_delete(data)
	case "file_list":        result, err = file_list(data)
	case "file_find":        result, err = file_find(data)
	case "log_read":         result, err = log_read()
	case "catalogue_verify": result, err = catalogue_verify(data)
	case "plugin_list":      result, err = plugin_list()
	case "plugin_write":     result, err = plugin_write(data)
	case "plugin_remove":    result, err = plugin_remove(data)
	case:                    err = {"unimplemented", fmt.tprintf("no call %s here", name)}
	}
	if err.code != "" do return json_response(200, error_format(id, err))
	return json_response(
		200,
		fmt.tprintf(`{{"type":"reply","id":%s,"data":%s}}`, quote(id), result),
	)
}

error_format :: proc(id: string, err: Error) -> string {
	return fmt.tprintf(
		`{{"type":"reply","id":%s,"error":{{"code":%s,"message":%s}}}}`,
		quote(id),
		quote(err.code),
		quote(err.message),
	)
}
