let state={view:'welcome',query:'',player:null,mode:'standalone',prevState:null,user:null,_title:'',_year:'',_poster:'',_savedSeason:null,_savedEpisode:null,_sources:null}
let backendUrl=localStorage.getItem('um_backend')||''
let token='',refreshToken=''

async function tryRefreshSession(){
  return false
}

async function detect(){
  for(let i=0;i<3;i++){
    try{const r=await fetch('/api/status',{signal:AbortSignal.timeout(5000)});if(r.ok){state.mode='backend';state.backendUrl='';return}}catch{}
    if(i<2)await new Promise(r=>setTimeout(r,2000))
  }
  if(backendUrl){try{const r=await fetch(`${backendUrl}/api/status`,{signal:AbortSignal.timeout(5000)});if(r.ok){state.mode='backend';state.backendUrl=backendUrl;return}}catch{}}
  state.mode='standalone';state.backendUrl=''
}

async function api(m,t,p,n){
  if(state.mode==='backend'){
    const b=state.backendUrl||'';const o={headers:{'Content-Type':'application/json'}}
    if(p)o.body=JSON.stringify(p)
    const r=await fetch(`${b}${t}`,{...o,method:m,credentials:'include'})
    if(!r.ok){const e=await r.json().catch(()=>({error:`HTTP ${r.status}`}));throw new Error(e.error)}
    return r.json()
  }
  return standalone(t)
}

async function standalone(a){
  if(a==='/api/status')return{mode:'standalone'}
  const p=new URLSearchParams(a.split('?')[1]||'')
  if(a.startsWith('/api/search')){const q=p.get('q');if(!q)return[];const r=await fetch('https://v3.sg.media-imdb.com/suggestion/x/'+encodeURIComponent(q)+'.json');const d=await r.json();return(d.d||[]).filter(i=>i.id).map(i=>({id:i.id,title:i.l,year:i.y||null,poster:i.i?.[0]||'',type:(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}))}
  if(a==='/api/trending'||a.startsWith('/api/popular'))return[]
  const mid=a.match(/\/api\/movie\/(tt\d+)(\/sources)?(\?|$)/)
  if(mid){const id=mid[1];if(mid[2]==='/sources')return srcs(p.get('title'),p.get('year'),id);return imdbDetails(id)}
  throw new Error('Backend required')
}

async function imdbDetails(id){const k='d:'+id;const c=sessionStorage.getItem(k);if(c)return JSON.parse(c);let d={id,title:'',year:null,poster:'',overview:'',genres:[],runtime:null,cast:[],rating:null,type:'movie'};try{const r=await fetch('https://v3.sg.media-imdb.com/suggestion/x/'+id+'.json');const j=await r.json();const i=j.d?.find(x=>x.id===id)||j.d?.[0];if(i){d.title=i.l||'';d.year=i.y||null;d.poster=i.i?.[0]||'';d.cast=i.s?i.s.split(', '):[];d.type=(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}}catch{}try{const r=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(d.title+(d.year?' '+d.year:'')+' film'));const w=await r.json();if(w.extract)d.overview=w.extract;if(!d.poster&&w.thumbnail?.source)d.poster=w.thumbnail.source}catch{}sessionStorage.setItem(k,JSON.stringify(d));return d}
async function srcs(title,year,imdbId){const k='s:'+(imdbId||title);const c=sessionStorage.getItem(k);if(c)return JSON.parse(c);let src=[];try{const r=await fetch('https://'+atob('dG9ycmVudGlvLnN0cmVtLmZ1bg==')+'/stream/movie/'+imdbId+'.json');const d=await r.json();if(d?.streams)for(const s of d.streams){const seedM=s.title?.match(/👤\s*(\d+)/);const sizeM=s.title?.match(/💾\s*([\d.]+)\s*(GB|MB)/);src.push({provider:'TSX',quality:((s.title||s.name||'').includes('4K')?'4K':(s.title||'').includes('1080')?'1080p':(s.title||'').includes('720')?'720p':'Unknown'),size:sizeM?sizeM[1]+' '+sizeM[2]:'',seeds:seedM?parseInt(seedM[1]):0,peers:0,hash:s.infoHash,fileIndex:s.fileIdx||0})}}catch{}src.sort((a,b)=>(b.seeds||0)-(a.seeds||0));sessionStorage.setItem(k,JSON.stringify(src));return src}
function qs(s){return document.querySelector(s)}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function img(p){return p||''}
function fmt(s){if(!s)return'';const m=s.match(/^[\d.]+/);if(!m)return s;const n=parseFloat(m[0]);if(s.includes('GB')&&n>=1)return n.toFixed(1)+' GB';if(s.includes('GB'))return (n*1024).toFixed(0)+' MB';if(s.includes('MB')&&n>=1000)return (n/1024).toFixed(1)+' GB';return Math.round(n)+' MB'}
function title(i){return i.title||i.name||'Unknown'}
function year(i){return i.year||''}
function rating(i){return i.rating?i.rating.toFixed(1):null}

function navigate(v,d){
  state.prevState={view:state.view,data:state.data};state.view=v;state.data=d
  let h='#'
  if(v==='search')h='#q='+encodeURIComponent(state.query||'')
  else if(v==='detail'){
    const ep=selectedEpisode?'&s='+selectedSeason+'&e='+selectedEpisode:''
    h='#id='+(d?.id||'')+(d?.type==='tv'?'&type=tv':'')+(d?.title?'&t='+encodeURIComponent(d.title):'')+(d?.year?'&y='+d.year:'')+ep+(d?._playHash?'&hash='+d._playHash:'')
  }else if(v==='profile')h='#profile'
  else if(v==='notice')h='#notice'
  history.replaceState(null,'',h);render()
}

window.addEventListener('popstate',()=>{
  if(state.player)return
  const h=window.location.hash.slice(1)
  if(!h||h==='/'||h===''){state.view='welcome';render();return}
  if(h==='profile'){state.view='profile';render();return}
  const p=new URLSearchParams(h)
  if(p.has('q')){state.query=p.get('q');qs('#searchInput').value=state.query;render()}
  else if(p.has('id')){
    state.view='detail';const se=parseInt(p.get('s')),ep=parseInt(p.get('e'))
    if(se&&ep){selectedSeason=se;selectedEpisode=ep}
    state.data={id:p.get('id'),type:p.get('type')||'movie',title:p.get('t')||'',year:p.get('y')||'',season:se||null,episode:ep||null}
    render()
  }
})

function goBack(){if(state.prevState){state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;render()}else navigate('home')}

async function render(){renderUserSection();const m=qs('#main');try{if(state.view==='welcome'){m.innerHTML=W()}else if(state.view==='home'){m.innerHTML=H();L()}else if(state.view==='search'){m.innerHTML=S();LS()}else if(state.view==='detail'){m.innerHTML=D();LD()}else if(state.view==='profile'){m.innerHTML=PR();PL()}else if(state.view==='notice'){m.innerHTML=NT()}}catch(e){m.innerHTML=E(e.message)}}

function renderUserSection(){
  const el=qs('#userSection');if(!el)return
  if(state.user){
    const d=state.user.username||state.user.email
    el.innerHTML='<div class="user-menu" style="position:relative"><button class="user-btn" onclick="toggleUserMenu()">'+esc(d)+' <span style="font-size:10px">▼</span></button><div class="user-drop" id="userDrop" style="display:none;position:absolute;top:100%;right:0;background:var(--surface-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:4px;min-width:120px;z-index:200"><button class="speed-option" onclick="navigate(\'profile\');toggleUserMenu()">profile</button><button class="speed-option" onclick="signOut();toggleUserMenu()">sign out</button></div></div>'
  }else el.innerHTML='<button class="user-btn" onclick="showAuth()">sign in</button>'
}
function toggleUserMenu(){const d=qs('#userDrop');if(d)d.style.display=d.style.display==='block'?'none':'block'}
document.addEventListener('click',e=>{const d=qs('#userDrop'),b=qs('#userDrop')?.previousElementSibling;if(d&&!d.contains(e.target)&&e.target!==b)d.style.display='none'})
document.addEventListener('contextmenu',e=>{
  if(!state.user||state.view!=='detail'||!state.data?.id)return
  const cm=qs('#ctxMenu');if(cm){cm.style.display='none';cm.remove()}
  const m=document.createElement('div');m.id='ctxMenu';m.style.cssText='position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;background:var(--surface-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:4px;min-width:150px;z-index:300'
  m.innerHTML='<button class="speed-option" onclick="toggleWatchlist();qso()">toggle watchlist</button>'
  document.body.appendChild(m)
  e.preventDefault()
})
document.addEventListener('click',()=>{const cm=qs('#ctxMenu');if(cm){cm.remove()}})
document.addEventListener('contextmenu',e=>{
  const card=e.target.closest('.card');if(!card||state.view!=='profile'||!state.user)return
  const id=card.dataset.id,t=card.dataset.title,p=card.dataset.poster;if(!id)return
  const cm=qs('#ctxMenu');if(cm){cm.style.display='none';cm.remove()}
  const m=document.createElement('div');m.id='ctxMenu';m.style.cssText='position:fixed;left:'+e.clientX+'px;top:'+e.clientY+'px;background:var(--surface-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:4px;min-width:150px;z-index:300'
  m.innerHTML='<button class="speed-option" onclick="moveProgress(\''+id+'\',\'watched\');qso()">mark watched</button><button class="speed-option" onclick="moveProgress(\''+id+'\',\'planned\');qso()">plan to watch</button><button class="speed-option" onclick="addWatchlistFromProfile(\''+id+'\',\''+esc(t||'')+'\',\''+(p||'')+'\',\'movie\');qso()">add to watchlist</button><button class="speed-option" onclick="deleteProgress(\''+id+'\');qso()">remove</button>'
  document.body.appendChild(m)
  e.preventDefault()
})
function qso(){const cm=qs('#ctxMenu');if(cm)cm.remove()}
async function moveProgress(id,status){fetch((state.backendUrl||'')+'/api/progress/update',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id,status})}).catch(()=>{});PL()}
async function deleteProgress(id){fetch((state.backendUrl||'')+'/api/progress/delete',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id})}).catch(()=>{});PL()}

