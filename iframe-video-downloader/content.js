const sent = new Set();

function getKind(url) {
  if (/\.m3u8/i.test(url) || /mpegurl/i.test(url)) return "HLS";
  const m = url.match(/\.(mp4|webm|mov|m4v)(?:$|[?#])/i);
  return m ? m[1].toUpperCase() : "VIDEO";
}

function report(raw) {
  try {
    const url = new URL(raw, location.href).href;
    if (!/^https?:/i.test(url) || sent.has(url)) return;
    sent.add(url);
    const item = { url, type: getKind(url), source: "page", title: document.title };
    chrome.runtime.sendMessage({ type: "found", ...item }).catch(() => {});
    try {
      window.top?.postMessage({ _wsVideoCaptured: true, ...item }, "*");
      window.postMessage({ _wsVideoCaptured: true, ...item }, "*");
    } catch {}
  } catch {}
}

function scan(root = document) {
  try {
    root.querySelectorAll?.("video, source").forEach(el => {
      if (el.src) report(el.src);
      if (el.currentSrc) report(el.currentSrc);
    });
    performance.getEntriesByType?.("resource").forEach(e => {
      if (/\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])|\.m3u8/i.test(e.name)) report(e.name);
    });
  } catch {}
}

// Observe network resources in real-time
try {
  const po = new PerformanceObserver(list => {
    list.getEntries().forEach(e => {
      if (/\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])|\.m3u8/i.test(e.name)) {
        report(e.name);
      }
    });
  });
  po.observe({ type: "resource", buffered: true });
} catch {}

// Observe DOM mutations for dynamically inserted video / iframe elements
new MutationObserver(mutations => mutations.forEach(m => {
  m.addedNodes.forEach(n => n.nodeType === 1 && scan(n));
  if (m.type === "attributes" && m.target.src) report(m.target.src);
})).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });

// Listen for detected items from background.js (webRequest) and forward to host page
try {
  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === "detected" && msg.item) {
      try {
        window.top?.postMessage({ _wsVideoCaptured: true, ...msg.item }, "*");
      } catch {}
    }
  });
} catch {}

// Bridge between host web page and extension background
window.addEventListener("message", async e => {
  if (!e.data) return;
  if (e.data._wsBridge === "list") {
    try {
      const res = await chrome.runtime.sendMessage({ type: "list" });
      window.postMessage({ _wsBridgeReply: "list", items: res?.items || [] }, "*");
    } catch {}
  } else if (e.data._wsBridge === "clear") {
    try {
      await chrome.runtime.sendMessage({ type: "clear" });
      window.postMessage({ _wsBridgeReply: "clear", ok: true }, "*");
    } catch {}
  }
});

addEventListener("DOMContentLoaded", () => scan());
setInterval(scan, 1000);
