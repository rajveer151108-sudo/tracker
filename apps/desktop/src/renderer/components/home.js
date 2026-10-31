// Home: one music library, three genuinely different listening spaces.
const homeState={loadedAt:0,loading:false,collectionLoading:false,queueLoading:false,queueLoadedAt:0,queueRequest:0,queueSchedule:0,nowKey:"",recent:[],games:[],queue:[],playlists:[],activeCollection:null,nowPlaying:null,slotItem:null,pendingUri:"",pendingAt:0,pendingCommandAt:0,loadSequence:0,volume:50,volumeTimer:null,search:"",librarySearch:"",librarySearching:false,libraryResults:[],librarySearchError:"",librarySearchRequest:0,librarySearchTimer:null,connected:false,writeAccess:false};
const HOME_PENDING_ANIMATION_TIMEOUT=5000,HOME_PENDING_PLAYBACK_TIMEOUT=9000;
const homeImage=images=>images?.length?(images[0]?.url||images.at(-1)?.url||""):"";
const homeArtists=artists=>(artists||[]).map(a=>a.name).filter(Boolean).join(", ");
function homeElement(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
const HOME_COPY={arcade:["GAME LIBRARY","Choose a stage","PRESS START"],vinyl:["VINYL LIBRARY","Choose a record","NOW SPINNING"],cd:["COMPACT DISC LIBRARY","Choose a CD","DISC LOADED"]};
const ARCADE_VOCAL_OVERRIDES={"spotify:track:6oLHyWvmk6bKrA91EIYZBp":"PARTYNEXTDOOR"};
const currentHomeMode=()=>document.body.dataset.homeMode||"arcade";
let arcadeCanvasRequest=0;
function updateHomeVolumeUi(value){const volume=Math.max(0,Math.min(100,Math.round(Number(value)||0))),sliders=document.querySelectorAll(".homeCdVolumeRange,.homeStereoVolume input"),readouts=document.querySelectorAll(".homeCdVolumeValue,.homeStereoVolumeValue"),control=document.querySelector(".homeCdSlider");homeState.volume=volume;sliders.forEach(slider=>{if(Number(slider.value)!==volume)slider.value=String(volume);});readouts.forEach(readout=>{readout.textContent=`${volume}%`;});control?.style.setProperty("--volume",`${volume}%`);}
function setHomeVolume(value,immediate=false){updateHomeVolumeUi(value);clearTimeout(homeState.volumeTimer);const commit=async()=>{homeState.volumeTimer=null;const result=await window.tracker.setVolume(homeState.volume);if(!result?.ok)showToast(`VOLUME: ${result?.error||"COULDN'T CHANGE IT"}`);};if(immediate)commit();else homeState.volumeTimer=setTimeout(commit,70);}
function setHomeGameColor(item){
  const seed=String(item?.uri||item?.title||"afterglow");let hash=0;for(const char of seed)hash=(hash*31+char.charCodeAt(0))>>>0;
  const hue=hash%360,sat=62+(hash%18),light=42+(hash%12),fallback=`hsl(${hue} ${sat}% ${light}%)`,screen=$("homeScreen");
  const apply=(name,value)=>{screen?.style.setProperty(name,value);document.body.style.setProperty(name,value);};
  apply("--game-color",fallback);apply("--cd-a",fallback);apply("--cd-b",`hsl(${(hue+72)%360} ${sat}% ${Math.min(72,light+18)}%)`);apply("--cd-c",`hsl(${(hue+168)%360} ${Math.max(48,sat-14)}% ${Math.min(78,light+24)}%)`);
  if(!item?.img)return;
  const image=new Image();image.crossOrigin="anonymous";image.onload=()=>{
    try{
      const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});canvas.width=canvas.height=28;ctx.drawImage(image,0,0,28,28);
      const data=ctx.getImageData(0,0,28,28).data,buckets=[];let r=0,g=0,b=0,w=0,cr=0,cg=0,cb=0,cw=0;for(let i=0;i<12;i++)buckets.push({r:0,g:0,b:0,w:0});
      for(let i=0;i<data.length;i+=16){const rr=data[i],gg=data[i+1],bb=data[i+2],hi=Math.max(rr,gg,bb),lo=Math.min(rr,gg,bb),chroma=hi-lo,weight=1+chroma/70,colorWeight=Math.max(0,chroma-16)*(0.6+hi/255);r+=rr*weight;g+=gg*weight;b+=bb*weight;w+=weight;if(colorWeight){cr+=rr*colorWeight;cg+=gg*colorWeight;cb+=bb*colorWeight;cw+=colorWeight;}const bucket=Math.min(11,Math.floor(hi/22));buckets[bucket].r+=rr*weight;buckets[bucket].g+=gg*weight;buckets[bucket].b+=bb*weight;buckets[bucket].w+=weight;}
      const avg=[Math.round(r/w),Math.round(g/w),Math.round(b/w)],accent=cw?[Math.round(cr/cw),Math.round(cg/cw),Math.round(cb/cw)]:avg,color=`rgb(${accent[0]} ${accent[1]} ${accent[2]})`;
      const sorted=buckets.filter(x=>x.w>0).sort((a,b)=>b.w-a.w),pick=(n,mix)=>{const x=sorted[n]||sorted[0]||{r:avg[0],g:avg[1],b:avg[2],w:1};return `rgb(${Math.round(x.r/x.w*mix+255*(1-mix))} ${Math.round(x.g/x.w*mix+255*(1-mix))} ${Math.round(x.b/x.w*mix+255*(1-mix))})`;};
      apply("--game-color",color);apply("--cd-a",color);apply("--cd-b",pick(1,.82));apply("--cd-c",pick(2,.64));
    }catch{}
  };image.src=item.img;
}

function paintArcadeWorld(canvas,url){
  if(!canvas||!url)return;
  const image=new Image();
  image.onload=()=>{
    if(!canvas.isConnected)return;
    const context=canvas.getContext("2d",{willReadFrequently:true}),width=canvas.width,height=canvas.height,scale=Math.max(width/image.naturalWidth,height/image.naturalHeight),sourceWidth=width/scale,sourceHeight=height/scale;
    context.imageSmoothingEnabled=true;context.drawImage(image,(image.naturalWidth-sourceWidth)/2,(image.naturalHeight-sourceHeight)/2,sourceWidth,sourceHeight,0,0,width,height);
    let source;try{source=context.getImageData(0,0,width,height);}catch{return;}
    const state={source,strength:0,lastTime:0};canvas._arcadeWorld=state;
    const colorAt=(x,y,lift)=>{const sx=Math.max(0,Math.min(width-1,Math.round(x))),sy=Math.max(0,Math.min(height-1,Math.round(y))),index=(sy*width+sx)*4,data=source.data;return `rgb(${Math.min(255,data[index]+lift)} ${Math.min(255,data[index+1]+lift)} ${Math.min(255,data[index+2]+lift)})`;};
    const paintField=(centerX,centerY,radius,power,phase)=>{if(!Number.isFinite(centerX)||!Number.isFinite(centerY)||power<.02)return;const left=Math.max(0,Math.floor(centerX-radius)),right=Math.min(width-1,Math.ceil(centerX+radius)),top=Math.max(0,Math.floor(centerY-radius)),bottom=Math.min(height-1,Math.ceil(centerY+radius));for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){const dx=x-centerX,dy=y-centerY,distance=Math.hypot(dx,dy);if(distance>=radius)continue;const falloff=(1-distance/radius)*power,wave=Math.sin(distance*1.7-phase)*.65,push=(falloff*3.2+wave*falloff),length=Math.max(.25,distance),destX=Math.round(x+dx/length*push),destY=Math.round(y+dy/length*push);context.fillStyle=`rgba(3,4,10,${Math.min(.5,falloff*.42)})`;context.fillRect(x,y,1,1);context.fillStyle=colorAt(x,y,Math.round(falloff*95));context.fillRect(destX,destY,falloff>.72?2:1,falloff>.72?2:1);}};
    const animate=time=>{if(!canvas.isConnected)return;const active=document.body.dataset.view==="home"&&currentHomeMode()==="arcade"&&!document.hidden;if(!active){setTimeout(()=>requestAnimationFrame(animate),240);return;}const cursor=canvas._arcadeCursor||{},cat=canvas._arcadeCat||{},target=cursor.active?1:0;state.strength+=(target-state.strength)*.12;if(time-state.lastTime>28){state.lastTime=time;context.putImageData(source,0,0);const phase=time*.008;paintField(cursor.x,cursor.y,9,state.strength,phase);paintField(cat.x,cat.y,5,cat.active?.58:0,phase+1.7);}requestAnimationFrame(animate);};
    requestAnimationFrame(animate);
  };
  image.crossOrigin="anonymous";image.src=url;
}