function W(){return'<div class="welcome"><div class="welcome-card"><h1 style="color:var(--primary)">web-streaming <span class="beta-tag">beta</span></h1><p>a simple streaming site that simply works.</p><ul class="welcome-list"><li>simply doesn\'t spam ads</li><li>simply doesn\'t break half the time</li><li>simply just works</li></ul><p>everything runs with no budget. hosted on render\'s free tier.</p><p style="font-size:13px"><a href="#" onclick="navigate(\'notice\');return false" style="color:var(--primary)">view project notice</a></p><button class="btn btn-primary" style="margin-top:20px;font-size:16px;padding:14px 48px" onclick="navigate(\'home\')">enter</button></div></div>'}
function enterSite(){state.view='home';navigate('home')}

function H(){return'<div class="loading-screen" id="HL"><div class="spinner"></div><p>loading...</p></div>'}

async function L(){
  try{
    if(state.user){(async()=>{try{const cw=await api('GET','/api/progress/list?status=watching');if(cw?.length){qs('#main').insertAdjacentHTML('afterbegin','<div class="section"><h2 class="section-title">continue watching</h2><div class="grid" id="cwGrid"></div></div>');G('cwGrid',cw.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type,progress:i.watched&&i.duration?i.watched/i.duration:0})))}}catch{}})()}
    const a=await api('GET','/api/trending');qs('#HL').style.display='none'
    if(!a.length){qs('#HL').outerHTML='<div class="loading-screen"><p>no backend connected. try searching.</p></div>';return}
    window._trending=a
    // Filter bar
    qs('#main').insertAdjacentHTML('beforeend','<div class="section" style="padding-bottom:0"><div style="display:flex;gap:8px;margin-bottom:16px"><button class="profile-tab active" onclick="filterTrending(\'all\',this)">all</button><button class="profile-tab" onclick="filterTrending(\'movie\',this)">movies</button><button class="profile-tab" onclick="filterTrending(\'tv\',this)">tv shows</button></div><div class="grid" id="g0"></div></div>')
    G('g0',a)
  }catch(e){qs('#main').innerHTML='<div class="error-view"><p>'+esc(e.message)+'</p></div>'}
}

function filterTrending(type,btn){
  const tabs=document.querySelectorAll('.profile-tab');tabs.forEach(t=>t.classList.remove('active'))
  if(btn)btn.classList.add('active')
  const items=window._trending||[]
  const filtered=type==='all'?items:items.filter(i=>i.type===type)
  G('g0',filtered)
  if(!filtered.length)qs('#g0').innerHTML='<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:40px">nothing here</p>'
}

function el(tag,opts={},...children){
  const e=document.createElement(tag)
  if(opts.cls)e.className=opts.cls
  if(opts.id)e.id=opts.id
  if(opts.text)e.textContent=opts.text
  if(opts.html)e.innerHTML=opts.html
  children.forEach(c=>e.appendChild(c))
  return e
}

function sectionHTML(title,items){return'<div class="section"><h2 class="section-title">'+esc(title)+'</h2><div class="grid" id="sg'+title.replace(/\s/g,'')+'"></div></div>'}

