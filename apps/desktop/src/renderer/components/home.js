// Home: one music library, four genuinely different listening spaces.
const homeState={loadedAt:0,loading:false,collectionLoading:false,nowKey:"",recent:[],games:[],playlists:[],activeCollection:null,nowPlaying:null,slotItem:null};
const homeImage=images=>images?.length?(images[0]?.url||images.at(-1)?.url||""):"";
const homeArtists=artists=>(artists||[]).map(a=>a.name).filter(Boolean).join(", ");
function homeElement(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
const HOME_COPY={arcade:["GAME LIBRARY","Choose a stage","PRESS START"],vinyl:["CD LIBRARY","Choose a disc","NOW LOADED"],tape:["THE VIDEO ARCHIVE","Select a tape","FEATURE PRESENTATION"],midnight:["YOUR MUSIC","Recently played","NOW PLAYING"]};
const currentHomeMode=()=>document.body.dataset.homeMode||"arcade";
function setHomeGameColor(item){
  const seed=String(item?.uri||item?.title||"afterglow");let hash=0;for(const char of seed)hash=(hash*31+char.charCodeAt(0))>>>0;
  const hue=hash%360,sat=62+(hash%18),light=42+(hash%12),fallback=`hsl(${hue} ${sat}% ${light}%)`,screen=$("homeScreen");
  screen?.style.setProperty("--game-color",fallback);document.body.style.setProperty("--game-color",fallback);
  screen?.style.setProperty("--cd-a",fallback);screen?.style.setProperty("--cd-b",`hsl(${(hue+72)%360} ${sat}% ${Math.min(72,light+18)}%)`);screen?.style.setProperty("--cd-c",`hsl(${(hue+168)%360} ${Math.max(48,sat-14)}% ${Math.min(78,light+24)}%)`);
  if(!item?.img)return;
  const image=new Image();image.crossOrigin="anonymous";image.onload=()=>{
    try{
      const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});canvas.width=canvas.height=28;ctx.drawImage(image,0,0,28,28);
      const data=ctx.getImageData(0,0,28,28).data,buckets=[];let r=0,g=0,b=0,w=0,cr=0,cg=0,cb=0,cw=0;for(let i=0;i<12;i++)buckets.push({r:0,g:0,b:0,w:0});
      for(let i=0;i<data.length;i+=16){const rr=data[i],gg=data[i+1],bb=data[i+2],hi=Math.max(rr,gg,bb),lo=Math.min(rr,gg,bb),chroma=hi-lo,weight=1+chroma/70,colorWeight=Math.max(0,chroma-16)*(0.6+hi/255);r+=rr*weight;g+=gg*weight;b+=bb*weight;w+=weight;if(colorWeight){cr+=rr*colorWeight;cg+=gg*colorWeight;cb+=bb*colorWeight;cw+=colorWeight;}const bucket=Math.min(11,Math.floor(hi/22));buckets[bucket].r+=rr*weight;buckets[bucket].g+=gg*weight;buckets[bucket].b+=bb*weight;buckets[bucket].w+=weight;}
      const avg=[Math.round(r/w),Math.round(g/w),Math.round(b/w)],accent=cw?[Math.round(cr/cw),Math.round(cg/cw),Math.round(cb/cw)]:avg,color=`rgb(${accent[0]} ${accent[1]} ${accent[2]})`;
      const sorted=buckets.filter(x=>x.w>0).sort((a,b)=>b.w-a.w),pick=(n,mix)=>{const x=sorted[n]||sorted[0]||{r:avg[0],g:avg[1],b:avg[2],w:1};return `rgb(${Math.round(x.r/x.w*mix+255*(1-mix))} ${Math.round(x.g/x.w*mix+255*(1-mix))} ${Math.round(x.b/x.w*mix+255*(1-mix))})`;};
      screen?.style.setProperty("--game-color",color);document.body.style.setProperty("--game-color",color);screen?.style.setProperty("--cd-a",color);screen?.style.setProperty("--cd-b",pick(1,.82));screen?.style.setProperty("--cd-c",pick(2,.64));
    }catch{}
  };image.src=item.img;
}