function mountArcadeCanvas(host,trackUri,request){
  if(!host||!trackUri||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  window.tracker.spotifyCanvas(trackUri).then(result=>{
    if(request!==arcadeCanvasRequest||!host.isConnected||!result?.ok||!result.url)return;
    const video=homeElement("video","arcadeCanvasWorld");video.src=result.url;video.autoplay=true;video.loop=true;video.muted=true;video.playsInline=true;video.preload="auto";video.disablePictureInPicture=true;
    video.addEventListener("error",()=>video.remove(),{once:true});host.appendChild(video);video.play().catch(()=>video.remove());
  }).catch(()=>{});
}

function updateArcadeDialogue(line,nextLine,index,allLines){
  const box=document.querySelector(".arcadeDialogue"),text=box?.querySelector(".arcadeDialogueText"),next=box?.querySelector(".arcadeDialogueNext"),speaker=box?.querySelector(".arcadeDialogueSpeaker");
  if(!box||!text)return;
  const artistText=box.dataset.artists||"",currentLine=window.DialogueSpeaker.parseLine(line,artistText),nextParsed=window.DialogueSpeaker.parseLine(nextLine,artistText),current=currentLine.text,upcoming=nextParsed.text,currentSpeaker=window.DialogueSpeaker.speakerFor(allLines||[],index,artistText,box.dataset.defaultSpeaker||""),key=current+"|"+upcoming+"|"+currentSpeaker;
  if(box.dataset.key===key)return;
  box.dataset.key=key;box.dataset.length=current.length>115?"extra":current.length>64?"long":"normal";text.textContent=current||"LISTENING FOR DIALOGUE…";if(next)next.textContent=upcoming?`NEXT  ${upcoming}`:"";if(speaker)speaker.textContent=currentSpeaker.toUpperCase();
  box.classList.remove("talking");void box.offsetWidth;box.classList.add("talking");
}

function wireArcadeSeek(control){
  let dragging=false;
  const preview=clientX=>{if(!durSec)return 0;const rect=control.getBoundingClientRect(),ratio=clamp01((clientX-rect.left)/Math.max(1,rect.width)),target=ratio*durSec;posSec=target;syncAt=performance.now();activeIdx=-2;$("homeScreen")?.style.setProperty("--home-progress",`${(ratio*100).toFixed(2)}%`);control.setAttribute("aria-valuenow",String(Math.round(target)));return target;};
  control.tabIndex=0;control.setAttribute("role","slider");control.setAttribute("aria-label","Song position");control.setAttribute("aria-valuemin","0");
  control.addEventListener("pointerdown",event=>{if(!durSec)return;dragging=true;seeking=true;control.classList.add("scrubbing");control.setPointerCapture(event.pointerId);preview(event.clientX);});
  control.addEventListener("pointermove",event=>{if(dragging)preview(event.clientX);});
  control.addEventListener("pointerup",event=>{if(!dragging)return;const target=preview(event.clientX);dragging=false;control.classList.remove("scrubbing");if(control.hasPointerCapture(event.pointerId))control.releasePointerCapture(event.pointerId);commitSeek(target);});
  control.addEventListener("pointercancel",()=>{dragging=false;seeking=false;control.classList.remove("scrubbing");});
  control.addEventListener("keydown",event=>{if(!durSec||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const now=posSec+(playing?(performance.now()-syncAt)/1000:0),target=event.key==="Home"?0:event.key==="End"?durSec:now+(event.key==="ArrowRight"?5:-5);seeking=true;commitSeek(target);});
}

function wireCdScrub(disc){
  let dragging=false,lastAngle=0,totalAngle=0,startPosition=0,moved=false;
  const angleFor=event=>{const rect=disc.getBoundingClientRect();return Math.atan2(event.clientY-(rect.top+rect.height/2),event.clientX-(rect.left+rect.width/2))*180/Math.PI;};
  const preview=()=>{const target=Math.max(0,Math.min(durSec,startPosition+totalAngle/360*durSec));posSec=target;syncAt=performance.now();activeIdx=-2;disc.style.setProperty("--scrub-angle",`${totalAngle}deg`);$("homeScreen")?.style.setProperty("--home-progress",`${durSec?target/durSec*100:0}%`);disc.setAttribute("aria-valuenow",String(Math.round(target)));return target;};
  disc.tabIndex=0;disc.setAttribute("role","slider");disc.setAttribute("aria-label","Rotate the disc to seek");disc.setAttribute("aria-valuemin","0");disc.title="Drag the disc to scrub through the song";
  disc.addEventListener("pointerdown",event=>{if(!durSec)return;event.preventDefault();dragging=true;moved=false;seeking=true;totalAngle=0;startPosition=Math.max(0,Math.min(durSec,posSec+(playing?(performance.now()-syncAt)/1000:0)));lastAngle=angleFor(event);disc.classList.add("scratching");disc.setPointerCapture(event.pointerId);});
  disc.addEventListener("pointermove",event=>{if(!dragging)return;const angle=angleFor(event),delta=(angle-lastAngle+540)%360-180;lastAngle=angle;totalAngle+=delta;moved=moved||Math.abs(totalAngle)>1;preview();});
  disc.addEventListener("pointerup",event=>{if(!dragging)return;const target=preview();dragging=false;if(disc.hasPointerCapture(event.pointerId))disc.releasePointerCapture(event.pointerId);disc.classList.remove("scratching");disc.style.removeProperty("--scrub-angle");if(moved)commitSeek(target);else seeking=false;});
  disc.addEventListener("pointercancel",()=>{dragging=false;seeking=false;posSec=startPosition;syncAt=performance.now();disc.classList.remove("scratching");disc.style.removeProperty("--scrub-angle");});
  disc.addEventListener("keydown",event=>{if(!durSec||!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const now=posSec+(playing?(performance.now()-syncAt)/1000:0),target=event.key==="Home"?0:event.key==="End"?durSec:now+(event.key==="ArrowRight"?5:-5);seeking=true;commitSeek(target);});
}

function paintPixelKitten(canvas){
  const context=canvas.getContext("2d");context.imageSmoothingEnabled=false;context.clearRect(0,0,32,20);
  const block=(color,x,y,w,h)=>{context.fillStyle=color;context.fillRect(x,y,w,h);};
  block("#171a21",1,8,3,7);block("#171a21",3,5,3,5);block("#171a21",5,4,3,3);block("#171a21",6,9,18,9);block("#171a21",20,5,10,11);block("#171a21",21,2,4,5);block("#171a21",27,2,4,6);block("#171a21",8,16,5,4);block("#171a21",16,16,5,4);block("#171a21",24,15,4,5);
  block("#8f9299",3,8,3,6);block("#bfc1c7",5,6,2,3);block("#9c9fa6",7,10,17,6);block("#bfc1c7",21,6,8,9);block("#bfc1c7",22,3,3,5);block("#bfc1c7",27,3,3,5);block("#777b83",10,12,4,4);block("#777b83",18,10,4,6);block("#bfc1c7",9,16,3,3);block("#bfc1c7",17,16,3,3);block("#bfc1c7",25,15,2,4);
  block("#0a0c11",23,8,2,2);block("#0a0c11",27,8,2,2);block("#0a0c11",25,11,2,2);block("#f19ac8",21,11,2,2);block("#f19ac8",29,11,2,2);block("#e7e9ee",23,8,1,1);block("#e7e9ee",27,8,1,1);
}

function mountArcadeKitten(screen,worldCanvas){
  const kitten=homeElement("canvas","arcadePixelKitten");kitten.width=32;kitten.height=20;kitten.setAttribute("aria-hidden","true");paintPixelKitten(kitten);screen.appendChild(kitten);
  let currentX=64,currentY=80,targetX=64,targetY=80,visible=false,facing=1;
  const tick=()=>{if(!screen.isConnected)return;const active=document.body.dataset.view==="home"&&currentHomeMode()==="arcade"&&!document.hidden;if(!active){setTimeout(()=>requestAnimationFrame(tick),240);return;}currentX+=(targetX-currentX)*.09;currentY+=(targetY-currentY)*.09;kitten.style.setProperty("--kitten-x",`${currentX}px`);kitten.style.setProperty("--kitten-y",`${currentY}px`);kitten.style.setProperty("--kitten-face",String(facing));if(worldCanvas){const rect=screen.getBoundingClientRect();worldCanvas._arcadeCat={x:currentX/Math.max(1,rect.width)*worldCanvas.width,y:currentY/Math.max(1,rect.height)*worldCanvas.height,active:visible};}requestAnimationFrame(tick);};
  screen.addEventListener("pointerenter",()=>{visible=true;kitten.classList.add("awake");screen.style.setProperty("--arcade-mouse-on","1");});
  screen.addEventListener("pointermove",event=>{const rect=screen.getBoundingClientRect(),mouseX=event.clientX-rect.left,mouseY=event.clientY-rect.top,nextX=Math.max(32,Math.min(rect.width-32,mouseX-22)),nextY=Math.max(42,Math.min(rect.height-82,mouseY+22));facing=nextX>=targetX?1:-1;targetX=nextX;targetY=nextY;screen.style.setProperty("--arcade-mouse-x",`${mouseX}px`);screen.style.setProperty("--arcade-mouse-y",`${mouseY}px`);if(worldCanvas)worldCanvas._arcadeCursor={x:mouseX/Math.max(1,rect.width)*worldCanvas.width,y:mouseY/Math.max(1,rect.height)*worldCanvas.height,active:true};if(!visible){visible=true;kitten.classList.add("awake");}screen.style.setProperty("--arcade-mouse-on","1");});
  screen.addEventListener("pointerleave",()=>{visible=false;kitten.classList.remove("awake");screen.style.setProperty("--arcade-mouse-on","0");if(worldCanvas)worldCanvas._arcadeCursor={...(worldCanvas._arcadeCursor||{}),active:false};});
  requestAnimationFrame(tick);
}

function homePendingTransition(pendingUri,pendingAt,pendingCommandAt,np,now=Date.now()){
  if(!pendingUri)return"none";
  const active=np&&(np.state==="playing"||np.state==="paused"),uri=String(np?.uri||np?.id||"");
  if(!pendingCommandAt)return now-pendingAt<HOME_PENDING_ANIMATION_TIMEOUT?"wait":"expired";
  if(active&&uri===pendingUri)return"confirmed";
  return now-pendingCommandAt<HOME_PENDING_PLAYBACK_TIMEOUT?"wait":"expired";
}

async function homePlay(item){if(!item?.uri)return false;if(homeState.pendingUri===item.uri)homeState.pendingCommandAt=Date.now();const result=await playSpotifyUri(item.uri,item.context||null);showToast(result?.ok?`PLAYING: ${item.title}`:`COULDN'T PLAY: ${result?.error||"UNKNOWN ERROR"}`);if(result?.ok){setTimeout(poll,120);setTimeout(poll,700);}return !!result?.ok;}

async function playHomeCollection(shuffle=false){
  if(homeState.collectionLoading||!homeState.games.length){showToast("LOAD A COLLECTION FIRST");return;}
  const context=homeState.activeCollection?.kind==="playlist"?homeState.activeCollection.uri:null,index=shuffle?Math.floor(Math.random()*homeState.games.length):0,item={...homeState.games[index],context};
  if(shuffle&&context){if(!requireHomeWriteAccess())return;const toggled=await window.tracker.spApi({path:"/me/player/shuffle?state=true",method:"PUT"});if(!toggled?.ok){showToast(`SPOTIFY: ${toggled?.error||"COULDN'T ENABLE SHUFFLE"}`);return;}}
  const started=await homePlay(item);if(started&&shuffle)showToast(context?`SHUFFLING ${homeState.activeCollection.title}`:`RANDOM PICK: ${item.title}`);
}

function closeHomeTrackMenu(){const menu=$("homeTrackMenu");if(!menu)return;menu.classList.remove("open");menu.setAttribute("aria-hidden","true");menu.innerHTML="";}
function requireHomeWriteAccess(){if(homeState.writeAccess)return true;showToast("RECONNECT SPOTIFY TO ENABLE THIS");openAccountPanel();return false;}
async function runHomeTrackAction(item,action,playlist){
  if(action==="play"){closeHomeTrackMenu();return homePlay(item);}
  if(!requireHomeWriteAccess())return;
  let result,label;
  if(action==="queue"){result=await window.tracker.spApi({path:`/me/player/queue?uri=${encodeURIComponent(item.uri)}`,method:"POST"});label="ADDED TO QUEUE";}
  else if(action==="like"){result=await window.tracker.spApi({path:`/me/library?uris=${encodeURIComponent(item.uri)}`,method:"PUT"});label="LIKED SONG";}
  else if(action==="playlist"&&playlist){result=await window.tracker.spApi({path:`/playlists/${playlist.id}/items`,method:"POST",body:{uris:[item.uri]}});label=`ADDED TO ${playlist.title}`;}
  if(result?.ok){closeHomeTrackMenu();showToast(label);if(action==="queue")scheduleHomeQueueRefresh(homeState.nowPlaying?.uri||"");}else showToast(`SPOTIFY: ${result?.error||"ACTION FAILED"}`);
}
function openHomeTrackMenu(item,x,y){
  const menu=$("homeTrackMenu");if(!menu)return;menu.innerHTML="";menu.append(homeElement("strong","homeTrackMenuTitle",item.title));
  const action=(label,name)=>{const button=homeElement("button","homeTrackMenuAction",label);button.addEventListener("click",()=>runHomeTrackAction(item,name));menu.appendChild(button);};
  action("▶  Play now","play");action("＋  Add to queue","queue");action("♥  Like song","like");
  const playlistToggle=homeElement("button","homeTrackMenuAction","▤  Add to playlist"),picker=homeElement("div","homeTrackPlaylistPicker");
  playlistToggle.addEventListener("click",()=>{picker.classList.toggle("open");playlistToggle.classList.toggle("active",picker.classList.contains("open"));});menu.append(playlistToggle,picker);
  const playlists=homeState.playlists.filter(entry=>entry.kind==="playlist"&&entry.editable);
  if(playlists.length)playlists.forEach(playlist=>{const button=homeElement("button","",playlist.title);button.addEventListener("click",()=>runHomeTrackAction(item,"playlist",playlist));picker.appendChild(button);});
  else picker.appendChild(homeElement("span","","No editable playlists loaded"));
  if(!homeState.writeAccess)menu.appendChild(homeElement("small","homeTrackMenuHint","Reconnect Spotify once to enable queue, like and playlist controls."));
  menu.classList.add("open");menu.setAttribute("aria-hidden","false");menu.style.left=`${Math.max(10,Math.min(window.innerWidth-250,x))}px`;menu.style.top=`${Math.max(10,Math.min(window.innerHeight-320,y))}px`;
}
async function launchHomeItem(item,source){
  const mode=currentHomeMode();
  if(mode==="arcade")return launchHomeGame(item,source);
  if(mode==="vinyl")return launchHomeVinyl(item,source);
  if(mode==="cd")return launchHomeCd(item,source);
  return homePlay(item);
}
async function launchHomeGame(item,source){
  if(!item?.uri||homeState.slotItem)return;
  document.querySelectorAll(".gameCartridgePortal").forEach(node=>node.remove());
  homeState.slotItem=item;homeState.pendingUri=item.uri;homeState.pendingAt=Date.now();homeState.pendingCommandAt=0;setHomeGameColor(item);const screen=$("homeScreen"),hero=$("arcadeNow");screen.classList.add("game-slotting");
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
  screen.classList.remove("game-slotting");renderHomeHero();
  const started=await homePlay(item);
  if(!started){homeState.slotItem=null;homeState.pendingUri="";homeState.pendingAt=0;homeState.pendingCommandAt=0;renderHomeHero();return;}
  setTimeout(()=>{if(homeState.slotItem?.uri===item.uri&&homeState.nowPlaying?.uri!==item.uri)clearHomePending(true);},5000);
}
async function launchHomeVinyl(item,source){
  if(!item?.uri||homeState.slotItem)return;
  document.querySelectorAll(".homeCdFlight,.homeCdFlightSleeve").forEach(node=>node.remove());
  const sequence=++homeState.loadSequence,sourceNode=source?.querySelector(".homeSongMedia")||source?.querySelector("img")||source,sourceRect=sourceNode?.getBoundingClientRect();
  homeState.slotItem=item;homeState.pendingUri=item.uri;homeState.pendingAt=Date.now();homeState.pendingCommandAt=0;setHomeGameColor(item);const screen=$("homeScreen"),hero=$("arcadeNow");screen.classList.remove("cd-seated");screen.classList.add("cd-loading");renderHomeHero();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const target=hero.querySelector(".homeCdDisc")?.getBoundingClientRect(),src=sourceRect||(hero.querySelector(".homeCdAlbumCard img")||hero).getBoundingClientRect();
  if(target){
    const sleeve=homeElement("div","homeCdFlightSleeve"),sleeveArt=homeElement("img"),sleeveCopy=homeElement("span","",item.title);sleeveArt.alt="";if(item.img)sleeveArt.src=item.img;sleeve.append(sleeveArt,sleeveCopy);document.body.appendChild(sleeve);
    const disc=homeElement("div","homeCdFlight"),art=homeElement("img");art.alt="";if(item.img)art.src=item.img;disc.appendChild(art,homeElement("i",""));document.body.appendChild(disc);
    const size=Math.min(280,Math.max(170,target.width)),left=target.left+target.width/2-size/2,top=target.top+target.height/2-size/2;
    const sleeveSize=Math.min(176,Math.max(116,size*.58)),sleeveLeft=target.left-sleeveSize*.76,sleeveTop=target.top+target.height*.24;
    const startScale=Math.max(.24,Math.min(.58,src.width/sleeveSize)),sleeveDx=src.left+src.width/2-(sleeveLeft+sleeveSize/2),sleeveDy=src.top+src.height/2-(sleeveTop+sleeveSize/2),dx=src.left+src.width/2-(left+size/2),dy=src.top+src.height/2-(top+size/2);
    Object.assign(sleeve.style,{left:`${sleeveLeft}px`,top:`${sleeveTop}px`,width:`${sleeveSize}px`});
    Object.assign(disc.style,{left:`${left}px`,top:`${top}px`,width:`${size}px`,height:`${size}px`});
    const sleeveFlight=sleeve.animate([
      {transform:`translate3d(${sleeveDx}px,${sleeveDy}px,0) scale(${startScale}) rotate(-4deg)`,opacity:1},
      {transform:`translate3d(${sleeveDx*.22}px,${sleeveDy*.18}px,0) scale(.96) rotate(2deg)`,opacity:1,offset:.42},
      {transform:"translate3d(0,-10px,0) scale(1.02) rotate(2deg)",opacity:1,offset:.62},
      {transform:"translate3d(-48px,14px,0) scale(.96) rotate(-9deg)",opacity:.94}
    ],{duration:1320,easing:"cubic-bezier(.2,.78,.2,1)",fill:"forwards"});
    const flight=disc.animate([
      {transform:`translate3d(${dx}px,${dy}px,0) scale(${Math.max(.18,startScale*.7)}) rotate(-12deg)`,opacity:1,filter:"saturate(.9)"},
      {transform:`translate3d(${dx*.58}px,${dy*.58}px,0) scale(.62) rotate(34deg)`,opacity:1,filter:"saturate(1.05)",offset:.34},
      {transform:`translate3d(${dx*.14}px,${dy*.14-38}px,0) scale(.96) rotate(226deg)`,opacity:1,filter:"saturate(1.14)",offset:.76},
      {transform:"translate3d(0,-8px,0) scale(1.02) rotate(342deg)",opacity:1,filter:"saturate(1.08)",offset:.92},
      {transform:"translate3d(0,0,0) scale(1) rotate(360deg)",opacity:1,filter:"saturate(1)"}
    ],{duration:1320,easing:"cubic-bezier(.32,.06,.16,1)",fill:"forwards"});
    await Promise.all([flight.finished.catch(()=>{}),sleeveFlight.finished.catch(()=>{})]);
    if(sequence===homeState.loadSequence){screen.classList.add("cd-seated");await new Promise(resolve=>requestAnimationFrame(resolve));}
    disc.remove();sleeve.remove();
  }else{
    await new Promise(resolve=>setTimeout(resolve,700));
  }
  if(sequence!==homeState.loadSequence)return;
  screen.classList.add("cd-seated");
  const started=await homePlay(item);
  setTimeout(()=>{if(sequence!==homeState.loadSequence)return;screen.classList.remove("cd-loading","cd-seated");if(!started)clearHomePending();else renderHomeHero();},520);
  setTimeout(()=>{if(sequence===homeState.loadSequence&&homeState.slotItem?.uri===item.uri)clearHomePending(true);},5200);
}

async function launchHomeCd(item,source){
  if(!item?.uri||homeState.slotItem)return;
  document.querySelectorAll(".homeStereoFlight,.homeStereoFlightCase").forEach(node=>node.remove());
  const sequence=++homeState.loadSequence,sourceNode=source?.querySelector(".homeSongMedia")||source?.querySelector("img")||source,sourceRect=sourceNode?.getBoundingClientRect();
  homeState.slotItem=item;homeState.pendingUri=item.uri;homeState.pendingAt=Date.now();homeState.pendingCommandAt=0;setHomeGameColor(item);
  const screen=$("homeScreen"),hero=$("arcadeNow");screen.classList.remove("stereo-seated");screen.classList.add("stereo-loading");renderHomeHero();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const target=hero.querySelector(".homeStereoSlot")?.getBoundingClientRect(),src=sourceRect||hero.getBoundingClientRect();
  if(target){
    const flightCase=homeElement("div","homeStereoFlightCase"),caseArt=homeElement("img"),caseTitle=homeElement("span","",item.title);caseArt.alt="";if(item.img)caseArt.src=item.img;flightCase.append(caseArt,caseTitle);document.body.appendChild(flightCase);
    const disc=homeElement("div","homeStereoFlight"),label=homeElement("img");label.alt="";if(item.img)label.src=item.img;disc.append(label,homeElement("i",""));document.body.appendChild(disc);
    const size=Math.min(250,Math.max(180,target.width*.8)),left=target.left+target.width/2-size/2,top=target.top+target.height/2-size/2;
    const caseSize=Math.min(154,Math.max(112,size*.6)),caseLeft=target.left-caseSize*.62,caseTop=target.top-caseSize*.9;
    const startScale=Math.max(.3,Math.min(.76,src.width/caseSize)),dx=src.left+src.width/2-(left+size/2),dy=src.top+src.height/2-(top+size/2),caseDx=src.left+src.width/2-(caseLeft+caseSize/2),caseDy=src.top+src.height/2-(caseTop+caseSize/2);
    Object.assign(flightCase.style,{left:`${caseLeft}px`,top:`${caseTop}px`,width:`${caseSize}px`,height:`${caseSize}px`});
    Object.assign(disc.style,{left:`${left}px`,top:`${top}px`,width:`${size}px`,height:`${size}px`});
    const caseFlight=flightCase.animate([
      {transform:`translate3d(${caseDx}px,${caseDy}px,0) scale(${startScale}) rotate(-3deg)`,opacity:1},
      {transform:`translate3d(${caseDx*.25}px,${caseDy*.2}px,0) scale(.98) rotate(2deg)`,opacity:1,offset:.42},
      {transform:"translate3d(0,0,0) scale(1.03) rotate(-2deg)",opacity:1,offset:.7},
      {transform:"translate3d(-22px,8px,0) scale(.94) rotate(-8deg)",opacity:.72}
    ],{duration:1380,easing:"cubic-bezier(.2,.78,.2,1)",fill:"forwards"});
    const flight=disc.animate([
      {transform:`translate3d(${dx}px,${dy}px,0) scale(${Math.max(.18,startScale*.58)}) rotateZ(-18deg) rotateX(0deg)`,opacity:0},
      {transform:`translate3d(${dx}px,${dy}px,0) scale(${Math.max(.18,startScale*.58)}) rotateZ(-18deg) rotateX(0deg)`,opacity:1,offset:.22},
      {transform:`translate3d(${dx*.52}px,${dy*.5-42}px,90px) scale(.9) rotateZ(150deg) rotateX(24deg)`,opacity:1,offset:.52},
      {transform:`translate3d(${dx*.1}px,${dy*.1-17}px,28px) scale(.96) rotateZ(315deg) rotateX(72deg)`,opacity:1,offset:.82},
      {transform:"translate3d(0,2px,0) scale(.94) rotateZ(390deg) rotateX(87deg)",opacity:1}
    ],{duration:1380,easing:"cubic-bezier(.24,.72,.2,1)",fill:"forwards"});
    await Promise.all([flight.finished.catch(()=>{}),caseFlight.finished.catch(()=>{})]);
    if(sequence===homeState.loadSequence){screen.classList.add("stereo-seated");await new Promise(resolve=>setTimeout(resolve,110));}
    disc.remove();flightCase.remove();
  }else await new Promise(resolve=>setTimeout(resolve,650));
  if(sequence!==homeState.loadSequence)return;
  const started=await homePlay(item);
  setTimeout(()=>{if(sequence!==homeState.loadSequence)return;screen.classList.remove("stereo-loading","stereo-seated");if(!started)clearHomePending();else renderHomeHero();},520);
  setTimeout(()=>{if(sequence===homeState.loadSequence&&homeState.slotItem?.uri===item.uri)clearHomePending(true);},5200);
}

function renderHomeRoster(){
  const list=$("arcadeRecent");list.innerHTML="";
  const mode=currentHomeMode(),loadingText=mode==="vinyl"?"FLIPPING THROUGH RECORDS…":mode==="cd"?"LOADING DISCS…":"LOADING GAMES…";
  if(homeState.collectionLoading){list.appendChild(homeElement("div","homeLoading",loadingText));return;}
  if(!homeState.games.length){list.appendChild(homeElement("div","homeEmpty","This collection has no playable songs yet."));return;}
  const query=homeState.search.trim().toLowerCase(),visible=homeState.games.map((item,index)=>({item,index})).filter(({item})=>!query||`${item.title} ${item.sub} ${item.album}`.toLowerCase().includes(query));
  if(!visible.length){list.appendChild(homeElement("div","homeEmpty",`No songs match “${homeState.search}”.`));return;}
  visible.forEach(({item,index})=>{
    const row=homeElement("div","homeSong");row.classList.toggle("selected",homeState.nowPlaying?.uri===item.uri);row.setAttribute("role","button");row.tabIndex=0;row.setAttribute("aria-label",`Play ${item.title}`);
    row.appendChild(homeElement("span","homeSongNumber",String(index+1).padStart(2,"0")));
    const media=homeElement("span","homeSongMedia"),image=homeElement("img");image.alt="";image.loading="lazy";if(item.img)image.src=item.img;media.appendChild(image);row.appendChild(media);
    const copy=homeElement("span","homeSongCopy");copy.append(homeElement("strong","",item.title),homeElement("small","",item.sub||"Unknown artist"));row.appendChild(copy);
    row.appendChild(homeElement("span","homeSongArrow","▶"));const more=homeElement("button","homeSongMenuButton","•••");more.setAttribute("aria-label",`More options for ${item.title}`);more.addEventListener("click",event=>{event.stopPropagation();const rect=more.getBoundingClientRect();openHomeTrackMenu(item,rect.right+6,rect.top);});row.appendChild(more);row.addEventListener("click",()=>launchHomeItem(item,row));row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();launchHomeItem(item,row);}});row.addEventListener("contextmenu",event=>{event.preventDefault();openHomeTrackMenu(item,event.clientX,event.clientY);});list.appendChild(row);
  });
}
function appendHomeLibraryCard(list,item){
  const card=homeElement("button",`homeCollection${item.kind==="track"?" homeSearchSong":""}`);card.classList.toggle("selected",item.kind!=="track"&&homeState.activeCollection?.key===item.key);let image;if(item.img){image=homeElement("img");image.alt="";image.loading="lazy";image.src=item.img;}else{image=homeElement("div","homeCollectionPlaceholder",item.symbol||"♫");}card.append(image,homeElement("strong","",item.title),homeElement("small","",item.sub||(item.kind==="track"?"Song":"Playlist")));if(item.kind==="track")card.appendChild(homeElement("span","homeSearchResultType","SONG · PLAY"));card.addEventListener("click",()=>item.kind==="track"?launchHomeItem(item,card):loadHomeCollection(item));list.appendChild(card);
}
function renderHomeCollections(){
  const list=$("arcadeCollections");list.innerHTML="";
  if(homeState.librarySearch){
    if(homeState.librarySearching){list.appendChild(homeElement("div","homeLoading","SEARCHING SPOTIFY…"));return;}
    if(homeState.librarySearchError){list.appendChild(homeElement("div","homeEmpty",homeState.librarySearchError));return;}
    const songs=homeState.libraryResults.filter(item=>item.kind==="track"),playlists=homeState.libraryResults.filter(item=>item.kind==="playlist");
    if(!songs.length&&!playlists.length){list.appendChild(homeElement("div","homeEmpty",`Nothing found for “${homeState.librarySearch}”.`));return;}
    if(songs.length){list.appendChild(homeElement("div","homeCollectionGroup","SONGS"));songs.forEach(item=>appendHomeLibraryCard(list,item));}
    if(playlists.length){list.appendChild(homeElement("div","homeCollectionGroup","PLAYLISTS"));playlists.forEach(item=>appendHomeLibraryCard(list,item));}
    return;
  }
  if(!homeState.playlists.length){list.appendChild(homeElement("div","homeEmpty","Connect Spotify to bring your full library here."));return;}
  homeState.playlists.forEach(item=>appendHomeLibraryCard(list,item));
}

