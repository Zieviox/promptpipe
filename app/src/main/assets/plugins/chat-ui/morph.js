"use strict";
// The patcher: render() builds the whole screen fresh, as before, and morph() applies it to the
// screen that is there by changing only what differs. Elements that are still wanted stay the
// same elements, so whatever the person is doing with them survives a redraw on its own: text
// they are typing (and the keyboard's word in progress), a selection, the cursor, focus, scroll
// positions, folds they opened. No state is saved and put back.
//
// Rules, in short:
// - Children are matched by key: data-key, else data-row (the chat screen's row names), else id. Children without a key are matched by tag,
//   in order. A list whose items can come and go needs keys, or an item may be reused for its
//   neighbour (harmless, but its scroll, focus or fold then belongs to the other item).
// - class follows the render (no state of the person's lives in a class), except the classes in
//   morph.keepClasses: ones code adds for a moment and removes itself (a drag's, a highlight).
// - Other attributes and the value / checked / selected properties change only when the new render asks
//   for something different from what the last render asked for. What the person changed in the
//   meantime (typed text, a ticked box, an opened <details>) stays until the app itself asks for a
//   different value. To force a value, render a different one (or set it on the element directly).
// - Event listeners are moved to the element that stays, so handlers always see the newest render.
//   Listeners are recorded as they are added (Element.addEventListener is wrapped below). Only the
//   ones added while the element was being built (not yet on the page) move; ones added to an element
//   already on the page (a drag's move and let-go handlers) stay where they are. { once: true }
//   listeners aren't recorded.
// - The field that has the focus is never written to: the person is typing there. A value the app
//   asks for meanwhile is applied once the focus has left (on the next redraw).
// - Handlers from the newest render still point at the elements it built, which are thrown away
//   when an element on the page is kept. So a handler must act on the element of its event
//   (e.currentTarget, e.target) or find it on the page, not on a variable from the build. As a
//   safety net, a thrown-away form field forwards value, checked, the selection, files, focus(),
//   select() and the like to the field that stayed, and every thrown-away element has __live.
// - data-own: the element's children belong to code that updates them itself (the live reply);
//   morph leaves them alone. data-replace: the element is replaced whole, never patched.
// - A <textarea>'s children are never touched (its text is its value).

