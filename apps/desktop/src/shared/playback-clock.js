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
    observationStartedAtMs = observedAtMs,
    nextPlaying = false,
    force = false,
  } = {}) {
    const elapsed = localPlaying ? Math.max(0, observedAtMs - localAtMs) / 1000 : 0;
    const predicted = Math.max(0, Number(localPosition) || 0) + elapsed;
    // Spotify's position is read in the middle of an AppleScript/IPC request,
    // not when the response reaches this renderer. Advance a playing sample by
    // half the measured round trip so both clocks describe the same instant.
    const roundTripMs = Math.max(0, Number(observedAtMs) - Number(observationStartedAtMs));
    const sampleAgeMs = nextPlaying ? Math.min(1000, roundTripMs * .5) : 0;
    const observed = Math.max(0, Number(observedPosition) || 0) + sampleAgeMs / 1000;
    const drift = observed - predicted;
    const stateChanged = !!localPlaying !== !!nextPlaying;
    const pausedMove = !nextPlaying && Math.abs(drift) > .08;
    const snapped = force || stateChanged || pausedMove || Math.abs(drift) > .9;
    if (snapped) return { position: observed, atMs: observedAtMs, drift, sampleAgeMs, snapped: true };
    // Spotify's position is sampled through an external process and can wobble
    // by a few frames. Ignore tiny errors and gently absorb larger ones instead
    // of making every lyric jump once per poll.
    if (Math.abs(drift) < .04) return { position: predicted, atMs: observedAtMs, drift, sampleAgeMs, snapped: false };
    const correction = Math.max(-.14, Math.min(.14, drift * .28));
    return { position: Math.max(0, predicted + correction), atMs: observedAtMs, drift, sampleAgeMs, snapped: false };
  }

  return { reconcilePlaybackClock };
});
