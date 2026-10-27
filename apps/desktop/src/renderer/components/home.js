// Home: one music library, four genuinely different listening spaces.
const homeState={loadedAt:0,loading:false,nowKey:"",recent:[],playlists:[],selected:null,nowPlaying:null};
const homeImage=images=>images?.length?(images[0]?.url||images.at(-1)?.url||""):"";
const homeArtists=artists=>(artists||[]).map(a=>a.name).filter(Boolean).join(", ");
function homeElement(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
const HOME_COPY={arcade:["GAME LIBRARY","Choose a stage","PRESS START"],vinyl:["THE RECORD SHELF","Select a record","NOW SPINNING"],tape:["THE VIDEO ARCHIVE","Select a tape","FEATURE PRESENTATION"],midnight:["YOUR MUSIC","Recently played","NOW PLAYING"]};
const currentHomeMode=()=>document.body.dataset.homeMode||"arcade";

async function homePlay(item){if(!item?.uri)return;const result=await window.tracker.playUri(item.uri,item.context||null);showToast(result?.ok?`PLAYING: ${item.title}`:`COULDN'T PLAY: ${result?.error||"UNKNOWN ERROR"}`);if(result?.ok)setTimeout(poll,350);}
function selectHomeItem(item){homeState.selected=item;renderHome();}

function renderHomeRoster(){
  const list=$("arcadeRecent");list.innerHTML="";
  if(!homeState.recent.length){list.appendChild(homeElement("div","homeEmpty","Play something in Spotify and it will appear here."));return;}
  homeState.recent.forEach((item,index)=>{
    const row=homeElement("button","homeSong");row.classList.toggle("selected",homeState.selected?.uri===item.uri);row.setAttribute("aria-label",`Select ${item.title}`);
    row.appendChild(homeElement("span","homeSongNumber",String(index+1).padStart(2,"0")));
    const image=homeElement("img");image.alt="";image.loading="lazy";if(item.img)image.src=item.img;row.appendChild(image);
    const copy=homeElement("span","homeSongCopy");copy.append(homeElement("strong","",item.title),homeElement("small","",item.sub||"Unknown artist"));row.appendChild(copy);
    row.appendChild(homeElement("span","homeSongArrow","›"));row.addEventListener("click",()=>selectHomeItem(item));row.addEventListener("dblclick",()=>homePlay(item));list.appendChild(row);
  });
}
function renderHomeCollections(){
  const list=$("arcadeCollections");list.innerHTML="";
  if(!homeState.playlists.length){list.appendChild(homeElement("div","homeEmpty","Connect Spotify to bring your playlist collections here."));return;}
  homeState.playlists.forEach(item=>{const card=homeElement("button","homeCollection");const image=homeElement("img");image.alt="";image.loading="lazy";if(item.img)image.src=item.img;card.append(image,homeElement("strong","",item.title),homeElement("small","",item.sub||"Playlist"));card.addEventListener("click",()=>selectHomeItem({...item,isPlaylist:true}));card.addEventListener("dblclick",()=>homePlay(item));list.appendChild(card);});
}
function renderHomeHero(){
  const hero=$("arcadeNow");hero.innerHTML="";const item=homeState.selected||homeState.nowPlaying||homeState.recent[0];const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade;
  if(!item){const empty=homeElement("div","homeHeroEmpty");empty.append(homeElement("span","homeHeroKicker",copy[2]),homeElement("h2","","Your next favourite song lives here"),homeElement("p","","Open the library or start Spotify to fill this space."));hero.appendChild(empty);return;}
  const visual=homeElement("div","homeHeroVisual"),art=homeElement("img","homeHeroArt");art.alt=`${item.title} artwork`;if(item.img)art.src=item.img;visual.append(art,homeElement("div","homeVinyl",""),homeElement("div","homeTapeSpine",item.title));
  const details=homeElement("div","homeHeroDetails");details.append(homeElement("span","homeHeroKicker",item.isNow?`LIVE // ${copy[2]}`:copy[2]),homeElement("h2","",item.title),homeElement("p","homeHeroArtist",item.sub||"Unknown artist"),homeElement("p","homeHeroDescription",item.isPlaylist?"A collection ready to become the soundtrack for this room.":"Selected from your listening history. Start it here, then open the mic when you want the lyrics to take over."));
  const actions=homeElement("div","homeHeroActions"),play=homeElement("button","homePrimary",mode==="arcade"?"START GAME":item.isPlaylist?"PLAY COLLECTION":"PLAY"),lyrics=homeElement("button","homeSecondary","OPEN LYRICS");play.addEventListener("click",()=>homePlay(item));lyrics.addEventListener("click",()=>setAppView("lyrics"));actions.append(play,lyrics);details.appendChild(actions);hero.append(visual,details);
}
function renderHome(){
  if(!$("homeScreen"))return;const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade;$("homeRosterKicker").textContent=copy[0];$("homeRosterTitle").textContent=copy[1];document.querySelectorAll("[data-home-theme]").forEach(b=>b.classList.toggle("active",b.dataset.homeTheme===mode));renderHomeRoster();renderHomeHero();renderHomeCollections();
}
const localHomeTracks=history=>(history||[]).slice(0,16).map(t=>({uri:t.uri,title:t.name||"Unknown track",sub:t.artist||t.album||"Local history",img:t.img||""}));
async function refreshArcadeHome(force=false){
  if(homeState.loading||(!force&&Date.now()-homeState.loadedAt<60000))return;homeState.loading=true;
  try{const [status,history]=await Promise.all([window.tracker.spStatus(),window.tracker.historyGet()]);homeState.recent=localHomeTracks(history);homeState.playlists=[];
    if(status?.connected){const [recent,playlists]=await Promise.all([window.tracker.spApi("/me/player/recently-played?limit=20"),window.tracker.spApi("/me/playlists?limit=16")]);if(recent.ok){const seen=new Set();homeState.recent=(recent.data?.items||[]).flatMap(row=>{const t=row?.track;if(!t?.uri||seen.has(t.uri))return[];seen.add(t.uri);return[{uri:t.uri,title:t.name||"Unknown track",sub:homeArtists(t.artists),img:homeImage(t.album?.images)}];}).slice(0,16);}if(playlists.ok)homeState.playlists=(playlists.data?.items||[]).filter(p=>p?.uri).slice(0,14).map(p=>({uri:p.uri,title:p.name||"Untitled collection",sub:`${p.tracks?.total??p.items?.total??"?"} songs`,img:homeImage(p.images),isPlaylist:true}));}
    if(!homeState.selected&&homeState.recent.length)homeState.selected=homeState.recent[0];homeState.loadedAt=Date.now();renderHome();
  }finally{homeState.loading=false;}
}
function updateHomeNowPlaying(np){const active=np&&(np.state==="playing"||np.state==="paused"),key=active?`${np.id}:${np.state}:${np.artwork}`:"idle";if(key===homeState.nowKey)return;homeState.nowKey=key;homeState.nowPlaying=active?{uri:np.uri,title:np.title,sub:`${np.artist}${np.album?` · ${np.album}`:""}`,img:np.artwork||"",isNow:true}:null;if(!homeState.selected||homeState.selected.isNow)homeState.selected=homeState.nowPlaying||homeState.recent[0]||null;renderHome();}
function setAppView(view){const wanted=view==="lyrics"?"lyrics":"home";if($("library").classList.contains("open"))closeLibrary();if($("trackerPanel").classList.contains("open"))closeTracker();if($("settings").classList.contains("open"))closeSettings();document.body.dataset.view=wanted;$("homeBtn").classList.toggle("active",wanted==="home");$("lyricsBtn").classList.toggle("active",wanted==="lyrics");$("homeScreen").setAttribute("aria-hidden",wanted!=="home"?"true":"false");if(wanted==="home")refreshArcadeHome();else activeIdx=-2;}
function initHome(){$("homeBtn").addEventListener("click",()=>setAppView("home"));$("lyricsBtn").addEventListener("click",()=>setAppView("lyrics"));$("arcadeLibraryBtn").addEventListener("click",()=>{setTab("recent");openLibrary();});document.querySelectorAll("[data-home-theme]").forEach(b=>b.addEventListener("click",()=>window.tracker.setSettings({homeMode:b.dataset.homeTheme})));renderHome();setAppView("home");}
