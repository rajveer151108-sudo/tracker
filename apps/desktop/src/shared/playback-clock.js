(function exposePlaybackClock(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PlaybackClock = api;
})(typeof globalThis === "object" ? globalThis : this, function playbackClockFactory() {
  function reconcilePlaybackClock({
    localPosition = 0,
    localAtMs = 0,
    localPlaying = false,
    observedPosition = 0,
    observedAtMs = 0,
    nextPlaying = false,
    force = false,
  } = {}) {
    const elapsed = localPlaying ? Math.max(0, observedAtMs - localAtMs) / 1000 : 0;
    const predicted = Math.max(0, Number(localPosition) || 0) + elapsed;
    const observed = Math.max(0, Number(observedPosition) || 0);
    const drift = observed - predicted;
    const stateChanged = !!localPlaying !== !!nextPlaying;
    const pausedMove = !nextPlaying && Math.abs(drift) > .08;
    const snapped = force || stateChanged || pausedMove || Math.abs(drift) > .9;
    if (snapped) return { position: observed, atMs: observedAtMs, drift, snapped: true };
    // Spotify's position is sampled through an external process and can wobble
    // by a few frames. Ignore tiny errors and gently absorb larger ones instead
    // of making every lyric jump once per poll.
    if (Math.abs(drift) < .055) return { position: predicted, atMs: observedAtMs, drift, snapped: false };
    const correction = Math.max(-.12, Math.min(.12, drift * .2));
    return { position: Math.max(0, predicted + correction), atMs: observedAtMs, drift, snapped: false };
  }

  return { reconcilePlaybackClock };
});
