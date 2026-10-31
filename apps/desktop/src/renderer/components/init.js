// =====================================================================
  // Start
  // =====================================================================
  (async function init() {
    buildSettingsPanel();
    settings = prepareVisualAutomationSettings(await window.tracker.getSettings());
    window.tracker.onSettings((s) => { settings = prepareVisualAutomationSettings(s); applySettings(); });
    applySettings();
    initHome();
    $("playpause").innerHTML = ICON_PLAY;
    poll();
    setInterval(poll, 1000);
    requestAnimationFrame(frame);
  })();