async function homePlay(item){if(!item?.uri)return false;const result=await window.tracker.playUri(item.uri,item.context||null);showToast(result?.ok?`PLAYING: ${item.title}`:`COULDN'T PLAY: ${result?.error||"UNKNOWN ERROR"}`);if(result?.ok)setTimeout(poll,250);return !!result?.ok;}
async function launchHomeItem(item,source){
  const mode=currentHomeMode();
  if(mode==="arcade")return launchHomeGame(item,source);
  if(mode==="vinyl")return launchHomeCd(item,source);
  return homePlay(item);
}
async function launchHomeGame(item,source){
  if(!item?.uri||homeState.slotItem)return;
  document.querySelectorAll(".gameCartridgePortal").forEach(node=>node.remove());
  homeState.slotItem=item;setHomeGameColor(item);const screen=$("homeScreen"),hero=$("arcadeNow");screen.classList.add("game-slotting");
  const heroRect=hero.getBoundingClientRect(),slotRect=hero.querySelector(".arcadeGameSlot")?.getBoundingClientRect();
  const portal=homeElement("div","gameCartridgePortal"),cartridge=homeElement("div","gameCartridgeFlight"),label=homeElement("div","gameCartridgeLabel"),art=homeElement("img");art.alt="";if(item.img)art.src=item.img;label.append(art,homeElement("strong","",item.title));cartridge.append(label);portal.append(cartridge);hero.appendChild(portal);
  const startW=Math.min(210,heroRect.width*.3),slotCenter=slotRect?slotRect.left+slotRect.width/2:heroRect.left+heroRect.width/2,startX=slotCenter-startW/2,cartridgeH=startW/1.55;
  const slotTop=slotRect?.top??heroRect.top+heroRect.height*.76,startY=Math.max(heroRect.top+50,slotTop-cartridgeH-120),portalH=slotTop-startY+(slotRect?.height||24)/2;
  Object.assign(portal.style,{left:`${startX}px`,top:`${startY}px`,width:`${startW}px`,height:`${portalH}px`});
  const targetY=portalH+8;
  const flight=cartridge.animate([
    {transform:"translate3d(0,-18px,0)",opacity:0},
    {transform:"translate3d(0,0,0)",opacity:1,offset:.1},
    {transform:`translate3d(0,${Math.max(0,portalH-cartridgeH-12)}px,0)`,opacity:1,offset:.72},
    {transform:`translate3d(0,${targetY}px,0)`,opacity:1}
  ],{duration:1000,easing:"cubic-bezier(.45,0,.2,1)",fill:"forwards"});
  await new Promise(resolve=>setTimeout(resolve,1020));
  flight.cancel();portal.remove();
  const started=await homePlay(item);
  setTimeout(()=>{screen.classList.remove("game-slotting");if(!started)homeState.slotItem=null;renderHomeHero();},450);
  setTimeout(()=>{if(homeState.slotItem===item){homeState.slotItem=null;screen.classList.remove("game-slotting");renderHomeHero();}},4000);
}
async function launchHomeCd(item,source){
  if(!item?.uri||homeState.slotItem)return;
  document.querySelectorAll(".homeCdFlight").forEach(node=>node.remove());
  homeState.slotItem=item;setHomeGameColor(item);const screen=$("homeScreen"),hero=$("arcadeNow");screen.classList.add("cd-loading");renderHomeHero();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const target=hero.querySelector(".homeCdDiscTarget")?.getBoundingClientRect(),src=(source?.querySelector("img")||hero.querySelector(".homeCdAlbumCard img")||hero).getBoundingClientRect();
  if(target){
    const disc=homeElement("div","homeCdFlight"),art=homeElement("img");art.alt="";if(item.img)art.src=item.img;disc.appendChild(art);document.body.appendChild(disc);
    const size=Math.min(230,Math.max(150,target.width*.96)),left=target.left+target.width/2-size/2,top=target.top+target.height/2-size/2;
    const startScale=Math.max(.26,Math.min(.62,src.width/size)),dx=src.left+src.width/2-(left+size/2),dy=src.top+src.height/2-(top+size/2);
    Object.assign(disc.style,{left:`${left}px`,top:`${top}px`,width:`${size}px`,height:`${size}px`});
    const flight=disc.animate([
      {transform:`translate3d(${dx}px,${dy}px,0) scale(${startScale}) rotate(-18deg)`,opacity:.1,filter:"blur(1px) saturate(.8)"},
      {transform:`translate3d(${dx*.38}px,${dy*.5-42}px,0) scale(.82) rotate(12deg)`,opacity:1,filter:"blur(0) saturate(1.15)",offset:.28},
      {transform:"translate3d(0,-16px,0) scale(1.04) rotate(340deg)",opacity:1,filter:"blur(0) saturate(1.25)",offset:.78},
      {transform:"translate3d(0,0,0) scale(.82) rotate(460deg)",opacity:0}
    ],{duration:1220,easing:"cubic-bezier(.5,0,.16,1)",fill:"forwards"});
    await flight.finished.catch(()=>{});
    disc.remove();
  }else{
    await new Promise(resolve=>setTimeout(resolve,700));
  }
  screen.classList.add("cd-seated");
  const started=await homePlay(item);
  setTimeout(()=>{screen.classList.remove("cd-loading","cd-seated");if(!started)homeState.slotItem=null;renderHomeHero();},420);
  setTimeout(()=>{if(homeState.slotItem===item){homeState.slotItem=null;screen.classList.remove("cd-loading","cd-seated");renderHomeHero();}},4000);
}

