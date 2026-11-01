// Small, safe Markdown to HTML: paragraphs, line breaks, headings, lists,
// code blocks, **bold**, *italic*, `code` and links. Everything is escaped first.
(function () {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (t) =>
    esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>');
  const block = (b) => {
    const lines = b.split("\n");
    const h = /^(#{1,6})\s+(.*)$/.exec(b);
    if (h && lines.length === 1) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    if (lines.every((l) => /^\s*([-*+]|\d+[.)])\s+/.test(l))) {
      const tag = /^\s*\d/.test(lines[0]) ? "ol" : "ul";
      return `<${tag}>${lines.map((l) => "<li>" + inline(l.replace(/^\s*([-*+]|\d+[.)])\s+/, "")) + "</li>").join("")}</${tag}>`;
    }
    if (lines.every((l) => /^>\s?/.test(l))) return `<blockquote>${lines.map((l) => inline(l.replace(/^>\s?/, ""))).join("<br>")}</blockquote>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  };
  window.mdToHtml = (text) => {
    const out = [];
    // Code fences first, so their insides are left alone.
    const parts = String(text).split(/^(`{3,})[^\n]*\n([\s\S]*?)^\1\s*$/m);
    for (let i = 0; i < parts.length; i += 3) {
      for (const b of parts[i].split(/\n{2,}/)) if (b.trim()) out.push(block(b.replace(/^\n+|\n+$/g, "")));
      if (i + 2 < parts.length) out.push(`<pre><code>${esc(parts[i + 2].replace(/\n$/, ""))}</code></pre>`);
    }
    return out.join("");
  };
})();
