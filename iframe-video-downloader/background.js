const byTab = new Map();
const VIDEO_RE = /\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])|\.m3u8/i;

function kind(url, type = "") {
  if (/\.m3u8/i.test(url) || /mpegurl/i.test(type)) return "HLS";
  const m = url.match(/\.(mp4|webm|mov|m4v)(?:$|[?#])/i);
  return m ? m[1].toUpperCase() : "VIDEO";
}

function add(tabId, item) {
  if (tabId < 0 || !item?.url || !/^https?:/i.test(item.url)) return;
  const list = byTab.get(tabId) || [];
  const existing = list.find(x => x.url === item.url);
  if (existing) Object.assign(existing, item);
  else list.unshift({ ...item, id: crypto.randomUUID(), detectedAt: Date.now() });
  byTab.set(tabId, list.slice(0, 100));
  try {
    chrome.tabs.sendMessage(tabId, { type: "detected", item }).catch(() => {});
  } catch {}
}

chrome.webRequest.onHeadersReceived.addListener(details => {
  const headers = Object.fromEntries((details.responseHeaders || []).map(h => [h.name.toLowerCase(), h.value || ""]));
  const type = headers["content-type"] || "";
  if (details.type === "media" || VIDEO_RE.test(details.url) || /video|mpegurl/i.test(type)) {
    add(details.tabId, { url: details.url, type: kind(details.url, type), source: "network", contentType: type });
  }
}, { urls: ["<all_urls>"] }, ["responseHeaders"]);

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === "found") {
    add(sender.tab?.id ?? -1, { url: msg.url, type: kind(msg.url), source: "page", title: msg.title || "" });
    reply({ ok: true });
  } else if (msg.type === "list") {
    const tid = (msg.tabId != null && msg.tabId >= 0) ? msg.tabId : sender.tab?.id;
    reply({ items: byTab.get(tid) || [] });
  } else if (msg.type === "clear") {
    byTab.delete(msg.tabId); reply({ ok: true });
  } else if (msg.type === "download") {
    chrome.downloads.download({ url: msg.url, filename: msg.filename, saveAs: true })
      .then(id => reply({ ok: true, id })).catch(e => reply({ ok: false, error: e.message }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(tabId => byTab.delete(tabId));
