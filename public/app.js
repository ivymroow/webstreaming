let state={view:'welcome',query:'',player:null,mode:'standalone',prevState:null,user:null,_title:'',_year:'',_poster:'',_savedSeason:null,_savedEpisode:null,_sources:null}
let backendUrl=localStorage.getItem('um_backend')||''
let token='',refreshToken=''
let resetParams=null

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
async function srcs(title,year,imdbId){return[]}
function qs(s){return document.querySelector(s)}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function jesc(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
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
    const ep=(d?.type==='tv'&&selectedEpisode)?'&s='+selectedSeason+'&e='+selectedEpisode:''
    h='#id='+(d?.id||'')+(d?.type==='tv'?'&type=tv':'')+(d?.title?'&t='+encodeURIComponent(d.title):'')+(d?.year?'&y='+d.year:'')+ep+(d?._playHash?'&hash='+d._playHash:'')
  }  else if(v==='profile')h='/profile'
  else if(v==='notice')h='/notice'
  else if(v==='socials')h='/socials'
  else if(v==='home')h='/'
  history[v==='detail'||v==='search'?'replaceState':'pushState'](null,'',h);render()
}

window.addEventListener('popstate',()=>{
  if(state.player)return
  const p=window.location.pathname
  if(p==='/'){state.view=state.user?'home':'welcome';render()}
  else if(p==='/profile'){state.view='profile';render()}
  else if(p==='/notice'){state.view='notice';render()}
  else if(p==='/socials'){state.view='socials';render()}
  else{const h=window.location.hash.slice(1);if(h){const params=new URLSearchParams(h)
  if(params.has('q')){state.query=params.get('q');qs('#searchInput').value=state.query;state.view='search';render()}
  else if(params.has('id')){state.view='detail';const se=parseInt(params.get('s')),ep=parseInt(params.get('e'))
    if(se&&ep){selectedSeason=se;selectedEpisode=ep}
    state.data={id:params.get('id'),type:params.get('type')||'movie',title:params.get('t')||'',year:params.get('y')||'',season:se||null,episode:ep||null};render()}}}
  if(!window.location.pathname.startsWith('/detail')&&!window.location.hash)state.view='home'
})

function goBack(){if(state.prevState){state.view=state.prevState.view;state.data=state.prevState.data;state.prevState=null;render()}else navigate('home')}

async function render(){renderUserSection();const m=qs('#main');try{if(state.view==='welcome'){m.innerHTML=W()}else if(state.view==='home'){m.innerHTML=H();L()}else if(state.view==='search'){m.innerHTML=S();LS()}else if(state.view==='detail'){m.innerHTML=D();LD()}else if(state.view==='profile'){m.innerHTML=PR();PL()}else if(state.view==='notice'){m.innerHTML=NT()}else if(state.view==='socials'){m.innerHTML=ST()}}catch(e){m.innerHTML=E(e.message)}}

function renderUserSection(){
  const el=qs('#userSection');if(!el)return
  if(state.user){
    const d=state.user.username||state.user.email
    el.innerHTML='<div class="user-menu" style="position:relative"><button class="user-btn" onclick="toggleUserMenu()">'+esc(d)+' <span style="font-size:10px">▼</span></button><div class="user-drop" id="userDrop" style="display:none;position:absolute;top:100%;right:0;background:var(--surface-elevated);border:1px solid var(--border);border-radius:var(--radius);padding:4px;min-width:160px;z-index:200"><button class="speed-option" onclick="showAccountSettings();toggleUserMenu()">account settings</button><button class="speed-option" onclick="navigate(\'profile\');toggleUserMenu()">profile</button><button class="speed-option" onclick="signOut();toggleUserMenu()">sign out</button></div></div>'
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
  m.innerHTML='<button class="speed-option" onclick="moveProgress(\''+id+'\',\'watched\');qso()">mark watched</button><button class="speed-option" onclick="moveProgress(\''+id+'\',\'planned\');qso()">plan to watch</button><button class="speed-option" onclick="addWatchlistFromProfile(\''+id+'\',\''+jesc(t||'')+'\',\''+(p||'')+'\',\'movie\');qso()">add to watchlist</button><button class="speed-option" onclick="deleteProgress(\''+id+'\');qso()">remove</button>'
  document.body.appendChild(m)
  e.preventDefault()
})
function qso(){const cm=qs('#ctxMenu');if(cm)cm.remove()}
async function moveProgress(id,status){fetch((state.backendUrl||'')+'/api/progress/update',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id,status})}).catch(()=>{});PL()}
async function deleteProgress(id){Promise.all([fetch((state.backendUrl||'')+'/api/progress/delete',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id})}),fetch((state.backendUrl||'')+'/api/watchlist/remove',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id})})]).catch(()=>{});PL()}

function W(){return'<div class="welcome"><div class="welcome-card"><h1 style="color:var(--primary)">webstreaming <span class="beta-tag">beta</span></h1><p style="color:var(--primary)">a simple streaming site that simply works.</p><ul class="welcome-list" style="color:var(--primary)"><li>simply doesn\'t spam ads</li><li>simply doesn\'t break half the time</li><li>simply just works</li></ul><p style="color:var(--primary)">everything runs with no budget. hosted on railway\'s free tier & render\'s free tier.</p><p style="font-size:13px;color:#f59e0b;font-weight:600">it is recommended to disable adblockers while using this site. the embeds load way faster without. some embed providers glitch some episodes / shows so just choose another one and move on. this was hard to make. it was all free no budget.</p><p style="font-size:13px;margin-top:8px"><a href="#" onclick="navigate(\'notice\');return false" style="color:var(--primary)">view full project build</a></p><p style="color:var(--text-muted);font-size:10px;margin-top:2px">1.0.2</p><button class="btn btn-primary" style="margin-top:20px;font-size:16px;padding:14px 48px" onclick="navigate(\'home\')">enter</button></div></div>'}
function enterSite(){state.view='home';navigate('home')}

function H(){return'<div class="loading-screen" id="HL"><div class="spinner"></div><p>loading...</p></div>'}

