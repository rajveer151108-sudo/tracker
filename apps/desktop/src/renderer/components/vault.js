// Vault: a deliberately local, private workspace for unreleased audio.
const vaultState={library:{tracks:[],backgroundUrl:""},selectedId:"",playingId:"",query:"",project:"",status:"",loaded:false,loading:false};
const vaultTrack=()=>vaultState.library.tracks.find(track=>track.id===vaultState.selectedId)||null;
const vaultPlayingTrack=()=>vaultState.library.tracks.find(track=>track.id===vaultState.playingId)||null;
const vaultCssUrl=url=>url?`url(${JSON.stringify(url)})`:"none";
const vaultDuration=value=>Number.isFinite(Number(value))&&Number(value)>0?fmt(Number(value)):"0:00";

function vaultFilteredTracks(){
  const query=vaultState.query.trim().toLowerCase();
  return vaultState.library.tracks.filter(track=>{
    if(vaultState.project&&track.project!==vaultState.project)return false;
    if(vaultState.status&&track.status!==vaultState.status)return false;
    if(!query)return true;
    return [track.title,track.artist,track.project,track.version,track.tags,track.notes].some(value=>String(value||"").toLowerCase().includes(query));
  });
}

function setVaultLibrary(library){
  if(!library)return;
  vaultState.library={tracks:Array.isArray(library.tracks)?library.tracks:[],backgroundUrl:library.backgroundUrl||""};
  if(vaultState.selectedId&&!vaultState.library.tracks.some(track=>track.id===vaultState.selectedId))vaultState.selectedId="";
  if(!vaultState.selectedId&&vaultState.library.tracks[0])vaultState.selectedId=vaultState.library.tracks[0].id;
  renderVault();
}

function makeVaultRecord(track){
  const button=document.createElement("button");button.type="button";button.className="vaultRecord";button.classList.toggle("selected",track.id===vaultState.selectedId);button.dataset.id=track.id;
  const art=document.createElement("span");art.className="vaultRecordArt";if(track.artworkUrl)art.style.backgroundImage=vaultCssUrl(track.artworkUrl);else{const mark=document.createElement("span");mark.textContent=(track.title||"V").slice(0,1).toUpperCase();art.appendChild(mark);}
  const copy=document.createElement("span");copy.className="vaultRecordCopy";const title=document.createElement("b");title.textContent=track.title||"Untitled";const detail=document.createElement("span");detail.textContent=[track.artist,track.project,track.version].filter(Boolean).join(" · ");copy.append(title,detail);
  const meta=document.createElement("span");meta.className="vaultRecordMeta";const dot=document.createElement("i");dot.dataset.stage=track.status||"demo";const length=document.createElement("small");length.textContent=track.duration?vaultDuration(track.duration):(track.status||"demo");meta.append(dot,length);
  button.append(art,copy,meta);button.addEventListener("click",()=>selectVaultTrack(track.id));button.addEventListener("dblclick",()=>playVaultTrack(track.id,true));return button;
}

