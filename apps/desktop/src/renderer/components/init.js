// =====================================================================
  // Start
  // =====================================================================
  (async function init() {
    buildSettingsPanel();
    settings = await window.tracker.getSettings();
    window.tracker.onSettings((s) => { settings = s; applySettings(); });
    applySettings();
    initHome();
    $("playpause").innerHTML = ICON_PLAY;
    poll();
    setInterval(poll, 1000);
    requestAnimationFrame(frame);
  })();

