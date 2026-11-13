"use strict";
// App part (chat screen): the site view, as in the wireframe. The header (back,
// "AI page · site", Profile and site), one tab per site page (its chat, its
// state, close, new tab), the address bar, what the page is linked to, and the
// hole where the real page shows. The app draws all of it; the phone's shell
// only puts the page in the hole (told as fractions of the screen).

// S.sv: the site view is open. S.svPage: the page whose tab is chosen.
S.sv = false;
S.svPage = 0;
// What we last told the shell: shown or not, and where the hole was.
const SV = { shown: false, key: "" };
// Other parts may add a strip under the page (the welcome's login card): functions giving a node or null.
const siteViewFoot = [];

// The chat a page is showing, if one of yours is linked to it.
const chatOfPage = (k) => {
  const url = pg(k).url;
  return (url && S.chats.find((c) => c.meta.source && sameUrl(c.meta.source, url))) || null;
};
const pageState = (k) => (pg(k).busy || Object.values(S.pageTurns || {}).some((t) => t.page === k) ? "replying" : pg(k).connected ? "ready" : "idle");
const STATE_DOT = { replying: "var(--warn)", ready: "var(--ok)", idle: "var(--muted)" };

const closeSiteView = () => ((S.sv = false), render());
const pickTab = (k) => {
  S.svPage = k;
  const c = chatOfPage(k);
  if (c && c.path !== S.chat.path) openChat(c.path).catch((e) => toast(e.message, "error"));
  else render();
};
const openInPage = (url, k) => api("/api/site/open", { url, page: k }).then(() => render(), (e) => toast(e.message, "error"));
// Closing a tab frees its page (it goes back to the site's start); the chat stays.
const closeTab = (k) => {
  const site = siteFor();
  if (!site) return;
  openInPage(site.url, k);
  toast("Tab closed. The chat is kept.");
};
// A new tab: a new chat, on a page that isn't busy or showing another chat.
const newTab = () => {
  const site = siteFor();
  if (!site) return toast("Get a site plugin first");
  const k = [...Array(pageCount()).keys()].find((i) => pageState(i) !== "replying" && !chatOfPage(i) && i !== S.svPage) ??
    [...Array(pageCount()).keys()].find((i) => pageState(i) !== "replying" && !chatOfPage(i));
  if (k == null) return toast("Every page is in use. More: Settings › Sites › Max replies at once");
  startNewChat();
  S.svPage = k;
  openInPage(site.url, k);
};
// The page shows a chat of the site that isn't one of yours: bring it in as a new chat.
const importPageChat = async (k) => {
  const url = pg(k).url;
  startNewChat();
  S.chat.meta.source = url;
  setChatSite(siteIdOf());
  S.sv = false;
  render();
  await importHistory();
};

const svLayer = () => {
  const site = siteFor();
  const n = Math.max(1, pageCount());
  const k = Math.min(S.svPage || 0, n - 1);
  const p = pg(k);
  const linked = chatOfPage(k);
  const tab = (i) => {
    const c = chatOfPage(i);
    const state = pageState(i);
    return h("div", { class: "it svtab" + (i === k ? " on" : ""), role: "tab", "aria-selected": String(i === k) },
      h("button", { onclick: () => pickTab(i) }, h("span", { class: "dot", style: "margin:0;background:" + STATE_DOT[state] }), h("span", { class: "tx" }, c ? c.meta.title || "Chat" : pg(i).title || (pg(i).url ? new URL(pg(i).url).host : "Page " + (i + 1)))),
      c && state !== "replying" ? h("button", { class: "act", "aria-label": "Close tab", onclick: () => closeTab(i) }, svgIcon("close")) : null);
  };
  const go = (e) => {
    const v = e.target.value.trim();
    if (v) openInPage(/^https?:\/\//.test(v) ? v : "https://" + v, k);
  };
  return h("div", { class: "svl" },
    h("div", { class: "top" },
      h("button", { class: "ic", "aria-label": "Back to chat", title: "Back to chat (Alt+S)", onclick: closeSiteView }, svgIcon("back")),
      h("span", { class: "t" }, "AI page · " + (site ? site.name : "no site")),
      h("button", { class: "pill", onclick: () => ((S.sv = false), openSiteSheet()) }, "Profile and site")),
    h("div", { class: "svtabs", role: "tablist" }, ...[...Array(n).keys()].map(tab),
      h("button", { class: "ic", "aria-label": "New tab", title: "New tab: a new chat", onclick: newTab }, svgIcon("plus"))),
    h("div", { class: "svbar" },
      h("label", { class: "search" }, h("input", { id: "url", "aria-label": "Page address", value: p.url || "", "data-keep": "svurl", onkeydown: (e) => e.key === "Enter" && go(e), onchange: go })),
      h("button", { class: "ic", "aria-label": "Reload", title: "Reload the page", onclick: () => api("/api/app/action", { action: "reload", page: k }).catch((e) => toast(e.message, "error")) }, svgIcon("retry"))),
    linked
      ? h("div", { class: "foot svlink" }, h("span", { class: "grow" }, "Linked to chat: " + (linked.meta.title || "Chat")), h("button", { class: "pill", onclick: () => ((S.sv = false), openChat(linked.path).catch((e) => toast(e.message, "error"))) }, "Open chat"))
      : site && p.url && !sameUrl(p.url, site.url)
        ? h("button", { class: "it prim svlink", onclick: () => importPageChat(k) }, "Import this chat")
        : null,
    h("div", { id: "svhole", class: "svhole" }, "The site page shows here."),
    ...siteViewFoot.map((f) => f()).filter(Boolean));
};

// Tell the shell where the page goes, or that the site view closed. Only when
// something changed (every redraw calls this).
const syncSiteView = () => {
  if (!S.sv) {
    if (SV.shown) {
      SV.shown = false;
      SV.key = "";
      api("/api/app/action", { action: "chat" }).catch(() => {});
    }
    return;
  }
  const lay = document.querySelector(".svl");
  const hole = document.getElementById("svhole");
  if (!lay || !hole) return;
  const a = lay.getBoundingClientRect();
  const r = hole.getBoundingClientRect();
  if (!a.width || !a.height) return;
  const f = { l: (r.left - a.left) / a.width, t: (r.top - a.top) / a.height, r: (r.right - a.left) / a.width, b: (r.bottom - a.top) / a.height };
  const page = Math.min(S.svPage || 0, Math.max(1, pageCount()) - 1);
  const key = [page, f.l, f.t, f.r, f.b].map((x) => x.toFixed(4)).join(" ");
  if (key === SV.key) return;
  SV.key = key;
  SV.shown = true;
  api("/api/app/action", { action: "site", page, hole: f }).catch((e) => toast(e.message, "error"));
};
addEventListener("resize", () => S.sv && syncSiteView());

// The shell hid or showed the page itself (Back, Alt+S, a login popup).
on("siteView", (ev) => {
  SV.shown = !!ev.show;
  if (!ev.show) SV.key = "";
  if (!!S.sv === !!ev.show) return;
  S.sv = !!ev.show;
  if (S.sv) S.svPage = S.page;
  render();
});
on("siteKey", () => showSite());
// A page loaded, connected or changed address: the tabs and the address bar follow.
on("site", (ev) => S.sv && ev.event !== "progress" && render());
on("pages", () => S.sv && render());
