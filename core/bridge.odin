package ppcore

// The page bridge and the event line.
// - events: the core emits, the app screen long-polls /api/events;
// - shell calls: work only the shell can do (drive a site page, app actions,
//   native modules). The core queues a call, the shell long-polls /shell/next
//   and answers on /shell/done;
// - jobs: API requests handed to the app screen, which runs the message
//   pipeline and answers on /api/jobs/done.
// Request threads wait on one shared condition until their answer arrives.

import "core:fmt"
import "core:strings"
import "core:sync"
import "core:time"

UI_ALIVE_SECONDS :: 40
SHELL_ALIVE_SECONDS :: 40

ui_alive :: proc() -> bool {
	sync.guard(&S.mu)
	return S.ui_polling > 0 || seconds_since(S.ui_poll) < UI_ALIVE_SECONDS
}

shell_alive :: proc() -> bool {
	sync.guard(&S.mu)
	return seconds_since(S.shell_poll) < SHELL_ALIVE_SECONDS
}

// `obj` is the JSON text of an object; "seq" is added in front.
emit :: proc(obj: string) {
	sync.guard(&S.mu)
	S.event_seq += 1
	rest := strings.trim_space(obj)
	rest = len(rest) > 1 ? rest[1:] : "}"
	sep := strings.has_prefix(strings.trim_space(rest), "}") ? "" : ","
	text := fmt.aprintf(`{{"seq":%d%s%s`, S.event_seq, sep, rest, allocator = heap())
	append(&S.event_ids, S.event_seq)
	append(&S.event_text, text)
	if len(S.event_ids) > EVENT_KEEP {
		delete(S.event_text[0], heap())
		ordered_remove(&S.event_ids, 0)
		ordered_remove(&S.event_text, 0)
	}
	sync.cond_broadcast(&S.changed)
}

emit_error :: proc(msg: string) {
	emit(fmt.tprintf(`{{"type":"error","text":%s}}`, quote(msg)))
}

poll_events :: proc(after: int, wait: time.Duration) -> string {
	sync.guard(&S.mu)
	S.ui_poll = time.now()
	S.ui_polling += 1
	defer {S.ui_polling -= 1; S.ui_poll = time.now()}
	deadline := time.time_add(time.now(), wait)
	for S.event_seq <= after {
		left := time.diff(time.now(), deadline)
		if left <= 0 do break
		sync.cond_wait_with_timeout(&S.changed, &S.mu, left)
	}
	b := strings.builder_make()
	fmt.sbprintf(&b, `{{"seq":%d,"events":[`, S.event_seq)
	n := 0
	for id, i in S.event_ids {
		if id <= after do continue
		if n > 0 do strings.write_byte(&b, ',')
		strings.write_string(&b, S.event_text[i])
		n += 1
	}
	strings.write_string(&b, "]}")
	return strings.to_string(b)
}

// ---------- waiting for answers ----------

@(private = "file")
new_waiter :: proc(prefix: string) -> (id: string, w: ^Waiter) {
	// caller holds S.mu
	S.next_id += 1
	id = fmt.aprintf("%s%d", prefix, S.next_id, allocator = heap())
	w = new(Waiter, heap())
	S.waiters[id] = w
	return
}

// Waits (holding S.mu) until `w` is answered or the time is up.
@(private = "file")
await :: proc(id: string, w: ^Waiter, timeout: time.Duration, still_there: proc() -> bool) -> (result: string, err: string) {
	deadline := time.time_add(time.now(), timeout)
	for !w.done {
		left := time.diff(time.now(), deadline)
		if left <= 0 {
			err = "timed out"
			break
		}
		if !still_there() {
			err = "the other side went away"
			break
		}
		sync.cond_wait_with_timeout(&S.changed, &S.mu, min(left, 5 * time.Second))
	}
	if w.done {
		result = strings.clone(w.result, context.allocator)
		if !w.ok do err = strings.clone(w.error, context.allocator)
	}
	delete_key(&S.waiters, id)
	delete(w.result, heap())
	delete(w.error, heap())
	free(w, heap())
	delete(id, heap())
	return
}

@(private = "file")
shell_seen :: proc() -> bool {return seconds_since(S.shell_poll) < SHELL_ALIVE_SECONDS} // S.mu held

@(private = "file")
ui_seen :: proc() -> bool {return S.ui_polling > 0 || seconds_since(S.ui_poll) < UI_ALIVE_SECONDS} // S.mu held

answer :: proc(id: string, ok: bool, result: string, error: string) -> bool {
	sync.guard(&S.mu)
	w, found := S.waiters[id]
	if !found || w.done do return false
	w.done = true
	w.ok = ok
	w.result = strings.clone(result, heap())
	w.error = strings.clone(error, heap())
	sync.cond_broadcast(&S.changed)
	return true
}

// ---------- shell calls ----------

// Runs `kind` in the shell with `data` (JSON text) and returns its result.
shell_call :: proc(kind: string, data: string, timeout: time.Duration) -> (result: string, err: string) {
	sync.guard(&S.mu)
	if !shell_seen() do return "", "the app shell isn't connected"
	id, w := new_waiter("c")
	call := fmt.aprintf(`{{"id":%s,"kind":%s,"data":%s}}`, quote(id), quote(kind), data == "" ? "{}" : data, allocator = heap())
	append(&S.call_text, call)
	sync.cond_broadcast(&S.changed)
	return await(id, w, timeout, shell_seen)
}

shell_next :: proc(wait: time.Duration) -> string {
	sync.guard(&S.mu)
	S.shell_poll = time.now()
	deadline := time.time_add(time.now(), wait)
	for len(S.call_text) == 0 {
		left := time.diff(time.now(), deadline)
		if left <= 0 do break
		sync.cond_wait_with_timeout(&S.changed, &S.mu, left)
		S.shell_poll = time.now()
	}
	b := strings.builder_make()
	strings.write_string(&b, `{"calls":[`)
	for c, i in S.call_text {
		if i > 0 do strings.write_byte(&b, ',')
		strings.write_string(&b, c)
		delete(c, heap())
	}
	clear(&S.call_text)
	strings.write_string(&b, "]}")
	return strings.to_string(b)
}

// ---------- native modules ----------

has_module :: proc(name: string) -> bool {
	sync.guard(&S.mu)
	for m in S.modules do if m == name do return true
	return false
}

// A module the platform lacks never hides the feature: the call fails with a
// plain reason the screen shows where the control is.
module_missing :: proc(name: string) -> string {
	sync.guard(&S.mu)
	why := S.missing[name] or_else "this platform's app doesn't include it"
	return fmt.tprintf("%s is not supported on this platform (%s): %s", name, S.platform == "" ? "unknown" : S.platform, why)
}

module_call :: proc(name, call, args: string, timeout: time.Duration) -> (result: string, err: string) {
	if !has_module(name) do return "", module_missing(name)
	data := fmt.tprintf(`{{"module":%s,"call":%s,"args":%s}}`, quote(name), quote(call), args == "" ? "{}" : args)
	return shell_call("module", data, timeout)
}

// ---------- jobs for the app screen ----------

run_job :: proc(req: string, timeout: time.Duration) -> (result: string, err: string) {
	id: string
	w: ^Waiter
	{
		sync.guard(&S.mu)
		if !ui_seen() do return "", "open the promptpipe app first"
		id, w = new_waiter("j")
	}
	emit(fmt.tprintf(`{{"type":"job","id":%s,"req":%s}}`, quote(id), req))
	sync.guard(&S.mu)
	return await(id, w, timeout, ui_seen)
}
