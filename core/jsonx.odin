package ppcore

// Thin wrapper over core:encoding/json: parse to a dynamic value, read fields
// with defaults, and write JSON text with a string builder.

import "core:encoding/json"
import "core:fmt"
import "core:strings"

parse_obj :: proc(data: []byte) -> (json.Object, bool) {
	if len(data) == 0 do return json.Object{}, true
	v, err := json.parse(data, .JSON5, parse_integers = true)
	if err != nil do return nil, false
	o, is_obj := v.(json.Object)
	return o, is_obj
}

get_str :: proc(o: json.Object, key: string, def := "") -> string {
	if s, ok := o[key].(json.String); ok do return string(s)
	return def
}

get_int :: proc(o: json.Object, key: string, def := 0) -> int {
	#partial switch v in o[key] {
	case json.Integer: return int(v)
	case json.Float: return int(v)
	}
	return def
}

get_bool :: proc(o: json.Object, key: string, def := false) -> bool {
	if b, ok := o[key].(json.Boolean); ok do return bool(b)
	return def
}

get_arr :: proc(o: json.Object, key: string) -> json.Array {
	if a, ok := o[key].(json.Array); ok do return a
	return nil
}

get_obj :: proc(o: json.Object, key: string) -> json.Object {
	if m, ok := o[key].(json.Object); ok do return m
	return nil
}

// JSON text of any parsed value (key order may change).
to_json :: proc(v: json.Value) -> string {
	data, err := json.marshal(v)
	if err != nil do return "null"
	return string(data)
}

jstr :: proc(b: ^strings.Builder, s: string) {
	strings.write_byte(b, '"')
	for r in s {
		switch r {
		case '"': strings.write_string(b, `\"`)
		case '\\': strings.write_string(b, `\\`)
		case '\n': strings.write_string(b, `\n`)
		case '\r': strings.write_string(b, `\r`)
		case '\t': strings.write_string(b, `\t`)
		case:
			if r < 0x20 || r == 0x2028 || r == 0x2029 {
				fmt.sbprintf(b, `\u%04x`, int(r))
			} else {
				strings.write_rune(b, r)
			}
		}
	}
	strings.write_byte(b, '"')
}

quote :: proc(s: string) -> string {
	b := strings.builder_make()
	jstr(&b, s)
	return strings.to_string(b)
}
