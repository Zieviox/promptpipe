package ppcore

// promptpipe core: the small native program every platform starts. It serves the screen and its
// calls on 127.0.0.1 (files under named roots with the change check, plugin verification, the
// log), and the local API for other apps.
//
//     ppcore --app <app folder> --private <app-only folder> --assets <app files> [--port 7790]
//
// The key comes from PP_KEY (the platform makes one per start).

import "base:runtime"
import "core:fmt"
import "core:os"
import "core:strconv"
import "core:sync"

VERSION :: "1.0.0"

// The state that outlives one request; everything in it is on the heap and guarded by `mu`.
State :: struct {
	app_dir:     string, // shared storage: config.json, drafts.json, .promptpipe/plugins, logs
	private_dir: string, // app-only: revisions.json, plugin updates
	assets_dir:  string, // what ships with the app: ui/, docs/, plugins/ (read-only)
	port:        int,
	key:         string,
	mu:          sync.Mutex,
	changed:     sync.Cond, // broadcast on every new event and job answer
	events:      [dynamic]Event,
	event_next:  int,
	jobs:        map[string]^Job,
}

S: State

heap :: proc() -> runtime.Allocator {
	return runtime.heap_allocator()
}

// Android: the core is a program the app starts, not a NativeActivity, and Odin's Android target
// only runs `main` through `core:sys/android/native_app_glue` (it refuses a plain `main`). So it's
// built with -no-entry-point, and core/android/shim.c's C `main` (a name Odin keeps for itself)
// calls `pp_core_main`, which starts Odin's runtime as Odin's own entry point does
// (base:runtime's entry_unix.odin), then runs the core. Elsewhere: `main`.
when ODIN_PLATFORM_SUBTARGET == .Android {
	@(export, link_name = "pp_core_main")
	android_entry :: proc "c" (argc: i32, argv: [^]cstring) -> i32 {
		runtime.args__ = argv[:argc]
		context = runtime.default_context()
		runtime._startup_runtime()
		core_run()
		runtime._cleanup_runtime()
		return 0
	}
} else {
	main :: proc() {
		core_run()
	}
}

core_run :: proc() {
	args := os.args[1:]
	S.port = 7790
	for i := 0; i + 1 < len(args); i += 2 {
		switch args[i] {
		case "--app":     S.app_dir = args[i + 1]
		case "--private": S.private_dir = args[i + 1]
		case "--assets":  S.assets_dir = args[i + 1]
		case "--port":    S.port = strconv.parse_int(args[i + 1]) or_else S.port
		case:
			fmt.eprintln("core: unknown option", args[i])
			os.exit(2)
		}
	}
	if S.app_dir == "" || S.private_dir == "" || S.assets_dir == "" {
		fmt.eprintln("usage: ppcore --app <dir> --private <dir> --assets <dir> [--port 7790]")
		os.exit(2)
	}
	if !core_start() do os.exit(1)
}

core_start :: proc() -> bool {
	context.allocator = heap()
	S.key = os.get_env("PP_KEY", heap())
	if len(S.key) < 32 {
		fmt.eprintln("core: PP_KEY is missing or too short")
		return false
	}
	// Everything that outlives a request is made on the heap: maps and lists keep the
	// allocator they were made with, and a request's arena is freed when it ends.
	S.jobs = make(map[string]^Job, heap())
	S.events = make([dynamic]Event, heap())
	revisions = make(map[string]string, heap())
	for dir in ([]string{S.app_dir, S.private_dir}) do folder_make(dir)
	revisions_load()
	fmt.printfln("core: %s, app folder %s", VERSION, S.app_dir)
	if err := server_start(S.port); err != nil {
		fmt.eprintln("core: can't listen on port", S.port, err)
		return false
	}
	return true
}
