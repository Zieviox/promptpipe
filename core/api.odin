package ppcore

// The local API for other apps (UC41): OpenAI-style at /v1, the token required. A request becomes
// a job the app runs (`job_received`); the app's `job_changed` events come back here and go to the
// caller, streamed, with keep-alives while it waits; a closed connection cancels the job, and the
// same request sent again joins the job already running (#209).

import "core:crypto"
import "core:encoding/hex"
import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:strings"
import "core:sync"
import "core:time"

Job :: struct {
	id:    string,
	key:   string, // the request's revision, to join a retried request
	parts: [dynamic]string, // the app's job_changed data, in order
	done:  bool,
	users: int,
}

cors_add :: proc(res: ^Response) {
	append(&res.headers, [2]string{"Access-Control-Allow-Origin", "*"})
	append(&res.headers, [2]string{"Access-Control-Allow-Headers", "authorization, content-type"})
	append(&res.headers, [2]string{"Access-Control-Allow-Methods", "GET, POST, OPTIONS"})
}

api_error :: proc(status: int, message, code: string) -> Response {
	ERROR :: `{{"error":{{"message":%s,"type":"promptpipe_error","code":%s}}}}`
	res := json_response(status, fmt.tprintf(ERROR, quote(message), quote(code)))
	cors_add(&res)
	return res
}

// The Bearer token against the settings' hash, trusted only while config.json is the version the
// core wrote (D7).
api_token_verify :: proc(req: ^Request) -> (bool, string) {
	full := join(S.app_dir, "config.json")
	data, err := os.read_entire_file(full, context.allocator)
	if err != nil do return false, "open promptpipe first"
	if recorded := revision_recorded(full); recorded != "" && recorded != revision_get(data) {
		return false, "the settings changed outside the app: open promptpipe to check them"
	}
	config, _ := object_parse(data)
	token := strings.trim_prefix(req.headers["authorization"] or_else "", "Bearer ")
	ok := same(revision_get(transmute([]byte)token), text_get(config, "api_token_hash"))
	return ok, "Incorrect API key. Use the API token from promptpipe settings."
}

// What the app sends: one message as it is; a conversation with role headings; with "chat", only
// the last user message (the chat holds the rest).
message_build :: proc(messages: json.Array, chat: string) -> string {
	b := strings.builder_make()
	last := ""
	for m in messages {
		o := m.(json.Object) or_else nil
		role := text_get(o, "role", "user")
		text: string
		#partial switch c in o["content"] {
		case json.String: text = string(c)
		case json.Array:
			parts: [dynamic]string
			for item in c do append(&parts, text_get(item.(json.Object) or_else nil, "text"))
			text = strings.join(parts[:], "\n")
		}
		text = strings.trim_space(text)
		if text == "" do continue
		if role == "user" do last = text
		fmt.sbprintf(
			&b,
			"%s### %s%s\n%s",
			strings.builder_len(b) > 0 ? "\n\n" : "",
			strings.to_upper(role[:1]),
			role[1:],
			text,
		)
	}
	if chat != "" || len(messages) == 1 do return last
	return strings.to_string(b)
}

api_request_run :: proc(req: ^Request) -> Response {
	if req.method == "OPTIONS" {
		res := Response{status = 204}
		cors_add(&res)
		return res
	}
	if ok, why := api_token_verify(req); !ok do return api_error(401, why, "invalid_api_key")
	request := ""
	job_data := ""
	switch {
	case req.path == "/v1/models":
		request, job_data = "models", `{}`
	case req.path == "/v1/chat/completions" && req.method == "POST":
		body, ok := object_parse(req.body)
		if !ok do return api_error(400, "body is not JSON", "invalid_request")
		chat := text_get(body, "chat")
		message := message_build(list_get(body, "messages"), chat == "new" ? "" : chat)
		if message == "" do return api_error(400, "messages is empty", "invalid_request")
		request = "chat"
		job_data = fmt.tprintf(
			`{{"message":%s,"profile":%s,"chat":%s,"stream":%v}}`,
			quote(message),
			quote(text_get(body, "model")),
			quote(chat == "new" ? "" : chat),
			flag_get(body, "stream"),
		)
	case:
		return api_error(404, "Only /v1/models and /v1/chat/completions exist here.", "not_found")
	}
	job := job_join(revision_get(req.body), request, job_data)
	stream := strings.contains(job_data, `"stream":true`)
	return job_answer_write(req, job, stream, request)
}

// A job for this request: the one already running for the same request, or a new one.
job_join :: proc(key, request, data: string) -> ^Job {
	sync.guard(&S.mu)
	for _, job in S.jobs do if job.key == key && !job.done {
		job.users += 1
		return job
	}
	raw: [12]byte
	crypto.rand_bytes(raw[:])
	job := new(Job, heap())
	id := string(hex.encode(raw[:], heap()))
	job^ = {id = id, key = strings.clone(key, heap()), users = 1}
	job.parts = make([dynamic]string, heap())
	S.jobs[job.id] = job
	fields := strings.trim_suffix(strings.trim_prefix(data, "{"), "}")
	envelope := fmt.tprintf(
		`{{"type":"event","name":"job_received","data":{{"id":%s,"request":%q%s%s}}}}`,
		quote(job.id),
		request,
		fields == "" ? "" : ",",
		fields,
	)
	sync.mutex_unlock(&S.mu)
	event_send(envelope)
	sync.mutex_lock(&S.mu)
	return job
}

