package ppcore

// Minimal HTTP/1.1 for 127.0.0.1: one thread per connection, one request per
// connection (Connection: close). Enough for the app screen, the shell and
// local API clients; nothing here is exposed beyond the loopback address.

import "core:fmt"
import "core:mem/virtual"
import "core:net"
import "core:strconv"
import "core:strings"
import "core:thread"

MAX_HEAD :: 64 * 1024
MAX_BODY :: 64 * 1024 * 1024

Request :: struct {
	method:  string,
	path:    string, // percent-decoded, no query
	query:   map[string]string,
	headers: map[string]string, // names lower-case
	body:    []byte,
}

Response :: struct {
	status:  int,
	type:    string,
	body:    []byte,
	headers: [dynamic][2]string,
}

Handler :: #type proc(req: ^Request) -> Response

serve :: proc(port: int, handler: Handler) -> net.Network_Error {
	sock := net.listen_tcp(net.Endpoint{net.IP4_Loopback, port}) or_return
	fmt.printfln("core: listening on 127.0.0.1:%d", port)
	for {
		client, _, err := net.accept_tcp(sock)
		if err != nil {
			fmt.eprintln("core: accept failed:", err)
			continue
		}
		Conn :: struct {
			sock:    net.TCP_Socket,
			handler: Handler,
		}
		thread.create_and_start_with_poly_data(Conn{client, handler}, proc(c: Conn) {
			handle_conn(c.sock, c.handler)
		}, self_cleanup = true)
	}
}

@(private = "file")
handle_conn :: proc(sock: net.TCP_Socket, handler: Handler) {
	defer net.close(sock)
	arena: virtual.Arena
	if virtual.arena_init_growing(&arena) != nil do return
	defer virtual.arena_destroy(&arena)
	context.allocator = virtual.arena_allocator(&arena)
	context.temp_allocator = context.allocator

	req, ok := read_request(sock)
	res: Response
	if !ok {
		res = text(400, "bad request")
	} else {
		res = handler(&req)
	}
	write_response(sock, res)
}

@(private = "file")
read_request :: proc(sock: net.TCP_Socket) -> (req: Request, ok: bool) {
	buf := make([dynamic]byte, 0, 8192)
	chunk: [8192]byte
	head_end := -1
	for head_end < 0 {
		n, err := net.recv_tcp(sock, chunk[:])
		if err != nil || n == 0 do return
		append(&buf, ..chunk[:n])
		head_end = strings.index(string(buf[:]), "\r\n\r\n")
		if head_end < 0 && len(buf) > MAX_HEAD do return
	}
	head := string(buf[:head_end])
	lines := strings.split(head, "\r\n")
	parts := strings.split(lines[0], " ")
	if len(parts) < 2 do return
	req.method = parts[0]
	target := parts[1]
	raw_query := ""
	if q := strings.index_byte(target, '?'); q >= 0 {
		raw_query = target[q + 1:]
		target = target[:q]
	}
	req.path = net.percent_decode(target) or_else target
	req.query = parse_query(raw_query)
	for line in lines[1:] {
		c := strings.index_byte(line, ':')
		if c <= 0 do continue
		req.headers[strings.to_lower(strings.trim_space(line[:c]))] = strings.trim_space(line[c + 1:])
	}
	length := 0
	if cl, has := req.headers["content-length"]; has {
		length = strconv.parse_int(cl) or_else -1
		if length < 0 || length > MAX_BODY do return
	}
	body_start := head_end + 4
	for len(buf) - body_start < length {
		n, err := net.recv_tcp(sock, chunk[:])
		if err != nil || n == 0 do return
		append(&buf, ..chunk[:n])
	}
	req.body = buf[body_start:body_start + length]
	return req, true
}

parse_query :: proc(raw: string) -> map[string]string {
	out := make(map[string]string)
	for pair in strings.split(raw, "&") {
		if pair == "" do continue
		k, v := pair, ""
		if e := strings.index_byte(pair, '='); e >= 0 {
			k, v = pair[:e], pair[e + 1:]
		}
		plus_k, _ := strings.replace_all(k, "+", " ")
		plus_v, _ := strings.replace_all(v, "+", " ")
		out[net.percent_decode(plus_k) or_else k] = net.percent_decode(plus_v) or_else v
	}
	return out
}

@(private = "file")
reason :: proc(status: int) -> string {
	switch status {
	case 200: return "OK"
	case 204: return "No Content"
	case 302: return "Found"
	case 400: return "Bad Request"
	case 401: return "Unauthorized"
	case 403: return "Forbidden"
	case 404: return "Not Found"
	case 500: return "Internal Server Error"
	case 501: return "Not Implemented"
	case 502: return "Bad Gateway"
	case 503: return "Service Unavailable"
	case 504: return "Gateway Timeout"
	}
	return "Status"
}

@(private = "file")
write_response :: proc(sock: net.TCP_Socket, res: Response) {
	b := strings.builder_make()
	fmt.sbprintf(&b, "HTTP/1.1 %d %s\r\n", res.status, reason(res.status))
	if res.type != "" do fmt.sbprintf(&b, "Content-Type: %s\r\n", res.type)
	fmt.sbprintf(&b, "Content-Length: %d\r\nCache-Control: no-store\r\nConnection: close\r\n", len(res.body))
	for h in res.headers do fmt.sbprintf(&b, "%s: %s\r\n", h[0], h[1])
	strings.write_string(&b, "\r\n")
	send_all(sock, b.buf[:])
	send_all(sock, res.body)
}

@(private = "file")
send_all :: proc(sock: net.TCP_Socket, data: []byte) {
	rest := data
	for len(rest) > 0 {
		n, err := net.send_tcp(sock, rest)
		if err != nil || n <= 0 do return
		rest = rest[n:]
	}
}

// ---------- response helpers (pure) ----------

text :: proc(status: int, s: string) -> Response {
	return Response{status = status, type = "text/plain; charset=utf-8", body = transmute([]byte)s}
}

json_res :: proc(status: int, s: string) -> Response {
	return Response{status = status, type = "application/json; charset=utf-8", body = transmute([]byte)s}
}

json_error :: proc(status: int, msg: string) -> Response {
	b := strings.builder_make()
	strings.write_string(&b, `{"error":`)
	jstr(&b, msg)
	strings.write_byte(&b, '}')
	return json_res(status, strings.to_string(b))
}

json_ok :: proc() -> Response {
	return json_res(200, `{"ok":true}`)
}

mime_for :: proc(path: string) -> string {
	dot := strings.last_index_byte(path, '.')
	ext := dot >= 0 ? path[dot + 1:] : ""
	switch ext {
	case "html": return "text/html; charset=utf-8"
	case "js", "mjs": return "text/javascript; charset=utf-8"
	case "css": return "text/css; charset=utf-8"
	case "json": return "application/json; charset=utf-8"
	case "md": return "text/markdown; charset=utf-8"
	case "svg": return "image/svg+xml"
	case "png": return "image/png"
	case "woff2": return "font/woff2"
	}
	return "application/octet-stream"
}