function S(){return'<div class="section"><h2 class="section-title">Results for "'+esc(state.query)+'"</h2><div class="grid" id="sg"></div><div class="loading-screen" id="sL"><div class="spinner"></div><p>Searching...</p></div></div>'}
async function LS(){try{const r=await api('GET','/api/search?q='+encodeURIComponent(state.query));qs('#sL').style.display='none';G('sg',r)}catch(e){qs('#main').innerHTML=E(e.message)}}

function D(){return'<div class="detail"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="loading-screen" id="dL"><div class="spinner"></div><p>Loading...</p></div></div>'}

async function LD(){
  const{id,type,title:t,year:y,season:s,episode:ep}=state.data
  const tHint=t||'',yHint=y||''
  if(s&&ep){selectedSeason=s;selectedEpisode=ep}
  try{
    const d=await api('GET','/api/movie/'+id+'?type='+type+'&title='+encodeURIComponent(tHint)+'&year='+yHint)
    state.data._title=d.title||'';state.data._year=d.year||'';state.data._poster=d.poster||''
    if(d.type==='tv'||type==='tv'){const eps=await api('GET','/api/show/'+id+'/episodes?title='+encodeURIComponent(d.title||''));RD(d,null,eps)}
    else{const src=await api('GET','/api/movie/'+id+'/sources?title='+encodeURIComponent(d.title||'')+'&year='+(d.year||'')+'&type='+type);RD(d,src,null)}
  }catch(e){qs('#dL').outerHTML='<p style="color:var(--text-muted);padding:20px">'+esc(e.message)+'</p>'}
}

let selectedSeason=1,selectedEpisode=1

async function loadEpisodeSources(id,season,episode){
  const title=state.data?._title||'',year=state.data?._year||'',list=qs('#sl')
  if(!list)return
  list.innerHTML='<div class="loading-screen" style="padding:16px"><div class="spinner"></div></div>'
  const q='S'+String(season).padStart(2,'0')+'E'+String(episode).padStart(2,'0')
  let srcs=null
  try{srcs=await api('GET','/api/show/'+id+'/sources?title='+encodeURIComponent(title)+'&year='+year+'&type=tv&season='+season+'&episode='+episode+'&_='+Date.now())}catch{}
  if(!srcs||!srcs.length){try{const r=await fetch('https://'+atob('dG9ycmVudGlvLnN0cmVtLmZ1bg==')+'/stream/series/'+id+':'+season+':'+episode+'.json');const d=await r.json();if(d?.streams)srcs=d.streams.map(x=>{const t=x.title||'',sM=t.match(/👤\s*(\d+)/),zM=t.match(/💾\s*([\d.]+)\s*(GB|MB)/);return{provider:'TSX',quality:t.includes('4K')?'4K':t.includes('1080')?'1080p':t.includes('720')?'720p':'Unknown',size:zM?zM[1]+' '+zM[2]:'',seeds:sM?parseInt(sM[1]):0,peers:0,hash:x.infoHash,fileIndex:x.fileIdx||0}})}catch{}}
  if(!srcs||!srcs.length){list.innerHTML='<p style="color:var(--text-muted);font-size:14px;padding:8px 0">No sources for '+esc(title)+' '+q+'.</p>';return}
  srcs.sort((a,b)=>(b.seeds||0)-(a.seeds||0))
  state._sources=srcs
  list.innerHTML=srcs.map(src=>{const eu=',\''+esc(src.embedUrl)+'\'';return'<div class="source-item" id="src-'+src.hash+'"><div class="source-info"><span class="source-quality">HD</span><span style="color:var(--text-muted);font-size:11px">'+(src.provider||'')+'</span></div><button class="source-play" style="background:#4ade80;color:#000" onclick="playSource(\''+src.hash+'\',0,\''+esc(title)+' '+q+'\''+eu+')">▶ Play</button></div>'}).join('')
  if(state.data?._playHash){const ph=state.data._playHash;state.data._playHash=null;setTimeout(()=>{const b=qs('#src-'+ph+' .source-play');if(b)b.click()},100)}
}

function RD(d,srces,episodes){
  const t=d.title||'Unknown',y=d.year||'',rt=d.runtime?Math.floor(d.runtime/60)+'h '+d.runtime%60+'m':'',r=d.rating?d.rating.toFixed(1):'',o=d.overview||'No overview available.',g=d.genres||[],c=d.cast&&d.cast.length?d.cast.join(', '):'',isTv=episodes&&episodes.length>0
  document.title=t+' - web-streaming'
  const posterUrl=d.poster||''
  let wlBtn=''
  if(state.user){wlBtn='<button class="wl-btn" id="wlBtn" onclick="toggleWatchlist()">Loading...</button>';setTimeout(async()=>{try{const r=await api('GET','/api/watchlist/check?id='+d.id);const b=qs('#wlBtn');if(b){b.textContent=r.inList?'✓ In Watchlist':'+ Watchlist';b.className='wl-btn'+(r.inList?' in-list':'')}}catch{}},50)}
  let epHTML=''
  if(isTv){
    if(state.data?.season&&state.data?.episode){selectedSeason=state.data.season;selectedEpisode=state.data.episode;state.data.season=null;state.data.episode=null}
    else if(!selectedSeason||!episodes.some(x=>x.season===selectedSeason)){selectedSeason=episodes[0]?.season||1;selectedEpisode=episodes[0]?.episodes?.[0]?.number||1}
    window._eps=episodes
    epHTML='<div class="episode-picker"><div class="sources-title">Select Episode</div><div class="episode-controls"><select id="seasonSelect">'+episodes.map(s=>'<option value="'+s.season+'">Season '+s.season+' ('+s.episodes.length+' eps)</option>').join('')+'</select><select id="episodeSelect"></select></div><div id="episodeInfo" class="episode-info"></div><div class="sources-section" style="margin-top:12px"><div class="sources-title">Sources</div><div class="sources-list" id="sl"><div class="loading-screen" style="padding:12px"><div class="spinner"></div></div></div></div></div>'
  }
  qs('#dL').outerHTML='<div class="detail-hero"><div class="detail-poster">'+(posterUrl?'<img src="'+posterUrl+'" alt="'+esc(t)+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22><rect fill=%22%231a1a1a%22 width=%22200%22 height=%22300%22/><text x=%22100%22 y=%22160%22 text-anchor=%22middle%22 font-size=%2248%22 fill=%22%23555%22>🎬</text></svg>\'">':'<div class="card-placeholder" style="aspect-ratio:2/3">🎬</div>')+'</div><div class="detail-info"><h1 class="detail-title">'+esc(t)+'</h1><div class="detail-meta">'+(y?'<span>'+y+'</span>':'')+(rt?'<span>'+rt+'</span>':'')+'</div><div class="detail-genres">'+g.map(x=>'<span>'+x+'</span>').join('')+'</div>'+(r?'<div class="detail-rating"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> '+r+'/10</div>':'')+(wlBtn?'<div style="margin-bottom:16px">'+wlBtn+'</div>':'')+'<p class="detail-overview">'+esc(o)+'</p>'+(c?'<p class="detail-cast"><strong>Stars:</strong> '+esc(c)+'</p>':'')+epHTML+'</div></div>'

  if(isTv){
    const ie=()=>{const ss=qs('#seasonSelect');if(!ss){setTimeout(ie,100);return};ss.value=selectedSeason;ss.onchange=function(){fillEpisodes(true)};fillEpisodes()};setTimeout(ie,50)
  }else{
    const list=qs('#sl')
    if(!srces||!srces.length){if(list)list.innerHTML='<p style="color:var(--text-muted);font-size:14px;padding:8px 0">No sources found.</p>';return}
    state._sources=srces
    if(list)list.innerHTML=srces.map(s=>{const eu=',\''+esc(s.embedUrl)+'\'';return'<div class="source-item" id="src-'+s.hash+'"><div class="source-info"><span class="source-quality">HD</span><span style="color:var(--text-muted);font-size:11px">'+(s.provider||'')+'</span></div><button class="source-play" style="background:#4ade80;color:#000" onclick="playSource(\''+s.hash+'\',0,\''+esc(t)+'\''+eu+')">▶ Play</button></div>'}).join('')
    if(state.data?._playHash){const ph=state.data._playHash;state.data._playHash=null;setTimeout(()=>{const b=qs('#src-'+ph+' .source-play');if(b)b.click()},100)}
  }

}

