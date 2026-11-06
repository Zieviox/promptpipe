package ppcore

// OpenAI-compatible API at /v1 (the only API for other apps). Base URL
// http://127.0.0.1:<port>/v1, API key = the app's API token, which is always
// on. Models are the app's profiles. Extension: an optional "chat" field.
//   no "chat": one new chat on the site; all messages go into one prompt.
//   "chat": "<path>.md": continue that saved chat; only the last user message
//   is sent, since the chat file already holds the rest.
// Every reply also reports what really happened under "promptpipe":
// the chat file, what was sent, and the source site.

import "core:crypto"
import "core:encoding/hex"
import "core:encoding/json"
import "core:fmt"
import "core:strings"
import "core:time"

@(private = "file")
cors :: proc(res: Response) -> Response {
	r := res
	append(&r.headers, [2]string{"Access-Control-Allow-Origin", "*"})
	append(&r.headers, [2]string{"Access-Control-Allow-Headers", "authorization, content-type"})
	append(&r.headers, [2]string{"Access-Control-Allow-Methods", "GET, POST, OPTIONS"})
	return r
}

@(private = "file")
oa_error :: proc(status: int, message, code: string) -> Response {
	return cors(json_res(status, fmt.tprintf(`{{"error":{{"message":%s,"type":"promptpipe_error","code":%s}}}}`, quote(message), quote(code))))
}

@(private = "file")
profile_names :: proc() -> []string {
	out := make([dynamic]string)
	for p in get_arr(config_obj(), "profiles") {
		po, _ := p.(json.Object)
		if name := get_str(po, "name"); name != "" do append(&out, name)
	}
	return out[:]
}

@(private = "file")
content_text :: proc(m: json.Object) -> string {
	#partial switch c in m["content"] {
	case json.String: return strings.trim_space(string(c))
	case json.Array:
		parts := make([dynamic]string)
		for item in c {
			io, _ := item.(json.Object)
			if t := get_str(io, "text"); t != "" do append(&parts, t)
		}
		return strings.trim_space(strings.join(parts[:], "\n"))
	}
	return ""
}

// One self-contained prompt: a single user message goes as it is; a longer
// conversation is written out with role headings, ending on the last message.
flatten :: proc(messages: json.Array) -> string {
	roles, texts := make([dynamic]string), make([dynamic]string)
	for m in messages {
		mo, _ := m.(json.Object)
		t := content_text(mo)
		if t == "" do continue
		append(&roles, get_str(mo, "role", "user"))
		append(&texts, t)
	}
	if len(texts) == 1 && roles[0] == "user" do return texts[0]
	b := strings.builder_make()
	for t, i in texts {
		if i > 0 do strings.write_string(&b, "\n\n")
		r := roles[i]
		strings.write_string(&b, "### ")
		if len(r) > 0 do strings.write_string(&b, strings.to_upper(r[:1]))
		if len(r) > 1 do strings.write_string(&b, r[1:])
		strings.write_byte(&b, '\n')
		strings.write_string(&b, t)
	}
	return strings.to_string(b)
}

last_user :: proc(messages: json.Array) -> string {
	#reverse for m in messages {
		mo, _ := m.(json.Object)
		if get_str(mo, "role", "user") == "user" {
			if t := content_text(mo); t != "" do return t
		}
	}
	return ""
}

