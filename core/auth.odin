package ppcore

// The security key. Every call needs it, so other apps on the device and web
// pages can't use the core:
// - the app screen gets it once via /open?key=…, which sets an HttpOnly,
//   SameSite=Strict cookie and redirects;
// - the shell sends it as the X-PP-Key header;
// - the OpenAI-style /v1 API uses its own token (always on) as a Bearer key;
// - /hello proves to the shell that it is talking to this core (see below).
// The Host header must be 127.0.0.1 or localhost, which stops DNS rebinding.

import "core:crypto"
import "core:crypto/hash"
import "core:crypto/hmac"
import "core:encoding/hex"
import "core:fmt"
import "core:strings"

new_secret :: proc(allocator := context.allocator) -> string {
	raw: [24]byte
	crypto.rand_bytes(raw[:])
	return string(hex.encode(raw[:], allocator))
}

same :: proc(a, b: string) -> bool {
	if len(a) != len(b) || len(a) == 0 do return false
	return crypto.compare_constant_time(transmute([]byte)a, transmute([]byte)b) == 1
}

host_ok :: proc(req: ^Request) -> bool {
	host := req.headers["host"] or_else ""
	return host == fmt.tprintf("127.0.0.1:%d", S.port) || host == fmt.tprintf("localhost:%d", S.port)
}

cookie_key :: proc(req: ^Request) -> string {
	for part in strings.split(req.headers["cookie"] or_else "", ";") {
		p := strings.trim_space(part)
		if strings.has_prefix(p, "pp_key=") do return p[len("pp_key="):]
	}
	return ""
}

key_ok :: proc(req: ^Request) -> bool {
	return same(req.headers["x-pp-key"] or_else "", S.key) || same(cookie_key(req), S.key)
}

shell_ok :: proc(req: ^Request) -> bool {
	return same(req.headers["x-pp-key"] or_else "", S.key)
}

bearer_ok :: proc(req: ^Request) -> bool {
	auth := req.headers["authorization"] or_else ""
	if !strings.has_prefix(auth, "Bearer ") do return false
	return same(auth[len("Bearer "):], secret_get("apiToken"))
}

// GET /open?key=K -> cookie + redirect to the app screen.
open_session :: proc(req: ^Request) -> Response {
	if !same(req.query["key"] or_else "", S.key) do return text(401, "wrong or missing key")
	res := Response{status = 302}
	append(&res.headers, [2]string{"Set-Cookie", fmt.tprintf("pp_key=%s; Path=/; HttpOnly; SameSite=Strict", S.key)})
	append(&res.headers, [2]string{"Location", "/"})
	return res
}

// GET /hello?nonce=N, no key needed: answers HMAC-SHA256(key, "ppcore-proof:" + N).
// Another app can take port 7790 while the core is down. The shell asks for
// this proof before it sends the key or runs any call, so an app on the port
// that doesn't know the key never gets it.
hello :: proc(req: ^Request) -> Response {
	nonce := req.query["nonce"] or_else ""
	if len(nonce) < 16 || len(nonce) > 128 || !is_hex(nonce) do return json_error(400, "nonce: 16 to 128 hex characters")
	return json_res(200, fmt.tprintf(`{{"proof":%s}}`, quote(proof(nonce))))
}

proof :: proc(nonce: string) -> string {
	tag: [32]byte
	msg := strings.concatenate({"ppcore-proof:", nonce})
	hmac.sum(hash.Algorithm.SHA256, tag[:], transmute([]byte)msg, transmute([]byte)S.key)
	return string(hex.encode(tag[:]))
}

is_hex :: proc(s: string) -> bool {
	for c in s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) do return false
	}
	return true
}

// The gate, run as soon as a request's head is in and before its body is read
// (see http.odin). Host, then the key, the shell's key or the API token.
// Routes open without a key take no body.
admit :: proc(req: ^Request) -> (res: Response, body_limit: int, ok: bool) {
	if !host_ok(req) do return text(403, "wrong host"), 0, false
	p := req.path
	switch {
	case p == "/open", p == "/hello":
		return {}, 0, true
	case strings.has_prefix(p, "/v1/"):
		if req.method == "OPTIONS" do return {}, 0, true
		if bearer_ok(req) do return {}, MAX_BODY, true
		r := json_res(401, `{"error":{"message":"Incorrect API key. Use the API token from promptpipe settings.","type":"promptpipe_error","code":"invalid_api_key"}}`)
		append(&r.headers, [2]string{"Access-Control-Allow-Origin", "*"})
		append(&r.headers, [2]string{"Access-Control-Allow-Headers", "authorization, content-type"})
		append(&r.headers, [2]string{"Access-Control-Allow-Methods", "GET, POST, OPTIONS"})
		return r, 0, false
	case strings.has_prefix(p, "/shell/"):
		if shell_ok(req) do return {}, MAX_BODY, true
		return json_error(401, "missing or wrong key"), 0, false
	}
	if key_ok(req) do return {}, MAX_BODY, true
	return text(401, "missing or wrong key: open promptpipe from the app"), 0, false
}