async function toggleWatchlist(){
  const id=state.data?.id;if(!id)return;const btn=qs('#wlBtn');if(!btn)return;const wasIn=btn.textContent.includes('In')||btn.textContent.includes('✓');btn.textContent='...'
  try{if(wasIn){await api('POST','/api/watchlist/remove',{id});btn.textContent='+ Watchlist';btn.className='wl-btn'}else{const d=state.data;await api('POST','/api/watchlist/add',{id,title:d._title||'',poster:d._poster||'',type:d.type||'movie'});btn.textContent='✓ In Watchlist';btn.className='wl-btn in-list'}}catch{btn.textContent='Error';btn.className='wl-btn'}
}

function fillEpisodes(isSeasonChange){
  const eps=window._eps;if(!eps)return;const ss=qs('#seasonSelect');if(!ss)return;const season=parseInt(ss.value);selectedSeason=season;const epData=eps.find(s=>s.season===season);if(!epData)return;const es=qs('#episodeSelect');if(!es)return
  es.innerHTML=epData.episodes.map(e=>'<option value="'+e.number+'">'+e.number+'. '+esc(e.name)+(e.airdate?' ('+e.airdate+')':'')+'</option>').join('')
  if(isSeasonChange||!epData.episodes.some(e=>e.number===selectedEpisode))selectedEpisode=epData.episodes[0]?.number||1
  es.value=selectedEpisode;es.onchange=function(){selectedEpisode=parseInt(this.value);updateEpisodeInfo();updateHashForEpisode();loadEpisodeSources(state.data.id,selectedSeason,selectedEpisode)}
  updateEpisodeInfo();loadEpisodeSources(state.data.id,selectedSeason,selectedEpisode)
}
function updateHashForEpisode(){if(!state.data)return;history.replaceState(null,'','#id='+state.data.id+'&type=tv&t='+encodeURIComponent(state.data._title||'')+'&y='+(state.data._year||'')+'&s='+selectedSeason+'&e='+selectedEpisode+(state.data._playHash?'&hash='+state.data._playHash:''))}
function updateEpisodeInfo(){const eps=window._eps;if(!eps)return;const epData=eps.find(s=>s.season===selectedSeason);if(!epData)return;const ep=epData.episodes.find(e=>e.number===selectedEpisode);const info=qs('#episodeInfo');if(info&&ep)info.innerHTML=ep.summary?'<p style="font-size:13px;color:var(--text-muted);margin-top:8px">'+esc(ep.summary.slice(0,300))+'</p>':''}

function playerHTML(title){return'<div class="player-container"><button class="player-back" onclick="cp()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="player-wrapper" id="pw"><div class="player-loading" id="pl"><div class="spinner"></div><p id="plText">Connecting...</p><span class="player-progress-text" id="ps"></span></div><video id="player" crossorigin="anonymous" style="display:none;width:100%;height:100%;background:#000"></video><div id="customControls"><div class="controls-row"><button class="ctrl-btn" id="ppBtn">▶</button><span class="time-display" id="timeDisplay">0:00 / 0:00</span><div class="seek-container" id="seekBar"><div class="seek-track"><div class="seek-fill" id="seekFill"></div><div class="seek-thumb" id="seekThumb"></div></div></div><span class="time-display" id="timeRemaining">-0:00</span><div class="vol-group"><button class="ctrl-btn" id="volBtn"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></button><input type="range" class="vol-slider" id="volSlider" min="0" max="1" step=".05" value="1"></div><button class="ctrl-btn" id="ccBtn" title="Captions"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M7 12h2m3 0h6"/><path d="M7 15h1.5m3.5 0h6"/></svg></button><button class="ctrl-btn" id="spdBtn" title="Speed">1x</button><div class="speed-menu" id="speedMenu">'+[.5,.75,1,1.25,1.5,2].map(x=>'<button class="speed-option'+(x===1?' active':'')+'" data-speed="'+x+'">'+x+'x</button>').join('')+'</div><button class="ctrl-btn" id="fsBtn"><svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button></div></div><div class="kbd-hint" id="kbdHint"></div></div></div>'}

async function playBest(){
  if(!state._sources||!state._sources.length)return
  if(state.mode!=='backend'){alert('Backend required');return}
  const alive=state._sources.filter(s=>(s.seeds||0)>0||(s.peers||0)>0)
  if(!alive.length){alert('No viable sources');return}
  const title=state.data?._title||''
  state.view='player';document.title=title+' - web-streaming';qs('#app').innerHTML=playerHTML(title)
  const ps=qs('#ps'),pl=qs('#plText');if(pl)pl.textContent='Finding source...';if(ps)ps.textContent='Testing '+alive.length+' sources'
  try{
    const base=state.backendUrl||''
    const rr=await fetch(base+'/api/race',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sources:alive.map(s=>({hash:s.hash,fileIndex:s.fileIndex||0}))})})
    const race=await rr.json()
    if(!race.found){perr('No viable source found');return}
    if(race.error){perr(race.error);return}
    if(pl)pl.textContent='Buffering...'
    streamAndPlay(race.hash,0,race.id,ps,pl)
  }catch(e){perr(e.message)}
}

