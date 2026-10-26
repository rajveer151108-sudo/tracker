// =====================================================================
  // Start
  // =====================================================================
  (async function init() {
    buildSettingsPanel();
    buildTabs();
    settings = await window.tracker.getSettings();
    window.tracker.onSettings((s) => { settings = s; applySettings(); });
    applySettings();
    $("playpause").innerHTML = ICON_PLAY;
    poll();
    setInterval(poll, 1000);
    requestAnimationFrame(frame);
  })();

