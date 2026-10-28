// =====================================================================
// Lyrics-side Spotify queue
// =====================================================================
let queuePanelLoading = false;

function queueTrackFrom(raw) {
  const track = raw?.track || raw?.item || raw;
  if (!track?.uri) return null;
  const image = (track.album?.images || track.images || []).find((entry) => entry?.url)?.url || "";
  return {
    uri: track.uri,
    title: track.name || "Unknown track",
    artist: (track.artists || []).map((artist) => artist?.name).filter(Boolean).join(", ") || "Unknown artist",
    image,
  };
}

function renderQueueTrack(track, now = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "queueTrack";
  button.title = now ? "Restart this track" : `Play ${track.title}`;
  const image = document.createElement("img");
  image.alt = "";
  image.src = track.image;
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = track.title;
  const artist = document.createElement("small");
  artist.textContent = track.artist;
  copy.append(title, artist);
  const play = document.createElement("em");
  play.textContent = "▶";
  button.append(image, copy, play);
  button.addEventListener("click", async () => {
    button.disabled = true;
    $("queueStatus").textContent = `Loading ${track.title}…`;
    const result = await playSpotifyUri(track.uri);
    button.disabled = false;
    if (!result?.ok) showToast("COULDN'T PLAY QUEUED TRACK: " + (result?.error || "SPOTIFY DID NOT RESPOND"));
    else {
      $("queueStatus").textContent = "Playing from your queue";
      setTimeout(() => { poll(); refreshQueuePanel(true); }, 450);
    }
  });
  return button;
}

async function refreshQueuePanel(silent = false) {
  if (queuePanelLoading) return;
  queuePanelLoading = true;
  if (!silent) $("queueStatus").textContent = "Reading Spotify queue…";
  const response = await window.tracker.spApi("/me/player/queue").catch((error) => ({ ok: false, error: error?.message }));
  queuePanelLoading = false;
  const list = $("queueList");
  const now = $("queueNow");
  list.replaceChildren();
  now.replaceChildren();
  if (!response?.ok) {
    $("queueStatus").textContent = response?.status === 401 ? "Connect Spotify to view queue" : "Queue unavailable";
    list.innerHTML = '<div class="queueEmpty">Start Spotify on a device, then refresh your queue.</div>';
    $("queueCount").textContent = "OFFLINE";
    $("queueListCount").textContent = "0 TRACKS";
    return;
  }
  const current = queueTrackFrom(response.data?.currently_playing);
  const tracks = (response.data?.queue || []).map(queueTrackFrom).filter(Boolean);
  if (current) now.append(renderQueueTrack(current, true));
  if (tracks.length) tracks.forEach((track) => list.append(renderQueueTrack(track)));
  else list.innerHTML = '<div class="queueEmpty">Nothing is queued yet.<br>Add songs from the home song menu.</div>';
  $("queueStatus").textContent = "Synced with Spotify";
  $("queueCount").textContent = tracks.length ? `${tracks.length} NEXT` : "EMPTY";
  $("queueListCount").textContent = `${tracks.length} TRACK${tracks.length === 1 ? "" : "S"}`;
}

function openQueuePanel() {
  if (document.body.dataset.view !== "lyrics") setAppView("lyrics");
  $("queuePanel").classList.add("open");
  $("queuePanel").setAttribute("aria-hidden", "false");
  $("queueBtn").setAttribute("aria-expanded", "true");
  document.body.classList.add("queue-open");
  refreshQueuePanel();
}

function closeQueuePanel() {
  $("queuePanel")?.classList.remove("open");
  $("queuePanel")?.setAttribute("aria-hidden", "true");
  $("queueBtn")?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("queue-open");
}

$("queueBtn").addEventListener("click", () => $("queuePanel").classList.contains("open") ? closeQueuePanel() : openQueuePanel());
$("queueClose").addEventListener("click", closeQueuePanel);
$("queueRefresh").addEventListener("click", () => refreshQueuePanel());