async function playSource(hash,fi,title,embedUrl){
  state.prevState={view:state.view,data:state.data}
  if(embedUrl){
    history.replaceState(null,'','#'+getDetailHash()+'&hash='+hash)
    state.view='player';document.title=title+' - web-streaming';qs('#app').innerHTML=ifr(embedUrl,title)
    // auto-save as watching
    if(state.user&&state.data?.id){
      const se=state.data.type==='tv'?selectedSeason:0,ep=state.data.type==='tv'?selectedEpisode:0
      fetch((state.backendUrl||'')+'/api/progress/save',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id:state.data.id,title:state._title||state.data.title||'',poster:state._poster||'',type:state.data.type||'movie',season:se,episode:ep,duration:0,watched:0,status:'watching'})}).catch(()=>{})
    }
    return
  }
  if(state.mode!=='backend'){alert('Backend required');return}
  history.replaceState(null,'','#'+getDetailHash()+'&hash='+hash)
  state.view='player';document.title=title+' - web-streaming';qs('#app').innerHTML=playerHTML(title)
  const ps=qs('#ps'),pl=qs('#plText');if(pl)pl.textContent='Connecting...';if(ps)ps.textContent=''
  streamAndPlay(hash,fi||0,null,ps,pl)
}

function getDetailHash(){
  const d=state.data||{};let h='id='+(d.id||'')
  if(d.type==='tv')h+='&type=tv'
  if(d.title)h+='&t='+encodeURIComponent(d.title)
  if(d.year)h+='&y='+d.year
  if(selectedSeason&&selectedEpisode)h+='&s='+selectedSeason+'&e='+selectedEpisode
  return h
}

