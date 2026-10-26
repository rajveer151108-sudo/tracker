// =====================================================================
// Tracker: authenticated stats website hosted inside Afterglow
// =====================================================================
let trackerLoaded = false;

function openTracker() {
  closeLibrary();
  closeSettings();
  const panel = $("trackerPanel");
  const view = $("trackerView");
  panel.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  if (!trackerLoaded) {
    const trackerUrl = view.dataset.src;
    if (!trackerUrl) {
      $("trackerLoading").textContent = "Tracker URL is missing from this build.";
      $("trackerLoading").classList.add("show");
      return;
    }
    view.setAttribute("src", trackerUrl);
    trackerLoaded = true;
  }
}

function closeTracker() {
  const panel = $("trackerPanel");
  panel.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
}

const trackerView = $("trackerView");
trackerView.addEventListener("did-start-loading", () => $("trackerLoading").classList.add("show"));
trackerView.addEventListener("did-stop-loading", () => $("trackerLoading").classList.remove("show"));
trackerView.addEventListener("did-fail-load", (event) => {
  if (event.errorCode === -3) return;
  $("trackerLoading").textContent = "Tracker couldn't load. Check your internet connection, then press Reload.";
  $("trackerLoading").classList.add("show");
});

$("trackerBtn").addEventListener("click", openTracker);
$("closeTracker").addEventListener("click", closeTracker);
$("reloadTracker").addEventListener("click", () => {
  $("trackerLoading").textContent = "Loading Tracker…";
  trackerView.reload();
});
$("externalTracker").addEventListener("click", () => window.tracker.openTrackerExternal());
