package ppcore

// All shared state in one flat struct. Everything that lives longer than one
// request is allocated with the heap allocator and guarded by `mu`.

import "base:runtime"
import "core:sync"
import "core:time"

EVENT_KEEP :: 200

Waiter :: struct {
	done:   bool,
	ok:     bool,
	result: string, // JSON text
	error:  string,
}

State :: struct {
	// set once at start
	data_dir:    string, // user files: history/, plugins/, config.json
	private_dir: string, // key, secrets.json, plugin-updates/
	history_override: string, // a chosen chats folder (history-folder in private_dir), or ""
	assets_dir:  string, // what ships with the app: ui/, docs/, plugins/
	port:        int,
	key:         string, // required on every call (cookie or X-PP-Key)
	version:     string,

	mu:          sync.Mutex,
	changed:     sync.Cond, // broadcast on any event, shell call or answer

	// events for the app screen (long poll)
	event_seq:   int,
	event_ids:   [dynamic]int,
	event_text:  [dynamic]string,
	ui_poll:     time.Time,
	ui_polling:  int, // long polls in progress

	// calls the shell must run (site page, app actions, native modules)
	call_text:   [dynamic]string, // queued, oldest first
	shell_poll:  time.Time,
	platform:    string,
	modules:     [dynamic]string, // native modules this shell provides
	missing:     map[string]string, // module -> why it isn't on this platform
	site_json:   string, // the shell's site info (JSON)
	pages_json:  string, // the shell's site pages (JSON)
	app_json:    string, // the shell's app info (JSON object)

	// answers awaited by request threads (shell calls and API jobs)
	waiters:     map[string]^Waiter,
	next_id:     int,
}

S: State

heap :: proc() -> runtime.Allocator {
	return runtime.heap_allocator()
}

seconds_since :: proc(t: time.Time) -> f64 {
	if t == {} do return 1e9
	return time.duration_seconds(time.since(t))
}
