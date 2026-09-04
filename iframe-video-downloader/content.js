const sent = new Set();
let panel;
let statusEl;
let currentItems = [];

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

const safeName = (s, ext) => (s || "video").replace(/[\\/:*?\"<>|]+/g, "_").slice(0, 90) + "." + ext;

function setStatus(message, error = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = error ? "#ff8c9e" : "#a99db5";
}

async function messageBackground(message) {
  return chrome.runtime.sendMessage(message);
}

async function copyUrl(url) {
  await navigator.clipboard.writeText(url);
  setStatus("Media URL copied.");
}

async function directDownload(item) {
  const ext = (item.type || "mp4").toLowerCase().replace("video", "mp4").replace("hls", "m3u8");
  const result = await messageBackground({ type: "download", url: item.url, filename: safeName(item.title, ext) });
  setStatus(result?.ok ? "Download started." : (result?.error || "Download failed."), !result?.ok);
}

function attr(line, name) {
  const match = line.match(new RegExp(`${name}=(?:"([^"]+)"|([^,]+))`));
  return match?.[1] || match?.[2] || "";
}

function mp4Boxes(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), boxes = [];
  const containers = new Set(["moov", "trak", "mdia"]);
  function walk(from, to) {
    for (let p = from; p + 8 <= to;) {
      let size = view.getUint32(p), header = 8;
      const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
      if (size === 1 && p + 16 <= to) { size = Number(view.getBigUint64(p + 8)); header = 16; }
      if (!size) size = to - p;
      if (size < header || p + size > to) break;
      boxes.push({ type, start: p, size });
      if (containers.has(type)) walk(p + header, p + size);
      p += size;
    }
  }
  walk(0, bytes.byteLength);
  return { view, boxes };
}

function patchMp4Durations(source, totalSeconds) {
  const bytes = new Uint8Array(source), { view, boxes } = mp4Boxes(bytes);
  const mvhd = boxes.find(b => b.type === "mvhd");
  let movieScale = 1000;
  if (mvhd) {
    const v = bytes[mvhd.start + 8], scaleAt = mvhd.start + (v ? 28 : 20), durationAt = mvhd.start + (v ? 32 : 24);
    movieScale = view.getUint32(scaleAt) || 1000;
    if (v) view.setBigUint64(durationAt, BigInt(Math.round(totalSeconds * movieScale)));
    else view.setUint32(durationAt, Math.round(totalSeconds * movieScale));
  }
  for (const box of boxes) {
    const v = bytes[box.start + 8];
    if (box.type === "tkhd") {
      const at = box.start + (v ? 36 : 28), value = Math.round(totalSeconds * movieScale);
      if (v) view.setBigUint64(at, BigInt(value)); else view.setUint32(at, value);
    } else if (box.type === "mdhd") {
      const scaleAt = box.start + (v ? 28 : 20), at = box.start + (v ? 32 : 24), scale = view.getUint32(scaleAt) || movieScale, value = Math.round(totalSeconds * scale);
      if (v) view.setBigUint64(at, BigInt(value)); else view.setUint32(at, value);
    }
  }
  return bytes;
}

function transmuxTs(buffers, durations, totalSeconds) {
  if (typeof muxjs === "undefined") throw new Error("mux.js did not load.");
  const out = [];
  let initSegment = null, baseSeconds = 0;
  buffers.forEach((buffer, index) => {
    const transmuxer = new muxjs.mp4.Transmuxer({ keepOriginalTimestamps: false });
    transmuxer.setBaseMediaDecodeTime(Math.round(baseSeconds * 90000));
    transmuxer.on("data", segment => { if (!initSegment) initSegment = segment.initSegment; out.push(segment.data); });
    transmuxer.push(new Uint8Array(buffer));
    transmuxer.flush();
    baseSeconds += durations[index] || 0;
  });
  if (!initSegment) return new Blob([], { type: "video/mp4" });
  return new Blob([patchMp4Durations(initSegment, totalSeconds), ...out], { type: "video/mp4" });
}

async function downloadHls(item) {
  try {
    setStatus("Reading HLS playlist…");
    let playlistUrl = item.url;
    let text = await (await fetch(playlistUrl)).text();
    if (text.includes("#EXT-X-KEY")) throw new Error("Encrypted HLS is not supported.");
    if (text.includes("#EXT-X-STREAM-INF")) {
      const lines = text.split(/\r?\n/), variants = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXT-X-STREAM-INF")) variants.push({ bw: +attr(lines[i], "BANDWIDTH") || 0, url: new URL(lines[i + 1], playlistUrl).href });
      }
      variants.sort((a, b) => b.bw - a.bw);
      playlistUrl = variants[0]?.url || playlistUrl;
      text = await (await fetch(playlistUrl)).text();
    }
    if (text.includes("#EXT-X-KEY")) throw new Error("Encrypted HLS is not supported.");
    const playlistLines = text.split(/\r?\n/).map(x => x.trim());
    const mapLine = playlistLines.find(x => x.startsWith("#EXT-X-MAP:"));
    const mapUrl = mapLine ? new URL(attr(mapLine, "URI"), playlistUrl).href : null;
    const entries = [];
    let pendingDuration = 0;
    for (const line of playlistLines) {
      if (line.startsWith("#EXTINF:")) pendingDuration = parseFloat(line.slice(8)) || 0;
      else if (line && !line.startsWith("#")) { entries.push({ url: new URL(line, playlistUrl).href, duration: pendingDuration }); pendingDuration = 0; }
    }
    if (!entries.length) throw new Error("No HLS segments found.");
    const parts = [], durations = entries.map(x => x.duration), totalSeconds = durations.reduce((a, b) => a + b, 0);
    if (mapUrl) parts.push(await (await fetch(mapUrl)).arrayBuffer());
    for (let i = 0; i < entries.length; i++) {
      setStatus(`Downloading segment ${i + 1} of ${entries.length}…`);
      const response = await fetch(entries[i].url);
      if (!response.ok) throw new Error(`Segment ${i + 1} failed (${response.status}).`);
      parts.push(await response.arrayBuffer());
    }
    setStatus("Converting stream to MP4…");
    const first = new Uint8Array(parts[0]), isTs = first[0] === 0x47;
    const blob = isTs ? transmuxTs(parts, durations, totalSeconds) : new Blob([patchMp4Durations(parts[0], totalSeconds), ...parts.slice(1)], { type: "video/mp4" });
    if (!blob.size) throw new Error("The MP4 converter produced an empty file.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName(item.title || document.title, "mp4");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setStatus("MP4 download created.");
  } catch (error) {
    setStatus(error.message || "HLS download failed.", true);
  }
}

function renderPanel(items) {
  currentItems = items || [];
  const list = panel?.shadowRoot?.querySelector("#ws-ext-list");
  if (!list) return;
  if (!currentItems.length) {
    list.innerHTML = '<div class="empty">Play the video in the iframe, then press Scan.</div>';
    return;
  }
  list.replaceChildren(...currentItems.map((item, index) => {
    const el = document.createElement("section");
    el.className = "item";
    el.innerHTML = `<div class="row"><span class="tag"></span><strong>Detected media</strong></div><div class="url"></div><div class="actions"><button></button><button>Copy URL</button></div>`;
    el.querySelector(".tag").textContent = item.type || getKind(item.url);
    el.querySelector(".url").textContent = item.url;
    el.querySelector(".url").title = item.url;
    const buttons = el.querySelectorAll("button");
    buttons[0].textContent = (item.type === "HLS" || /\.m3u8/i.test(item.url)) ? "Download HLS as MP4" : "Download";
    buttons[0].onclick = () => (item.type === "HLS" || /\.m3u8/i.test(item.url)) ? downloadHls(item) : directDownload(item);
    buttons[1].onclick = () => copyUrl(item.url);
    return el;
  }));
}

async function refreshPanel() {
  scan();
  setStatus("Scanning captured iframe media…");
  try {
    const result = await messageBackground({ type: "list" });
    renderPanel(result?.items || []);
    setStatus((result?.items || []).length ? "Ready." : "No media captured yet. Start playback, then Scan.");
  } catch (error) {
    setStatus(error.message || "Scan failed.", true);
  }
}

function openPanel() {
  if (window.top !== window) return;
  if (panel) { panel.remove(); panel = null; return; }
  panel = document.createElement("div");
  panel.id = "ws-extension-download-panel";
  const shadow = panel.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:16px;bottom:70px;z-index:2147483647;width:410px;max-width:calc(100vw - 32px);color:#f8f3ff;font:13px Inter,Arial,sans-serif}
      *{box-sizing:border-box}.wrap{background:radial-gradient(circle at 50% -20%,#32164f,transparent 45%),#09070d;border:1px solid #30233d;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.75);overflow:hidden}
      header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #30233d}h1{font-size:15px;margin:0 0 3px}p{color:#a99db5;margin:0;font-size:11px}button{border:1px solid #30233d;background:#20152d;color:#f8f3ff;border-radius:8px;padding:7px 10px;cursor:pointer}button:hover{border-color:#a568ff;background:#2a1940}
      main{padding:10px;max-height:430px;overflow:auto}.empty{text-align:center;color:#a99db5;padding:60px 20px}.item{background:linear-gradient(135deg,#171020,#100d15);border:1px solid #30233d;border-radius:11px;padding:11px;margin-bottom:8px}.row{display:flex;align-items:center;gap:8px}.tag{font-size:10px;font-weight:800;color:#160922;background:#a568ff;padding:3px 6px;border-radius:5px}.url{color:#cbbfd5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:8px 0;font-size:11px}.actions{display:flex;gap:6px}.actions button:first-child{flex:1;background:#a568ff;color:#100717;border:0;font-weight:700}.actions button:first-child:hover{background:#bb8bff}footer{padding:10px 14px;color:#a99db5;border-top:1px solid #30233d;font-size:10px}
    </style>
    <div class="wrap">
      <header><div><h1>embed downloader <small>built in</small></h1><p>powered by extension iframe capture</p></div><div><button id="scan">Scan</button> <button id="clear">Clear</button> <button id="close">✕</button></div></header>
      <main id="ws-ext-list"><div class="empty">Play the video, then press Scan.</div></main>
      <footer id="status">Ready.</footer>
    </div>`;
  document.documentElement.appendChild(panel);
  statusEl = shadow.querySelector("#status");
  shadow.querySelector("#scan").onclick = refreshPanel;
  shadow.querySelector("#clear").onclick = async () => { await messageBackground({ type: "clear" }); renderPanel([]); setStatus("List cleared."); };
  shadow.querySelector("#close").onclick = () => { panel.remove(); panel = null; };
  refreshPanel();
}

function injectDownloadButton() {
  if (window.top !== window) return;
  const toolbar = document.querySelector(".player-toolbar");
  if (!toolbar || toolbar.querySelector("#ws-extension-download-button")) return;
  const button = document.createElement("button");
  button.id = "ws-extension-download-button";
  button.type = "button";
  button.className = "btn btn-secondary";
  button.style.cssText = "padding:4px 10px;font-size:12px;display:flex;align-items:center;gap:5px";
  button.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>DOWNLOAD';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openPanel();
  });
  toolbar.appendChild(button);
}

if (window.top === window) {
  new MutationObserver(injectDownloadButton).observe(document.documentElement, { subtree: true, childList: true });
  addEventListener("DOMContentLoaded", injectDownloadButton);
  setInterval(injectDownloadButton, 1000);
  injectDownloadButton();
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
