package ppcore

// The security key. Every call needs it, so other apps on the device and web
// pages can't use the core:
// - the app screen gets it once via /open?key=…, which sets an HttpOnly,
//   SameSite=Strict cookie and redirects;
// - the shell sends it as the X-PP-Key header;
// - the OpenAI-style /v1 API uses its own token (always on) as a Bearer key.
// The Host header must be 127.0.0.1 or localhost, which stops DNS rebinding.

import "core:crypto"
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