openai :: proc(req: ^Request) -> Response {
	if req.method == "OPTIONS" do return cors(Response{status = 204})
	if !bearer_ok(req) do return oa_error(401, "Incorrect API key. Use the API token from promptpipe settings.", "invalid_api_key")
	names := profile_names()
	if req.path == "/v1/models" {
		b := strings.builder_make()
		strings.write_string(&b, `{"object":"list","data":[`)
		for n, i in names {
			if i > 0 do strings.write_byte(&b, ',')
			fmt.sbprintf(&b, `{{"id":%s,"object":"model","created":0,"owned_by":"promptpipe"}}`, quote(n))
		}
		strings.write_string(&b, "]}")
		return cors(json_res(200, strings.to_string(b)))
	}
	if req.path != "/v1/chat/completions" || req.method != "POST" {
		return oa_error(404, "Only /v1/models and /v1/chat/completions exist here.", "not_found")
	}
	body, ok := parse_obj(req.body)
	if !ok do return oa_error(400, "body is not JSON", "invalid_request")
	messages := get_arr(body, "messages")
	chat := get_str(body, "chat")
	if chat != "" && chat != "new" && (!safe_rel(chat) || !strings.has_suffix(chat, ".md")) {
		return oa_error(400, "chat must be a saved chat's path ending in .md, or \"new\"", "invalid_request")
	}
	prompt := chat != "" && chat != "new" ? last_user(messages) : flatten(messages)
	if prompt == "" do return oa_error(400, "messages is empty", "invalid_request")
	model := get_str(body, "model")
	profile := ""
	for n in names do if strings.equal_fold(n, model) do profile = n

	job := fmt.tprintf(`{{"prompt":%s,"profile":%s,"chat":%s,"folder":"api"}}`, quote(prompt), quote(profile), quote(chat == "" ? "new" : chat))
	raw, err := run_job(job, 7 * 24 * time.Hour)
	if err != "" do return oa_error(err == "open the promptpipe app first" ? 503 : 502, err, "site_error")
	done, _ := parse_obj(transmute([]byte)raw)
	if e := get_str(done, "error"); e != "" do return oa_error(502, e, "site_error")
	result := get_obj(done, "result")
	if result == nil do return oa_error(502, "the app returned no result", "site_error")
	if e := get_str(result, "error"); e != "" do return oa_error(502, e, "site_error")

	reply, thinking := get_str(result, "reply"), get_str(result, "thinking")
	idbytes: [12]byte
	crypto.rand_bytes(idbytes[:])
	id := strings.concatenate({"chatcmpl-", string(hex.encode(idbytes[:]))})
	created := time.time_to_unix(time.now())
	name := profile != "" ? profile : (len(names) > 0 ? names[0] : "promptpipe")
	report := fmt.tprintf(`{{"chat":%s,"sent":%s,"source":%s}}`, quote(get_str(result, "chat")),
		quote(get_str(result, "sent", prompt)), to_json(result["source"] or_else nil))
	thinking_field := thinking != "" ? fmt.tprintf(`,"reasoning_content":%s`, quote(thinking)) : ""

	if get_bool(body, "stream") {
		// The reply only exists once the site has finished, so it goes out as one chunk.
		head := fmt.tprintf(`{{"id":%s,"object":"chat.completion.chunk","created":%d,"model":%s,"promptpipe":%s,"choices":[{{"index":0,`, quote(id), created, quote(name), report)
		sse := fmt.tprintf("data: %s\"delta\":{{\"role\":\"assistant\",\"content\":%s%s}},\"finish_reason\":null}}]}}\n\ndata: %s\"delta\":{{}},\"finish_reason\":\"stop\"}}]}}\n\ndata: [DONE]\n\n",
			head, quote(reply), thinking_field, head)
		return cors(Response{status = 200, type = "text/event-stream; charset=utf-8", body = transmute([]byte)sse})
	}
	// Token counts are estimates (about 4 characters per token).
	out := fmt.tprintf(`{{"id":%s,"object":"chat.completion","created":%d,"model":%s,"choices":[{{"index":0,"message":{{"role":"assistant","content":%s%s}},"finish_reason":"stop"}}],"usage":{{"prompt_tokens":%d,"completion_tokens":%d,"total_tokens":%d}},"promptpipe":%s}}`,
		quote(id), created, quote(name), quote(reply), thinking_field, len(prompt) / 4, len(reply) / 4, (len(prompt) + len(reply)) / 4, report)
	return cors(json_res(200, out))
}
