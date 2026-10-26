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
      if ($("library").classList.contains("open")) closeLibrary();
      else if ($("settings").classList.contains("open")) closeSettings();
      else if (document.body.classList.contains("immersive")) window.tracker.toggleFullscreen();
      return;
    }
    if (e.target && e.target.tagName === "INPUT") return;      // don't hijack keys while using a slider
    if (e.key === " ") { e.preventDefault(); control("playpause"); return; }
    if (e.key === "f" || e.key === "F") { window.tracker.toggleFullscreen(); return; }
    if (e.key === "l" || e.key === "L") { $("library").classList.contains("open") ? closeLibrary() : openLibrary(); return; }
    if (e.key === "s" || e.key === "S") { $("settings").classList.contains("open") ? closeSettings() : openSettings(); return; }
    if (e.key === "g" || e.key === "G") { window.tracker.setSettings({ glow: !settings.glow }); return; }
    if (e.key === "ArrowLeft") offset -= 0.25;
    else if (e.key === "ArrowRight") offset += 0.25;
    else return;
    $("offs").textContent = offset === 0 ? "" : "(" + (offset > 0 ? "+" : "") + offset.toFixed(2) + "s)";
  });