async function L(){
  try{
    // Load continue watching first
    let cwData=[]
    if(state.user){try{cwData=await api('GET','/api/progress/list?status=watching')}catch{}}
    if(cwData.length){qs('#main').insertAdjacentHTML('afterbegin','<div class="section"><h2 class="section-title">continue watching</h2><div class="grid" id="cwGrid"></div></div>');G('cwGrid',cwData.map(i=>({id:i.item_id,title:i.title,poster:i.poster,year:null,type:i.type,progress:i.watched&&i.duration?i.watched/i.duration:0,season:i.season,episode:i.episode,_resume:true})))}
    const[a,b,c]=await Promise.all([api('GET','/api/trending'),api('GET','/api/popular'),api('GET','/api/popular?type=tv')]);qs('#HL').style.display='none'
    if(!a.length&&!b.length&&!c.length){qs('#main').innerHTML='<div class="loading-screen"><p>backend connected, but home metadata is unavailable. check TMDB_KEY in Railway variables or try searching.</p></div>';return}
    window._trending=a
    qs('#main').insertAdjacentHTML('beforeend','<div class="section" style="padding-bottom:4px"><div style="display:flex;gap:8px"><button class="profile-tab active" onclick="filterTrending(\'all\',this)">all</button><button class="profile-tab" onclick="filterTrending(\'movie\',this)">movies</button><button class="profile-tab" onclick="filterTrending(\'tv\',this)">tv shows</button></div></div>')
    qs('#main').insertAdjacentHTML('beforeend','<div class="section"><h2 class="section-title">trending</h2><div class="grid" id="g0"></div></div>')
    G('g0',a)
    if(b.length){qs('#main').insertAdjacentHTML('beforeend','<div class="section"><h2 class="section-title">popular movies</h2><div class="grid" id="g1"></div></div>');G('g1',b)}
    if(c.length){qs('#main').insertAdjacentHTML('beforeend','<div class="section"><h2 class="section-title">popular shows</h2><div class="grid" id="g2"></div></div>');G('g2',c)}
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

function D(){state._savedThis=false;return'<div class="detail"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><div class="loading-screen" id="dL"><div class="spinner"></div><p>Loading...</p></div></div>'}

async function LD(){
  const{id,type,title:t,year:y,season:s,episode:ep}=state.data
  const tHint=t||'',yHint=y||''
  if(s!=null&&ep!=null&&type==='tv'){selectedSeason=s;selectedEpisode=ep}
  try{
    const d=await api('GET','/api/movie/'+id+'?type='+type+'&title='+encodeURIComponent(tHint)+'&year='+yHint)
    state.data._title=d.title||'';state.data._year=d.year||'';state.data._poster=d.poster||state.data.poster||'';if(d.id&&d.id!==id)state.data.id=d.id;if(d._tmdbId)state.data._tmdbId=d._tmdbId
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
  if(!srcs||!srcs.length){list.innerHTML='<p style="color:var(--text-muted);font-size:14px;padding:8px 0">no sources for '+esc(title)+' '+q+'.</p>';return}
  state._sources=srcs
  list.innerHTML=srcs.map(src=>{const eu=',\''+jesc(src.embedUrl)+'\'';return'<div class="source-item" id="src-'+src.hash+'"><div class="source-info"><span class="source-quality">HD</span><span style="color:var(--text-muted);font-size:11px">'+(src.provider||'')+'</span></div><button class="source-play" style="background:var(--primary);color:#fff" onclick="playSource(\''+src.hash+'\',0,\''+jesc(title)+' '+q+'\''+eu+')">▶ Play</button></div>'}).join('')
  if(state.data?._playHash){const ph=state.data._playHash;state.data._playHash=null;setTimeout(()=>{const b=qs('#src-'+ph+' .source-play');if(b)b.click()},100)}
}function RD(d,srces,episodes){
  const t=d.title||'Unknown',y=d.year||'',rt=d.runtime?Math.floor(d.runtime/60)+'h '+d.runtime%60+'m':'',r=d.rating?d.rating.toFixed(1):'',o=d.overview||'No overview available.',g=d.genres||[],c=d.cast&&d.cast.length?d.cast.join(', '):'',isTv=episodes&&episodes.length>0 && !d.unreleased && !d.unavailable
  document.title=t+' - webstreaming'
  const posterUrl=d.poster||''
  let wlBtn=''
  if(state.user){wlBtn='<button class="wl-btn" id="wlBtn" onclick="toggleWatchlist()">Loading...</button>';setTimeout(async()=>{try{const r=await api('GET','/api/watchlist/check?id='+d.id);const b=qs('#wlBtn');if(b){b.textContent=r.inList?'✓ In Watchlist':'+ Watchlist';b.className='wl-btn'+(r.inList?' in-list':'')}}catch{}},50)}
  let epHTML=''
  if(d.unavailable){
    epHTML='<div class="unreleased-warning" style="padding:16px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:var(--radius);color:#fca5a5;margin-top:16px;font-size:14px;line-height:1.5"><strong>Unavailable:</strong> '+esc(d.unavailableMessage||'This title is currently unavailable due to a streaming provider catalog mismatch. Please try again later.')+'</div>'
  }else if(d.unreleased){
    epHTML='<div class="unreleased-warning" style="padding:16px;background:rgba(245,158,11,0.1);border:1px solid #f59e0b;border-radius:var(--radius);color:#fbbf24;margin-top:16px;font-size:14px;line-height:1.5"><strong>Not Yet Released:</strong> This title is scheduled to be released on '+esc(d.releaseDate||'a future date')+'. Streaming sources will be available after the release.</div>'
  }else if(isTv){
    if(state.data?.season!=null&&state.data?.episode!=null){selectedSeason=state.data.season;selectedEpisode=state.data.episode;state.data.season=null;state.data.episode=null}
    else{selectedSeason=episodes[0]?.season??1;selectedEpisode=episodes[0]?.episodes?.[0]?.number||1}
    window._eps=episodes
    epHTML='<div class="episode-picker"><div class="sources-title">Select Episode</div><div class="episode-controls"><select id="seasonSelect">'+episodes.map(s=>'<option value="'+s.season+'">Season '+s.season+' ('+s.episodes.length+' eps)</option>').join('')+'</select><select id="episodeSelect"></select></div><div id="episodeInfo" class="episode-info"></div><div class="sources-section" style="margin-top:12px"><div class="sources-title">Sources</div><div class="sources-list" id="sl"><div class="loading-screen" style="padding:12px"><div class="spinner"></div></div></div></div></div>'
  }
  qs('#dL').outerHTML='<div class="detail-hero"><div class="detail-poster">'+(posterUrl?'<img src="'+posterUrl+'" alt="'+esc(t)+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22><rect fill=%22%231a1a1a%22 width=%22200%22 height=%22300%22/><text x=%22100%22 y=%22160%22 text-anchor=%22middle%22 font-size=%2248%22 fill=%22%23555%22>🎬</text></svg>\'">':'<div class="card-placeholder" style="aspect-ratio:2/3">🎬</div>')+'</div><div class="detail-info"><h1 class="detail-title">'+esc(t)+'</h1><div class="detail-meta">'+(y?'<span>'+y+'</span>':'')+(rt?'<span>'+rt+'</span>':'')+'</div><div class="detail-genres">'+g.map(x=>'<span>'+x+'</span>').join('')+'</div>'+(r?'<div class="detail-rating"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> '+r+'/10</div>':'')+(wlBtn?'<div style="margin-bottom:16px">'+wlBtn+'</div>':'')+'<p class="detail-overview">'+esc(o)+'</p>'+(c?'<p class="detail-cast"><strong>Cast:</strong> '+esc(c)+'</p>':'')+epHTML+(isTv||d.unreleased||d.unavailable?'':'<div class="sources-section"><div class="sources-title">Sources</div><div class="sources-list" id="sl"></div></div>')+'</div></div>'

  if(isTv){
    const ie=()=>{const ss=qs('#seasonSelect');if(!ss){setTimeout(ie,100);return};ss.value=selectedSeason;ss.onchange=function(){fillEpisodes(true)};fillEpisodes()};setTimeout(ie,50)
  }else if(!d.unreleased && !d.unavailable){
    const list=qs('#sl')
    if(!srces||!srces.length){if(list)list.innerHTML='<p style="color:var(--text-muted);font-size:14px;padding:8px 0">No sources found.</p>';return}
    state._sources=srces
    if(list)list.innerHTML=srces.map(s=>{const eu=',\''+jesc(s.embedUrl)+'\'';return'<div class="source-item" id="src-'+s.hash+'"><div class="source-info"><span class="source-quality">HD</span><span style="color:var(--text-muted);font-size:11px">'+(s.provider||'')+'</span></div><button class="source-play" style="background:var(--primary);color:#fff" onclick="playSource(\''+s.hash+'\',0,\''+jesc(t)+'\''+eu+')">▶ Play</button></div>'}).join('')
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
  const alive=state._sources.filter(s=>s.embedUrl)
  if(!alive.length){alert('No viable sources');return}
  const title=state.data?._title||''
  state.view='player';document.title=title+' - webstreaming';qs('#app').innerHTML=playerHTML(title)
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
    state.view='player';document.title=title+' - webstreaming';qs('#main').innerHTML=ifr(embedUrl,title)
    // auto-save as watching
    if(state.user&&state.data?.id&&!state._savedThis){
      state._savedThis=true
      const p=state._poster||state.data._poster||state.data.poster||''
      // Check if last episode of season for TV shows
      let status='watching'
      if(state.data.type==='movie')status='watched'
      else if(window._eps&&selectedSeason&&selectedEpisode){
        const sd=window._eps.find(s=>s.season===selectedSeason)
        if(sd&&sd.episodes&&selectedEpisode>=sd.episodes[sd.episodes.length-1]?.number)status='watched'
      }
      const se=state.data.type==='tv'?selectedSeason:0,ep=state.data.type==='tv'?selectedEpisode:0
      const saveId=state.data.id||''
      fetch((state.backendUrl||'')+'/api/progress/save',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id:saveId,title:state._title||state.data.title||'',poster:p,type:state.data.type||'movie',season:se,episode:ep,duration:0,watched:0,status})}).then(r=>{state._savedThis=false}).catch(()=>{state._savedThis=false})
    }
    return
  }
  if(state.mode!=='backend'){alert('Backend required');return}
  history.replaceState(null,'','#'+getDetailHash()+'&hash='+hash)
  state.view='player';document.title=title+' - webstreaming';qs('#app').innerHTML=playerHTML(title)
  const ps=qs('#ps'),pl=qs('#plText');if(pl)pl.textContent='Connecting...';if(ps)ps.textContent=''
  streamAndPlay(hash,fi||0,null,ps,pl)
}

