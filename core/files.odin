package ppcore

// The files primitive: paths are always relative to a base folder and can't
// leave it. Small pure helpers plus thin wrappers over core:os.

import "core:fmt"
import "core:os"
import "core:slice"
import "core:strings"
import "core:time"

// "a/b.md" is fine; "", "/x", "a/../b", "a//b" and backslashes are not.
safe_rel :: proc(rel: string) -> bool {
	if rel == "" || strings.has_prefix(rel, "/") || strings.contains_rune(rel, '\\') || strings.contains_rune(rel, 0) do return false
	for part in strings.split(rel, "/") {
		if part == "" || part == "." || part == ".." do return false
	}
	return true
}

safe_name :: proc(s: string) -> bool {
	if s == "" || s == "." || s == ".." do return false
	for c in s {
		ok := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '.' || c == '-'
		if !ok do return false
	}
	return true
}

join :: proc(parts: ..string) -> string {
	return strings.join(parts, "/")
}

parent :: proc(path: string) -> string {
	i := strings.last_index_byte(path, '/')
	return i > 0 ? path[:i] : path
}

read_text :: proc(path: string) -> (string, bool) {
	data, err := os.read_entire_file(path, context.allocator)
	if err != nil do return "", false
	return string(data), true
}

write_text :: proc(path: string, s: string, private := false) -> bool {
	os.make_directory_all(parent(path))
	perm := private ? os.Permissions{.Read_User, .Write_User} : os.Permissions_Read_All + {.Write_User}
	return os.write_entire_file(path, transmute([]byte)s, perm) == nil
}

// Like write_text (a folder is made for it first); on failure returns the OS's reason.
write_text_why :: proc(path: string, s: string) -> string {
	return write_bytes_why(path, transmute([]byte)s)
}

write_bytes :: proc(path: string, data: []byte) -> bool {
	return write_bytes_why(path, data) == ""
}

// Like write_bytes; on failure returns the OS's reason, so errors can say why.
write_bytes_why :: proc(path: string, data: []byte) -> string {
	mk := os.make_directory_all(parent(path))
	err := os.write_entire_file(path, data)
	if err == nil do return ""
	return fmt.tprintf("%v, folder: %v", err, mk)
}

Entry :: struct {
	rel:   string,
	dir:   bool,
	mtime: i64, // ms
}

// Every file and folder under `base`, skipping names that start with ".".
walk :: proc(base: string) -> []Entry {
	out := make([dynamic]Entry)
	walk_into :: proc(base, rel: string, out: ^[dynamic]Entry) {
		dir := rel == "" ? base : join(base, rel)
		infos, err := os.read_all_directory_by_path(dir, context.allocator)
		if err != nil do return
		slice.sort_by(infos, proc(a, b: os.File_Info) -> bool {return a.name < b.name})
		for fi in infos {
			if strings.has_prefix(fi.name, ".") do continue
			r := rel == "" ? fi.name : join(rel, fi.name)
			is_dir := fi.type == .Directory
			append(out, Entry{r, is_dir, time.time_to_unix_nano(fi.modification_time) / 1_000_000})
			if is_dir do walk_into(base, r, out)
		}
	}
	walk_into(base, "", &out)
	return out[:]
}

list_dirs :: proc(base: string) -> []string {
	out := make([dynamic]string)
	infos, err := os.read_all_directory_by_path(base, context.allocator)
	if err != nil do return nil
	for fi in infos do if fi.type == .Directory do append(&out, fi.name)
	return out[:]
}

copy_tree :: proc(from, to: string) -> bool {
	os.make_directory_all(to)
	infos, err := os.read_all_directory_by_path(from, context.allocator)
	if err != nil do return false
	for fi in infos {
		src, dst := join(from, fi.name), join(to, fi.name)
		if fi.type == .Directory {
			if !copy_tree(src, dst) do return false
		} else {
			data, rerr := os.read_entire_file(src, context.allocator)
			if rerr != nil || !write_bytes(dst, data) do return false
		}
	}
	return true
}

// How many files ending in `suffix` are under `dir` (the .git folder isn't looked into).
count_files :: proc(dir, suffix: string) -> int {
	infos, err := os.read_all_directory_by_path(dir, context.allocator)
	if err != nil do return 0
	n := 0
	for fi in infos {
		if fi.type == .Directory {
			if fi.name != ".git" do n += count_files(join(dir, fi.name), suffix)
		} else if strings.has_suffix(fi.name, suffix) do n += 1
	}
	return n
}
