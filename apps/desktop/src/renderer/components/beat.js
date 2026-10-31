// =====================================================================
  // Beat reaction: listens to system audio, finds bass hits, pulses the UI + screen glow
  // =====================================================================
  let audioCtx = null, analyser = null, freq = null, wave = null, previousSpectrum = null, productionSpectrum = null, beatStream = null;
  let productionSpectrumReady = false;
  let beatOn = false, beatStarting = false;
  let pulse = 0, avgBass = 0, lastBeat = 0, outLevel = 0, lastSend = 0, lastBass = 0, peak = 0;
  let motionEnergy = 0, motionVocal = 0, motionLift = 0, motionSyllable = 0, motionPhrase = 0, motionSibilance = 0;
  let energyPeak = 0.08, vocalPeak = 0.08, vocalFloor = 0.015, fluxPeak = 0.025;
  let vocalTextureBaseline = null;
  let motionShort = 0, motionLong = 0, motionBuild = 0, motionDuck = 0, dropFlash = 0, dropArmedUntil = 0;
  const audioStructureDetector = window.AudioStructure.createAudioStructureDetector();
  let structureContrast = 0, structureTimbreShift = 0, structureSwitchUp = 0, structureSwitchDown = 0;
  let structureProductionSwitch = 0, structureSwitchConfidence = 0, structureArrangementLift = 0;
  let structureTimbreEvidence = 0, structureLoudnessEvidence = 0;
  let structureLowActivity = 0, structureQuietHold = 0, structureQuietConfidence = 0, structureReentry = 0;
  let audioLoudnessTrend = 0, audioVocalTrend = 0, audioVocalLayering = 0, audioBeatConfidence = 0, audioBpm = 0, audioBassLevel = 0, audioFluxLevel = 0;
  let audioDrumChange = 0, audioHarmonyChange = 0, audioProductionAgreement = 0, audioTonality = 0, audioOnsetDensity = 0;
  let lyricMotionLife = 0, lyricMotionEmotion = 0, lyricWordPace = 0;
  let lyricWordAttack = 0, lyricWordSustain = 0, lyricTimingConfidence = 0;
  const motionStyleCache = new Map();
  function setMotionStyle(name, value) {
    if (motionStyleCache.get(name) === value) return;
    motionStyleCache.set(name, value);
    root.style.setProperty(name, value);
  }

  const MOTION_PROFILES = {
    rap:        { impact: 1.25, energy: .85, vocal: 1.0,  lift: .6,  build: .75, drop: 1.25, sway: .08, shake: .12, rate: 1.2 },
    rnb:        { impact: 0,    energy: .78, vocal: 1.35, lift: 1.45, build: .7, drop: .2,   sway: .46, shake: 0,   rate: .5 },
    jazz:       { impact: .55,  energy: .72, vocal: 1.1,  lift: 1.2,  build: .7,  drop: .5,   sway: .7,  shake: .03, rate: .8 },
    rock:       { impact: 1.15, energy: 1.2, vocal: 1.0,  lift: .8,  build: .9,  drop: 1.15, sway: .12, shake: 1,   rate: 1.35 },
    electronic: { impact: 1.35, energy: 1.1, vocal: .6,   lift: .9,  build: 1.35, drop: 1.5, sway: .05, shake: .25, rate: 1.4 },
    pop:        { impact: 1.0,  energy: 1.0, vocal: 1.05, lift: 1.0,  build: 1.0, drop: 1.0, sway: .2,  shake: .08, rate: 1.0 },
    other:      { impact: .9,   energy: .95, vocal: 1.0,  lift: 1.0,  build: .9,  drop: .9,  sway: .25, shake: .05, rate: .8 },
  };

  function motionProfile() {
    if (!settings.genreFeel) return MOTION_PROFILES.other;
    return MOTION_PROFILES[document.body.dataset.genre] || MOTION_PROFILES.other;
  }

  function setBeatStatus(text) { const el = $("status_beat"); if (el) el.textContent = text || ""; }

  function resetAudioStructureAnalysis() {
    audioStructureDetector.reset(performance.now());
    structureContrast = structureTimbreShift = structureSwitchUp = structureSwitchDown = 0;
    structureProductionSwitch = structureSwitchConfidence = structureArrangementLift = structureTimbreEvidence = structureLoudnessEvidence = 0;
    structureLowActivity = structureQuietHold = structureQuietConfidence = structureReentry = 0;
    audioLoudnessTrend = audioVocalTrend = audioVocalLayering = audioBeatConfidence = audioBpm = audioBassLevel = audioFluxLevel = 0;
    audioDrumChange = audioHarmonyChange = audioProductionAgreement = audioTonality = audioOnsetDensity = 0;
    vocalTextureBaseline = null;
    productionSpectrumReady = false;
    if (previousSpectrum) previousSpectrum.fill(0);
    if (productionSpectrum) productionSpectrum.fill(0);
  }

  async function startBeat(requestPermission = false) {
    if (beatOn || beatStarting) return;
    beatStarting = true;
    setBeatStatus("Starting\u2026");
    try {
      const permission = await window.tracker.screenCaptureStatus();
      if (!requestPermission && permission !== "granted") {
        setBeatStatus("Ready \u00B7 turn Beat Reaction off and on when you want to grant access");
        return;
      }
      const sourceId = await window.tracker.systemAudioSource();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            maxWidth: 320,
            maxHeight: 240,
            maxFrameRate: 1,
          },
        },
      });
      stream.getVideoTracks().forEach((t) => t.stop());          // we only want the sound
      const tracks = stream.getAudioTracks();
      if (!tracks.length) throw new Error("No audio came through. Check the permission in System Settings, then restart the app.");
      audioCtx = new AudioContext();
      await audioCtx.resume();
      const src = audioCtx.createMediaStreamSource(new MediaStream(tracks));
      analyser = audioCtx.createAnalyser();
      // 2048 samples keep live analysis inexpensive while giving the harmonic
      // profile enough resolution to distinguish chord colour and drum bands.
      analyser.fftSize = 2048;
      analyser.minDecibels = -95;
      analyser.maxDecibels = -10;                                  // more headroom, so loud songs don't max out
      analyser.smoothingTimeConstant = 0.45;
      src.connect(analyser);                                      // not connected to speakers, so no echo
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
      previousSpectrum = new Float32Array(analyser.frequencyBinCount);
      productionSpectrum = new Float32Array(analyser.frequencyBinCount);
      beatStream = stream;
      tracks[0].addEventListener("ended", () => stopBeat("Audio stopped"));
      beatOn = true;
      resetAudioStructureAnalysis();
      setBeatStatus("Listening");
    } catch (e) {
      beatOn = false;
      setBeatStatus("Couldn't start: " + (e && e.name ? e.name + " " : "") + (e && e.message ? e.message : e) +
        " (turn Beat Reaction off and on to retry)");
    } finally {
      beatStarting = false;
    }
  }

  function stopBeat(msg) {
    beatOn = false;
    try { if (beatStream) beatStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { if (audioCtx) audioCtx.close(); } catch (e) {}
    beatStream = null; audioCtx = null; analyser = null; freq = null; wave = null; previousSpectrum = null; productionSpectrum = null;
    motionEnergy = motionVocal = motionLift = motionSyllable = motionPhrase = motionSibilance = motionShort = motionLong = motionBuild = motionDuck = dropFlash = pulse = outLevel = 0;
    structureContrast = structureTimbreShift = structureSwitchUp = structureSwitchDown = structureProductionSwitch = structureSwitchConfidence = structureArrangementLift = structureTimbreEvidence = structureLoudnessEvidence = structureLowActivity = structureQuietHold = structureQuietConfidence = structureReentry = audioLoudnessTrend = audioVocalTrend = audioVocalLayering = audioBeatConfidence = audioBpm = audioBassLevel = audioFluxLevel = 0;
    audioDrumChange = audioHarmonyChange = audioProductionAgreement = audioTonality = audioOnsetDensity = 0;
    vocalTextureBaseline = null;
    resetAudioStructureAnalysis();
    window.tracker.sendBeat(applyMusicMotion({ impact: 0, energy: 0, vocal: 0, lift: 0, word: 0, pace: 0,
      build: 0, duck: 0, drop: 0, emotion: 0, syllable: 0, phrase: 0, sibilance: 0 }));
    setBeatStatus(msg || "");
  }

  // live sound level in the settings row, so you can see whether audio is reaching the app
  setInterval(() => {
    if (beatOn && $("settings").classList.contains("open")) {
      setBeatStatus("Listening \u00B7 voice " + Math.round(motionVocal * 100) + "% \u00B7 energy " + Math.round(motionEnergy * 100) + "% \u00B7 structure " + Math.round(structureContrast * 100) + "%");
    }
  }, 300);

  function clampMotion(value) { return Math.max(0, Math.min(1.5, Number(value) || 0)); }

  function follow(current, target, attack, release, dt) {
    const tau = target > current ? attack : release;
    return current + (target - current) * (1 - Math.exp(-dt / Math.max(0.01, tau)));
  }

  function bandLevel(fromHz, toHz, binHz) {
    const lo = Math.max(1, Math.floor(fromHz / binHz));
    const hi = Math.min(freq.length - 1, Math.max(lo, Math.ceil(toHz / binHz)));
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += freq[i];
    return sum / Math.max(1, (hi - lo + 1) * 255);
  }

  // A lightweight production profile: positive spectral flux estimates kick,
  // snare and hi-hat activity, while a 12-bin pitch-class profile follows the
  // harmonic/chord colour of the full mix. These are evidence channels, not
  // isolated stems; Director only trusts them when several layers agree.
  function productionFeatures(binHz, beatHit) {
    const chroma = Array(12).fill(0);
    let totalMagnitude = 0, tonalMagnitude = 0;
    let kickFlux = 0, kickBins = 0, snareFlux = 0, snareBins = 0;
    let hatFlux = 0, hatBins = 0, onsetFlux = 0, onsetBins = 0;
    for (let index = 1; index < freq.length; index++) {
      const hz = index * binHz;
      const value = freq[index] / 255;
      const before = productionSpectrumReady ? productionSpectrum[index] : value;
      const positive = Math.max(0, value - before);
      productionSpectrum[index] = value;
      if (hz >= 35 && hz <= 180) { kickFlux += positive; kickBins++; }
      if ((hz >= 170 && hz <= 520) || (hz >= 1500 && hz <= 5200)) { snareFlux += positive; snareBins++; }
      if (hz >= 5200 && hz <= 12000) { hatFlux += positive; hatBins++; }
      if (hz >= 35 && hz <= 12000) { onsetFlux += positive; onsetBins++; }
      if (hz < 80 || hz > 5000) continue;
      const left = freq[Math.max(1, index - 2)] / 255;
      const right = freq[Math.min(freq.length - 1, index + 2)] / 255;
      const localFloor = (left + right) * .5;
      const prominence = Math.max(0, value - localFloor * .82);
      const midi = 69 + 12 * Math.log2(hz / 440);
      const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
      const weight = prominence * (1 / (1 + hz / 4200));
      chroma[pitchClass] += weight;
      totalMagnitude += value;
      tonalMagnitude += prominence;
    }
    productionSpectrumReady = true;
    const chromaTotal = chroma.reduce((sum, value) => sum + value, 0);
    if (chromaTotal > .0001) for (let index = 0; index < chroma.length; index++) chroma[index] /= chromaTotal;
    const meanFlux = (sum, count, scale) => clamp01(sum / Math.max(1, count) * scale);
    const kick = Math.max(meanFlux(kickFlux, kickBins, 9.5), beatHit ? .72 : 0);
    const onset = Math.max(meanFlux(onsetFlux, onsetBins, 11), beatHit ? .5 : 0);
    return {
      chroma,
      tonality: clamp01((tonalMagnitude / Math.max(.001, totalMagnitude) - .035) / .24),
      drums: {
        kick,
        snare: meanFlux(snareFlux, snareBins, 12),
        hat: meanFlux(hatFlux, hatBins, 14),
        onset,
      },
    };
  }

  // This is intentionally a voice-aware mix analyser, not a claim of stem
  // separation. Vocal body, formants and consonant presence are balanced
  // against bass dominance and broadband noise; spectral flux then finds
  // syllable attacks without turning every kick into a lyric pulse.
  function vocalFeatures(binHz, bass) {
    const body = bandLevel(180, 720, binHz);
    const formant = bandLevel(720, 2400, binHz);
    const presence = bandLevel(2400, 5200, binHz);
    const air = bandLevel(5200, 9000, binHz);
    const lo = Math.max(1, Math.floor(180 / binHz));
    const hi = Math.min(freq.length - 1, Math.ceil(5200 / binHz));
    let logSum = 0, arithmetic = 0, flux = 0, count = 0;
    for (let i = lo; i <= hi; i++) {
      const value = freq[i] / 255;
      const before = previousSpectrum ? previousSpectrum[i] : value;
      const weight = i * binHz < 420 ? .55 : i * binHz > 3800 ? .72 : 1;
      flux += Math.max(0, value - before) * weight;
      arithmetic += value;
      logSum += Math.log(Math.max(.0001, value));
      if (previousSpectrum) previousSpectrum[i] = value;
      count++;
    }
    const mean = arithmetic / Math.max(1, count);
    const flatness = mean > .0001 ? Math.exp(logSum / Math.max(1, count)) / mean : 1;
    const balance = Math.min(1, Math.min(body, formant) / Math.max(.015, Math.max(body, formant)) * 1.45);
    const tonal = Math.max(.45, 1 - Math.max(0, flatness - .5) * 1.05);
    const bassPenalty = Math.max(0, bass - (body + formant) * .48) * .32;
    const raw = Math.max(0, (body * .33 + formant * .43 + presence * .24) * (.68 + balance * .32) * tonal - bassPenalty);
    const vocalMax = Math.max(.015, body, formant, presence);
    const broadness = Math.min(body, formant, presence * 1.3) / vocalMax;
    const spectralTexture = clamp01(1 - Math.abs(flatness - .28) / .36);
    const noisePenalty = Math.max(0, flatness - .62) * .8;
    const richness = clamp01((broadness - .16) * 1.25 + balance * .22 + spectralTexture * .18
      - bassPenalty * 1.8 - noisePenalty);
    return { raw, flux: flux / Math.max(1, count), presence, air, richness };
  }

  function applyMusicMotion(motion) {
    const legacyEnabled = settings.musicMotion !== false;
    const lyricsEnabled = settings.lyricsDance == null ? legacyEnabled : !!settings.lyricsDance;
    const glowEnabled = settings.glowDance == null ? legacyEnabled : !!settings.glowDance;
    const baseStrength = (settings.motionStrength == null ? 100 : settings.motionStrength) / 100;
    const strength = lyricsEnabled ? baseStrength : 0;
    const glowStrength = glowEnabled ? baseStrength : 0;
    const energy = clampMotion(motion.energy * strength);
    const vocal = clampMotion(motion.vocal * strength);
    const lift = clampMotion(motion.lift * strength);
    const build = clampMotion(motion.build * strength);
    const duck = clampMotion(motion.duck * strength);
    const drop = clampMotion(motion.drop * strength);
    const emotion = clampMotion(motion.emotion * strength);
    const syllable = clampMotion(motion.syllable * strength);
    const phrase = clampMotion(motion.phrase * strength);
    const sibilance = clampMotion(motion.sibilance * strength);
    const sway = Math.max(-1, Math.min(1, Number(motion.sway) || 0)) * Math.min(1.5, strength);
    const shake = Math.max(-1.5, Math.min(1.5, Number(motion.shake) || 0)) * Math.min(1.5, strength);
    setMotionStyle("--motion-energy", energy.toFixed(3));
    setMotionStyle("--motion-vocal", vocal.toFixed(3));
    setMotionStyle("--motion-lift", lift.toFixed(3));
    setMotionStyle("--motion-build", build.toFixed(3));
    setMotionStyle("--motion-duck", duck.toFixed(3));
    setMotionStyle("--motion-drop", drop.toFixed(3));
    setMotionStyle("--motion-emotion", emotion.toFixed(3));
    setMotionStyle("--motion-syllable", syllable.toFixed(3));
    setMotionStyle("--motion-phrase", phrase.toFixed(3));
    setMotionStyle("--motion-sibilance", sibilance.toFixed(3));
    setMotionStyle("--motion-word", clampMotion(motion.word * strength).toFixed(3));
    setMotionStyle("--motion-sway", sway.toFixed(3));
    setMotionStyle("--motion-shake", shake.toFixed(3));
    setMotionStyle("--motion-pace", clampMotion(motion.pace * strength).toFixed(3));
    setMotionStyle("--lyrics-pulse", (lyricsEnabled ? clampMotion(motion.impact * strength) : 0).toFixed(3));
    const forGlow = (value) => clampMotion(value * glowStrength);
    const glowEnergy = forGlow(motion.energy);
    const glowVocal = forGlow(motion.vocal);
    const glowDrop = forGlow(motion.drop);
    setMotionStyle("--glow-motion-energy", glowEnergy.toFixed(3));
    setMotionStyle("--glow-motion-vocal", glowVocal.toFixed(3));
    setMotionStyle("--glow-motion-drop", glowDrop.toFixed(3));
    return { impact: forGlow(motion.impact), energy: glowEnergy, vocal: glowVocal, lift: forGlow(motion.lift),
      build: forGlow(motion.build), duck: forGlow(motion.duck), drop: glowDrop, emotion: forGlow(motion.emotion),
      syllable: forGlow(motion.syllable), phrase: forGlow(motion.phrase), sibilance: forGlow(motion.sibilance),
      word: forGlow(motion.word), pace: forGlow(motion.pace), sway: (Number(motion.sway) || 0) * Math.min(1.5, glowStrength) };
  }

  function beatStep(tNow, dt) {
    if (!beatOn || !analyser) {
      if (outLevel !== 0) {
        outLevel = 0; pulse = 0;
        root.style.setProperty("--pulse", "0");
        window.tracker.sendBeat(applyMusicMotion({ impact: 0, energy: 0, vocal: 0, lift: 0, word: 0 }));
      }
      return;
    }
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
    const binHz = audioCtx.sampleRate / analyser.fftSize;
    const bass = bandLevel(38, 170, binHz);
    const voice = vocalFeatures(binHz, bass);
    let squareSum = 0;
    for (const sample of wave) { const x = (sample - 128) / 128; squareSum += x * x; }
    const rms = Math.sqrt(squareSum / Math.max(1, wave.length));
    lastBass = bass;

    peak = Math.max(bass, peak * Math.exp(-dt / 5));             // adaptive bass ceiling
    const norm = peak > 0.04 ? bass / peak : 0;                   // bass relative to that, 0..1
    avgBass = follow(avgBass, norm, 0.45, 0.8, dt);               // slow running average
    const rise = norm - avgBass;                                  // how far above normal right now
    let beatHit = false;
    if (rise > 0.10 && norm > 0.5 && tNow - lastBeat > 160) { pulse = 1; lastBeat = tNow; beatHit = true; }
    pulse *= Math.exp(-dt / 0.16);                                // each hit fades out over ~0.16s
    const production = productionFeatures(binHz, beatHit);

    const profile = motionProfile();
    const k = (settings.beatStrength || 100) / 100 * feel.beat;
    outLevel = Math.min(1.4, (pulse * 0.9 + Math.max(0, rise) * 0.8) * k);
    root.style.setProperty("--pulse", (outLevel * profile.impact).toFixed(3));

    energyPeak = Math.max(rms, energyPeak * Math.exp(-dt / 6));
    vocalFloor = follow(vocalFloor, voice.raw, voice.raw < vocalFloor ? .45 : 8, voice.raw < vocalFloor ? .45 : 8, dt);
    vocalPeak = Math.max(voice.raw, vocalPeak * Math.exp(-dt / 4.5));
    fluxPeak = Math.max(voice.flux, fluxPeak * Math.exp(-dt / 2.2));
    const energyTarget = energyPeak > 0.025 ? Math.min(1, rms / energyPeak) : 0;
    const vocalRange = Math.max(.018, vocalPeak - vocalFloor * .55);
    const timingGate = .72 + Math.max(lyricMotionLife, lyricMotionEmotion) * .28;
    const vocalTarget = clamp01((voice.raw - vocalFloor * .55) / vocalRange) * timingGate;
    if (!Number.isFinite(vocalTextureBaseline)) vocalTextureBaseline = voice.richness;
    const richnessContrast = Math.max(0, voice.richness - vocalTextureBaseline);
    // A stacked vocal should become broader than this song's own vocal
    // baseline. The small absolute fallback can support that evidence but can
    // never trigger the Director by itself, which protects rich solo voices.
    const layeringTarget = Math.max(
      clamp01((richnessContrast - .07) / .22),
      clamp01((voice.richness - .88) / .12) * .28,
    ) * vocalTarget;
    vocalTextureBaseline = follow(vocalTextureBaseline, voice.richness, 10, 1.8, dt);
    audioVocalLayering = follow(audioVocalLayering, layeringTarget, .32, .72, dt);
    const audioSyllable = fluxPeak > .002 ? clamp01(voice.flux / fluxPeak * 1.18 - .16) * (.36 + vocalTarget * .64) : 0;
    // Exact lyric timing gives us a clean word attack even when a soft vocal is
    // hidden under drums. Audio still leads; timing only reinforces it.
    const timedAttack = lyricWordAttack * lyricTimingConfidence * (.42 + vocalTarget * .58);
    const syllableTarget = Math.max(audioSyllable, timedAttack * .78);
    const sibilanceRaw = voice.presence * .68 + voice.air * .32;
    const sibilanceTarget = clamp01(sibilanceRaw / Math.max(.035, vocalPeak * 1.22)) * vocalTarget;

    // A brightness centroid over the vocal/melodic range follows upward and
    // downward movement in the whole mix without pretending to isolate vocals.
    const centLo = Math.max(1, Math.floor(180 / binHz));
    const centHi = Math.min(freq.length - 1, Math.ceil(5200 / binHz));
    let weighted = 0, magnitude = 0;
    for (let i = centLo; i <= centHi; i++) {
      const value = freq[i] / 255;
      weighted += i * binHz * value;
      magnitude += value;
    }
    const centroid = magnitude > 0.01 ? weighted / magnitude : 180;
    const liftTarget = Math.max(0, Math.min(1, (centroid - 450) / 2400)) * vocalTarget;
    const structure = audioStructureDetector.update({
      bands: [bass, bandLevel(170, 520, binHz), bandLevel(520, 1800, binHz), bandLevel(1800, 5200, binHz), bandLevel(5200, 10000, binHz)],
      loudness: energyTarget,
      rawLoudness: rms,
      vocal: vocalTarget,
      beat: beatHit,
      chroma: production.chroma,
      tonality: production.tonality,
      drums: production.drums,
    }, tNow, dt);
    structureContrast = structure.contrast;
    structureTimbreShift = structure.timbreShift;
    structureSwitchUp = structure.switchUp;
    structureSwitchDown = structure.switchDown;
    structureProductionSwitch = structure.productionSwitch;
    structureSwitchConfidence = structure.switchConfidence;
    structureArrangementLift = structure.arrangementLift;
    structureTimbreEvidence = structure.timbreEvidence;
    structureLoudnessEvidence = structure.loudnessEvidence;
    structureLowActivity = structure.lowActivity;
    structureQuietHold = structure.quietHold;
    structureQuietConfidence = structure.quietConfidence;
    structureReentry = structure.reentry;
    audioLoudnessTrend = structure.loudnessTrend;
    audioVocalTrend = structure.vocalTrend;
    audioBeatConfidence = structure.beatConfidence;
    audioBpm = structure.bpm;
    audioBassLevel = norm;
    audioFluxLevel = syllableTarget;
    audioDrumChange = structure.drumChange;
    audioHarmonyChange = structure.harmonyChange;
    audioProductionAgreement = structure.productionAgreement;
    audioTonality = structure.tonality;
    audioOnsetDensity = structure.onsetDensity;
    motionEnergy = follow(motionEnergy, energyTarget, 0.045, 0.22, dt);
    motionVocal = follow(motionVocal, vocalTarget, 0.07, 0.28, dt);
    motionLift = follow(motionLift, liftTarget, 0.09, 0.3, dt);
    motionSyllable = follow(motionSyllable, syllableTarget, .024, .13, dt);
    motionPhrase = follow(motionPhrase, Math.max(vocalTarget, lyricWordSustain * lyricTimingConfidence * .34), .18, .5, dt);
    motionSibilance = follow(motionSibilance, sibilanceTarget, .035, .18, dt);

    motionShort = follow(motionShort, energyTarget, 0.08, 0.22, dt);
    motionLong = follow(motionLong, energyTarget, 0.9, 1.6, dt);
    const buildTarget = Math.max(0, Math.min(1, (motionShort - motionLong) * 3.2 + motionLift * 0.38));
    motionBuild = follow(motionBuild, buildTarget, 0.18, 0.42, dt);

    // A short valley after rising energy arms a drop. The next strong bass
    // transient gets a larger release than an ordinary beat.
    const preDropDip = motionLong > 0.38 && motionShort < motionLong * 0.68;
    if (preDropDip && (motionBuild > 0.12 || motionLong > 0.58)) dropArmedUntil = tNow + 1800;
    motionDuck = follow(motionDuck, preDropDip ? 1 : 0, 0.05, 0.2, dt);
    if (tNow < dropArmedUntil && rise > 0.14 && norm > 0.7 && energyTarget > motionLong * 0.9) {
      dropFlash = 1;
      dropArmedUntil = 0;
      motionDuck = 0;
    }
    // Structural contrast catches arrangement and beat switches that do not
    // contain the old detector's textbook silence-then-bass-drop pattern.
    if (structureSwitchUp > .35) dropFlash = Math.max(dropFlash, structureSwitchUp * .92);
    if (structureSwitchDown > .35) motionDuck = Math.max(motionDuck, structureSwitchDown * .9);
    dropFlash *= Math.exp(-dt / 0.28);

    const sway = Math.sin(tNow * 0.003 * profile.rate) * profile.sway * motionEnergy;
    const shake = Math.sin(tNow * 0.052) * profile.shake * outLevel;
    const expressiveVocal = lyricMotionEmotion * lyricMotionLife * motionVocal;
    const syncedWordAttack = Math.max(lyricWordAttack * (.58 + motionVocal * .42), motionSyllable * .58);
    const motion = applyMusicMotion({
      impact: outLevel * profile.impact,
      energy: motionEnergy * profile.energy,
      vocal: motionVocal * profile.vocal,
      lift: motionLift * profile.lift,
      build: motionBuild * profile.build,
      duck: motionDuck,
      drop: dropFlash * profile.drop,
      emotion: expressiveVocal,
      syllable: motionSyllable,
      phrase: motionPhrase,
      sibilance: motionSibilance,
      word: syncedWordAttack,
      pace: lyricWordPace,
      sway,
      shake,
    });
    if (tNow - lastSend > 33) { lastSend = tNow; window.tracker.sendBeat(motion); }
  }