async function searchHomeLibrary(query){
  const clean=String(query||"").trim(),request=++homeState.librarySearchRequest;homeState.librarySearch=clean;homeState.librarySearchError="";clearTimeout(homeState.librarySearchTimer);
  if(!clean){homeState.librarySearching=false;homeState.libraryResults=[];renderHomeCollections();return;}
  if(!homeState.connected){homeState.librarySearching=false;homeState.libraryResults=[];homeState.librarySearchError="Connect Spotify from the Home account button to search songs and playlists.";renderHomeCollections();return;}
  homeState.librarySearching=true;renderHomeCollections();
  const response=await window.tracker.spApi(`/search?q=${encodeURIComponent(clean)}&type=track,playlist&limit=10`);
  if(request!==homeState.librarySearchRequest)return;
  homeState.librarySearching=false;
  if(!response.ok){homeState.libraryResults=[];homeState.librarySearchError="Spotify search is unavailable right now.";renderHomeCollections();return;}
  const songs=normaliseHomeTracks(response.data?.tracks?.items),playlists=(response.data?.playlists?.items||[]).filter(item=>item?.uri).map(item=>({key:`search:${item.id}`,id:item.id,kind:"playlist",uri:item.uri,title:item.name||"Untitled playlist",sub:`${item.tracks?.total??item.items?.total??"?"} songs`,img:homeImage(item.images)}));homeState.libraryResults=[...songs.map(item=>({...item,kind:"track"})),...playlists];renderHomeCollections();
}
function renderArcadeCabinet(hero,item){
  const canvasRequest=++arcadeCanvasRequest;
  const cabinet=homeElement("div","arcadeCabinet"),display=homeElement("div","arcadeDisplay"),top=homeElement("div","arcadeDisplayTop");
  top.append(homeElement("span","","PLAYER 01"),homeElement("strong","",item?"NOW PLAYING":"READY"),homeElement("span","",item?"SCORE 01":"INSERT GAME"));display.appendChild(top);
  const screen=homeElement("div","arcadeScreenContent");let pixelWorld=null;
  if(item){
    const world=homeElement("div","arcadeScreenWorld");pixelWorld=homeElement("canvas","arcadePixelWorld");pixelWorld.width=80;pixelWorld.height=45;world.append(pixelWorld,homeElement("div","arcadeWorldShade"));screen.appendChild(world);if(item.img)paintArcadeWorld(pixelWorld,item.img);mountArcadeCanvas(world,item.uri,canvasRequest);
    const art=homeElement("img","arcadeScreenArt");art.alt=`${item.title} artwork`;if(item.img)art.src=item.img;const info=homeElement("div","arcadeScreenInfo");info.append(homeElement("span","arcadeScreenStatus",playing?"● GAME IN PROGRESS":"Ⅱ GAME PAUSED"),homeElement("h2","",item.title),homeElement("p","",item.sub||"Unknown artist"),homeElement("small","",item.album||"AFTERGLOW ARCADE"));
    const dialogue=homeElement("div","arcadeDialogue"),artists=window.DialogueSpeaker.artistsFrom(item.sub),defaultSpeaker=ARCADE_VOCAL_OVERRIDES[item.uri]||(artists.length===1?artists[0]:"VOCALS"),speaker=homeElement("span","arcadeDialogueSpeaker",defaultSpeaker.toUpperCase()),copy=homeElement("strong","arcadeDialogueText","LISTENING FOR DIALOGUE…"),next=homeElement("small","arcadeDialogueNext","");dialogue.dataset.artists=item.sub||"";dialogue.dataset.defaultSpeaker=defaultSpeaker;dialogue.append(speaker,copy,next);
    const progress=homeElement("div","arcadeStageProgress");progress.append(homeElement("span","","STAGE PROGRESS"),homeElement("i",""));wireArcadeSeek(progress);screen.append(art,info,dialogue,progress);
  }
  else{const idle=homeElement("div","arcadeScreenIdle");idle.append(homeElement("span","","AFTERGLOW"),homeElement("h2","","SELECT A GAME"),homeElement("p","","Choose a song from the left rack"));screen.appendChild(idle);}
  if(pixelWorld)mountArcadeKitten(screen,pixelWorld);
  display.appendChild(screen);
  const deck=homeElement("div","arcadeDeck"),transport=homeElement("div","arcadeDeckButtons"),prev=homeElement("button","arcadeRoundButton","◀"),play=homeElement("button","arcadeRoundButton primary",playing?"Ⅱ":"▶"),next=homeElement("button","arcadeRoundButton","▶");prev.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));transport.append(prev,play,next);
  const slotZone=homeElement("div","arcadeSlotZone");slotZone.append(homeElement("span","","GAME SLOT"),homeElement("div","arcadeGameSlot",""),homeElement("small","",homeState.slotItem?"LOADING…":"CHOOSE A SONG"));
  const lyrics=homeElement("button","arcadeLyricsButton","MIC // LYRICS");lyrics.addEventListener("click",()=>setAppView("lyrics"));deck.append(transport,slotZone,lyrics);cabinet.append(display,deck);hero.appendChild(cabinet);
}
function renderVinylPlayer(hero,item,copy){
  const scene=homeElement("div","homeCdScene"),stack=homeElement("div","homeCdAlbumStack"),cards=homeState.queue.filter(Boolean).slice(0,5);stack.classList.toggle("empty",!cards.length);stack.classList.toggle("loading",homeState.queueLoading);
  if(item?.img){const ambience=homeElement("img","homeCdAmbience");ambience.alt="";ambience.src=item.img;scene.appendChild(ambience);}
  cards.forEach((card,index)=>{const tile=homeElement("div","homeCdAlbumCard");tile.style.setProperty("--i",index);tile.title=`Up next: ${card.title||"Unknown track"}`;const img=homeElement("img");img.alt="";if(card.img)img.src=card.img;tile.append(img,homeElement("span","",card.title||"Afterglow"),homeElement("small","",`${String(index+1).padStart(2,"0")}  ${card.sub||"UP NEXT"}`));stack.appendChild(tile);});
  const player=homeElement("div","homeCdPlayer"),deck=homeElement("div","homeCdDeck"),target=homeElement("div","homeCdDiscTarget"),platter=homeElement("div","homeCdPlatter"),disc=homeElement("div","homeCdDisc");
  if(item?.img){const img=homeElement("img");img.alt="";img.src=item.img;disc.appendChild(img);}
  disc.append(homeElement("div","homeCdDiscShine",""),homeElement("div","homeCdSpindle",""));platter.appendChild(disc);wireCdScrub(disc);
  const tonearm=homeElement("div","homeCdNeedle","");tonearm.append(homeElement("i",""));target.append(platter,homeElement("div","homeCdLaser",""),tonearm,homeElement("div","homeCdDeckBadge","33⅓  /  AUTO"));
  const controls=homeElement("div","homeCdControls"),prev=homeElement("button","homeCdButton","◀"),play=homeElement("button","homeCdButton primary",playing?"Ⅱ":"▶"),next=homeElement("button","homeCdButton","▶"),progress=homeElement("div","homeCdProgress"),lyrics=homeElement("button","homeCdButton wide","LYRICS");progress.append(homeElement("span","","TRACK"),homeElement("i",""),homeElement("b","","DRAG DISC"));wireArcadeSeek(progress);
  prev.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));lyrics.addEventListener("click",()=>setAppView("lyrics"));controls.append(prev,play,next,progress,lyrics);
  const screen=homeElement("div","homeCdScreen"),screenTop=homeElement("div","homeCdScreenTop"),meter=homeElement("div","homeCdMeter");screenTop.append(homeElement("span","",`VINYL // ${playing?"SPINNING":"READY"}`),homeElement("b","",playing?"ON AIR":"STANDBY"));for(let i=0;i<18;i++)meter.appendChild(homeElement("i",""));screen.append(screenTop,homeElement("strong","",item.title),homeElement("small","",`${item.sub||"Unknown artist"}${item.album?" · "+item.album:""}`),meter);
  const volume=homeElement("label","homeCdSlider"),volumeInput=homeElement("input","homeCdVolumeRange"),volumeValue=homeElement("span","homeCdVolumeValue",`${homeState.volume}%`);volume.style.setProperty("--volume",`${homeState.volume}%`);volumeInput.type="range";volumeInput.min="0";volumeInput.max="100";volumeInput.step="1";volumeInput.value=String(homeState.volume);volumeInput.setAttribute("aria-label","Spotify volume");volumeInput.addEventListener("input",()=>setHomeVolume(volumeInput.value));volumeInput.addEventListener("change",()=>setHomeVolume(volumeInput.value,true));volume.append(volumeInput,volumeValue);
  deck.append(target,volume,screen,controls);player.append(homeElement("div","homeCdBrand","AFTERGLOW  /  ANALOG HI-FIDELITY"),homeElement("div","homeCdLid",""),deck);
  scene.append(stack,player);hero.append(scene);
}

