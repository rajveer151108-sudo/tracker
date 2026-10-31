(function exposeAudioStructure(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AudioStructure = api;
})(typeof globalThis === "object" ? globalThis : this, function audioStructureFactory() {
  const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
  const follow = (current, target, tau, dt) => current + (target - current) * (1 - Math.exp(-dt / Math.max(.01, tau)));

  function normaliseProfile(input, length) {
    const profile = Array.from({ length }, (_, index) => Math.max(0, Number(input?.[index]) || 0));
    const total = profile.reduce((sum, value) => sum + value, 0);
    return total > .0001 ? profile.map((value) => value / total) : profile.map(() => 0);
  }

  function profileDistance(a = [], b = []) {
    const length = Math.max(a.length, b.length);
    if (!length) return 0;
    let distance = 0;
    for (let index = 0; index < length; index++) distance += Math.abs((a[index] || 0) - (b[index] || 0));
    return clamp01(distance / 2);
  }

  function normaliseBands(input) {
    return normaliseProfile(input, 5);
  }

  function createAudioStructureDetector() {
    let state;

    function reset(nowMs = 0) {
      state = {
        startedAt: nowMs, lastSwitchAt: nowMs, elapsed: 0, contrastHold: 0,
        shortBands: [0, 0, 0, 0, 0], longBands: [0, 0, 0, 0, 0],
        shortLoudness: 0, longLoudness: 0, shortVocal: 0, longVocal: 0,
        shortRawLoudness: 0, longRawLoudness: 0, rawLoudnessPeak: 0,
        shortChroma: Array(12).fill(0), longChroma: Array(12).fill(0),
        shortDrums: Array(4).fill(0), longDrums: Array(4).fill(0),
        shortTonality: 0, longTonality: 0,
        quietHold: 0, quietMinimum: 1, quietArmedUntil: 0, reentry: 0,
        switchUp: 0, switchDown: 0, lastBeatAt: 0, beatInterval: 0, beatConfidence: 0,
      };
    }

    function update(frame = {}, nowMs = 0, dt = .033) {
      if (!state) reset(nowMs);
      dt = Math.max(.005, Math.min(.2, Number(dt) || .033));
      state.elapsed += dt;
      const bands = normaliseBands(frame.bands);
      const loudness = clamp01(frame.loudness);
      const rawLoudness = Math.max(0, Number(frame.rawLoudness) || 0);
      const vocal = clamp01(frame.vocal);
      const chroma = normaliseProfile(frame.chroma, 12);
      const drums = [frame.drums?.kick, frame.drums?.snare, frame.drums?.hat, frame.drums?.onset].map(clamp01);
      const tonality = clamp01(frame.tonality);
      const hasHarmony = Array.isArray(frame.chroma);
      const hasDrums = !!frame.drums;
      const hasProductionFeatures = hasHarmony || hasDrums;
      const firstFrame = state.elapsed <= dt + .001;
      if (firstFrame) {
        state.shortBands = bands.slice(); state.longBands = bands.slice();
        state.shortChroma = chroma.slice(); state.longChroma = chroma.slice();
        state.shortDrums = drums.slice(); state.longDrums = drums.slice();
        state.shortLoudness = state.longLoudness = loudness;
        state.shortRawLoudness = state.longRawLoudness = rawLoudness;
        state.rawLoudnessPeak = rawLoudness;
        state.shortVocal = state.longVocal = vocal;
        state.shortTonality = state.longTonality = tonality;
      } else {
        for (let index = 0; index < bands.length; index++) {
          state.shortBands[index] = follow(state.shortBands[index], bands[index], .34, dt);
          state.longBands[index] = follow(state.longBands[index], bands[index], 5.2, dt);
        }
        for (let index = 0; index < chroma.length; index++) {
          state.shortChroma[index] = follow(state.shortChroma[index], chroma[index], .48, dt);
          state.longChroma[index] = follow(state.longChroma[index], chroma[index], 7.4, dt);
        }
        for (let index = 0; index < drums.length; index++) {
          state.shortDrums[index] = follow(state.shortDrums[index], drums[index], .42, dt);
          state.longDrums[index] = follow(state.longDrums[index], drums[index], 6.2, dt);
        }
        state.shortLoudness = follow(state.shortLoudness, loudness, .3, dt);
        state.longLoudness = follow(state.longLoudness, loudness, 4.4, dt);
        state.shortRawLoudness = follow(state.shortRawLoudness, rawLoudness, .18, dt);
        state.longRawLoudness = follow(state.longRawLoudness, rawLoudness, 6.8, dt);
        state.rawLoudnessPeak = Math.max(rawLoudness, state.rawLoudnessPeak * Math.exp(-dt / 18));
        state.shortVocal = follow(state.shortVocal, vocal, .42, dt);
        state.longVocal = follow(state.longVocal, vocal, 4.8, dt);
        state.shortTonality = follow(state.shortTonality, tonality, .65, dt);
        state.longTonality = follow(state.longTonality, tonality, 7.2, dt);
      }

      if (frame.beat && nowMs - state.lastBeatAt > 140) {
        const interval = state.lastBeatAt ? nowMs - state.lastBeatAt : 0;
        state.lastBeatAt = nowMs;
        if (interval >= 180 && interval <= 1500) {
          state.beatInterval = state.beatInterval ? follow(state.beatInterval, interval, 1.8, dt) : interval;
          state.beatConfidence = Math.min(1, state.beatConfidence + .13);
        }
      } else {
        state.beatConfidence = Math.max(0, state.beatConfidence - dt * .018);
      }

      const timbreDistance = state.shortBands.reduce((sum, value, index) => sum + Math.abs(value - state.longBands[index]), 0) / 2;
      const loudnessDelta = state.shortLoudness - state.longLoudness;
      const rawLoudnessDelta = state.shortRawLoudness - state.longRawLoudness;
      const rawPresence = state.rawLoudnessPeak > .002
        ? clamp01(rawLoudness / Math.max(.002, state.rawLoudnessPeak * .82))
        : loudness;
      const vocalDelta = state.shortVocal - state.longVocal;
      const timbreEvidence = clamp01(timbreDistance * 4.15);
      const loudnessEvidence = clamp01(Math.abs(loudnessDelta) * 2.45
        + Math.min(1, Math.abs(rawLoudnessDelta) / Math.max(.008, state.longRawLoudness)) * .48);
      const vocalEvidence = clamp01(Math.abs(vocalDelta) * 2.35);
      const drumDistance = state.shortDrums.reduce((sum, value, index) => sum
        + Math.abs(value - state.longDrums[index]), 0) / state.shortDrums.length;
      const drumChange = clamp01(drumDistance * 3.15);
      const tonalTrust = Math.max(.18, Math.min(1, (state.shortTonality + state.longTonality) * .72));
      const harmonyChange = clamp01(profileDistance(state.shortChroma, state.longChroma) * 2.15 * tonalTrust);
      const productionLayers = [timbreEvidence, loudnessEvidence, drumChange, harmonyChange, vocalEvidence];
      const rankedLayers = productionLayers.slice().sort((a, b) => b - a);
      const activeLayerCount = productionLayers.filter((value) => value > .34).length;
      const productionAgreement = clamp01((rankedLayers[0] + rankedLayers[1] + rankedLayers[2] - 1.02) / 1.45);
      // In a near-silent passage, normalising frequency bands amplifies noise
      // into a fake timbre change. Presence weighting keeps that noise from
      // masquerading as a new arrangement.
      const timbrePresence = .24 + rawPresence * .76;
      const contrast = clamp01(timbreDistance * 3.25 * timbrePresence
        + Math.abs(loudnessDelta) * 1.45
        + Math.min(1, Math.abs(rawLoudnessDelta) / Math.max(.008, state.longRawLoudness)) * .52
        + Math.abs(vocalDelta) * .55
        + drumChange * .22
        + harmonyChange * .16);
      const direction = loudnessDelta * 1.25
        + (state.shortBands[0] - state.longBands[0]) * .72
        + (state.shortBands[1] - state.longBands[1]) * .42
        + vocalDelta * .22;

      // Arrangement returns need memory. A frame-level contrast detector can
      // see the quiet passage and the return, but it cannot know they belong
      // together. Hold the low-energy state long enough to arm one deliberate
      // re-entry cue, then release it on the first convincing recovery.
      const warmedUp = state.elapsed > 3.5;
      const lowRelativeToHistory = rawPresence < .43
        && (state.longRawLoudness < .004 || rawLoudness < state.longRawLoudness * .72);
      const lowActivityNow = warmedUp && lowRelativeToHistory && loudness < .62;
      if (lowActivityNow) {
        state.quietHold = Math.min(8, state.quietHold + dt);
        state.quietMinimum = Math.min(state.quietMinimum, rawLoudness);
      } else {
        state.quietHold = Math.max(0, state.quietHold - dt * .7);
      }
      if (state.quietHold > 1.05) state.quietArmedUntil = nowMs + 12000;
      const quietArmed = nowMs < state.quietArmedUntil;
      const recoveredFromQuiet = quietArmed
        && rawPresence > .68
        && loudness > .66
        && rawLoudness > Math.max(.006, state.quietMinimum * 1.75)
        && (rawLoudness > state.longRawLoudness * 1.12 || frame.beat)
        && (!hasProductionFeatures || drums[3] > .18 || productionAgreement > .28);
      if (recoveredFromQuiet) {
        state.reentry = 1;
        state.switchUp = 1;
        state.lastSwitchAt = nowMs;
        state.quietArmedUntil = 0;
        state.quietHold = 0;
        state.quietMinimum = 1;
      }

      // A real arrangement change persists for several analysis frames. A
      // single kick or snare changes the spectrum briefly and never fills this
      // hold, which keeps the detector active without becoming random.
      const productionLayerMoved = drumChange > .28 || harmonyChange > .3;
      const productionConsensus = !hasProductionFeatures || (productionLayerMoved
        && ((activeLayerCount >= 3 && productionAgreement > .28)
          || (activeLayerCount >= 2 && productionAgreement > .62 && loudnessEvidence > .45)));
      if (contrast > .43 && productionConsensus) state.contrastHold = Math.min(1.5, state.contrastHold + dt);
      else state.contrastHold = Math.max(0, state.contrastHold - dt * 1.8);
      const cooledDown = nowMs - state.lastSwitchAt > 6200;
      const requiredHold = hasProductionFeatures ? .46 : .34;
      if (warmedUp && cooledDown && state.contrastHold > requiredHold) {
        if (direction < -.035) state.switchDown = 1;
        else state.switchUp = 1;
        state.lastSwitchAt = nowMs;
        state.contrastHold = 0;
        // Rebase partway toward the new arrangement so one switch creates one
        // decision instead of repeatedly firing while the long window catches up.
        for (let index = 0; index < bands.length; index++) {
          state.longBands[index] = state.longBands[index] * .55 + state.shortBands[index] * .45;
        }
        for (let index = 0; index < chroma.length; index++) {
          state.longChroma[index] = state.longChroma[index] * .55 + state.shortChroma[index] * .45;
        }
        for (let index = 0; index < drums.length; index++) {
          state.longDrums[index] = state.longDrums[index] * .55 + state.shortDrums[index] * .45;
        }
        state.longLoudness = state.longLoudness * .55 + state.shortLoudness * .45;
        state.longVocal = state.longVocal * .55 + state.shortVocal * .45;
      }
      state.switchUp *= Math.exp(-dt / .72);
      state.switchDown *= Math.exp(-dt / .72);
      state.reentry *= Math.exp(-dt / .9);

      const bpm = state.beatInterval > 0 ? 60000 / state.beatInterval : 0;
      return {
        contrast,
        timbreShift: clamp01(timbreDistance * 4),
        loudnessTrend: Math.max(-1, Math.min(1, loudnessDelta * 2.4
          + rawLoudnessDelta / Math.max(.008, state.longRawLoudness) * .45)),
        vocalTrend: Math.max(-1, Math.min(1, vocalDelta * 2.5)),
        switchUp: state.switchUp,
        switchDown: state.switchDown,
        lowActivity: clamp01((.55 - rawPresence) / .36),
        quietHold: clamp01(state.quietHold / 2.2),
        reentry: state.reentry,
        drumChange,
        harmonyChange,
        productionAgreement,
        tonality: state.shortTonality,
        onsetDensity: state.shortDrums[3],
        beatConfidence: state.beatConfidence,
        bpm: bpm >= 40 && bpm <= 240 ? bpm : 0,
      };
    }

    reset();
    return { reset, update };
  }

  return { createAudioStructureDetector, normaliseBands, normaliseProfile, profileDistance };
});