(() => {
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const capture = (o) => !!(typeof o === "object" && o ? o.capture : o);
  if (!Element.prototype.__ppRecords) {
    Element.prototype.__ppRecords = true;
    Element.prototype.addEventListener = function (type, fn, opts) {
      if (fn && !(typeof opts === "object" && opts && opts.once)) (this.__ls || (this.__ls = [])).push([type, fn, opts, this.isConnected]);
      return add.call(this, type, fn, opts);
    };
    Element.prototype.removeEventListener = function (type, fn, opts) {
      if (this.__ls) this.__ls = this.__ls.filter(([t, f, o]) => !(t === type && f === fn && capture(o) === capture(opts)));
      return remove.call(this, type, fn, opts);
    };
  }

  // Handlers some code sets as properties (el.onclick = …) instead of listeners.
  const HANDLER_PROPS = ["onclick", "oninput", "onchange", "onkeydown", "onkeyup", "ontoggle", "onscroll", "onsubmit", "onfocus", "onblur"];
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute("data-key") || n.getAttribute("data-row") || n.id || null : null);
  const attrsOf = (el) => {
    const o = {};
    for (const a of el.attributes) o[a.name] = a.value;
    return o;
  };
  const FORM = /^(INPUT|TEXTAREA|SELECT|OPTION)$/;
  const propsOf = (el) => (FORM.test(el.tagName) ? { value: el.value, checked: el.checked, selected: el.selected } : null);

  // What the render asked for, kept on each element as the base for the next comparison.
  const stamp = (el) => {
    if (el.nodeType !== 1) return;
    el.__pa = attrsOf(el);
    el.__pp = propsOf(el);
    for (const c of el.children) stamp(c);
  };

  const syncAttrs = (live, next) => {
    const want = attrsOf(next);
    const base = live.__pa || attrsOf(live);
    for (const n in want) if (n !== "class" && want[n] !== base[n] && live.getAttribute(n) !== want[n]) live.setAttribute(n, want[n]);
    for (const n in base) if (n !== "class" && !(n in want) && live.hasAttribute(n)) live.removeAttribute(n);
    // class: what the render asks for, plus the moment classes on the element now.
    const cls = [want.class || "", ...[...live.classList].filter((c) => morph.keepClasses.has(c))].join(" ").trim();
    if ((live.getAttribute("class") || "") !== cls) cls ? live.setAttribute("class", cls) : live.removeAttribute("class");
    live.__pa = want;
  };
  const syncProps = (live, next) => {
    const want = propsOf(next);
    if (!want) return;
    const base = live.__pp || propsOf(live);
    const typing = live === document.activeElement;
    for (const k of ["value", "checked", "selected"]) {
      if (typing && k === "value") want.value = base.value; // not now: compared again on the next redraw
      else if (want[k] !== base[k] && live[k] !== want[k]) live[k] = want[k];
    }
    live.__pp = want;
  };
  const syncListeners = (live, next) => {
    const stay = [];
    if (live.__ls) for (const r of live.__ls) r[3] ? stay.push(r) : remove.call(live, r[0], r[1], r[2]);
    const moved = next.__ls ? next.__ls.filter((r) => !r[3]) : [];
    for (const [t, f, o] of moved) add.call(live, t, f, o);
    live.__ls = stay.length || moved.length ? stay.concat(moved) : null;
    for (const p of HANDLER_PROPS) if (live[p] !== next[p]) live[p] = next[p];
  };
  // The thrown-away copy of a kept form field acts on the kept one (see the rules above).
  const FWD_PROPS = ["value", "checked", "selected", "selectedIndex", "selectionStart", "selectionEnd", "selectionDirection", "files"];
  const FWD_CALLS = ["focus", "blur", "select", "setSelectionRange", "setRangeText", "click", "scrollIntoView"];
  const forward = (next, live) => {
    next.__live = live;
    if (!FORM.test(next.tagName)) return;
    for (const p of FWD_PROPS) if (p in live) Object.defineProperty(next, p, { configurable: true, get: () => live[p], set: (v) => (live[p] = v) });
    for (const m of FWD_CALLS) if (typeof live[m] === "function") next[m] = (...a) => live[m](...a);
  };

  const sameKind = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.nodeName === b.nodeName && !keyOf(a) && !keyOf(b)));

  // Patch one node to match another of the same kind.
  const patch = (live, next) => {
    if (live === next) return;
    if (live.nodeType !== 1) {
      if (live.nodeValue !== next.nodeValue) live.nodeValue = next.nodeValue;
      return;
    }
    syncAttrs(live, next);
    syncListeners(live, next);
    if (live.tagName !== "TEXTAREA" && !live.hasAttribute("data-own")) patchChildren(live, next);
    syncProps(live, next); // after the children: a <select>'s value needs its options
    forward(next, live);
  };

  // Make live's children match next's children (next's are used up: new ones move into live).
  const patchChildren = (live, next) => {
    const kids = [...next.childNodes];
    const wanted = new Set();
    for (const k of kids) {
      const key = keyOf(k);
      if (key) wanted.add(key);
    }
    const keyed = new Map();
    for (let c = live.firstChild; c; c = c.nextSibling) {
      const key = keyOf(c);
      if (key && !keyed.has(key)) keyed.set(key, c);
    }
    let cursor = live.firstChild;
    // A keyed node no new child wants is going anyway: drop it now rather than move others past it.
    const dropUnwanted = () => {
      while (cursor) {
        const key = keyOf(cursor);
        if (!key || wanted.has(key)) break;
        const n = cursor.nextSibling;
        cursor.remove();
        cursor = n;
      }
    };
    for (const k of kids) {
      dropUnwanted();
      const key = keyOf(k);
      let match = null;
      if (key) {
        wanted.delete(key);
        const old = keyed.get(key);
        if (old && old.nodeName === k.nodeName && !k.hasAttribute("data-replace")) match = old;
        keyed.delete(key);
      } else {
        // The next few unkeyed nodes of the same kind (keyed ones are skipped: a later child may want them).
        for (let c = cursor, steps = 0; c && steps < 6; c = c.nextSibling, steps++) {
          if (keyOf(c)) continue;
          if (sameKind(c, k) && !(k.nodeType === 1 && k.hasAttribute("data-replace"))) {
            match = c;
            break;
          }
        }
      }
      if (match) {
        if (match === cursor) cursor = cursor.nextSibling;
        else live.insertBefore(match, cursor);
        patch(match, k);
      } else {
        stamp(k);
        live.insertBefore(k, cursor);
      }
    }
    while (cursor) {
      const n = cursor.nextSibling;
      cursor.remove();
      cursor = n;
    }
  };

  // morph(live, next): patch an element to match a freshly built one of the same tag.
  // morph(live, [nodes]): make live's children match the list.
  window.morph = (live, next) => {
    if (Array.isArray(next)) {
      const box = document.createElement(live.tagName);
      for (const n of next.flat(Infinity)) if (n != null && n !== false) box.append(n instanceof Node ? n : String(n));
      return patchChildren(live, box);
    }
    if (live.nodeName !== next.nodeName) {
      stamp(next);
      live.replaceWith(next);
      return next;
    }
    patch(live, next);
    return live;
  };
  // Classes that code adds for a moment and removes itself: a redraw leaves them in place.
  window.morph.keepClasses = new Set(["flash", "hl", "tourhl", "dragging", "dt", "db", "di"]);
  if (window.PP) PP.morph = window.morph;
})();