function renderCdStereo(hero,item){
  const scene=homeElement("div",`homeStereoScene ${playing?"is-playing":"is-paused"}`);
  if(item?.img){const ambience=homeElement("img","homeStereoAmbience");ambience.alt="";ambience.src=item.img;scene.appendChild(ambience);}
  const speaker=side=>{const box=homeElement("div",`homeStereoSpeaker ${side}`),grille=homeElement("div","homeStereoGrille");grille.append(homeElement("i","homeStereoTweeter"),homeElement("i","homeStereoWoofer"),homeElement("span","homeStereoPulse"));box.append(homeElement("b","",side==="left"?"L":"R"),grille);return box;};
  const receiver=homeElement("div","homeStereoReceiver"),brand=homeElement("div","homeStereoBrand");brand.append(homeElement("span","","AFTERGLOW / DIGITAL AUDIO"),homeElement("b","",playing?"SIGNAL LOCKED":"STANDBY"));
  const display=homeElement("div","homeStereoDisplay"),media=homeElement("div","homeStereoMedia"),jewel=homeElement("div","homeStereoJewel"),art=homeElement("img");art.alt="";if(item.img)art.src=item.img;jewel.append(art,homeElement("span","",item.title));
  const disc=homeElement("div","homeStereoDisc"),label=homeElement("img");label.alt="";if(item.img)label.src=item.img;disc.append(label,homeElement("i",""),homeElement("b",""));media.append(disc,jewel);
  const info=homeElement("div","homeStereoInfo"),status=homeElement("span","",`CD 01  //  ${playing?"PLAYING":"PAUSED"}`);info.append(status,homeElement("strong","",item.title),homeElement("small","",`${item.sub||"Unknown artist"}${item.album?" · "+item.album:""}`));
  const visualizer=homeElement("div","homeStereoVisualizer");for(let i=0;i<24;i++)visualizer.appendChild(homeElement("i",""));
  display.replaceChildren(media,info,visualizer);
  const queue=homeElement("div","homeStereoQueue");queue.appendChild(homeElement("span","homeStereoQueueLabel",homeState.queueLoading?"READING NEXT DISCS…":"UP NEXT // DISC CHANGER"));
  homeState.queue.filter(Boolean).slice(0,3).forEach((card,index)=>{const tile=homeElement("button","homeStereoQueueDisc"),image=homeElement("img");image.alt="";if(card.img)image.src=card.img;tile.append(homeElement("b","",String(index+2).padStart(2,"0")),image,homeElement("span","",card.title||"Unknown track"));tile.title=`Play ${card.title||"next track"}`;tile.addEventListener("click",()=>launchHomeCd(card,tile));queue.appendChild(tile);});
  if(!homeState.queueLoading&&!homeState.queue.length)queue.appendChild(homeElement("small","","Queue a song in Spotify and its jewel case will appear here."));
  const slot=homeElement("div","homeStereoSlot");slot.append(homeElement("span","",homeState.slotItem?"ACCEPTING DISC":"SLOT-IN COMPACT DISC"),homeElement("i",""));
  const seek=homeElement("div","homeStereoSeek");seek.append(homeElement("span","","TRACK 01"),homeElement("i",""),homeElement("b","","SEEK"));wireArcadeSeek(seek);
  const controls=homeElement("div","homeStereoControls"),prev=homeElement("button","","◀"),play=homeElement("button","primary",playing?"Ⅱ":"▶"),next=homeElement("button","","▶"),lyrics=homeElement("button","wide","LYRICS");prev.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));lyrics.addEventListener("click",()=>setAppView("lyrics"));controls.append(prev,play,next,lyrics);
  const volume=homeElement("label","homeStereoVolume"),volumeInput=homeElement("input");volumeInput.type="range";volumeInput.min="0";volumeInput.max="100";volumeInput.step="1";volumeInput.value=String(homeState.volume);volumeInput.setAttribute("aria-label","Spotify volume");volumeInput.addEventListener("input",()=>setHomeVolume(volumeInput.value));volumeInput.addEventListener("change",()=>setHomeVolume(volumeInput.value,true));volume.append(homeElement("span","","VOLUME"),volumeInput,homeElement("b","homeStereoVolumeValue",`${homeState.volume}%`));
  receiver.append(brand,display,queue,slot,seek,controls,volume);scene.append(speaker("left"),receiver,speaker("right"));hero.append(scene);
}
function renderHomeHero(){
  const hero=$("arcadeNow");hero.innerHTML="";const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade,item=enrichHomeItem(homeState.slotItem||homeState.nowPlaying);
  if(mode==="arcade"){renderArcadeCabinet(hero,item);return;}
  if(mode==="vinyl"&&item){renderVinylPlayer(hero,item,copy);return;}
  if(mode==="cd"&&item){renderCdStereo(hero,item);return;}
  if(!item){const empty=homeElement("div","homeHeroEmpty");empty.append(homeElement("span","homeHeroKicker",copy[2]),homeElement("h2","","Your next favourite song lives here"),homeElement("p","","Connect Spotify or start playback to fill this space."));hero.appendChild(empty);return;}
  const visual=homeElement("div","homeHeroVisual"),art=homeElement("img","homeHeroArt");art.alt=`${item.title} artwork`;if(item.img)art.src=item.img;visual.append(art,homeElement("div","homeVinyl",""),homeElement("div","homeTapeSpine",item.title));
  const details=homeElement("div","homeHeroDetails");details.append(homeElement("span","homeHeroKicker",`LIVE // ${copy[2]}`),homeElement("h2","",item.title),homeElement("p","homeHeroArtist",item.sub||"Unknown artist"));
  const albumName=(item.album||item.sub||"").split(" · ").at(-1);details.appendChild(homeElement("p","homeHeroAlbum",albumName));
  const actions=homeElement("div","homeHeroActions"),previous=homeElement("button","homeTransport","◀"),play=homeElement("button","homePrimary",playing?"PAUSE":"PLAY"),next=homeElement("button","homeTransport","▶"),lyrics=homeElement("button","homeSecondary","LYRICS");previous.addEventListener("click",()=>control("previous"));play.addEventListener("click",()=>control("playpause"));next.addEventListener("click",()=>control("next"));lyrics.addEventListener("click",()=>setAppView("lyrics"));actions.append(previous,play,next,lyrics);details.appendChild(actions);hero.append(visual,details);
}
function renderHome(){
  if(!$("homeScreen"))return;const mode=currentHomeMode(),copy=HOME_COPY[mode]||HOME_COPY.arcade,collectionMeta=mode==="vinyl"?"Search songs and playlists, or flip through a record crate.":mode==="cd"?"Search songs and playlists, or choose a jewel case.":"Search songs and playlists, or load a collection.";$("homeRosterKicker").textContent=copy[0];$("homeRosterTitle").textContent=homeState.activeCollection?.title||copy[1];$("homeRosterMeta").textContent=homeState.activeCollection?.sub||"Recently played";$("homeCollectionsMeta").textContent=collectionMeta;const canPlay=!homeState.collectionLoading&&!!homeState.games.length;$("homeLikedShortcut").classList.toggle("selected",homeState.activeCollection?.kind==="liked");$("homePlayCollection").disabled=!canPlay;$("homeShuffleCollection").disabled=!canPlay;document.querySelectorAll("[data-home-theme]").forEach(b=>b.classList.toggle("active",b.dataset.homeTheme===mode));renderHomeRoster();renderHomeHero();renderHomeCollections();
}
const localHomeTracks=history=>(history||[]).slice(0,16).map(t=>({uri:t.uri,title:t.name||"Unknown track",sub:t.artist||t.album||"Local history",img:t.img||""}));
function normaliseHomeTracks(rows,context){return(rows||[]).flatMap(row=>{const t=row?.track||row?.item||row;if(!t?.uri||!String(t.uri).startsWith("spotify:track:"))return[];return[{uri:t.uri,context,title:t.name||"Unknown track",sub:homeArtists(t.artists),album:t.album?.name||"",img:homeImage(t.album?.images)}];});}
function normalisePublicPlaylistTracks(rows,collection){return(rows||[]).flatMap(track=>{if(!track?.uri||!String(track.uri).startsWith("spotify:track:"))return[];return[{uri:track.uri,context:collection?.uri||null,title:track.title||"Unknown track",sub:track.artist||"Unknown artist",album:collection?.title||"",img:collection?.img||""}];});}
function homeQueueFromResponse(response,expectedUri=""){
  if(!response?.ok)return null;
  const currentUri=String(response.data?.currently_playing?.uri||"");
  if(expectedUri&&currentUri!==expectedUri)return null;
  return normaliseHomeTracks(response.data?.queue).filter(track=>track.uri!==currentUri).slice(0,5);
}
async function refreshHomeQueue(force=false,expectedUri=""){
  if(!force&&(homeState.queueLoading||Date.now()-homeState.queueLoadedAt<12000))return;
  const request=++homeState.queueRequest;homeState.queueLoading=true;
  try{
    const response=await window.tracker.spApi("/me/player/queue");
    if(request!==homeState.queueRequest)return;
    const queue=homeQueueFromResponse(response,expectedUri);if(!queue)return;
    homeState.queue=queue;homeState.queueLoadedAt=Date.now();
  }finally{
    if(request===homeState.queueRequest){homeState.queueLoading=false;if(["vinyl","cd"].includes(currentHomeMode()))renderHomeHero();}
  }
}
function scheduleHomeQueueRefresh(uri){
  const schedule=++homeState.queueSchedule;homeState.queue=[];homeState.queueLoadedAt=0;if(["vinyl","cd"].includes(currentHomeMode()))renderHomeHero();
  [200,700,1600,3200,6000].forEach(delay=>setTimeout(()=>{if(schedule===homeState.queueSchedule)refreshHomeQueue(true,uri);},delay));
}
async function loadHomeCollection(collection){
  if(!collection||homeState.collectionLoading)return;
  homeState.activeCollection=collection;homeState.collectionLoading=true;homeState.games=[];homeState.search="";if($("homeSongSearch"))$("homeSongSearch").value="";closeHomeTrackMenu();renderHome();
  try{
    if(collection.kind==="recent")homeState.games=homeState.recent.slice();
    else{
      let response=null;
      if(collection.kind==="liked")response=await spotifyPaged("/me/tracks?limit=50");
      else if(collection.editable!==false){response=await spotifyPaged(`/playlists/${collection.id}/items?limit=100`);if(!response.ok)response=await spotifyPaged(`/playlists/${collection.id}/tracks?limit=100`);}
      if(response?.ok)homeState.games=normaliseHomeTracks(response.data?.items,collection.kind==="playlist"?collection.uri:null);
      if(collection.kind==="playlist"&&!homeState.games.length){const publicResult=await window.tracker.spotifyPublicPlaylist(collection.id).catch(()=>null);if(publicResult?.ok){homeState.games=normalisePublicPlaylistTracks(publicResult.data?.tracks,collection);const declared=Number(String(collection.sub||"").match(/\d+/)?.[0]);if(declared>homeState.games.length)homeState.activeCollection={...collection,sub:`${homeState.games.length} available · ${collection.sub}`};}}
      if(!homeState.games.length)showToast(`COULDN'T LOAD ${collection.title}`);
    }
  }finally{homeState.collectionLoading=false;renderHome();}
}
async function refreshArcadeHome(force=false){
  if(homeState.loading||(!force&&Date.now()-homeState.loadedAt<60000))return;homeState.loading=true;
  try{const [status,history]=await Promise.all([window.tracker.spStatus(),window.tracker.historyGet()]);homeState.connected=!!status?.connected;homeState.writeAccess=!!status?.writeAccess;homeState.recent=localHomeTracks(history);homeState.games=homeState.games.length?homeState.games:homeState.recent.slice();homeState.playlists=[{key:"recent",kind:"recent",title:"Recently played",sub:`${homeState.recent.length} songs`,symbol:"↻"}];
    if(status?.connected){const [profile,recent,playlists,liked,queue]=await Promise.all([window.tracker.spApi("/me"),window.tracker.spApi("/me/player/recently-played?limit=50"),spotifyPaged("/me/playlists?limit=50"),window.tracker.spApi("/me/tracks?limit=1"),window.tracker.spApi("/me/player/queue")]);if(recent.ok){const seen=new Set();homeState.recent=normaliseHomeTracks(recent.data?.items).filter(t=>{if(seen.has(t.uri))return false;seen.add(t.uri);return true;}).slice(0,50);if(!homeState.activeCollection||homeState.activeCollection.kind==="recent")homeState.games=homeState.recent.slice();}const initialQueue=homeQueueFromResponse(queue);if(initialQueue){homeState.queue=initialQueue;homeState.queueLoadedAt=Date.now();}homeState.playlists=[{key:"liked",kind:"liked",title:"Liked Songs",sub:`${liked.ok?(liked.data?.total??"Your"):"Your"} songs`,symbol:"♥"},{key:"recent",kind:"recent",title:"Recently played",sub:`${homeState.recent.length} songs`,symbol:"↻"}];if(playlists.ok)homeState.playlists.push(...(playlists.data?.items||[]).filter(p=>p?.uri).map(p=>({key:`playlist:${p.id}`,id:p.id,kind:"playlist",uri:p.uri,title:p.name||"Untitled collection",sub:`${p.tracks?.total??p.items?.total??"?"} songs`,img:homeImage(p.images),editable:!!p.collaborative||!!profile.ok&&p.owner?.id===profile.data?.id})));}
    if(!homeState.activeCollection)homeState.activeCollection=homeState.playlists.find(p=>p.kind==="recent")||homeState.playlists[0];homeState.loadedAt=Date.now();renderHome();
  }finally{homeState.loading=false;}
}
function homeNowPlayingKey(np){if(!np||!(np.state==="playing"||np.state==="paused"))return"idle";return[np.id,np.uri,np.title,np.artist,np.album,np.artwork,np.state].map(value=>String(value||"").normalize("NFKC").trim().toLowerCase()).join("|");}
function enrichHomeItem(item){if(!item?.uri)return item;const known=[...homeState.games,...homeState.recent,...homeState.queue].find(track=>track.uri===item.uri);return known?{...item,sub:known.sub||item.sub,album:known.album||item.album,img:known.img||item.img}:item;}
function clearHomePending(render=false){
  if(!homeState.slotItem&&!homeState.pendingUri)return;
  homeState.slotItem=null;homeState.pendingUri="";homeState.pendingAt=0;homeState.pendingCommandAt=0;homeState.loadSequence++;$("homeScreen")?.classList.remove("game-slotting","cd-loading","cd-seated","stereo-loading","stereo-seated");if(render)renderHomeHero();
}
function updateHomeNowPlaying(np){
  const active=np&&(np.state==="playing"||np.state==="paused"),uri=String(np?.uri||np?.id||""),key=homeNowPlayingKey(np),volume=Number(np?.volume),previousUri=homeState.nowPlaying?.uri||"";let pendingCleared=false;
  if(Number.isFinite(volume))updateHomeVolumeUi(volume);
  if(homeState.pendingUri&&homeState.slotItem){
    const transition=homePendingTransition(homeState.pendingUri,homeState.pendingAt,homeState.pendingCommandAt,np);
    if(transition==="wait")return;
    clearHomePending();pendingCleared=true;
  }
  if(key===homeState.nowKey){if(pendingCleared||homeState.slotItem)renderHomeHero();return;}
  homeState.nowKey=key;homeState.nowPlaying=active?enrichHomeItem({uri,title:np.title||"Unknown track",sub:np.artist||"Unknown artist",album:np.album||"",img:np.artwork||"",isNow:true}):null;if(homeState.nowPlaying)setHomeGameColor(homeState.nowPlaying);
  renderHome();if(active&&uri&&uri!==previousUri&&["vinyl","cd"].includes(currentHomeMode()))scheduleHomeQueueRefresh(uri);
}
function onHomeModeChange(previous,next){if(previous!==next&&["vinyl","cd"].includes(next))scheduleHomeQueueRefresh(homeState.nowPlaying?.uri||"");}
let viewTransitionTimer=0;
function setAppView(view){
  const wanted=["lyrics","vault"].includes(view)?view:"home",previous=document.body.dataset.view||"home";
  if($("accountPanel").classList.contains("open"))closeAccountPanel();if($("trackerPanel").classList.contains("open"))closeTracker();if($("settings").classList.contains("open"))closeSettings();
  if(previous===wanted){if(wanted==="home")refreshArcadeHome();else if(wanted==="lyrics")activeIdx=-2;else if(typeof refreshVault==="function")refreshVault();return;}
  if(previous==="vault"&&wanted!=="vault"&&typeof isVaultPlaying==="function"&&isVaultPlaying())$("vaultAudio").pause();
  if(wanted!=="home")closeQueuePanel();
  clearTimeout(viewTransitionTimer);document.body.classList.remove("view-enter-home","view-enter-lyrics","view-enter-vault");void document.body.offsetWidth;
  document.body.dataset.view=wanted;document.body.classList.add(`view-enter-${wanted}`);
  document.querySelectorAll("#homeScreen video").forEach(video=>{if(wanted==="home")video.play().catch(()=>{});else video.pause();});
  $("homeBtn").classList.toggle("active",wanted==="home");$("lyricsBtn").classList.toggle("active",wanted==="lyrics");$("vaultBtn").classList.toggle("active",wanted==="vault");$("homeScreen").setAttribute("aria-hidden",wanted!=="home"?"true":"false");$("vaultScreen").setAttribute("aria-hidden",wanted!=="vault"?"true":"false");
  if(wanted==="home")refreshArcadeHome();else if(wanted==="lyrics")activeIdx=-2;else if(typeof refreshVault==="function")refreshVault();
  viewTransitionTimer=setTimeout(()=>document.body.classList.remove(`view-enter-${wanted}`),900);
}
function initHome(){$("homeBtn").addEventListener("click",()=>setAppView("home"));$("lyricsBtn").addEventListener("click",()=>setAppView("lyrics"));$("homeLikedShortcut").addEventListener("click",()=>{const liked=homeState.playlists.find(item=>item.kind==="liked");if(liked)loadHomeCollection(liked);else{showToast("CONNECT SPOTIFY TO OPEN LIKED SONGS");openAccountPanel();}});$("homePlayCollection").addEventListener("click",()=>playHomeCollection(false));$("homeShuffleCollection").addEventListener("click",()=>playHomeCollection(true));$("homeQueueShortcut").addEventListener("click",openQueuePanel);$("homeSongSearch").addEventListener("input",event=>{homeState.search=event.target.value;renderHomeRoster();});$("homeLibrarySearch").addEventListener("input",event=>{const query=event.target.value;clearTimeout(homeState.librarySearchTimer);homeState.librarySearch=query.trim();homeState.librarySearchError="";if(!homeState.librarySearch){searchHomeLibrary("");return;}homeState.librarySearching=true;renderHomeCollections();homeState.librarySearchTimer=setTimeout(()=>searchHomeLibrary(query),320);});document.addEventListener("click",event=>{if(!event.target.closest("#homeTrackMenu,.homeSongMenuButton"))closeHomeTrackMenu();});window.addEventListener("blur",closeHomeTrackMenu);window.tracker.onAuthRestored?.(()=>{homeState.loadedAt=0;refreshArcadeHome(true);});document.querySelectorAll("[data-home-theme]").forEach(b=>b.addEventListener("click",()=>window.tracker.setSettings({homeMode:b.dataset.homeTheme})));renderHome();setAppView("home");}
