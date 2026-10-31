// =====================================================================
// Tracker: authenticated stats website hosted inside Afterglow
// =====================================================================
let trackerLoaded = false;
let trackerLiveNow = null;
let trackerLivePosition = 0;
let trackerLiveDuration = 0;

function trackerTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function updateTrackerLiveProgress(position, duration) {
  trackerLivePosition = Math.max(0, Number(position) || 0);
  trackerLiveDuration = Math.max(0, Number(duration) || trackerLiveDuration || 0);
  if (!$('trackerPanel')?.classList.contains('open')) return;
  const ratio = trackerLiveDuration ? Math.min(1, trackerLivePosition / trackerLiveDuration) : 0;
  $("trackerLive")?.style.setProperty("--tracker-progress", `${(ratio * 100).toFixed(2)}%`);
  if ($("trackerLivePosition")) $("trackerLivePosition").textContent = trackerTime(trackerLivePosition);
  if ($("trackerLiveDuration")) $("trackerLiveDuration").textContent = trackerTime(trackerLiveDuration);
}

function updateTrackerNowPlaying(np) {
  trackerLiveNow = np && (np.state === "playing" || np.state === "paused") ? { ...np } : null;
  const live = $("trackerLive");
  if (!live) return;
  live.classList.toggle("idle", !trackerLiveNow);
  live.classList.toggle("playing", trackerLiveNow?.state === "playing");
  live.classList.toggle("paused", trackerLiveNow?.state === "paused");
  const cover = $("trackerLiveCover");
  if (trackerLiveNow?.artwork) {
    if (cover.getAttribute("src") !== trackerLiveNow.artwork) cover.src = trackerLiveNow.artwork;
  } else cover.removeAttribute("src");
  $("trackerLiveState").textContent = !trackerLiveNow ? "LIVE PLAYBACK // WAITING"
    : trackerLiveNow.state === "playing" ? "LIVE PLAYBACK // RECORDING NOW" : "LIVE PLAYBACK // PAUSED";
  $("trackerLiveTitle").textContent = trackerLiveNow?.title || "Start a song to wake the archive";
  $("trackerLiveArtist").textContent = trackerLiveNow
    ? `${trackerLiveNow.artist || "Unknown artist"}${trackerLiveNow.album ? ` · ${trackerLiveNow.album}` : ""}`
    : "Afterglow will follow Spotify in real time.";
  updateTrackerLiveProgress(trackerLiveNow?.positionSec || 0, (trackerLiveNow?.durationMs || 0) / 1000);
}

function freshTrackerUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set("afterglow-ui", "2");
  url.searchParams.set("loaded", Date.now().toString());
  return url.toString();
}

function setTrackerLoading(title, detail = "Loading your private archive…") {
  const host = $("trackerLoading");
  const meter = document.createElement("span");meter.className = "trackerLoader";
  for(let index=0;index<4;index++)meter.appendChild(document.createElement("i"));
  const strong=document.createElement("strong"),small=document.createElement("small");strong.textContent=title;small.textContent=detail;host.replaceChildren(meter,strong,small);
}

function setTrackerSyncState(text, state = "live") {
  const label = $("trackerSyncState");if(!label)return;const dot=document.createElement("i");label.replaceChildren(dot,document.createTextNode(text));label.dataset.state=state;
}

function openTracker() {
  closeAccountPanel();
  closeSettings();
  const panel = $("trackerPanel");
  const view = $("trackerView");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  updateTrackerNowPlaying(trackerLiveNow);
  updateTrackerLiveProgress(posSec, durSec);
  if (!trackerLoaded) {
    const trackerUrl = view.dataset.src;
    if (!trackerUrl) {
      setTrackerLoading("TRACKER LINK MISSING", "This build does not include a dashboard address.");
      $("trackerLoading").classList.add("show");
      return;
    }
    // GitHub Pages caches index.html for several minutes. A fresh document URL
    // prevents the persistent Electron partition from pinning an older UI while
    // hashed JS/CSS assets can still use their normal long-lived cache.
    view.setAttribute("src", freshTrackerUrl(trackerUrl));
    trackerLoaded = true;
  }
}

function closeTracker() {
  const panel = $("trackerPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

const trackerView = $("trackerView");
trackerView.addEventListener("did-start-loading", () => {setTrackerLoading("CALIBRATING LISTENING SIGNAL");$("trackerLoading").classList.add("show");});
trackerView.addEventListener("did-stop-loading", () => $("trackerLoading").classList.remove("show"));
trackerView.addEventListener("did-fail-load", (event) => {
  if (event.errorCode === -3) return;
  setTrackerLoading("SIGNAL LOST", "Check your internet connection, then press Reload.");
  $("trackerLoading").classList.add("show");
});
trackerView.addEventListener("ipc-message", async (event) => {
  if (event.channel === "tracker-disconnect") {
    await window.tracker.disconnectTracker();
    return;
  }
  if (event.channel !== "tracker-session") return;
  const result = await window.tracker.connectTracker(event.args[0]);
  if (result?.ok) showToast("Live Tracker connected");
  else if (result?.error) showToast(result.error);
});

window.tracker.onTrackerSyncStatus((status) => {
  if (status.error) setTrackerSyncState(status.error,"error");
  else if (!status.connected) setTrackerSyncState("Log in to enable live tracking","offline");
  else if (status.queued) setTrackerSyncState(`${status.queued} play${status.queued === 1 ? "" : "s"} waiting to sync`,"waiting");
  else setTrackerSyncState("Live tracking connected","live");
});

window.tracker.trackerSyncStatus();

$("trackerBtn").addEventListener("click", openTracker);
$("closeTracker").addEventListener("click", closeTracker);
$("reloadTracker").addEventListener("click", () => {
  setTrackerLoading("RECALIBRATING LISTENING SIGNAL");
  if (typeof trackerView.reloadIgnoringCache === "function") trackerView.reloadIgnoringCache();
  else trackerView.setAttribute("src", freshTrackerUrl(trackerView.dataset.src));
});
$("externalTracker").addEventListener("click", () => window.tracker.openTrackerExternal());
