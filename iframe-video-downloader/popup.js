const list = document.querySelector("#list"), statusEl = document.querySelector("#status");
let tabId;
const safeName = (s, ext) => (s || "video").replace(/[\\/:*?\"<>|]+/g, "_").slice(0, 90) + "." + ext;
function setStatus(s, err=false){ statusEl.textContent=s; statusEl.parentElement.classList.toggle("error",err); }
async function message(msg){ return chrome.runtime.sendMessage(msg); }
async function copy(url){ await navigator.clipboard.writeText(url); setStatus("Media URL copied."); }
async function direct(item){
  const ext=(item.type||"mp4").toLowerCase().replace("video","mp4");
  const r=await message({type:"download",url:item.url,filename:safeName(item.title,ext)});
  setStatus(r.ok?"Download started.":r.error,true);
}
function attr(line,name){const m=line.match(new RegExp(`${name}=(?:\"([^\"]+)\"|([^,]+))`));return m?.[1]||m?.[2]||""}
function mp4Boxes(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),boxes=[];
  const containers=new Set(["moov","trak","mdia"]);
  function walk(from,to){
    for(let p=from;p+8<=to;){
      let size=view.getUint32(p),header=8;
      const type=String.fromCharCode(bytes[p+4],bytes[p+5],bytes[p+6],bytes[p+7]);
      if(size===1&&p+16<=to){size=Number(view.getBigUint64(p+8));header=16}
      if(!size)size=to-p;if(size<header||p+size>to)break;
      boxes.push({type,start:p,size});
      if(containers.has(type))walk(p+header,p+size);
      p+=size;
    }
  }
  walk(0,bytes.byteLength);return {view,boxes};
}
function patchMp4Durations(source,totalSeconds){
  const bytes=new Uint8Array(source),{view,boxes}=mp4Boxes(bytes);
  const mvhd=boxes.find(b=>b.type==="mvhd");
  let movieScale=1000;
  if(mvhd){
    const v=bytes[mvhd.start+8],scaleAt=mvhd.start+(v?28:20),durationAt=mvhd.start+(v?32:24);
    movieScale=view.getUint32(scaleAt)||1000;
    if(v)view.setBigUint64(durationAt,BigInt(Math.round(totalSeconds*movieScale)));else view.setUint32(durationAt,Math.round(totalSeconds*movieScale));
  }
  for(const box of boxes){
    const v=bytes[box.start+8];
    if(box.type==="tkhd"){
      const at=box.start+(v?36:28),value=Math.round(totalSeconds*movieScale);
      if(v)view.setBigUint64(at,BigInt(value));else view.setUint32(at,value);
    }else if(box.type==="mdhd"){
      const scaleAt=box.start+(v?28:20),at=box.start+(v?32:24),scale=view.getUint32(scaleAt)||movieScale,value=Math.round(totalSeconds*scale);
      if(v)view.setBigUint64(at,BigInt(value));else view.setUint32(at,value);
    }
  }
  return bytes;
}
function transmuxTs(buffers,durations,totalSeconds){
  // Remux every HLS segment independently. Its MP4 decode time comes from the
  // playlist duration, so timestamp jumps/discontinuities in the TS are removed.
  const out=[];let initSegment=null,baseSeconds=0;
  buffers.forEach((buffer,index)=>{
    const tx=new muxjs.mp4.Transmuxer({keepOriginalTimestamps:false});
    tx.setBaseMediaDecodeTime(Math.round(baseSeconds*90000));
    tx.on("data",segment=>{if(!initSegment)initSegment=segment.initSegment;out.push(segment.data)});
    tx.push(new Uint8Array(buffer));tx.flush();
    baseSeconds+=durations[index]||0;
  });
  if(!initSegment)return new Blob([],{type:"video/mp4"});
  return new Blob([patchMp4Durations(initSegment,totalSeconds),...out],{type:"video/mp4"});
}
async function hls(item){
  try{
    setStatus("Reading HLS playlist…");
    let playlistUrl=item.url, text=await (await fetch(playlistUrl)).text();
    if(text.includes("#EXT-X-KEY")) throw new Error("Encrypted HLS is not supported.");
    if(text.includes("#EXT-X-STREAM-INF")){
      const lines=text.split(/\r?\n/), variants=[];
      for(let i=0;i<lines.length;i++) if(lines[i].startsWith("#EXT-X-STREAM-INF")) variants.push({bw:+attr(lines[i],"BANDWIDTH")||0,url:new URL(lines[i+1],playlistUrl).href});
      variants.sort((a,b)=>b.bw-a.bw); playlistUrl=variants[0].url; text=await (await fetch(playlistUrl)).text();
    }
    if(text.includes("#EXT-X-KEY")) throw new Error("Encrypted HLS is not supported.");
    const playlistLines=text.split(/\r?\n/).map(x=>x.trim());
    const mapLine=playlistLines.find(x=>x.startsWith("#EXT-X-MAP:"));
    const mapUrl=mapLine?new URL(attr(mapLine,"URI"),playlistUrl).href:null;
    const entries=[];let pendingDuration=0;
    for(const line of playlistLines){
      if(line.startsWith("#EXTINF:")) pendingDuration=parseFloat(line.slice(8))||0;
      else if(line&&!line.startsWith("#")){entries.push({url:new URL(line,playlistUrl).href,duration:pendingDuration});pendingDuration=0}
    }
    const urls=entries.map(x=>x.url),durations=entries.map(x=>x.duration),totalSeconds=durations.reduce((a,b)=>a+b,0);
    if(!urls.length) throw new Error("No HLS segments found.");
    const parts=[];
    if(mapUrl){const r=await fetch(mapUrl);if(!r.ok)throw new Error(`MP4 initialization failed (${r.status}).`);parts.push(await r.arrayBuffer())}
    for(let i=0;i<urls.length;i++){setStatus(`Downloading segment ${i+1} of ${urls.length}…`);const r=await fetch(urls[i]);if(!r.ok)throw new Error(`Segment ${i+1} failed (${r.status}).`);parts.push(await r.arrayBuffer())}
    setStatus("Converting stream to MP4…");
    const first=new Uint8Array(parts[0]),isTs=first[0]===0x47;
    const blob=isTs?transmuxTs(parts,durations,totalSeconds):new Blob([patchMp4Durations(parts[0],totalSeconds),...parts.slice(1)],{type:"video/mp4"});
    if(!blob.size)throw new Error("The MP4 converter produced an empty file.");
    const url=URL.createObjectURL(blob);
    await chrome.downloads.download({url,filename:safeName(item.title,"mp4"),saveAs:true});
    setTimeout(()=>URL.revokeObjectURL(url),60000); setStatus("MP4 download created.");
  }catch(e){setStatus(e.message||"HLS download failed.",true)}
}
function render(items){
  if(!items.length){list.innerHTML='<div class="empty">Play the video, then reopen this popup.</div>';return}
  list.replaceChildren(...items.map(item=>{
    const el=document.createElement("section");el.className="item";
    const top=document.createElement("div");top.className="row";top.innerHTML=`<span class="tag"></span><strong>Detected media</strong>`;top.querySelector(".tag").textContent=item.type;
    const url=document.createElement("div");url.className="url";url.textContent=item.url;url.title=item.url;
    const actions=document.createElement("div");actions.className="actions";
    const dl=document.createElement("button");dl.textContent=item.type==="HLS"?"Download HLS":"Download";dl.onclick=()=>item.type==="HLS"?hls(item):direct(item);
    const cp=document.createElement("button");cp.textContent="Copy URL";cp.onclick=()=>copy(item.url);
    actions.append(dl,cp);el.append(top,url,actions);return el;
  }))
}
(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});tabId=tab.id;render((await message({type:"list",tabId})).items)})();
document.querySelector("#clear").onclick=async()=>{await message({type:"clear",tabId});render([]);setStatus("List cleared.")};