function ifr(url,title){
  document.title=title+' - web-streaming'
  const u=url.replace(/'/g,'%27')
  return'<div class="player-container"><button class="player-back" onclick="cp()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>back</button><div class="player-wrapper"><iframe src="'+u+'" allow="autoplay;encrypted-media;fullscreen" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:none;background:#000"></iframe></div></div>'
}

async function streamAndPlay(hash,fi,dlId,ps,pl){
  const base=state.backendUrl||'',infoHash=hash
  let pollIv=null
  if(dlId){pollIv=setInterval(async()=>{try{const r=await fetch(base+'/api/download/'+dlId+'/status');const st=await r.json();if(!st||st.error)return;const pct=Math.round((st.progress||0)*100),speed=st.speed?(st.speed/1e6).toFixed(1)+' MB/s':'';if(pl)pl.textContent='Buffering...';if(ps)ps.textContent=pct+'%'+(speed?' · '+speed:'')}catch{}},1000)}
  try{
    const r=await fetch(base+'/api/stream/'+hash+'?fileIndex='+fi)
    if(!r.ok){if(pollIv)clearInterval(pollIv);perr('Stream failed');return}
    const reader=r.body.getReader(),chunks=[],startTime=Date.now();let received=0
    while(true){const{done,value}=await reader.read();if(done)break;chunks.push(value);received+=value.length
      if(!dlId){const elapsed=(Date.now()-startTime)/1000,speed=elapsed>0?(received/elapsed/1e6).toFixed(1)+' MB/s':'';if(pl)pl.textContent='Buffering...';if(ps)ps.textContent=(received/1e6).toFixed(0)+' MB'+(speed?' · '+speed:'')}}
    if(pollIv)clearInterval(pollIv)
    if(pl)pl.textContent='Starting...';if(ps)ps.textContent=''
    const blob=new Blob(chunks,{type:'video/mp4'}),video=qs('#player')
    qs('#pl').style.display='none';video.style.display='block';video.muted=false;video.volume=1
    video.src=URL.createObjectURL(blob)
    const ts=parseInt(new URLSearchParams(window.location.hash.slice(1)).get('t'))
    if(ts&&ts>0)video.currentTime=ts
    initPlayer(video,base,infoHash)
    if(video._enableSeek)video._enableSeek()
    try{const sr=await fetch(base+'/api/subtitles/'+infoHash+'/list'),sd=await sr.json();if(sd.tracks?.length){const vr=await fetch(base+'/api/subtitles/'+infoHash+'/0'),vtt=await vr.text(),sb=new Blob([vtt],{type:'text/vtt'}),url=URL.createObjectURL(sb),tr=document.createElement('track');tr.kind='captions';tr.label=sd.tracks[0].name||'English';tr.srclang='en';tr.src=url;tr.id='preSub';video.appendChild(tr);for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=i===video.textTracks.length-1?'showing':'hidden'}}catch{}
  }catch(e){if(pollIv)clearInterval(pollIv);perr(e.message)}
}

function initPlayer(video,baseUrl,infoHash){
  const pp=qs('#ppBtn'),seek=qs('#seekBar'),fill=qs('#seekFill'),thumb=qs('#seekThumb'),timeD=qs('#timeDisplay'),timeR=qs('#timeRemaining'),volBtn=qs('#volBtn'),volSlider=qs('#volSlider'),fs=qs('#fsBtn'),ccBtn=qs('#ccBtn'),spdBtn=qs('#spdBtn'),spdMenu=qs('#speedMenu'),ctrls=qs('#customControls'),kbdHint=qs('#kbdHint')
  let hideTimer,audioCtx,audioSrc,seekEnabled=false
  function ul(){if(audioSrc||!video)return;try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioSrc=audioCtx.createMediaElementSource(video);audioSrc.connect(audioCtx.destination);audioCtx.resume()}catch{}video.muted=false;video.volume=parseFloat(volSlider?.value||'1');video.play().catch(()=>{})}
  video.oncanplay=()=>{qs('#pl').style.display='none';video.style.display='block';ctrls.style.display='';ul();video.play().catch(()=>{})}
  video.onplaying=()=>{qs('#pl').style.display='none'}
  pp.onclick=()=>{if(video.paused){video.play();pp.textContent='⏸'}else{video.pause();pp.textContent='▶'}}
  video.onplay=()=>{pp.textContent='⏸'};video.onpause=()=>{pp.textContent='▶'};video.onended=()=>{pp.textContent='▶'}
  video.ontimeupdate=()=>{if(!video.duration)return;const pct=(video.currentTime/video.duration)*100;fill.style.width=pct+'%';thumb.style.display='';thumb.style.left=pct+'%';timeD.textContent=fmtTime(video.currentTime)+' / '+fmtTime(video.duration);if(timeR)timeR.textContent='-'+(video.duration-video.currentTime>0?fmtTime(video.duration-video.currentTime):'0:00');    if(state.user&&state.data?.id){const se=state.data.type==='tv'?selectedSeason:0,ep=state.data.type==='tv'?selectedEpisode:0;clearTimeout(window._st);window._st=setTimeout(()=>{fetch(baseUrl+'/api/progress/save',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id:state.data.id,title:state._title||'',poster:state._poster||'',type:state.data.type||'movie',season:se,episode:ep,duration:Math.round(video.duration),watched:Math.round(video.currentTime),status:video.currentTime/video.duration>.9?'watched':'watching'})}).catch(()=>{})},5000)}}
  let seeking=false;function ds(cx){if(!video.duration||!seekEnabled)return;const rc=seek.getBoundingClientRect(),pct=Math.max(0,Math.min(1,(cx-rc.left)/rc.width));video.currentTime=pct*video.duration}
  seek.title=seekEnabled?'Seek':'Seek (available after buffering)'
  seek.onmousedown=e=>{if(!seekEnabled)return;seeking=true;ds(e.clientX)}
  seek.onmousemove=e=>{if(seeking)ds(e.clientX)}
  document.addEventListener('mouseup',()=>{seeking=false})
  seek.addEventListener('touchstart',e=>{if(!seekEnabled)return;seeking=true;ds(e.touches[0].clientX)},{passive:true})
  seek.addEventListener('touchmove',e=>{if(seeking)ds(e.touches[0].clientX)},{passive:true})
  seek.addEventListener('touchend',()=>{seeking=false})
  video._enableSeek=()=>{seekEnabled=true;seek.title='Seek'}
  const volSvg=volBtn.querySelector('svg')
  volSlider.addEventListener('input',()=>{const v=parseFloat(volSlider.value);video.volume=v;video.muted=(v===0);uI()})
  volBtn.onclick=()=>{video.muted=!video.muted;if(!video.muted)volSlider.value=video.volume;uI()}
  video.onvolumechange=()=>{volSlider.value=video.muted?0:video.volume;uI()}
  function uI(){if(!volSvg)return;if(video.muted||video.volume===0)volSvg.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13 0l-1.5 1.5L16 12l-1.5 1.5L16 15l1.5-1.5L19 12l1.5 1.5L22 12l-1.5-1.5L22 9l-1.5 1.5L19 9l-1.5 1.5L16 9z"/>';else if(video.volume<.5)volSvg.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13 1.5L14.5 12l1.5 1.5V10.5z"/>';else volSvg.innerHTML='<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'}
  fs.onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else document.body.requestFullscreen()}
  let cc=false;if(ccBtn){ccBtn.onclick=()=>{cc=!cc;ccBtn.classList.toggle('toggled',cc);for(let i=0;i<video.textTracks.length;i++)video.textTracks[i].mode=cc?(i===video.textTracks.length-1?'showing':'hidden'):'hidden'}}
  spdBtn.onclick=e=>{e.stopPropagation();spdMenu.classList.toggle('open')}
  spdMenu.querySelectorAll('.speed-option').forEach(b=>b.onclick=e=>{e.stopPropagation();const s=parseFloat(b.dataset.speed);video.playbackRate=s;spdMenu.querySelectorAll('.speed-option').forEach(o=>o.classList.toggle('active',parseFloat(o.dataset.speed)===s));spdBtn.textContent=s+'x';spdMenu.classList.remove('open')})
  document.addEventListener('click',()=>spdMenu.classList.remove('open'))
  document.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{})},{once:true})
  video.onclick=()=>{if(video.paused)video.play().catch(()=>{});else video.pause()}
  // Keyboard shortcuts
  document.addEventListener('keydown',e=>{
    if(!video||state.view!=='player')return
    switch(e.key.toLowerCase()){
      case ' ':case 'k':e.preventDefault();video.paused?video.play():video.pause();showKbd(video.paused?'Paused':'Playing');break
      case 'arrowleft':e.preventDefault();video.currentTime-=5;showKbd('-5s');break
      case 'arrowright':e.preventDefault();video.currentTime+=5;showKbd('+5s');break
      case 'j':e.preventDefault();video.currentTime-=10;showKbd('-10s');break
      case 'l':e.preventDefault();video.currentTime+=10;showKbd('+10s');break
      case 'arrowup':e.preventDefault();video.volume=Math.min(1,video.volume+.1);volSlider.value=video.volume;showKbd('Vol '+Math.round(video.volume*100)+'%');break
      case 'arrowdown':e.preventDefault();video.volume=Math.max(0,video.volume-.1);volSlider.value=video.volume;showKbd('Vol '+Math.round(video.volume*100)+'%');break
      case 'f':e.preventDefault();if(document.fullscreenElement)document.exitFullscreen();else document.body.requestFullscreen();break
      case 'm':e.preventDefault();video.muted=!video.muted;showKbd(video.muted?'Muted':'Unmuted');break
      case 'c':e.preventDefault();if(ccBtn)ccBtn.click();break
      case '>':e.preventDefault();const speeds=[.5,.75,1,1.25,1.5,2];const ci=speeds.indexOf(video.playbackRate);const ni=speeds[(ci+1)%speeds.length];video.playbackRate=ni;spdBtn.textContent=ni+'x';showKbd('Speed '+ni+'x');break
      case '<':e.preventDefault();const sx=[.5,.75,1,1.25,1.5,2];const ix=sx.indexOf(video.playbackRate);const nx=sx[ix>0?ix-1:sx.length-1];video.playbackRate=nx;spdBtn.textContent=nx+'x';showKbd('Speed '+nx+'x');break
    }
  })
  function showKbd(msg){if(!kbdHint)return;kbdHint.textContent=msg;kbdHint.classList.add('show');clearTimeout(hideTimer);hideTimer=setTimeout(()=>kbdHint.classList.remove('show'),1500)}
  // Auto-hide controls
  let controlsTimeout
  function showControls(){ctrls.classList.remove('hidden');clearTimeout(controlsTimeout);controlsTimeout=setTimeout(()=>{if(!video.paused)ctrls.classList.add('hidden')},3000)}
  ctrls.addEventListener('mousemove',showControls)
  ctrls.addEventListener('mouseenter',()=>clearTimeout(controlsTimeout))
  video.addEventListener('mousemove',showControls)
  showControls()
}

