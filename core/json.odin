package ppcore

// The JSON adapter: core:encoding/json used as it is, behind small readers and a writer, so the
// rest of the core reads fields with defaults and writes JSON text without the library's types.

import "core:encoding/json"
import "core:strings"

Object :: json.Object

object_parse :: proc(text: []byte) -> (Object, bool) {
	value, err := json.parse(text, parse_integers = true)
	if err != nil do return nil, false
	object, ok := value.(json.Object)
	return object, ok
}

text_get :: proc(o: Object, key: string, fallback := "") -> string {
	if s, ok := o[key].(json.String); ok do return string(s)
	return fallback
}

flag_get :: proc(o: Object, key: string, fallback := false) -> bool {
	if b, ok := o[key].(json.Boolean); ok do return bool(b)
	return fallback
}

object_get :: proc(o: Object, key: string) -> Object {
	if v, ok := o[key].(json.Object); ok do return v
	return nil
}

list_get :: proc(o: Object, key: string) -> json.Array {
	if v, ok := o[key].(json.Array); ok do return v
	return nil
}

// Any parsed value back to JSON text.
value_format :: proc(v: json.Value) -> string {
	data, _ := json.marshal(v)
	return string(data)
}

// A string as a JSON string literal.
quote :: proc(s: string) -> string {
	b := strings.builder_make()
	strings.write_byte(&b, '"')
	for r in s {
		switch r {
		case '"':  strings.write_string(&b, `\"`)
		case '\\': strings.write_string(&b, `\\`)
		case '\n': strings.write_string(&b, `\n`)
		case '\r': strings.write_string(&b, `\r`)
		case '\t': strings.write_string(&b, `\t`)
		case:
			if r < 0x20 {
				digits := "0123456789abcdef"
				strings.write_string(&b, `\u00`)
				strings.write_byte(&b, digits[r >> 4])
				strings.write_byte(&b, digits[r & 15])
			} else do strings.write_rune(&b, r)
		}
	}
	strings.write_byte(&b, '"')
	return strings.to_string(b)
}