function renderHomeRoster(){
  const list=$("arcadeRecent");list.innerHTML="";
  const mode=currentHomeMode(),loadingText=mode==="vinyl"?"LOADING DISCS…":mode==="tape"?"LOADING TAPES…":"LOADING GAMES…";
  if(homeState.collectionLoading){list.appendChild(homeElement("div","homeLoading",loadingText));return;}
  if(!homeState.games.length){list.appendChild(homeElement("div","homeEmpty","This collection has no playable songs yet."));return;}
  homeState.games.forEach((item,index)=>{
    const row=homeElement("button","homeSong");row.classList.toggle("selected",homeState.nowPlaying?.uri===item.uri);row.setAttribute("aria-label",`Play ${item.title}`);
    row.appendChild(homeElement("span","homeSongNumber",String(index+1).padStart(2,"0")));
    const image=homeElement("img");image.alt="";image.loading="lazy";if(item.img)image.src=item.img;row.appendChild(image);
    const copy=homeElement("span","homeSongCopy");copy.append(homeElement("strong","",item.title),homeElement("small","",item.sub||"Unknown artist"));row.appendChild(copy);
    row.appendChild(homeElement("span","homeSongArrow","▶"));row.addEventListener("click",()=>launchHomeItem(item,row));list.appendChild(row);
  });
}
function renderHomeCollections(){
  const list=$("arcadeCollections");list.innerHTML="";
  if(!homeState.playlists.length){list.appendChild(homeElement("div","homeEmpty","Connect Spotify to bring your full library here."));return;}
  homeState.playlists.forEach(item=>{const card=homeElement("button","homeCollection");card.classList.toggle("selected",homeState.activeCollection?.key===item.key);let image;if(item.img){image=homeElement("img");image.alt="";image.loading="lazy";image.src=item.img;}else{image=homeElement("div","homeCollectionPlaceholder",item.symbol||"♫");}card.append(image,homeElement("strong","",item.title),homeElement("small","",item.sub||"Playlist"));card.addEventListener("click",()=>loadHomeCollection(item));list.appendChild(card);});
}
function renderArcadeCabinet(hero,item){
  const cabinet=homeElement("div","arcadeCabinet"),display=homeElement("div","arcadeDisplay"),top=homeElement("div","arcadeDisplayTop");
  top.append(homeElement("span","","PLAYER 01"),homeElement("strong","",item?"NOW PLAYING":"READY"),homeElement("span","",item?"SCORE 01":"INSERT GAME"));display.appendChild(top);
  const screen=homeElement("div","arcadeScreenContent");
  if(item){const art=homeElement("img","arcadeScreenArt");art.alt=`${item.title} artwork`;if(item.img)art.src=item.img;const info=homeElement("div","arcadeScreenInfo");info.append(homeElement("span","arcadeScreenStatus",playing?"● GAME IN PROGRESS":"Ⅱ GAME PAUSED"),homeElement("h2","",item.title),homeElement("p","",item.sub||"Unknown artist"),homeElement("small","",item.album||"AFTERGLOW ARCADE"));screen.append(art,info);}
  else{const idle=homeElement("div","arcadeScreenIdle");idle.append(homeElement("span","","AFTERGLOW"),homeElement("h2","","SELECT A GAME"),homeElement("p","","Choose a song from the left rack"));screen.appendChild(idle);}
  display.appendChild(screen);
  const deck=homeElement("div","arcadeDeck"),transport=homeElement("div","arcadeDeckButtons"),prev=homeElement("button","arcadeRoundButton","◀"),play=homeElement("button","arcadeRoundButton primary",playing?"Ⅱ":"▶"),next=homeElement("button","arcadeRoundButton","▶");prev.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));transport.append(prev,play,next);
  const slotZone=homeElement("div","arcadeSlotZone");slotZone.append(homeElement("span","","GAME SLOT"),homeElement("div","arcadeGameSlot",""),homeElement("small","",homeState.slotItem?"LOADING…":"CHOOSE A SONG"));
  const lyrics=homeElement("button","arcadeLyricsButton","MIC // LYRICS");lyrics.addEventListener("click",()=>setAppView("lyrics"));deck.append(transport,slotZone,lyrics);cabinet.append(display,deck);hero.appendChild(cabinet);
}
function renderCdPlayer(hero,item,copy){
  const scene=homeElement("div","homeCdScene"),stack=homeElement("div","homeCdAlbumStack"),cards=(homeState.games.length?homeState.games:[item]).filter(Boolean).slice(0,5);
  cards.forEach((card,index)=>{const tile=homeElement("div","homeCdAlbumCard");tile.style.setProperty("--i",index);const img=homeElement("img");img.alt="";if(card.img)img.src=card.img;tile.append(img,homeElement("span","",card.title||"Afterglow"));stack.appendChild(tile);});
  const player=homeElement("div","homeCdPlayer"),deck=homeElement("div","homeCdDeck"),target=homeElement("div","homeCdDiscTarget"),disc=homeElement("div","homeCdDisc");
  if(item?.img){const img=homeElement("img");img.alt="";img.src=item.img;disc.appendChild(img);}
  target.append(disc,homeElement("div","homeCdLaser",""),homeElement("div","homeCdNeedle",""));
  const controls=homeElement("div","homeCdControls"),prev=homeElement("button","homeCdButton","◀"),play=homeElement("button","homeCdButton primary",playing?"Ⅱ":"▶"),next=homeElement("button","homeCdButton","▶"),lyrics=homeElement("button","homeCdButton wide","LYRICS");
  prev.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));lyrics.addEventListener("click",()=>setAppView("lyrics"));controls.append(prev,play,next,lyrics);
  const screen=homeElement("div","homeCdScreen");screen.append(homeElement("span","",`COMPACT DISC // ${playing?"PLAYING":"READY"}`),homeElement("strong","",item.title),homeElement("small","",`${item.sub||"Unknown artist"}${item.album?" · "+item.album:""}`));
  deck.append(target,homeElement("div","homeCdSlider",""),screen,controls);player.append(homeElement("div","homeCdLid",""),deck);
  scene.append(stack,player);hero.append(scene);
}
function renderHomeHero(){
  const hero=$("arcadeNow");hero.innerHTML="";const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade,item=(mode==="vinyl"&&homeState.slotItem)||homeState.nowPlaying;
  if(mode==="arcade"){renderArcadeCabinet(hero,item);return;}
  if(mode==="vinyl"&&item){renderCdPlayer(hero,item,copy);return;}
  if(!item){const empty=homeElement("div","homeHeroEmpty");empty.append(homeElement("span","homeHeroKicker",copy[2]),homeElement("h2","","Your next favourite song lives here"),homeElement("p","","Open the library or start Spotify to fill this space."));hero.appendChild(empty);return;}
  const visual=homeElement("div","homeHeroVisual"),art=homeElement("img","homeHeroArt");art.alt=`${item.title} artwork`;if(item.img)art.src=item.img;visual.append(art,homeElement("div","homeVinyl",""),homeElement("div","homeTapeSpine",item.title));
  const details=homeElement("div","homeHeroDetails");details.append(homeElement("span","homeHeroKicker",`LIVE // ${copy[2]}`),homeElement("h2","",item.title),homeElement("p","homeHeroArtist",item.sub||"Unknown artist"));
  const albumName=(item.album||item.sub||"").split(" · ").at(-1);details.appendChild(homeElement("p","homeHeroAlbum",albumName));
  const actions=homeElement("div","homeHeroActions"),previous=homeElement("button","homeTransport","◀"),play=homeElement("button","homePrimary",playing?"PAUSE":"PLAY"),next=homeElement("button","homeTransport","▶"),lyrics=homeElement("button","homeSecondary","LYRICS");previous.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));lyrics.addEventListener("click",()=>setAppView("lyrics"));actions.append(previous,play,next,lyrics);details.appendChild(actions);hero.append(visual,details);
}
function renderHome(){
  if(!$("homeScreen"))return;const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade,collectionMeta=mode==="vinyl"?"Pick a crate to load its discs on the left.":mode==="tape"?"Pick an archive to load its tapes on the left.":"Liked Songs, Blends and playlists load their games on the left.";$("homeRosterKicker").textContent=copy[0];$("homeRosterTitle").textContent=homeState.activeCollection?.title||copy[1];$("homeRosterMeta").textContent=homeState.activeCollection?.sub||"Recently played";$("homeCollectionsMeta").textContent=collectionMeta;document.querySelectorAll("[data-home-theme]").forEach(b=>b.classList.toggle("active",b.dataset.homeTheme===mode));renderHomeRoster();renderHomeHero();renderHomeCollections();
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
function updateHomeNowPlaying(np){const active=np&&(np.state==="playing"||np.state==="paused"),key=active?`${np.id}:${np.state}:${np.artwork}`:"idle";if(key===homeState.nowKey)return;homeState.nowKey=key;homeState.nowPlaying=active?{uri:np.uri,title:np.title,sub:np.artist||"Unknown artist",album:np.album||"",img:np.artwork||"",isNow:true}:null;if(homeState.nowPlaying)setHomeGameColor(homeState.nowPlaying);homeState.slotItem=null;$("homeScreen")?.classList.remove("game-slotting","cd-loading","cd-seated");renderHome();}
function setAppView(view){const wanted=view==="lyrics"?"lyrics":"home";if($("library").classList.contains("open"))closeLibrary();if($("trackerPanel").classList.contains("open"))closeTracker();if($("settings").classList.contains("open"))closeSettings();document.body.dataset.view=wanted;$("homeBtn").classList.toggle("active",wanted==="home");$("lyricsBtn").classList.toggle("active",wanted==="lyrics");$("homeScreen").setAttribute("aria-hidden",wanted!=="home"?"true":"false");if(wanted==="home")refreshArcadeHome();else activeIdx=-2;}
function initHome(){$("homeBtn").addEventListener("click",()=>setAppView("home"));$("lyricsBtn").addEventListener("click",()=>setAppView("lyrics"));$("arcadeLibraryBtn").addEventListener("click",()=>{setTab("recent");openLibrary();});document.querySelectorAll("[data-home-theme]").forEach(b=>b.addEventListener("click",()=>window.tracker.setSettings({homeMode:b.dataset.homeTheme})));renderHome();setAppView("home");}
