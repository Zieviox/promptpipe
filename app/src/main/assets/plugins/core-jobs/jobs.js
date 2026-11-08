"use strict";
// ---------- external jobs (other apps via the OpenAI-style /v1 API) ----------
const runJob = async (ev) => {
  const req = ev.req || {};
  try {
    const prof = S.config.profiles.find((p) => (req.profile && p.name.toLowerCase() === String(req.profile).toLowerCase()) || p.id === req.profile) || profile();
    let chat;
    if (req.chat === "current" && S.chat) chat = S.chat;
    else if (req.chat && req.chat !== "new") chat = ChatFile.fromMd(req.chat, (await api("/api/history/file?path=" + encodeURIComponent(req.chat))).text || "");
    else chat = newChat(req.folder ?? S.config.api.folder ?? "api");
    if (!chat.meta.tags) chat.meta.tags = [];
    const turn = await runChat(chat, req.prompt, prof);
    await api("/api/jobs/done", { id: ev.id, result: { reply: turn.reply, thinking: turn.thinking || "", raw: turn.raw, sent: turn.sent, chat: chat.path, source: chat.meta.source, error: turn.error } });
    if (S.chat && S.chat.path === chat.path) render();
  } catch (e) {
    api("/api/jobs/done", { id: ev.id, error: e.message }).catch(() => {});
  }
};

on("job", runJob);