function getDetailHash(){
  const d=state.data||{};let h='id='+(d.id||'')
  if(d.type==='tv')h+='&type=tv'
  if(d.title)h+='&t='+encodeURIComponent(d.title)
  if(d.year)h+='&y='+d.year
  if(d.type==='tv'&&selectedSeason!=null&&selectedEpisode!=null)h+='&s='+selectedSeason+'&e='+selectedEpisode
  return h
}

function ifr(url,title){
  document.title=title+' - webstreaming'
  const u=url.replace(/'/g,'%27')
  const eps=window._eps||[]
  const seasonOpts=eps.map(s=>'<option value="'+s.season+'"'+(s.season===selectedSeason?' selected':'')+'>Season '+s.season+' ('+s.episodes.length+')</option>').join('')
  const cur=eps.find(s=>s.season===selectedSeason)
  const epOpts=cur?cur.episodes.map(e=>'<option value="'+e.number+'"'+(e.number===selectedEpisode?' selected':'')+'>'+e.number+'. '+esc(e.name)+'</option>').join(''):''
  const drops=eps.length?'<select id="pvSeason" onchange="pvFillEpisodes()">'+seasonOpts+'</select><select id="pvEpisode" onchange="pvPlay()">'+epOpts+'</select>':''
  const dlBtn='<button class="btn btn-secondary" onclick="toggleDownloadGUI()" style="padding:4px 10px;font-size:12px;display:flex;align-items:center;gap:5px"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button>'
  return'<div class="player-container"><div class="player-toolbar"><button class="detail-back" onclick="cp()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>back</button>'+drops+dlBtn+'</div><div class="player-wrapper"><iframe id="playerIframe" src="'+u+'" allow="autoplay;encrypted-media;fullscreen" allowfullscreen referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;border:none;background:#000"></iframe></div></div>'
}

function pvFillEpisodes(){
  const ss=qs('#pvSeason');if(!ss)return
  const season=parseInt(ss.value)
  const cur=(window._eps||[]).find(s=>s.season===season);if(!cur)return
  const es=qs('#pvEpisode');if(!es)return
  es.innerHTML=cur.episodes.map(e=>'<option value="'+e.number+'">'+e.number+'. '+esc(e.name)+'</option>').join('')
  es.value=cur.episodes[0]?.number||1
  pvPlay()
}
async function pvPlay(){
  const ss=qs('#pvSeason'),es=qs('#pvEpisode');if(!ss||!es)return
  const season=parseInt(ss.value),episode=parseInt(es.value)
  if(season===selectedSeason&&episode===selectedEpisode)return
  selectedSeason=season;selectedEpisode=episode
  updateHashForEpisode()
  const title=state.data?._title||'',year=state.data?._year||''
  let srcs=null
  try{srcs=await api('GET','/api/show/'+state.data.id+'/sources?title='+encodeURIComponent(title)+'&year='+year+'&type=tv&season='+season+'&episode='+episode)}catch{}
  if(!srcs||!srcs.length)return
  state._sources=srcs
  const src=srcs[0]
  if(src.embedUrl){
    state._embedUrl=src.embedUrl
    qs('#main').innerHTML=ifr(src.embedUrl,title+' S'+String(season).padStart(2,'0')+'E'+String(episode).padStart(2,'0'))
  }
}

// ---- Download GUI panel & Live HLS Downloader ----
function attr(line,name){const m=line.match(new RegExp(`${name}=(?:"([^"]+)"|([^,]+))`));return m?.[1]||m?.[2]||""}
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
  if(typeof muxjs==='undefined')throw new Error("Transmuxer library not loaded.");
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

async function dlGuiHlsDownload(item){
  try{
    dlGuiSetStatus("Reading HLS playlist…");
    let playlistUrl=item.url;
    let res=await fetch(playlistUrl);
    if(!res.ok)throw new Error("Could not fetch playlist ("+res.status+")");
    let text=await res.text();
    if(text.includes("#EXT-X-KEY"))throw new Error("Encrypted HLS streams cannot be converted.");
    if(text.includes("#EXT-X-STREAM-INF")){
      const lines=text.split(/\r?\n/),variants=[];
      for(let i=0;i<lines.length;i++)if(lines[i].startsWith("#EXT-X-STREAM-INF"))variants.push({bw:+attr(lines[i],"BANDWIDTH")||0,url:new URL(lines[i+1],playlistUrl).href});
      variants.sort((a,b)=>b.bw-a.bw);playlistUrl=variants[0]?.url||playlistUrl;text=await (await fetch(playlistUrl)).text();
    }
    if(text.includes("#EXT-X-KEY"))throw new Error("Encrypted HLS streams cannot be converted.");
    const playlistLines=text.split(/\r?\n/).map(x=>x.trim());
    const mapLine=playlistLines.find(x=>x.startsWith("#EXT-X-MAP:"));
    const mapUrl=mapLine?new URL(attr(mapLine,"URI"),playlistUrl).href:null;
    const entries=[];let pendingDuration=0;
    for(const line of playlistLines){
      if(line.startsWith("#EXTINF:"))pendingDuration=parseFloat(line.slice(8))||0;
      else if(line&&!line.startsWith("#")){entries.push({url:new URL(line,playlistUrl).href,duration:pendingDuration});pendingDuration=0}
    }
    const urls=entries.map(x=>x.url),durations=entries.map(x=>x.duration),totalSeconds=durations.reduce((a,b)=>a+b,0);
    if(!urls.length)throw new Error("No HLS segments found.");
    const parts=[];
    if(mapUrl){const r=await fetch(mapUrl);if(!r.ok)throw new Error("MP4 initialization failed ("+r.status+")");parts.push(await r.arrayBuffer())}
    for(let i=0;i<urls.length;i++){
      dlGuiSetStatus(`Downloading segment ${i+1} of ${urls.length}…`);
      const r=await fetch(urls[i]);
      if(!r.ok)throw new Error(`Segment ${i+1} failed (${r.status})`);
      parts.push(await r.arrayBuffer());
    }
    dlGuiSetStatus("Converting stream to MP4…");
    const first=new Uint8Array(parts[0]),isTs=first[0]===0x47;
    const blob=isTs?transmuxTs(parts,durations,totalSeconds):new Blob([patchMp4Durations(parts[0],totalSeconds),...parts.slice(1)],{type:"video/mp4"});
    if(!blob.size)throw new Error("Conversion produced an empty file.");
    const safeTitle=(state.data?.title||item.title||"video").replace(/[\\/:*?"<>|]+/g,"_").slice(0,90)+".mp4";
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=safeTitle;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    dlGuiSetStatus("MP4 download saved!");
  }catch(e){
    dlGuiSetStatus(e.message||"HLS download failed.",true);
  }
}

function captureMediaItem(url,type="VIDEO",title=""){
  if(!url||!/^https?:/i.test(url))return;
  if(!window._dlGuiItems)window._dlGuiItems=[];
  const isHls=/\.m3u8/i.test(url)||/mpegurl/i.test(type);
  const detectedType=isHls?"HLS":(type||"VIDEO");
  const existing=window._dlGuiItems.find(x=>x.url===url);
  if(existing){
    if(detectedType==="HLS")existing.type="HLS";
  }else{
    window._dlGuiItems.unshift({url,type:detectedType,title:title||document.title,source:"page"});
    if(window._dlGuiItems.length>100)window._dlGuiItems.pop();
    if(qs('#dl-gui-panel'))dlGuiRender(window._dlGuiItems);
  }
}

function dlGuiPoll(){
  try{
    performance.getEntriesByType?.("resource").forEach(e=>{
      if(/\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])|\.m3u8/i.test(e.name)){
        captureMediaItem(e.name,/\.m3u8/i.test(e.name)?"HLS":"VIDEO");
      }
    });
    document.querySelectorAll("video, source").forEach(el=>{
      if(el.src)captureMediaItem(el.src,/\.m3u8/i.test(el.src)?"HLS":"VIDEO");
      if(el.currentSrc)captureMediaItem(el.currentSrc,/\.m3u8/i.test(el.currentSrc)?"HLS":"VIDEO");
    });
    window.postMessage({_wsBridge:"list"},"*");
  }catch{}
}

// Observe network resources continuously
try{
  const po=new PerformanceObserver(list=>{
    list.getEntries().forEach(e=>{
      if(/\.(mp4|webm|mov|m4v|m3u8)(?:$|[?#])|\.m3u8/i.test(e.name)){
        captureMediaItem(e.name,/\.m3u8/i.test(e.name)?"HLS":"VIDEO");
      }
    });
  });
  po.observe({type:"resource",buffered:true});
}catch{}

function toggleDownloadGUI(){
  let panel=qs('#dl-gui-panel')
  if(panel){
    if(window._dlGuiPollTimer){clearInterval(window._dlGuiPollTimer);window._dlGuiPollTimer=null}
    panel.remove();
    return
  }
  panel=document.createElement('div')
  panel.id='dl-gui-panel'
  panel.style.cssText='position:fixed;bottom:70px;right:16px;z-index:9999;width:370px;background:radial-gradient(circle at 50% -20%,#32164f,transparent 45%),#09070d;color:#f8f3ff;font:13px Inter,Arial,sans-serif;border:1px solid #30233d;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);overflow:hidden'
  panel.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #30233d">
      <div>
        <div style="font-size:15px;font-weight:700;margin-bottom:2px">embed downloader <span style="font-size:10px;color:#a568ff;vertical-align:middle">v1.0</span></div>
        <div style="color:#a99db5;font-size:11px">developed · by ivymroow</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button onclick="dlGuiClear()" style="border:1px solid #30233d;background:#20152d;color:#f8f3ff;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px">Clear</button>
        <button onclick="toggleDownloadGUI()" style="border:1px solid #30233d;background:#20152d;color:#f8f3ff;border-radius:8px;padding:5px 8px;cursor:pointer">✕</button>
      </div>
    </div>
    <div id="dl-gui-list" style="padding:10px;max-height:340px;overflow-y:auto">
      <div style="text-align:center;color:#a99db5;padding:40px 20px">Play the video to capture streams live.</div>
    </div>
    <div id="dl-gui-status" style="padding:8px 14px;color:#a99db5;border-top:1px solid #30233d;font-size:11px">monitoring live…</div>
  `
  document.body.appendChild(panel)
  dlGuiPoll()
  dlGuiRender(window._dlGuiItems||[])
  if(window._dlGuiPollTimer)clearInterval(window._dlGuiPollTimer)
  window._dlGuiPollTimer=setInterval(dlGuiPoll,1000)
}

function dlGuiSetStatus(msg,err=false){
  const el=qs('#dl-gui-status');if(!el)return
  el.textContent=msg
  el.style.color=err?'#ff8c9e':'#a99db5'
}

async function dlGuiClear(){
  window._dlGuiItems=[]
  window._dlGuiCurrentItems=[]
  window.postMessage({_wsBridge:"clear"},"*")
  dlGuiRender([])
  dlGuiSetStatus('List cleared.')
}

function dlGuiRender(items){
  const list=qs('#dl-gui-list');if(!list)return
  if(!items||!items.length){
    list.innerHTML='<div style="text-align:center;color:#a99db5;padding:40px 20px">Play the video to capture streams live.</div>';
    return
  }
  list.innerHTML=items.map((item,i)=>`
    <div style="background:linear-gradient(135deg,#171020,#100d15);border:1px solid #30233d;border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:10px;font-weight:800;color:#160922;background:${item.type==='HLS'?'#f59e0b':'#a568ff'};padding:2px 6px;border-radius:5px">${esc(item.type||'VIDEO')}</span>
        <strong style="font-size:13px">${item.type==='HLS'?'Live HLS Stream':'Detected Media'}</strong>
      </div>
      <div style="color:#cbbfd5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:8px;font-size:11px" title="${esc(item.url||'')}">${esc(item.url||'')}</div>
      <div style="display:flex;gap:6px">
        <button onclick="dlGuiDownload(${i})" style="flex:1;background:#a568ff;color:#100717;border:0;font-weight:700;border-radius:8px;padding:7px 10px;cursor:pointer">${item.type==='HLS'?'Download HLS (MP4)':'Download'}</button>
        <button onclick="dlGuiCopy(${i})" style="border:1px solid #30233d;background:#20152d;color:#f8f3ff;border-radius:8px;padding:7px 10px;cursor:pointer">Copy URL</button>
      </div>
    </div>
  `).join('')
  window._dlGuiCurrentItems=items
}

async function dlGuiCopy(i){
  const items=window._dlGuiCurrentItems||[];const item=items[i];if(!item)return
  try{await navigator.clipboard.writeText(item.url);dlGuiSetStatus('URL copied.')}catch{dlGuiSetStatus('Copy failed.',true)}
}

async function dlGuiDownload(i){
  const items=window._dlGuiCurrentItems||[];const item=items[i];if(!item)return
  if(item.type==='HLS'){
    return dlGuiHlsDownload(item)
  }
  const a=document.createElement('a');a.href=item.url;a.download='';a.target='_blank';a.click()
  dlGuiSetStatus('Download started.')
}

// Real-time listener for video & HLS captures from extension, iframes, and bridge
window.addEventListener('message',e=>{
  if(!e.data)return
  if(e.data._wsVideoCaptured&&e.data.url){
    captureMediaItem(e.data.url,e.data.type||'VIDEO',e.data.title||'')
  }else if(e.data._wsBridgeReply==='list'&&Array.isArray(e.data.items)){
    e.data.items.forEach(it=>captureMediaItem(it.url,it.type,it.title))
  }
})

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
function cp(){state._savedThis=false;if(state.player)state.player=null;if(state.prevState){const d=state.prevState.data||{};let h='id='+(d.id||'');if(d.type==='tv')h+='&type=tv';if(d.title)h+='&t='+encodeURIComponent(d.title);if(d.year)h+='&y='+d.year;if(d.type==='tv'&&selectedSeason!=null&&selectedEpisode!=null)h+='&s='+selectedSeason+'&e='+selectedEpisode;history.replaceState(null,'','#'+h);navigate(state.prevState.view,state.prevState.data)}else location.reload()}

window.addEventListener('message',e=>{if(e.origin.includes('vidlink.pro')){try{const d=typeof e.data==='string'?JSON.parse(e.data):e.data;if(d.event==='ended'||(d.progress&&d.progress>0.9)){if(state.user&&state.data?.id){const se2=state.data.type==='tv'?selectedSeason:0,ep2=state.data.type==='tv'?selectedEpisode:0;fetch((state.backendUrl||'')+'/api/progress/save',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id:state.data.id,title:state._title||'',poster:state._poster||'',type:state.data.type||'movie',season:se2,episode:ep2,duration:0,watched:0,status:'watched'})}).catch(()=>{})}}}catch{}}})

function G(id,items){
  const el=qs('#'+id);if(!items||!items.length){el.innerHTML='';return}
  el.innerHTML=items.map(i=>{const p=img(i.poster),t=title(i),y=year(i),r=rating(i),tp=i.type;(i.progress||0)>0
    const se=i.season&&i.episode?'S'+i.season+'E'+i.episode:''
    return'<div class="card" data-id="'+i.id+'" data-title="'+jesc(title(i))+'" data-poster="'+(i.poster||'')+'" onclick="navigate(\'detail\',{id:\''+i.id+'\',type:\''+(tp||'movie')+'\',title:\''+jesc(title(i))+'\',year:\''+(year(i)||'')+'\',poster:\''+(i.poster||'')+'\''+(se?',season:'+i.season+',episode:'+i.episode:'')+(i._resume?',_playHash:\'embed-0\'':'')+'})"><img class="card-poster" src="'+p+'" alt="'+jesc(t)+'" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 300%22><rect fill=%22%231a1a1a%22 width=%22200%22 height=%22300%22/><text x=%22100%22 y=%22160%22 text-anchor=%22middle%22 font-size=%2248%22 fill=%22%23555%22>🎬</text></svg>\'"><span class="card-badge">'+(tp==='tv'?'TV':'Movie')+'</span>'+(r?'<span class="card-rating"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'+r+'</span>':'')+(i.progress?'<div class="progress-bar"><div class="progress-fill" style="width:'+Math.min(i.progress*100,100)+'%"></div></div>':'')+'<div class="card-info"><div class="card-title">'+esc(t)+'</div><div class="card-meta">'+se+(se&&y?' · ':'')+(y||'')+'</div></div></div>'}).join('')
}

function ST(){document.title='socials - webstreaming';return'<div style="max-width:800px;margin:0 auto;padding:32px"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>back</button><div class="ns"><h2>socials</h2><p style="color:var(--primary);font-size:15px;line-height:2.4"><a href="https://x.com/webstreaminsite" target="_blank" style="color:var(--primary)">x.com/webstreaminsite</a><br><a href="https://discord.gg/Bk6Pf72F6H" target="_blank" style="color:var(--primary)">discord.gg/Bk6Pf72F6H</a></p></div><div class="ns"><h2>sites</h2><p style="color:var(--primary);font-size:14px;line-height:2.2"><a href="https://web-streaming.site" target="_blank" style="color:var(--primary)">web-streaming.site</a><br><a href="https://webstreaming.onrender.com" target="_blank" style="color:var(--primary)">webstreaming.onrender.com</a><br><a href="https://webtesting.up.railway.app" target="_blank" style="color:var(--primary)">webtesting.up.railway.app</a></p></div></div>'}
function NT(){document.title='notice - webstreaming';return'<div style="max-width:800px;margin:0 auto;padding:32px"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>back</button><div class="ns"><h2>architecture</h2><pre style="background:var(--surface);padding:16px;border-radius:var(--radius);color:var(--primary);font-size:13px;line-height:1.8;overflow-x:auto">browser\n  -> railway / render (express.js)\n    -> embed apis (vidsrc.to, 2embed, multiembed, smashy, vidlink)\n      -> iframe player\n  -> tmdb api (trending, popular, cast)\n  -> imdb api (search)\n  -> wikipedia api (details)\n  -> tvmaze api (episodes)\n  -> supabase (accounts)</pre></div><div class="ns"><h2>flow</h2><ol style="color:var(--primary);line-height:2;padding-left:20px"><li>browse trending / popular from tmdb api</li><li>search any movie or show via imdb</li><li>details loaded from wikipedia + tmdb cast</li><li>episodes fetched from tvmaze api</li><li>embed urls generated for 6 providers</li><li>click play opens embed player in iframe</li><li>auto-saves to continue watching via supabase</li></ol></div><div class="ns"><h2>apis used</h2><table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">tmdb</td><td style="padding:8px;color:var(--primary)">trending, popular, cast, external ids</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">imdb</td><td style="padding:8px;color:var(--primary)">search + metadata</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">wikipedia</td><td style="padding:8px;color:var(--primary)">plot summaries</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">tvmaze</td><td style="padding:8px;color:var(--primary)">episode guides</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">vidsrc.to</td><td style="padding:8px;color:var(--primary)">best player, fast loads, no ads</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">2embed</td><td style="padding:8px;color:var(--primary)">reliable</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">vidsrc.me</td><td style="padding:8px;color:var(--primary)">alt player</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">vidlink</td><td style="padding:8px;color:var(--primary)">alt player</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">multiembed</td><td style="padding:8px;color:var(--primary)">aggregator</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">smashy</td><td style="padding:8px;color:var(--primary)">fast server</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr><tr style="border-bottom:1px solid var(--border)"><td style="padding:8px;color:var(--primary)">supabase</td><td style="padding:8px;color:var(--primary)">accounts</td><td style="padding:8px;color:var(--primary);font-size:12px">free</td></tr></table></div><div class="ns"><h2>sites</h2><p style="color:var(--text);font-size:13px;line-height:1.8"><a href="https://web-streaming.site" target="_blank" style="color:var(--primary)">web-streaming.site</a><span style="color:var(--primary)"> — main site. fast and fast with updates</span></p><p style="color:var(--text);font-size:13px;line-height:1.8"><a href="https://webstreaming.onrender.com" target="_blank" style="color:var(--primary)">webstreaming.onrender.com</a><span style="color:var(--primary)"> — sleeps on free tier, slow with updates, not main anymore</span></p></div><div class="ns"><h2>disclaimer</h2><p style="color:var(--primary);font-size:13px;line-height:1.7">personal use only. the developer is not responsible for how this software is used.</p><p style="color:var(--primary);font-size:12px;margin-top:8px">built solo with no budget.</p><p style="color:var(--text-muted);font-size:10px;margin-top:4px">1.0.2</p></div></div>'}
function E(m){return'<div class="error-view"><h2>Something went wrong</h2><p>'+esc(m)+'</p><button class="btn btn-primary" onclick="location.reload()">Try Again</button></div>'}

function showAuth(){qs('#auth-modal').style.display='flex'}
function hideAuth(){qs('#auth-modal').style.display='none'}
let authMode='signin'
function cleanAuthError(message){return message==='CORS origin not allowed'?'this site is not allowed by the backend yet. add this domain to CORS_ORIGINS or PUBLIC_URL in Railway.':message}
async function doAuth(){
  const username=qs('#authUsername').value.trim(),pass=qs('#authPassword').value;if(!username||!pass)return
  const body={username,password:pass}
  if(authMode==='signup'){const email=qs('#authEmail')?.value.trim();if(email)body.email=email}
  const token=qs('#auth2fa')?.value.trim();if(token)body.token=token;
  try{
    const r=await api('POST',authMode==='signup'?'/api/auth/signup':'/api/auth/signin',body);
    if(r.needsConfirmation){qs('#authError').style.color='#4ade80';qs('#authError').textContent='check your email to finish signup';return}
    if(r.needs2fa){
      qs('#authError').style.color='#4ade80';
      if(r.method==='email'){
        qs('#authError').textContent='Verification code sent to your email. Enter below:';
        if(qs('#auth2faLabel'))qs('#auth2faLabel').textContent='Email Verification Code';
      }else{
        qs('#authError').textContent='Enter 6-digit code from authenticator app:';
        if(qs('#auth2faLabel'))qs('#auth2faLabel').textContent='Authenticator Code';
      }
      qs('#auth2faWrap').style.display='block';
      qs('#auth2fa').focus();
      return;
    }
    if(r.ok){state.user=r.user}
    qs('#auth2faWrap').style.display='none';
    qs('#auth2fa').value='';
    if(qs('#auth2faLabel'))qs('#auth2faLabel').textContent='2FA Code';
    hideAuth();render()
  }catch(e){
    qs('#authError').style.color='#f87171';
    qs('#authError').textContent=cleanAuthError(e.message)
  }
}
function toggleAuthMode(){authMode=authMode==='signin'?'signup':'signin';qs('#authModalTitle').textContent=authMode==='signin'?'sign in':'sign up';const ew=qs('#authEmailWrap');if(ew)ew.style.display=authMode==='signup'?'block':'none';if(qs('#auth2faWrap'))qs('#auth2faWrap').style.display='none';if(qs('#auth2fa'))qs('#auth2fa').value='';qs('#authToggle').innerHTML=authMode==='signin'?'don\'t have an account? <a href=\"#\" onclick=\"toggleAuthMode();return false\" style=\"color:var(--primary)\">sign up</a>':'already have an account? <a href=\"#\" onclick=\"toggleAuthMode();return false\" style=\"color:var(--primary)\">sign in</a>'}
function signOut(){fetch((state.backendUrl||'')+'/api/auth/signout',{method:'POST',credentials:'include'}).catch(()=>{});state.user=null;state.view='welcome';history.pushState(null,'','/');render()}
function hideAccountSettings(){const m=qs('#account-modal');if(m)m.style.display='none'}
async function showAccountSettings(){
  const m=qs('#account-modal'),email=qs('#accountEmail'),err=qs('#accountError'),st=qs('#accountStatus')
  if(!m)return
  if(err)err.textContent=''
  if(st)st.textContent='loading account...'
  m.style.display='flex'
  try{
    const account=await api('GET','/api/auth/account')
    if(email)email.value=account.email&&!account.needsEmail?account.email:''
    if(st)st.textContent=account.needsEmail?'add a real email so password reset can work':''
    
    // 2FA UI
    if(qs('#setup2faBox'))qs('#setup2faBox').style.display='none';
    if(qs('#setupEmail2faBox'))qs('#setupEmail2faBox').style.display='none';
    const isTotp = !!account.totp_enabled;
    const isEmail = !!account.email_2fa_enabled;
    const isAny = isTotp || isEmail;

    if(qs('#disable2faBox'))qs('#disable2faBox').style.display=isTotp?'block':'none';
    if(qs('#disableEmail2faBox'))qs('#disableEmail2faBox').style.display=isEmail?'block':'none';
    if(qs('#no2faActions'))qs('#no2faActions').style.display=isAny?'none':'flex';

    if(isTotp){
      qs('#account2faStatus').textContent='Enabled (Authenticator App)';
      qs('#account2faStatus').style.color='#4ade80';
    }else if(isEmail){
      qs('#account2faStatus').textContent='Enabled (Email Code)';
      qs('#account2faStatus').style.color='#4ade80';
    }else{
      qs('#account2faStatus').textContent='Disabled';
      qs('#account2faStatus').style.color='var(--text-muted)';
    }
  }catch(e){
    if(st)st.textContent=''
    if(err)err.textContent=cleanAuthError(e.message)
  }
}
async function saveAccountEmail(){
  const email=qs('#accountEmail')?.value.trim(),err=qs('#accountError'),st=qs('#accountStatus')
  if(err)err.textContent=''
  if(st)st.textContent=''
  if(!email){if(err)err.textContent='enter an email';return}
  try{
    const r=await api('POST','/api/auth/account/email',{email})
    if(r.user)state.user=r.user
    if(st)st.textContent='email saved'
    renderUserSection()
  }catch(e){if(err)err.textContent=cleanAuthError(e.message)}
}
async function sendPasswordReset(){
  const err=qs('#accountError'),st=qs('#accountStatus')
  if(err)err.textContent=''
  if(st)st.textContent='sending reset email...'
  try{
    await api('POST','/api/auth/password-reset',{})
    if(st)st.textContent='password reset email sent'
  }catch(e){
    if(st)st.textContent=''
    if(err)err.textContent=cleanAuthError(e.message)
  }
}
async function sendSignedOutPasswordReset(){
  const email=qs('#signedOutResetEmail')?.value.trim()
  const err=qs('#signedOutResetError'),st=qs('#signedOutResetStatus')
  if(err)err.textContent=''
  if(st)st.textContent=''
  if(!email){if(err)err.textContent='enter an email';return}
  if(st)st.textContent='sending reset email...'
  try{
    await api('POST','/api/auth/password-reset-email',{email})
    if(st)st.textContent='password reset email sent'
  }catch(e){
    if(st)st.textContent=''
    if(err)err.textContent=cleanAuthError(e.message)
  }
}
async function deleteMyAccount(){
  const confirm=qs('#deleteAccountConfirm')?.value
  const err=qs('#accountError'),st=qs('#accountStatus')
  if(err)err.textContent=''
  if(st)st.textContent=''
  if(confirm!=='DELETE MY ACCOUNT'){if(err)err.textContent='Type DELETE MY ACCOUNT to confirm';return}
  if(st)st.textContent='Deleting account...'
  try{
    await api('POST','/api/auth/account/delete',{confirmation:confirm})
    hideAccountSettings()
    state.user=null
    state.view='welcome'
    render()
  }catch(e){
    if(st)st.textContent=''
    if(err)err.textContent=cleanAuthError(e.message)
  }
}
function cancel2faSetup(){
  if(qs('#setup2faBox'))qs('#setup2faBox').style.display='none';
  if(qs('#setupEmail2faBox'))qs('#setupEmail2faBox').style.display='none';
  if(qs('#no2faActions'))qs('#no2faActions').style.display='flex';
}
async function start2faSetup(){
  try{
    const r=await api('POST','/api/auth/2fa/setup');
    qs('#setup2faQr').src=r.qrcode;
    qs('#setup2faBox').style.display='block';
    if(qs('#setupEmail2faBox'))qs('#setupEmail2faBox').style.display='none';
    if(qs('#no2faActions'))qs('#no2faActions').style.display='none';
  }catch(e){
    alert(cleanAuthError(e.message));
  }
}
function startEmail2faSetup(){
  if(qs('#setup2faBox'))qs('#setup2faBox').style.display='none';
  if(qs('#setupEmail2faBox'))qs('#setupEmail2faBox').style.display='block';
  if(qs('#no2faActions'))qs('#no2faActions').style.display='none';
}
async function enableEmail2fa(){
  try{
    await api('POST','/api/auth/2fa/email/setup');
    showAccountSettings();
  }catch(e){
    alert(cleanAuthError(e.message));
  }
}
async function sendDisableEmailOtp(){
  try{
    await api('POST','/api/auth/2fa/email/send');
    alert('Verification code sent to your email.');
  }catch(e){
    alert(cleanAuthError(e.message));
  }
}
async function disableEmail2fa(){
  if(!confirm('Are you sure you want to disable Email 2FA?'))return;
  try{
    await api('POST','/api/auth/2fa/email/disable',{});
    showAccountSettings();
  }catch(e){
    alert(cleanAuthError(e.message));
  }
}
async function verify2fa(){
  const token=qs('#setup2faCode').value.trim();
  if(!token)return alert('Enter the code');
  try{
    await api('POST','/api/auth/2fa/verify',{token});
    qs('#setup2faBox').style.display='none';
    qs('#setup2faCode').value='';
    showAccountSettings();
  }catch(e){
    alert(cleanAuthError(e.message));
  }
}
async function disable2fa(){
  if(!confirm('Are you sure you want to disable Authenticator 2FA?'))return;
  try{
    await api('POST','/api/auth/2fa/disable',{});
    showAccountSettings();
  }catch(e){
    alert(cleanAuthError(e.message));
  }
}

function readPasswordResetParams(){
  const query=new URLSearchParams(window.location.search)
  const hashText=window.location.hash.startsWith('#')?window.location.hash.slice(1):''
  const hash=new URLSearchParams(hashText)
  const type=hash.get('type')||query.get('type')
  const code=query.get('code')||hash.get('code')
  const accessToken=hash.get('access_token')||query.get('access_token')
  const refreshTokenValue=hash.get('refresh_token')||query.get('refresh_token')
  const isResetPath=window.location.pathname==='/reset-password'
  if(type==='recovery'||isResetPath||code||accessToken)return{type:type||'recovery',code,accessToken,refreshToken:refreshTokenValue}
  return null
}
function showPasswordReset(params){
  resetParams=params
  const m=qs('#reset-modal'),err=qs('#resetError'),st=qs('#resetStatus')
  if(err)err.textContent=''
  if(st)st.textContent=''
  const p=qs('#resetPassword'),c=qs('#resetPasswordConfirm')
  if(p)p.value=''
  if(c)c.value=''
  if(m)m.style.display='flex'
  setTimeout(()=>p?.focus(),50)
}
function hidePasswordReset(){
  const m=qs('#reset-modal')
  if(m)m.style.display='none'
}
async function submitPasswordReset(){
  const password=qs('#resetPassword')?.value||''
  const confirm=qs('#resetPasswordConfirm')?.value||''
  const err=qs('#resetError'),st=qs('#resetStatus')
  if(err)err.textContent=''
  if(st)st.textContent=''
  if(!resetParams){if(err)err.textContent='open the newest reset email link again';return}
  if(password.length<6){if(err)err.textContent='password must be at least 6 characters';return}
  if(password!==confirm){if(err)err.textContent='passwords do not match';return}
  if(st)st.textContent='saving new password...'
  try{
    const r=await api('POST','/api/auth/password/update',{...resetParams,password})
    if(r.user)state.user=r.user
    resetParams=null
    window.history.replaceState(null,'','/')
    hidePasswordReset()
    state.view='home'
    render()
  }catch(e){
    if(st)st.textContent=''
    if(err)err.textContent=cleanAuthError(e.message||'reset link expired or invalid')
  }
}

function PR(){return'<div class="profile"><button class="detail-back" onclick="navigate(\'home\')"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg> Back</button><h1>Profile</h1><div class="profile-search"><input type="text" id="psInput" class="profile-search-input" placeholder="Search movies & shows to add..." autocomplete="off"><div class="profile-search-drop" id="psDrop" style="display:none"></div></div><div class="profile-tabs"><button class="profile-tab active" data-tab="watching">Continue Watching</button><button class="profile-tab" data-tab="watchlist">Watchlist</button><button class="profile-tab" data-tab="watched">Watched</button></div><div class="grid" id="profileGrid"></div><div class="loading-screen" id="pLd"><div class="spinner"></div><p>Loading...</p></div></div>'}
async function PL(){
  if(!state.user){qs('#profileGrid').innerHTML='<p style="color:var(--text-muted);padding:40px;text-align:center">Sign in to manage your watchlist.</p>';qs('#pLd').style.display='none';return}
  document.title='Profile - webstreaming'
  async function lt(tab){qs('#pLd').style.display='';qs('#profileGrid').innerHTML='';qs('#psDrop').style.display='none';document.querySelectorAll('.profile-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab))
    try{let items=[];if(tab==='watchlist')items=await api('GET','/api/watchlist/list');else items=await api('GET','/api/progress/list?status='+tab);G('profileGrid',items.map(i=>({id:i.item_id||i.id,title:i.title,poster:i.poster,year:null,type:i.type,progress:tab==='watching'&&i.watched&&i.duration?i.watched/i.duration:0,season:i.season,episode:i.episode,_resume:tab==='watching'})));if(!items.length)qs('#profileGrid').innerHTML='<p style="color:var(--text-muted);padding:40px;text-align:center;grid-column:1/-1">Nothing here yet.</p>'}catch(e){qs('#profileGrid').innerHTML='<p style="color:#f87171;padding:40px;text-align:center">'+esc(e.message)+'</p>'}
    qs('#pLd').style.display='none'}
  qs('.profile-tab[data-tab="watching"]').onclick=()=>lt('watching');qs('.profile-tab[data-tab="watchlist"]').onclick=()=>lt('watchlist');qs('.profile-tab[data-tab="watched"]').onclick=()=>lt('watched')
  let st;qs('#psInput').addEventListener('input',function(){clearTimeout(st);const q=this.value.trim();if(!q){qs('#psDrop').style.display='none';return};st=setTimeout(async()=>{try{let results;if(state.mode==='backend')results=await api('GET','/api/search?q='+encodeURIComponent(q));else{const r=await fetch('https://v3.sg.media-imdb.com/suggestion/x/'+encodeURIComponent(q)+'.json');const d=await r.json();results=(d.d||[]).filter(i=>i.id).map(i=>({id:i.id,title:i.l,year:i.y||null,poster:i.i?.[0]||'',type:(i.qid==='tvSeries'||i.qid==='tvMiniSeries')?'tv':'movie'}))}const drop=qs('#psDrop');if(!results||!results.length){drop.style.display='none';return};drop.innerHTML=results.slice(0,8).map(i=>'<div class="ps-drop-item" onclick="addWatchlistFromProfile(\''+i.id+'\',\''+jesc(i.title||'')+'\',\''+(i.poster||'')+'\',\''+(i.type||'movie')+'\')"><img src="'+(i.poster||'')+'" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 60%22><rect fill=%22%231a1a26%22 width=%2240%22 height=%2260%22/><text x=%2220%22 y=%2235%22 text-anchor=%22middle%22 font-size=%2218%22>🎬</text></svg>\'" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"><div><div style="font-weight:600;font-size:13px">'+esc(i.title||'')+'</div><div style="font-size:11px;color:var(--text-muted)">'+(i.year||'')+' · '+(i.type==='tv'?'TV':'Movie')+'</div></div></div>').join('');drop.style.display='block'}catch{}},300)});document.addEventListener('click',e=>{const d=qs('#psDrop'),inp=qs('#psInput');if(d&&!d.contains(e.target)&&e.target!==inp)d.style.display='none'})
  lt('watching')
}
async function addWatchlistFromProfile(id,title,poster,type){
  if(!title){
    const card=document.querySelector('.card[data-id="'+id+'"]')
    if(card){title=card.querySelector('.card-title')?.textContent||'';poster=card.querySelector('img')?.src||''}
  }
  try{await api('POST','/api/watchlist/add',{id,title:title||'',poster:poster||'',type:type||'movie'});alert('added to watchlist')}catch(e){alert(e.message)}
}

function restoreFromHash(){const hash=window.location.hash.slice(1);if(!hash||hash==='/'||hash==='')return;if(hash==='profile'){state.view='profile';return};if(hash==='notice'){state.view='notice';return};const params=new URLSearchParams(hash);if(params.has('q')){state.query=params.get('q');state.view='search'}else if(params.has('id')){state.view='detail';const type=params.get('type')||(params.has('s')?'tv':'movie');const se=parseInt(params.get('s')),ep=parseInt(params.get('e'));if(!isNaN(se)&&!isNaN(ep)&&type==='tv'){selectedSeason=se;selectedEpisode=ep};state.data={id:params.get('id'),type,title:params.get('t')||'',year:params.get('y')||'',season:type==='tv'?(isNaN(se)?null:se):null,episode:type==='tv'?(isNaN(ep)?null:ep):null,_playHash:params.get('hash')||null}}else state.view='home'}

async function init(){
  try{await detect();if(state.mode==='backend'){try{const u=await api('GET','/api/auth/user');state.user=u}catch{}};if(state.mode==='standalone'&&!navigator.onLine){qs('#app').innerHTML='<div class="loading-screen"><h2>No backend</h2><p>Connect to the internet or configure a backend URL.</p></div>';return};const recovery=readPasswordResetParams();if(recovery){if(recovery.type==='signup'){try{const r=await api('POST','/api/auth/session',{accessToken:recovery.accessToken,refreshToken:recovery.refreshToken});state.user=r.user;window.history.replaceState(null,'','/')}catch(e){console.error('Session error:',e)}}else{state.view='welcome';render();showPasswordReset(recovery);return}};const p=window.location.pathname;const h=window.location.hash;if(h&&h.length>2){restoreFromHash();render()}else if(p==='/'){state.view=state.user?'home':'welcome';render()}else if(p==='/profile'){state.view='profile';render()}else if(p==='/notice'){state.view='notice';render()}else if(p==='/socials'){state.view='socials';render()}else{state.view='welcome';render()}return}catch(e){console.error('Init:',e);qs('#main').innerHTML='<div class="error-view"><h2>Failed to load</h2><p>'+esc(e.message||'Unknown error')+'</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>'}
}

// Scroll effect on header
window.addEventListener('scroll',()=>{qs('#mainHeader')?.classList.toggle('scrolled',window.scrollY>50)})

let st;qs('#searchInput').addEventListener('input',function(){clearTimeout(st);const q=this.value.trim();if(!q){clearSearchDrop();return};st=setTimeout(async()=>{try{const r=state.mode==='backend'?await api('GET','/api/search?q='+encodeURIComponent(q)):await standalone('/api/search?q='+encodeURIComponent(q));showSearchDrop(r,q)}catch{}},300)});
qs('#searchInput').addEventListener('keydown',function(e){if(e.key==='Enter'){clearTimeout(st);const q=this.value.trim();if(q){clearSearchDrop();state.query=q;navigate('search')}}})
function showSearchDrop(results,q){
  const el=qs('#searchDrop');if(!el){const d=document.createElement('div');d.id='searchDrop';d.style.cssText='position:absolute;top:100%;left:0;right:0;background:var(--surface-elevated);border:1px solid var(--border);border-radius:var(--radius);margin-top:4px;max-height:360px;overflow-y:auto;z-index:200';qs('.search-box').appendChild(d)}
  const drop=qs('#searchDrop');
  if(!results||!results.length){drop.style.display='none';return}
  drop.innerHTML=results.slice(0,8).map(i=>'<div class="ps-drop-item" onclick="clearSearchDrop();navigate(\'detail\',{id:\''+i.id+'\',type:\''+(i.type||'movie')+'\',title:\''+jesc(i.title||'')+'\',year:\''+(i.year||'')+'\'})"><img src="'+(i.poster||'')+'" onerror="this.src=\'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 60%22><rect fill=%22%231a1a26%22 width=%2240%22 height=%2260%22/><text x=%2220%22 y=%2235%22 text-anchor=%22middle%22 font-size=%2218%22>🎬</text></svg>\'" style="width:32px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0"><div><div style="font-weight:600;font-size:13px">'+esc(i.title||'')+'</div><div style="font-size:11px;color:var(--text-muted)">'+(i.year||'')+' · '+(i.type==='tv'?'TV':'Movie')+'</div></div></div>').join('')
  drop.style.display='block'
}
function clearSearchDrop(){const d=qs('#searchDrop');if(d)d.style.display='none'}
document.addEventListener('click',e=>{const d=qs('#searchDrop'),inp=qs('#searchInput');if(d&&!d.contains(e.target)&&e.target!==inp)d.style.display='none'})
init()