function renderVaultProjects(){
  const select=$("vaultProjectFilter"),current=vaultState.project,projects=[...new Set(vaultState.library.tracks.map(track=>track.project).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  select.replaceChildren();const all=document.createElement("option");all.value="";all.textContent="All projects";select.appendChild(all);
  for(const project of projects){const option=document.createElement("option");option.value=project;option.textContent=project;select.appendChild(option);}select.value=projects.includes(current)?current:"";if(!select.value)vaultState.project="";
}

function renderVaultList(){
  renderVaultProjects();const list=$("vaultList"),tracks=vaultFilteredTracks();list.replaceChildren();$("vaultCount").textContent=`${vaultState.library.tracks.length} ${vaultState.library.tracks.length===1?"file":"files"}`;
  if(!tracks.length){const empty=document.createElement("div");empty.className="vaultEmpty";empty.textContent=vaultState.library.tracks.length?"No sessions match those filters.":"Your unreleased files will live here. Import stems, demos or masters to begin.";list.appendChild(empty);return;}
  for(const track of tracks)list.appendChild(makeVaultRecord(track));
}

function fillVaultInspector(track){
  $("vaultInspectorEmpty").hidden=!!track;$("vaultForm").hidden=!track;if(!track)return;
  $("vaultTitleInput").value=track.title||"";$("vaultArtistInput").value=track.artist||"";$("vaultProjectInput").value=track.project||"";$("vaultVersionInput").value=track.version||"";$("vaultStatusInput").value=track.status||"demo";$("vaultTagsInput").value=track.tags||"";$("vaultBpmInput").value=track.bpm||"";$("vaultKeyInput").value=track.key||"";$("vaultNotesInput").value=track.notes||"";
}

function updateVaultBackdrop(track=vaultTrack()){
  const url=track?.backgroundUrl||vaultState.library.backgroundUrl||track?.artworkUrl||"";$("vaultScreen").style.setProperty("--vault-bg",vaultCssUrl(url));
}

function updateVaultHeader(){
  if(document.body.dataset.view!=="vault")return;const track=vaultTrack(),cover=$("cover");$("title").textContent=track?.title||"Vault";$("artist").textContent=track?.artist||"Private local music";$("album").textContent=track?[track.project,track.version].filter(Boolean).join(" · "):"Unreleased workspace";$("genre").textContent=track?(track.status||"demo").toUpperCase():"LOCAL ONLY";cover.style.visibility=track?.artworkUrl?"visible":"hidden";if(track?.artworkUrl)cover.src=track.artworkUrl;else cover.removeAttribute("src");
}

function renderVaultDeck(){
  const track=vaultTrack(),deck=document.querySelector(".vaultDeck"),audio=$("vaultAudio"),isSelectedPlaying=!!track&&track.id===vaultState.playingId&&!audio.paused;deck.classList.toggle("playing",isSelectedPlaying);
  $("vaultDeckStatus").textContent=isSelectedPlaying?"PLAYING LOCAL AUDIO":track?`${(track.status||"demo").toUpperCase()} // ${track.version||"VERSION"}`:"NO SESSION LOADED";$("vaultNowProject").textContent=track?[track.project,track.status].filter(Boolean).join(" // ").toUpperCase():"SELECT A RECORD";$("vaultNowTitle").textContent=track?.title||"Your private listening room";$("vaultNowArtist").textContent=track?.artist||"Import an audio file to begin.";
  const hero=$("vaultHeroArt");hero.style.backgroundImage=track?.artworkUrl?vaultCssUrl(track.artworkUrl):"none";hero.firstElementChild.style.display=track?.artworkUrl?"none":"";hero.firstElementChild.textContent=(track?.title||"V").slice(0,1).toUpperCase();$("vaultPlay").textContent=isSelectedPlaying?"Ⅱ":"▶";$("vaultPlay").setAttribute("aria-label",isSelectedPlaying?"Pause":"Play");
  if(track?.id!==vaultState.playingId){$("vaultProgress").value="0";$("vaultPosition").textContent="0:00";$("vaultDuration").textContent=vaultDuration(track?.duration||0);}updateVaultBackdrop(track);updateVaultHeader();
}

function renderVault(){renderVaultList();fillVaultInspector(vaultTrack());renderVaultDeck();}

function selectVaultTrack(id){if(!vaultState.library.tracks.some(track=>track.id===id))return;vaultState.selectedId=id;renderVault();}

async function refreshVault(force=false){
  if(vaultState.loading||vaultState.loaded&&!force){renderVault();return;}vaultState.loading=true;
  try{setVaultLibrary(await window.tracker.vaultGet());vaultState.loaded=true;}catch(error){showToast(`VAULT: ${error?.message||"COULDN'T OPEN THE LIBRARY"}`);}finally{vaultState.loading=false;}
}

async function importVaultAudio(){
  const result=await window.tracker.vaultImportAudio().catch(error=>({ok:false,error:error?.message}));if(!result?.ok){showToast(`VAULT: ${result?.error||"IMPORT FAILED"}`);return;}if(result.imported?.length){vaultState.selectedId=result.imported[0].id;setVaultLibrary(result.library);showToast(`${result.imported.length} ${result.imported.length===1?"SESSION":"SESSIONS"} ADDED TO VAULT`);}
}

function loadVaultAudio(track){
  const audio=$("vaultAudio");if(!track?.audioUrl)return false;if(vaultState.playingId!==track.id||audio.src!==track.audioUrl){audio.pause();audio.src=track.audioUrl;audio.load();vaultState.playingId=track.id;}return true;
}

async function playVaultTrack(id=vaultState.selectedId,autoplay=true){
  const track=vaultState.library.tracks.find(item=>item.id===id);if(!track)return;if(vaultState.selectedId!==id){vaultState.selectedId=id;renderVault();}const audio=$("vaultAudio");if(!loadVaultAudio(track))return;
  if(!autoplay)return;try{await audio.play();}catch(error){showToast(`VAULT PLAYER: ${error?.message||"COULDN'T PLAY THIS FILE"}`);}
}

function toggleVaultPlayback(){
  const audio=$("vaultAudio");if(!vaultTrack())return;if(vaultState.playingId===vaultState.selectedId&&!audio.paused){audio.pause();return;}playVaultTrack(vaultState.selectedId,true);
}

function vaultStep(direction){
  const tracks=vaultFilteredTracks().length?vaultFilteredTracks():vaultState.library.tracks;if(!tracks.length)return;const current=Math.max(0,tracks.findIndex(track=>track.id===(vaultState.playingId||vaultState.selectedId))),next=(current+direction+tracks.length)%tracks.length;playVaultTrack(tracks[next].id,true);
}

function vaultControl(action){if(action==="playpause")toggleVaultPlayback();else if(action==="previous")vaultStep(-1);else if(action==="next")vaultStep(1);}
function isVaultPlaying(){const audio=$("vaultAudio");return !!audio&&!audio.paused&&!audio.ended;}

async function saveVaultForm(event){
  event.preventDefault();const track=vaultTrack();if(!track)return;const patch=Object.fromEntries(new FormData(event.currentTarget).entries()),result=await window.tracker.vaultUpdate(track.id,patch).catch(error=>({ok:false,error:error?.message}));if(!result?.ok){showToast(`VAULT: ${result?.error||"COULDN'T SAVE"}`);return;}setVaultLibrary(result.library);showToast("SESSION SHEET SAVED");
}

async function chooseVaultTrackImage(kind){
  const track=vaultTrack();if(!track)return;const result=await window.tracker.vaultImportTrackImage(track.id,kind).catch(error=>({ok:false,error:error?.message}));if(result?.canceled)return;if(!result?.ok){showToast(`VAULT: ${result?.error||"IMAGE IMPORT FAILED"}`);return;}setVaultLibrary(result.library);showToast(kind==="background"?"TRACK BACKDROP UPDATED":"COVER ART UPDATED");
}

async function chooseVaultBackground(){const result=await window.tracker.vaultSetBackground().catch(error=>({ok:false,error:error?.message}));if(result?.canceled)return;if(!result?.ok){showToast(`VAULT: ${result?.error||"BACKGROUND IMPORT FAILED"}`);return;}setVaultLibrary(result.library);showToast("VAULT BACKDROP UPDATED");}
async function clearVaultBackground(){const result=await window.tracker.vaultClearBackground();if(result?.ok){setVaultLibrary(result.library);showToast("VAULT BACKDROP RESET");}}

async function removeVaultTrack(){
  const track=vaultTrack();if(!track||!confirm(`Remove “${track.title}” from Vault?\n\nYour original file and Vault's managed audio copy will stay on disk.`))return;const audio=$("vaultAudio");if(vaultState.playingId===track.id){audio.pause();audio.removeAttribute("src");vaultState.playingId="";}const result=await window.tracker.vaultRemove(track.id);if(!result?.ok){showToast(`VAULT: ${result?.error||"COULDN'T REMOVE IT"}`);return;}vaultState.selectedId="";setVaultLibrary(result.library);showToast("REMOVED FROM VAULT — AUDIO KEPT SAFE");
}

function updateVaultProgress(){
  const audio=$("vaultAudio"),track=vaultPlayingTrack();if(!track)return;const duration=Number(audio.duration)||Number(track.duration)||0,current=Number(audio.currentTime)||0;if(vaultState.selectedId===track.id){$("vaultProgress").value=duration?String(Math.round(current/duration*1000)):"0";$("vaultPosition").textContent=fmt(current);$("vaultDuration").textContent=vaultDuration(duration);}
}

function initVault(){
  const wave=$("vaultWave");for(let index=0;index<44;index++){const bar=document.createElement("i");bar.style.setProperty("--wave-height",`${5+((index*17)%22)}px`);bar.style.animationDelay=`-${(index%11)*.08}s`;wave.appendChild(bar);}
  $("vaultBtn").addEventListener("click",()=>setAppView("vault"));$("vaultImportBtn").addEventListener("click",importVaultAudio);$("vaultBackgroundBtn").addEventListener("click",chooseVaultBackground);$("vaultClearBackgroundBtn").addEventListener("click",clearVaultBackground);$("vaultSearch").addEventListener("input",event=>{vaultState.query=event.target.value;renderVaultList();});$("vaultProjectFilter").addEventListener("change",event=>{vaultState.project=event.target.value;renderVaultList();});$("vaultStatusFilter").addEventListener("change",event=>{vaultState.status=event.target.value;renderVaultList();});$("vaultPlay").addEventListener("click",toggleVaultPlayback);$("vaultPrevious").addEventListener("click",()=>vaultStep(-1));$("vaultNext").addEventListener("click",()=>vaultStep(1));$("vaultForm").addEventListener("submit",saveVaultForm);$("vaultArtworkBtn").addEventListener("click",()=>chooseVaultTrackImage("artwork"));$("vaultTrackBackgroundBtn").addEventListener("click",()=>chooseVaultTrackImage("background"));$("vaultRevealBtn").addEventListener("click",()=>vaultTrack()&&window.tracker.vaultReveal(vaultTrack().id));$("vaultRemoveBtn").addEventListener("click",removeVaultTrack);
  $("vaultProgress").addEventListener("input",event=>{const audio=$("vaultAudio");if(Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(event.target.value)/1000;updateVaultProgress();});
  const audio=$("vaultAudio");audio.addEventListener("play",()=>{if(typeof playing!=="undefined"&&playing)window.tracker.control("playpause").catch(()=>{});window.tracker.setPlaybackActive(true);renderVaultDeck();});audio.addEventListener("pause",()=>{window.tracker.setPlaybackActive(typeof playing!=="undefined"&&playing);renderVaultDeck();});audio.addEventListener("ended",()=>vaultStep(1));audio.addEventListener("timeupdate",updateVaultProgress);audio.addEventListener("loadedmetadata",async()=>{updateVaultProgress();const track=vaultPlayingTrack(),duration=Number(audio.duration)||0;if(track&&duration&&Math.abs(duration-(Number(track.duration)||0))>.5){const result=await window.tracker.vaultUpdate(track.id,{duration});if(result?.ok)setVaultLibrary(result.library);}});audio.addEventListener("error",()=>{if(audio.src)showToast("VAULT PLAYER: THIS AUDIO FILE COULDN'T BE READ");});
  refreshVault(true);
}
