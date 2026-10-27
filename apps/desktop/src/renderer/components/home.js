// Home: one music library, four genuinely different listening spaces.
const homeState={loadedAt:0,loading:false,collectionLoading:false,nowKey:"",recent:[],games:[],playlists:[],activeCollection:null,nowPlaying:null,slotItem:null};
const homeImage=images=>images?.length?(images[0]?.url||images.at(-1)?.url||""):"";
const homeArtists=artists=>(artists||[]).map(a=>a.name).filter(Boolean).join(", ");
function homeElement(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
const HOME_COPY={arcade:["GAME LIBRARY","Choose a stage","PRESS START"],vinyl:["THE RECORD SHELF","Select a record","NOW SPINNING"],tape:["THE VIDEO ARCHIVE","Select a tape","FEATURE PRESENTATION"],midnight:["YOUR MUSIC","Recently played","NOW PLAYING"]};
const currentHomeMode=()=>document.body.dataset.homeMode||"arcade";

async function homePlay(item){if(!item?.uri)return false;const result=await window.tracker.playUri(item.uri,item.context||null);showToast(result?.ok?`PLAYING: ${item.title}`:`COULDN'T PLAY: ${result?.error||"UNKNOWN ERROR"}`);if(result?.ok)setTimeout(poll,250);return !!result?.ok;}
async function launchHomeGame(item,source){
  if(!item?.uri||homeState.slotItem)return;
  homeState.slotItem=item;const screen=$("homeScreen"),hero=$("arcadeNow");screen.classList.add("game-slotting");
  const sourceRect=source?.getBoundingClientRect(),heroRect=hero.getBoundingClientRect();
  const cartridge=homeElement("div","gameCartridgeFlight");const art=homeElement("img");art.alt="";if(item.img)art.src=item.img;cartridge.append(art,homeElement("strong","",item.title));document.body.appendChild(cartridge);
  const startX=sourceRect?.left??40,startY=sourceRect?.top??innerHeight/2,startW=Math.min(sourceRect?.width??180,220);
  Object.assign(cartridge.style,{left:`${startX}px`,top:`${startY}px`,width:`${startW}px`});
  const targetX=heroRect.left+heroRect.width/2-startW*.34,targetY=heroRect.top+heroRect.height*.48;
  const flight=cartridge.animate([
    {transform:"translate3d(0,0,0) scale(1) rotateZ(0deg)",opacity:1},
    {transform:`translate3d(${(targetX-startX)*.62}px,${(targetY-startY)*.54-80}px,0) scale(.9) rotateZ(-7deg)`,opacity:1,offset:.58},
    {transform:`translate3d(${targetX-startX}px,${targetY-startY}px,0) scale(.68) rotateX(72deg)`,opacity:.95}
  ],{duration:780,easing:"cubic-bezier(.22,.8,.25,1)",fill:"forwards"});
  await flight.finished.catch(()=>{});cartridge.remove();
  const started=await homePlay(item);
  setTimeout(()=>{screen.classList.remove("game-slotting");if(!started)homeState.slotItem=null;renderHomeHero();},450);
  setTimeout(()=>{if(homeState.slotItem===item){homeState.slotItem=null;screen.classList.remove("game-slotting");renderHomeHero();}},4000);
}

function renderHomeRoster(){
  const list=$("arcadeRecent");list.innerHTML="";
  if(homeState.collectionLoading){list.appendChild(homeElement("div","homeLoading","LOADING GAMES…"));return;}
  if(!homeState.games.length){list.appendChild(homeElement("div","homeEmpty","This collection has no playable songs yet."));return;}
  homeState.games.forEach((item,index)=>{
    const row=homeElement("button","homeSong");row.classList.toggle("selected",homeState.nowPlaying?.uri===item.uri);row.setAttribute("aria-label",`Play ${item.title}`);
    row.appendChild(homeElement("span","homeSongNumber",String(index+1).padStart(2,"0")));
    const image=homeElement("img");image.alt="";image.loading="lazy";if(item.img)image.src=item.img;row.appendChild(image);
    const copy=homeElement("span","homeSongCopy");copy.append(homeElement("strong","",item.title),homeElement("small","",item.sub||"Unknown artist"));row.appendChild(copy);
    row.appendChild(homeElement("span","homeSongArrow","▶"));row.addEventListener("click",()=>launchHomeGame(item,row));list.appendChild(row);
  });
}
function renderHomeCollections(){
  const list=$("arcadeCollections");list.innerHTML="";
  if(!homeState.playlists.length){list.appendChild(homeElement("div","homeEmpty","Connect Spotify to bring your full library here."));return;}
  homeState.playlists.forEach(item=>{const card=homeElement("button","homeCollection");card.classList.toggle("selected",homeState.activeCollection?.key===item.key);let image;if(item.img){image=homeElement("img");image.alt="";image.loading="lazy";image.src=item.img;}else{image=homeElement("div","homeCollectionPlaceholder",item.symbol||"♫");}card.append(image,homeElement("strong","",item.title),homeElement("small","",item.sub||"Playlist"));card.addEventListener("click",()=>loadHomeCollection(item));list.appendChild(card);});
}
function renderHomeHero(){
  const hero=$("arcadeNow");hero.innerHTML="";const item=homeState.nowPlaying;const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade;
  if(!item){const empty=homeElement("div","homeHeroEmpty");empty.append(homeElement("span","homeHeroKicker",copy[2]),homeElement("h2","","Your next favourite song lives here"),homeElement("p","","Open the library or start Spotify to fill this space."));hero.appendChild(empty);return;}
  const visual=homeElement("div","homeHeroVisual"),art=homeElement("img","homeHeroArt");art.alt=`${item.title} artwork`;if(item.img)art.src=item.img;visual.append(art,homeElement("div","homeVinyl",""),homeElement("div","homeTapeSpine",item.title));
  const details=homeElement("div","homeHeroDetails");details.append(homeElement("span","homeHeroKicker",`LIVE // ${copy[2]}`),homeElement("h2","",item.title),homeElement("p","homeHeroArtist",item.sub||"Unknown artist"));
  const albumName=(item.album||item.sub||"").split(" · ").at(-1);details.appendChild(homeElement("p","homeHeroAlbum",albumName));
  const actions=homeElement("div","homeHeroActions"),previous=homeElement("button","homeTransport","◀"),play=homeElement("button","homePrimary",playing?"PAUSE":"PLAY"),next=homeElement("button","homeTransport","▶"),lyrics=homeElement("button","homeSecondary","LYRICS");previous.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));lyrics.addEventListener("click",()=>setAppView("lyrics"));actions.append(previous,play,next,lyrics);details.appendChild(actions);hero.append(visual,details);
}
function renderHome(){
  if(!$("homeScreen"))return;const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade;$("homeRosterKicker").textContent=copy[0];$("homeRosterTitle").textContent=homeState.activeCollection?.title||copy[1];$("homeRosterMeta").textContent=homeState.activeCollection?.sub||"Recently played";document.querySelectorAll("[data-home-theme]").forEach(b=>b.classList.toggle("active",b.dataset.homeTheme===mode));renderHomeRoster();renderHomeHero();renderHomeCollections();
}
const localHomeTracks=history=>(history||[]).slice(0,16).map(t=>({uri:t.uri,title:t.name||"Unknown track",sub:t.artist||t.album||"Local history",img:t.img||""}));
function normaliseHomeTracks(rows,context){return(rows||[]).flatMap(row=>{const t=row?.track||row?.item||row;if(!t?.uri||!String(t.uri).startsWith("spotify:track:"))return[];return[{uri:t.uri,context,title:t.name||"Unknown track",sub:homeArtists(t.artists),album:t.album?.name||"",img:homeImage(t.album?.images)}];});}
async function loadHomeCollection(collection){
  if(!collection||homeState.collectionLoading)return;
  homeState.activeCollection=collection;homeState.collectionLoading=true;renderHome();
  try{
    if(collection.kind==="recent")homeState.games=homeState.recent.slice();
    else{
      let response=await window.tracker.spApi(collection.kind==="liked"?"/me/tracks?limit=50":`/playlists/${collection.id}/items?limit=100`);
      if(!response.ok&&collection.kind==="playlist")response=await window.tracker.spApi(`/playlists/${collection.id}/tracks?limit=100`);
      if(response.ok)homeState.games=normaliseHomeTracks(response.data?.items,collection.kind==="playlist"?collection.uri:null);
      else showToast(`COULDN'T LOAD ${collection.title}`);
    }
  }finally{homeState.collectionLoading=false;renderHome();}
}
async function refreshArcadeHome(force=false){
  if(homeState.loading||(!force&&Date.now()-homeState.loadedAt<60000))return;homeState.loading=true;
  try{const [status,history]=await Promise.all([window.tracker.spStatus(),window.tracker.historyGet()]);homeState.recent=localHomeTracks(history);homeState.games=homeState.games.length?homeState.games:homeState.recent.slice();homeState.playlists=[{key:"recent",kind:"recent",title:"Recently played",sub:`${homeState.recent.length} songs`,symbol:"↻"}];
    if(status?.connected){const [recent,playlists,liked]=await Promise.all([window.tracker.spApi("/me/player/recently-played?limit=50"),window.tracker.spApi("/me/playlists?limit=50"),window.tracker.spApi("/me/tracks?limit=1")]);if(recent.ok){const seen=new Set();homeState.recent=normaliseHomeTracks(recent.data?.items).filter(t=>{if(seen.has(t.uri))return false;seen.add(t.uri);return true;}).slice(0,50);if(!homeState.activeCollection||homeState.activeCollection.kind==="recent")homeState.games=homeState.recent.slice();}homeState.playlists=[{key:"liked",kind:"liked",title:"Liked Songs",sub:`${liked.ok?(liked.data?.total??"Your"):"Your"} songs`,symbol:"♥"},{key:"recent",kind:"recent",title:"Recently played",sub:`${homeState.recent.length} songs`,symbol:"↻"}];if(playlists.ok)homeState.playlists.push(...(playlists.data?.items||[]).filter(p=>p?.uri).map(p=>({key:`playlist:${p.id}`,id:p.id,kind:"playlist",uri:p.uri,title:p.name||"Untitled collection",sub:`${p.tracks?.total??p.items?.total??"?"} songs`,img:homeImage(p.images)})));}
    if(!homeState.activeCollection)homeState.activeCollection=homeState.playlists.find(p=>p.kind==="recent")||homeState.playlists[0];homeState.loadedAt=Date.now();renderHome();
  }finally{homeState.loading=false;}
}
function updateHomeNowPlaying(np){const active=np&&(np.state==="playing"||np.state==="paused"),key=active?`${np.id}:${np.state}:${np.artwork}`:"idle";if(key===homeState.nowKey)return;homeState.nowKey=key;homeState.nowPlaying=active?{uri:np.uri,title:np.title,sub:np.artist||"Unknown artist",album:np.album||"",img:np.artwork||"",isNow:true}:null;homeState.slotItem=null;$("homeScreen")?.classList.remove("game-slotting");renderHome();}
function setAppView(view){const wanted=view==="lyrics"?"lyrics":"home";if($("library").classList.contains("open"))closeLibrary();if($("trackerPanel").classList.contains("open"))closeTracker();if($("settings").classList.contains("open"))closeSettings();document.body.dataset.view=wanted;$("homeBtn").classList.toggle("active",wanted==="home");$("lyricsBtn").classList.toggle("active",wanted==="lyrics");$("homeScreen").setAttribute("aria-hidden",wanted!=="home"?"true":"false");if(wanted==="home")refreshArcadeHome();else activeIdx=-2;}
function initHome(){$("homeBtn").addEventListener("click",()=>setAppView("home"));$("lyricsBtn").addEventListener("click",()=>setAppView("lyrics"));$("arcadeLibraryBtn").addEventListener("click",()=>{setTab("recent");openLibrary();});document.querySelectorAll("[data-home-theme]").forEach(b=>b.addEventListener("click",()=>window.tracker.setSettings({homeMode:b.dataset.homeTheme})));renderHome();setAppView("home");}
