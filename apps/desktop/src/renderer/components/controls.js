// =====================================================================
  // Playback controls + keyboard + fullscreen
  // =====================================================================
  async function control(action) {
    await window.tracker.control(action);
    setTimeout(poll, 250);               // refresh quickly so the window follows the change
  }
  $("previous").addEventListener("click", () => control("previous"));
  $("playpause").addEventListener("click", () => control("playpause"));
  $("next").addEventListener("click", () => control("next"));

  // Click or drag anywhere on the progress line to seek. While dragging we
  // update the lyrics/time locally, then ask Spotify to commit the position.
  const seekBar = $("bar");
  function previewSeek(clientX) {
    if (!durSec) return 0;
    const rect = seekBar.getBoundingClientRect();
    const ratio = clamp01((clientX - rect.left) / Math.max(1, rect.width));
    posSec = ratio * durSec;
    syncAt = performance.now();
    activeIdx = -2;
    return posSec;
  }
  async function commitSeek(position) {
    const target = Math.max(0, Math.min(durSec, Number(position) || 0));
    posSec = target;
    syncAt = performance.now();
    let result;
    try {
      result = await window.tracker.seek(target);
    } catch (error) {
      result = { ok: false, error: error?.message || "Spotify did not respond" };
    } finally {
      seeking = false;
      seekBar.classList.remove("scrubbing");
    }
    if (!result?.ok) showToast("Couldn't seek: " + (result?.error || "unknown error"));
    setTimeout(poll, 120);
  }
  seekBar.addEventListener("pointerdown", (event) => {
    if (!durSec) return;
    seeking = true;
    seekBar.classList.add("scrubbing");
    seekBar.setPointerCapture(event.pointerId);
    previewSeek(event.clientX);
  });
  seekBar.addEventListener("pointermove", (event) => {
    if (seeking) previewSeek(event.clientX);
  });
  seekBar.addEventListener("pointerup", (event) => {
    if (!seeking) return;
    const target = previewSeek(event.clientX);
    if (seekBar.hasPointerCapture(event.pointerId)) seekBar.releasePointerCapture(event.pointerId);
    commitSeek(target);
  });
  seekBar.addEventListener("pointercancel", () => {
    seeking = false;
    seekBar.classList.remove("scrubbing");
  });
  seekBar.addEventListener("keydown", (event) => {
    if (!durSec || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const now = posSec + (playing ? (performance.now() - syncAt) / 1000 : 0);
    const target = event.key === "Home" ? 0 : event.key === "End" ? durSec
      : now + (event.key === "ArrowRight" ? 5 : -5);
    seeking = true;
    commitSeek(target);
  });

  // in fullscreen the controls fade out; moving the mouse brings them (and the settings button) back
  let wakeTimer = null;
  function wake() {
    document.body.classList.add("awake");
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(() => {
      if (!$("settings").classList.contains("open")) document.body.classList.remove("awake");
    }, 2500);
  }
  window.addEventListener("mousemove", wake);
  window.tracker.onFullscreen((on) => { document.body.classList.toggle("immersive", on); activeIdx = -2; wake(); });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if ($("trackerPanel").classList.contains("open")) closeTracker();
      else if ($("library").classList.contains("open")) closeLibrary();
      else if ($("settings").classList.contains("open")) closeSettings();
      else if (document.body.classList.contains("immersive")) window.tracker.toggleFullscreen();
      return;
    }
    if (e.target && e.target.tagName === "INPUT") return;      // don't hijack keys while using a slider
    if (e.key === " ") { e.preventDefault(); control("playpause"); return; }
    if (e.key === "f" || e.key === "F") { window.tracker.toggleFullscreen(); return; }
    if (e.key === "l" || e.key === "L") { $("library").classList.contains("open") ? closeLibrary() : openLibrary(); return; }
    if (e.key === "t" || e.key === "T") { $("trackerPanel").classList.contains("open") ? closeTracker() : openTracker(); return; }
    if (e.key === "s" || e.key === "S") { $("settings").classList.contains("open") ? closeSettings() : openSettings(); return; }
    if (e.key === "g" || e.key === "G") { window.tracker.setSettings({ glow: !settings.glow }); return; }
    if (e.key === "ArrowLeft") offset -= 0.25;
    else if (e.key === "ArrowRight") offset += 0.25;
    else return;
    $("offs").textContent = offset === 0 ? "" : "(" + (offset > 0 ? "+" : "") + offset.toFixed(2) + "s)";
  });


