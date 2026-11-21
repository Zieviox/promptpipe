"use strict";
// On the app's own screen: carry envelopes between the page (the loader) and the platform's port.
(() => {
  const port = browser.runtime.connectNative("pp");
  port.onMessage.addListener((envelope) => window.postMessage({ pp: "in", envelope }, location.origin));
  window.addEventListener("message", (m) => {
    if (m.source === window && m.data && m.data.pp === "out") port.postMessage(m.data.envelope);
  });
})();