function fmtTime(s){if(!s||!isFinite(s))return'0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+(sec<10?'0':'')+sec}
function perr(msg){const pw=qs('#pw');if(pw)pw.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center"><p style="color:#f87171;font-size:16px">'+esc(msg)+'</p><button class="btn btn-primary" onclick="cp()">Go Back</button></div>'}
function cp(){if(state.player)state.player=null;if(state.prevState){const d=state.prevState.data||{};let h='id='+(d.id||'');if(d.type==='tv')h+='&type=tv';if(d.title)h+='&t='+encodeURIComponent(d.title);if(d.year)h+='&y='+d.year;if(selectedSeason&&selectedEpisode)h+='&s='+selectedSeason+'&e='+selectedEpisode;history.replaceState(null,'','#'+h);state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;render()}else location.reload()}

function G(id,items){
  const el=qs('#'+id);if(!items||!items.length){el.innerHTML='';return}
  el.innerHTML=items.map(i=>{const p=img(i.poster),t=title(i),y=year(i),r=rating(i),tp=i.type;(i.progress||0)>0
    return'<div class="card" data-id="'+i.id+'" data-title="'+esc(title(i))+'" data-poster="'+(i.poster||'')+'" onclick="navigate(\'detail\',{id:\''+i.id+'\',type:\''+(tp||'movie')+'\',title:\''+esc(title(i))+'\',year:\''+(year(i)||'')+'\'})"><img class="card-poster" src="'+p+'" alt="'+esc(t)+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22><rect fill=%22%231a1a1a%22 width=%22200%22 height=%22300%22/><text x=%22100%22 y=%22160%22 text-anchor=%22middle%22 font-size=%2248%22 fill=%22%23555%22>🎬</text></svg>\'"><span class="card-badge">'+(tp==='tv'?'TV':'Movie')+'</span>'+(r?'<span class="card-rating"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'+r+'</span>':'')+(i.progress?'<div class="progress-bar"><div class="progress-fill" style="width:'+Math.min(i.progress*100,100)+'%"></div></div>':'')+'<div class="card-info"><div class="card-title">'+esc(t)+'</div><div class="card-meta">'+(y||'')+'</div></div></div>'}).join('')
}

function NT(){document.title='notice - web-streaming';return'<div style="max-width:800px;margin:0 auto;padding:32px"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>back</button><h1 style="font-size:28px;font-weight:800;margin:20px 0 8px">project notice</h1><p style="color:var(--text-muted);margin-bottom:32px;line-height:1.6">how web-streaming works. no magic, just free apis.</p><div class="ns"><h2>architecture</h2><pre style="background:var(--surface);padding:16px;border-radius:var(--radius);color:var(--text);font-size:13px;line-height:1.8;overflow-x:auto">browser\n  -> render (express.js)\n    -> embed apis (2embed, multiembed, smashy)\n      -> iframe / new tab\n  -> imdb api (search)\n  -> wikipedia api (details)\n  -> tvmaze api (episodes)\n  -> supabase (accounts)</pre></div><div class="ns"><h2>flow</h2><ol style="color:var(--text-secondary);line-height:2;padding-left:20px"><li>search via imdb suggestion api</li><li>details from wikipedia rest api</li><li>episodes from tvmaze api</li><li>sources from embed providers</li><li>play opens in new tab, zero p2p</li></ol></div><div class="ns"><h2>apis used</h2><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">imdb</td><td style="padding:8px;color:var(--text-muted)">search + metadata</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">wikipedia</td><td style="padding:8px;color:var(--text-muted)">plot summaries</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">tvmaze</td><td style="padding:8px;color:var(--text-muted)">episode guides</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">2embed</td><td style="padding:8px;color:var(--text-muted)">primary embed</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">multiembed</td><td style="padding:8px;color:var(--text-muted)">aggregator</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">smashy</td><td style="padding:8px;color:var(--text-muted)">fast server</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--text)">supabase</td><td style="padding:8px;color:var(--text-muted)">accounts</td><td style="padding:8px;color:#4ade80;font-size:12px">free</td></tr></table></div><div class="ns"><h2>deployment</h2><p style="color:var(--text-secondary);line-height:1.8;font-size:13px">render free tier, docker container, node 22 + ffmpeg. built-in self-ping keepalive every 10 minutes.</p></div><div class="ns"><h2>source</h2><p style="color:var(--text-muted);font-size:13px"><a href="https://github.com/ivymroow/webstreaming" target="_blank" style="color:var(--primary)">github.com/ivymroow/webstreaming</a></p></div><div class="ns"><h2>disclaimer</h2><p style="color:var(--text-muted);font-size:13px;line-height:1.7">personal use only. the developer is not responsible for how this software is used.</p><p style="color:var(--text-muted);font-size:12px;margin-top:8px">built solo with no budget.</p><p style="color:var(--text-muted);font-size:10px;margin-top:4px">1.0.3</p></div></div>'}
function E(m){return'<div class="error-view"><h2>Something went wrong</h2><p>'+esc(m)+'</p><button class="btn btn-primary" onclick="location.reload()">Try Again</button></div>'}

function showAuth(){qs('#auth-modal').style.display='flex'}
function hideAuth(){qs('#auth-modal').style.display='none'}
let authMode='signin'
async function doAuth(){
  const username=qs('#authUsername').value.trim(),pass=qs('#authPassword').value;if(!username||!pass)return
  const body={username,password:pass}
  try{const r=await api('POST',authMode==='signup'?'/api/auth/signup':'/api/auth/signin',body);if(r.ok){state.user=r.user}hideAuth();render()}catch(e){qs('#authError').textContent=e.message}
}
function toggleAuthMode(){authMode=authMode==='signin'?'signup':'signin';qs('#authModalTitle').textContent=authMode==='signin'?'sign in':'sign up';qs('#authToggle').innerHTML=authMode==='signin'?'don\'t have an account? <a href=\"#\" onclick=\"toggleAuthMode();return false\" style=\"color:var(--primary)\">sign up</a>':'already have an account? <a href=\"#\" onclick=\"toggleAuthMode();return false\" style=\"color:var(--primary)\">sign in</a>'}
function signOut(){fetch((state.backendUrl||'')+'/api/auth/signout',{method:'POST',credentials:'include'}).catch(()=>{});state.user=null;render()}

function PR(){return'<div class="profile"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><h1>Profile</h1><div class="profile-search"><input type="text" id="psInput" class="profile-search-input" placeholder="Search movies & shows to add..." autocomplete="off"><div class="profile-search-drop" id="psDrop" style="display:none"></div></div><div class="profile-tabs"><button class="profile-tab active" data-tab="watching">Continue Watching</button><button class="profile-tab" data-tab="watchlist">Watchlist</button><button class="profile-tab" data-tab="watched">Watched</button><button class="profile-tab" data-tab="planned">Plan to Watch</button></div><div class="grid" id="profileGrid"></div><div class="loading-screen" id="pLd"><div class="spinner"></div><p>Loading...</p></div></div>'}
async function PL(){
  if(!state.user){qs('#profileGrid').innerHTML='<p style="color:var(--text-muted);padding:40px;text-align:center">Sign in to manage your watchlist.</p>';qs('#pLd').style.display='none';return}
  document.title='Profile - web-streaming'
  async function lt(tab){qs('#pLd').style.display='';qs('#profileGrid').innerHTML='';qs('#psDrop').style.display='none';document.querySelectorAll('.profile-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab))
    try{let items=[];if(tab==='watchlist')items=await api('GET','/api/watchlist/list');else items=await api('GET','/api/progress/list?status='+tab);G('profileGrid',items.map(i=>({id:i.item_id||i.id,title:i.title,poster:i.poster,year:null,type:i.type,progress:tab==='watching'&&i.watched&&i.duration?i.watched/i.duration:0})));if(!items.length)qs('#profileGrid').innerHTML='<p style="color:var(--text-muted);padding:40px;text-align:center;grid-column:1/-1">Nothing here yet.</p>'}catch(e){qs('#profileGrid').innerHTML='<p style="color:#f87171;padding:40px;text-align:center">'+esc(e.message)+'</p>'}
    qs('#pLd').style.display='none'}
  qs('.profile-tab[data-tab="watching"]').onclick=()=>lt('watching');qs('.profile-tab[data-tab="watchlist"]').onclick=()=>lt('watchlist');qs('.profile-tab[data-tab="watched"]').onclick=()=>lt('watched');qs('.profile-tab[data-tab="planned"]').onclick=()=>lt('planned')
  let st;qs('#psInput').addEventListener('input',function(){clearTimeout(st);const q=this.value.trim();if(!q){qs('#psDrop').style.display='none';return};st=setTimeout(async()=>{try{let results;if(state.mode==='backend')results=await api('GET','/api/search?q='+encodeURIComponent(q));else{const r=await fetch('https://v3.sg.media-imdb.com/suggestion/x/'+encodeURIComponent(q)+'.json');const d=await r.json();results=(d.d||[]).filter(i=>i.id).map(i=>({id:i.id,title:i.l,year:i.y||null,poster:i.i?.[0]||'',type:(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}))}const drop=qs('#psDrop');if(!results||!results.length){drop.style.display='none';return};drop.innerHTML=results.slice(0,8).map(i=>'<div class="ps-drop-item" onclick="addWatchlistFromProfile(\''+i.id+'\',\''+esc(i.title||'')+'\',\''+(i.poster||'')+'\',\''+(i.type||'movie')+'\')"><img src="'+(i.poster||'')+'" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 60%22><rect fill=%22%231a1a26%22 width=%2240%22 height=%2260%22/><text x=%2220%22 y=%2235%22 text-anchor=%22middle%22 font-size=%2218%22>🎬</text></svg>\'" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"><div><div style="font-weight:600;font-size:13px">'+esc(i.title||'')+'</div><div style="font-size:11px;color:var(--text-muted)">'+(i.year||'')+' · '+(i.type==='tv'?'TV':'Movie')+'</div></div></div>').join('');drop.style.display='block'}catch{}},300)});document.addEventListener('click',e=>{const d=qs('#psDrop'),inp=qs('#psInput');if(d&&!d.contains(e.target)&&e.target!==inp)d.style.display='none'})
  lt('watching')
}
async function addWatchlistFromProfile(id,title,poster,type){
  if(!title){
    const card=document.querySelector('.card[data-id="'+id+'"]')
    if(card){title=card.querySelector('.card-title')?.textContent||'';poster=card.querySelector('img')?.src||''}
  }
  try{await api('POST','/api/watchlist/add',{id,title:title||'',poster:poster||'',type:type||'movie'});alert('added to watchlist')}catch(e){alert(e.message)}
}

function restoreFromHash(){const hash=window.location.hash.slice(1);if(!hash||hash==='/'||hash==='')return;if(hash==='profile'){state.view='profile';return};if(hash==='notice'){state.view='notice';return};const params=new URLSearchParams(hash);if(params.has('q')){state.query=params.get('q');state.view='search'}else if(params.has('id')){state.view='detail';const se=parseInt(params.get('s')),ep=parseInt(params.get('e'));if(se&&ep){selectedSeason=se;selectedEpisode=ep};state.data={id:params.get('id'),type:params.get('type')||'movie',title:params.get('t')||'',year:params.get('y')||'',season:se||null,episode:ep||null,_playHash:params.get('hash')||null}}else state.view='home'}

async function init(){
  try{await detect();if(state.mode==='backend'){try{const u=await api('GET','/api/auth/user');state.user=u}catch{}};if(state.mode==='standalone'&&!navigator.onLine){qs('#app').innerHTML='<div class="loading-screen"><h2>No backend</h2><p>Connect to the internet or configure a backend URL.</p></div>';return};restoreFromHash();if(state.view==='welcome'&&state.user)state.view='home';if(state.view==='search'&&state.query)qs('#searchInput').value=state.query;render()}catch(e){console.error('Init:',e);qs('#main').innerHTML='<div class="error-view"><h2>Failed to load</h2><p>'+esc(e.message||'Unknown error')+'</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>'}
}

// Scroll effect on header
window.addEventListener('scroll',()=>{qs('#mainHeader')?.classList.toggle('scrolled',window.scrollY>50)})

let st;qs('#searchInput').addEventListener('input',function(){clearTimeout(st);const q=this.value.trim();if(!q){clearSearchDrop();return};st=setTimeout(async()=>{try{const r=state.mode==='backend'?await api('GET','/api/search?q='+encodeURIComponent(q)):await standalone('/api/search?q='+encodeURIComponent(q));showSearchDrop(r,q)}catch{}},300)});
qs('#searchInput').addEventListener('keydown',function(e){if(e.key==='Enter'){clearTimeout(st);const q=this.value.trim();if(q){clearSearchDrop();state.query=q;navigate('search')}}})
function showSearchDrop(results,q){
  const el=qs('#searchDrop');if(!el){const d=document.createElement('div');d.id='searchDrop';d.style.cssText='position:absolute;top:100%;left:0;right:0;background:var(--surface-elevated);border:1px solid var(--border);border-radius:var(--radius);margin-top:4px;max-height:360px;overflow-y:auto;z-index:200';qs('.search-box').appendChild(d)}
  const drop=qs('#searchDrop');
  if(!results||!results.length){drop.style.display='none';return}
  drop.innerHTML=results.slice(0,8).map(i=>'<div class="ps-drop-item" onclick="clearSearchDrop();navigate(\'detail\',{id:\''+i.id+'\',type:\''+(i.type||'movie')+'\',title:\''+esc(i.title||'')+'\',year:\''+(i.year||'')+'\'})"><img src="'+(i.poster||'')+'" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 60%22><rect fill=%22%231a1a26%22 width=%2240%22 height=%2260%22/><text x=%2220%22 y=%2235%22 text-anchor=%22middle%22 font-size=%2218%22>🎬</text></svg>\'" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"><div><div style="font-weight:600;font-size:13px">'+esc(i.title||'')+'</div><div style="font-size:11px;color:var(--text-muted)">'+(i.year||'')+' · '+(i.type==='tv'?'TV':'Movie')+'</div></div></div>').join('')
  drop.style.display='block'
}
function clearSearchDrop(){const d=qs('#searchDrop');if(d)d.style.display='none'}
document.addEventListener('click',e=>{const d=qs('#searchDrop'),inp=qs('#searchInput');if(d&&!d.contains(e.target)&&e.target!==inp)d.style.display='none'})
init()