// The app's job_changed events, in.
event_receive :: proc(body: []byte) -> Response {
	envelope, ok := object_parse(body)
	data := object_get(envelope, "data")
	if !ok || text_get(envelope, "name") != "job_changed" {
		return json_response(400, `{"error":"not a job_changed event"}`)
	}
	sync.guard(&S.mu)
	job := S.jobs[text_get(data, "job")] or_else nil
	if job == nil do return json_response(404, `{"error":"nobody waits for that job"}`)
	append(&job.parts, strings.clone(value_format(data), heap()))
	status := text_get(data, "status")
	job.done = status == "done" || status == "failed"
	sync.cond_broadcast(&S.changed)
	return json_response(200, `{"ok":true}`)
}

// Answer the caller as the job goes: server-sent chunks when streaming, else one answer at the
// end (with spaces before it as keep-alives, which JSON allows). A closed connection cancels it.
job_answer_write :: proc(req: ^Request, job: ^Job, stream: bool, request: string) -> Response {
	HEAD ::
		"HTTP/1.1 200 OK\r\nContent-Type: %s\r\nCache-Control: no-store\r\n" +
		"Connection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n"
	head := fmt.tprintf(HEAD, stream ? "text/event-stream" : "application/json")
	alive := bytes_send(req.socket, transmute([]byte)head)
	seen := 0
	reply_sent := 0
	final: Object
	for alive && final == nil {
		new_parts: [dynamic]Object
		{
			sync.guard(&S.mu)
			if len(job.parts) == seen && !job.done {
				sync.cond_wait_with_timeout(&S.changed, &S.mu, 15 * time.Second)
			}
			for ; seen < len(job.parts); seen += 1 {
				part, _ := object_parse(transmute([]byte)job.parts[seen])
				append(&new_parts, part)
			}
		}
		if len(new_parts) == 0 {
			alive = bytes_send(
				req.socket,
				transmute([]byte)string(stream ? ": keep-alive\n\n" : " "),
			)
			continue
		}
		for part in new_parts {
			status := text_get(part, "status")
			if status == "done" || status == "failed" do final = part
			reply := text_get(part, "reply")
			if stream && len(reply) > reply_sent && status != "failed" {
				CHUNK :: `data: {{"id":%s,"object":"chat.completion.chunk",` +
					`"choices":[{{"index":0,"delta":{{"content":%s}}}}]}}` + "\n\n"
				chunk := fmt.tprintf(CHUNK, quote(job.id), quote(reply[reply_sent:]))
				alive = bytes_send(req.socket, transmute([]byte)chunk)
				reply_sent = len(reply)
			}
		}
	}
	if !alive {
		job_cancel(job)
		return Response{done = true}
	}
	bytes_send(req.socket, transmute([]byte)answer_format(job, final, stream, request))
	return Response{done = true}
}

answer_format :: proc(job: ^Job, final: Object, stream: bool, request: string) -> string {
	if text_get(final, "status") == "failed" {
		message := text_get(object_get(final, "error"), "message", "the site didn't answer")
		return fmt.tprintf(
			`{{"error":{{"message":%s,"type":"promptpipe_error","code":"site_error"}}}}`,
			quote(message),
		)
	}
	if request == "models" {
		b := strings.builder_make()
		for m, i in list_get(final, "models") do fmt.sbprintf(
			&b,
			`%s{{"id":%s,"object":"model","owned_by":"promptpipe"}}`,
			i > 0 ? "," : "",
			quote(string(m.(json.String) or_else "")),
		)
		return fmt.tprintf(`{{"object":"list","data":[%s]}}`, strings.to_string(b))
	}
	report := fmt.tprintf(
		`{{"chat":%s,"sent":%s}}`,
		quote(text_get(final, "chat")),
		quote(text_get(final, "sent")),
	)
	thinking := text_get(final, "thinking")
	reasoning := thinking == "" ? "" : fmt.tprintf(`,"reasoning_content":%s`, quote(thinking))
	if stream {
		LAST :: `data: {{"id":%s,"object":"chat.completion.chunk","promptpipe":%s,` +
			`"choices":[{{"index":0,"delta":{{}},"finish_reason":"stop"}}]}}` +
			"\n\ndata: [DONE]\n\n"
		return fmt.tprintf(LAST, quote(job.id), report)
	}
	reply := text_get(final, "reply")
	sent := text_get(final, "sent")
	// Token counts are estimates: about 4 characters a token.
	ANSWER :: `{{"id":%s,"object":"chat.completion","choices":[{{"index":0,"message":` +
		`{{"role":"assistant","content":%s%s}},"finish_reason":"stop"}}],"usage":` +
		`{{"prompt_tokens":%d,"completion_tokens":%d,"total_tokens":%d}},"promptpipe":%s}}`
	tokens_in, tokens_out := len(sent) / 4, len(reply) / 4
	total := tokens_in + tokens_out
	id := quote(job.id)
	return fmt.tprintf(ANSWER, id, quote(reply), reasoning, tokens_in, tokens_out, total, report)
}

// The caller left: when nobody else waits for the job, the app stops it.
job_cancel :: proc(job: ^Job) {
	sync.guard(&S.mu)
	job.users -= 1
	if job.users > 0 || job.done do return
	job.done = true
	sync.mutex_unlock(&S.mu)
	CANCEL :: `{{"type":"event","name":"job_received","data":{{"id":%s,"request":"cancel"}}}}`
	event_send(fmt.tprintf(CANCEL, quote(job.id)))
	sync.mutex_lock(&S.mu)
}
