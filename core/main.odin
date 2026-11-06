package ppcore

// promptpipe core: one small program the platform shells start.
//   ppcore --data <user folder> --private <app-only folder> --assets <app files> [--port 7790]
// The key comes from the PP_KEY environment variable (the shell makes one per
// start); without it the core makes one and writes it to <private>/key.

import "core:fmt"
import "core:os"
import "core:strconv"
import "core:strings"

VERSION :: "0.7.0-dev"

main :: proc() {
	args := os.args[1:]
	port := 7790
	for i := 0; i + 1 < len(args); i += 2 {
		switch args[i] {
		case "--data": S.data_dir = args[i + 1]
		case "--private": S.private_dir = args[i + 1]
		case "--assets": S.assets_dir = args[i + 1]
		case "--port": port = strconv.parse_int(args[i + 1]) or_else port
		case:
			fmt.eprintln("core: unknown option", args[i])
			os.exit(2)
		}
	}
	if S.data_dir == "" || S.private_dir == "" || S.assets_dir == "" {
		fmt.eprintln("usage: ppcore --data <dir> --private <dir> --assets <dir> [--port 7790]")
		os.exit(2)
	}
	if !start(port) do os.exit(1)
}

// Shared by the command above and by shells that link the core in.
start :: proc(port: int) -> bool {
	context.allocator = heap()
	S.port = port
	S.version = VERSION
	S.event_ids = make([dynamic]int)
	S.event_text = make([dynamic]string)
	S.call_text = make([dynamic]string)
	S.modules = make([dynamic]string)
	S.missing = make(map[string]string)
	S.waiters = make(map[string]^Waiter)
	for d in ([]string{S.data_dir, S.private_dir, history_dir(), plugins_dir()}) do os.make_directory_all(d)

	S.key = os.get_env("PP_KEY", context.allocator)
	if len(S.key) < 32 {
		S.key = new_secret()
		write_text(join(S.private_dir, "key"), S.key, private = true)
		fmt.println("core: no PP_KEY given; made one in", join(S.private_dir, "key"))
	}
	if secret_get("apiToken") == "" {
		secret_set("apiToken", new_secret())
		fmt.println("core: made the API token (always on)")
	}
	fmt.printfln("core: %s, data %s", VERSION, S.data_dir)
	if err := serve(port, route); err != nil {
		fmt.eprintln("core: can't listen on port", port, err)
		return false
	}
	return true
}

_ :: strings
