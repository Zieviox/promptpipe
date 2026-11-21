package ppcore

// The HTTP adapter: a small HTTP/1.1 server on 127.0.0.1 over core:net (Odin has no HTTP server).
// One thread per connection, one request per connection, one arena per request; nothing is
// cached. The screen's event stream is the one long connection (server-sent events).

import "core:fmt"
import "core:mem/virtual"
import "core:net"
import "core:strconv"
import "core:strings"
import "core:sync"
import "core:thread"
import "core:time"

HEAD_MAX :: 64 * 1024
BODY_MAX :: 64 * 1024 * 1024
EVENTS_KEPT :: 200

Request :: struct {
	method:  string,
	path:    string,
	query:   map[string]string,
	headers: map[string]string, // names in lower case
	body:    []byte,
	socket:  net.TCP_Socket,
}

Response :: struct {
	status:  int,
	type:    string,
	body:    []byte,
	headers: [dynamic][2]string,
	done:    bool, // already written by the handler (streams)
}

Event :: struct {
	id:   int,
	text: string, // the event's envelope as JSON
}

server_start :: proc(port: int) -> net.Network_Error {
	socket := net.listen_tcp(net.Endpoint{net.IP4_Loopback, port}) or_return
	fmt.printfln("core: listening on 127.0.0.1:%d", port)
	for {
		client, _, err := net.accept_tcp(socket)
		if err != nil do continue
		thread.create_and_start_with_poly_data(client, proc(client: net.TCP_Socket) {
			defer net.close(client)
			arena: virtual.Arena
			if virtual.arena_init_growing(&arena) != nil do return
			defer virtual.arena_destroy(&arena)
			context.allocator = virtual.arena_allocator(&arena)
			context.temp_allocator = context.allocator
			req, ok := request_read(client)
			res := ok ? route(&req) : text_response(400, "bad request")
			if !res.done do response_write(client, res)
		}, self_cleanup = true)
	}
}

request_read :: proc(socket: net.TCP_Socket) -> (req: Request, ok: bool) {
	buf := make([dynamic]byte, 0, 8192)
	chunk: [8192]byte
	head_end := -1
	for head_end < 0 {
		n, err := net.recv_tcp(socket, chunk[:])
		if err != nil || n == 0 do return
		append(&buf, ..chunk[:n])
		head_end = strings.index(string(buf[:]), "\r\n\r\n")
		if head_end < 0 && len(buf) > HEAD_MAX do return
	}
	lines := strings.split(string(buf[:head_end]), "\r\n")
	first := strings.split(lines[0], " ")
	if len(first) < 2 do return
	req.method = first[0]
	target := first[1]
	query := ""
	if q := strings.index_byte(target, '?'); q >= 0 do target, query = target[:q], target[q + 1:]
	req.path = net.percent_decode(target) or_else target
	for pair in strings.split(query, "&") {
		key, _, value := strings.partition(pair, "=")
		if key != "" {
			req.query[net.percent_decode(key) or_else key] = net.percent_decode(value) or_else value
		}
	}
	for line in lines[1:] {
		name, _, value := strings.partition(line, ":")
		req.headers[strings.to_lower(strings.trim_space(name))] = strings.trim_space(value)
	}
	length := strconv.parse_int(req.headers["content-length"] or_else "0") or_else -1
	if length < 0 || length > BODY_MAX do return
	start := head_end + 4
	for len(buf) - start < length {
		n, err := net.recv_tcp(socket, chunk[:])
		if err != nil || n == 0 do return
		append(&buf, ..chunk[:n])
	}
	req.body = buf[start:start + length]
	req.socket = socket
	return req, true
}

response_write :: proc(socket: net.TCP_Socket, res: Response) {
	b := strings.builder_make()
	fmt.sbprintf(&b, "HTTP/1.1 %d %s\r\n", res.status, res.status < 400 ? "OK" : "Error")
	if res.type != "" do fmt.sbprintf(&b, "Content-Type: %s\r\n", res.type)
	fmt.sbprintf(
		&b,
		"Content-Length: %d\r\nCache-Control: no-store\r\nConnection: close\r\n",
		len(res.body),
	)
	for h in res.headers do fmt.sbprintf(&b, "%s: %s\r\n", h[0], h[1])
	strings.write_string(&b, "\r\n")
	bytes_send(socket, b.buf[:])
	bytes_send(socket, res.body)
}

bytes_send :: proc(socket: net.TCP_Socket, data: []byte) -> bool {
	for sent := 0; sent < len(data); {
		n, err := net.send_tcp(socket, data[sent:])
		if err != nil do return false
		sent += n
	}
	return true
}

text_response :: proc(status: int, text: string) -> Response {
	TYPE :: "text/plain; charset=utf-8"
	return Response{status = status, type = TYPE, body = transmute([]byte)text}
}

json_response :: proc(status: int, text: string) -> Response {
	return Response{status = status, type = "application/json", body = transmute([]byte)text}
}

// Keep an event for the screen's stream (the last EVENTS_KEPT, so a reconnect catches up).
event_send :: proc(envelope: string) {
	sync.guard(&S.mu)
	S.event_next += 1
	append(&S.events, Event{S.event_next, strings.clone(envelope, heap())})
	if len(S.events) > EVENTS_KEPT {
		delete(S.events[0].text, heap())
		ordered_remove(&S.events, 0)
	}
	sync.cond_broadcast(&S.changed)
}

// The screen's event stream: every event after `Last-Event-ID`, then each new one as it comes,
// with a comment every 15 s to keep the connection open.
stream_open :: proc(req: ^Request) -> Response {
	head := "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-store\r\n\r\n"
	if !bytes_send(req.socket, transmute([]byte)head) do return Response{done = true}
	last := strconv.parse_int(req.headers["last-event-id"] or_else "0") or_else 0
	for {
		out := strings.builder_make()
		{
			sync.guard(&S.mu)
			for len(S.events) == 0 || S.events[len(S.events) - 1].id <= last {
				if !sync.cond_wait_with_timeout(&S.changed, &S.mu, 15 * time.Second) do break
			}
			for e in S.events do if e.id > last {
				fmt.sbprintf(&out, "id: %d\ndata: %s\n\n", e.id, e.text)
				last = e.id
			}
		}
		text := strings.to_string(out)
		if !bytes_send(req.socket, transmute([]byte)(text == "" ? ": keep-alive\n\n" : text)) {
			break
		}
		free_all(context.allocator)
	}
	return Response{done = true}
}
