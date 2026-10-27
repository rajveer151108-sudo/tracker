// =====================================================================
  // Beat reaction: listens to system audio, finds bass hits, pulses the UI + screen glow
  // =====================================================================
  let audioCtx = null, analyser = null, freq = null, wave = null, beatStream = null;
  let beatOn = false, beatStarting = false;
  let pulse = 0, avgBass = 0, lastBeat = 0, outLevel = 0, lastSend = 0, lastBass = 0, peak = 0;
  let motionEnergy = 0, motionVocal = 0, motionLift = 0, energyPeak = 0.08, vocalPeak = 0.08;
  let motionShort = 0, motionLong = 0, motionBuild = 0, motionDuck = 0, dropFlash = 0, dropArmedUntil = 0;
  let lyricMotionLife = 0, lyricMotionEmotion = 0;

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
      // 1024 bins are enough to separate bass, vocals and brightness while
      // halving the transform and time-domain work versus the old 2048 size.
      analyser.fftSize = 1024;
      analyser.minDecibels = -95;
      analyser.maxDecibels = -10;                                  // more headroom, so loud songs don't max out
      analyser.smoothingTimeConstant = 0.45;
      src.connect(analyser);                                      // not connected to speakers, so no echo
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
      beatStream = stream;
      tracks[0].addEventListener("ended", () => stopBeat("Audio stopped"));
      beatOn = true;
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
    beatStream = null; audioCtx = null; analyser = null; freq = null; wave = null;
    motionEnergy = motionVocal = motionLift = motionShort = motionLong = motionBuild = motionDuck = dropFlash = pulse = outLevel = 0;
    applyMusicMotion({ impact: 0, energy: 0, vocal: 0, lift: 0 });
    setBeatStatus(msg || "");
  }

  // live sound level in the settings row, so you can see whether audio is reaching the app
  setInterval(() => {
    if (beatOn && $("settings").classList.contains("open")) {
      setBeatStatus("Listening \u00B7 energy " + Math.round(motionEnergy * 100) + "% \u00B7 lift " + Math.round(motionLift * 100) + "%");
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

  function applyMusicMotion(motion) {
    const enabled = !!settings.musicMotion;
    const strength = enabled ? (settings.motionStrength == null ? 100 : settings.motionStrength) / 100 : 0;
    const energy = clampMotion(motion.energy * strength);
    const vocal = clampMotion(motion.vocal * strength);
    const lift = clampMotion(motion.lift * strength);
    const build = clampMotion(motion.build * strength);
    const duck = clampMotion(motion.duck * strength);
    const drop = clampMotion(motion.drop * strength);
    const emotion = clampMotion(motion.emotion * strength);
    const sway = Math.max(-1, Math.min(1, Number(motion.sway) || 0)) * Math.min(1.5, strength);
    const shake = Math.max(-1.5, Math.min(1.5, Number(motion.shake) || 0)) * Math.min(1.5, strength);
    root.style.setProperty("--motion-energy", energy.toFixed(3));
    root.style.setProperty("--motion-vocal", vocal.toFixed(3));
    root.style.setProperty("--motion-lift", lift.toFixed(3));
    root.style.setProperty("--motion-build", build.toFixed(3));
    root.style.setProperty("--motion-duck", duck.toFixed(3));
    root.style.setProperty("--motion-drop", drop.toFixed(3));
    root.style.setProperty("--motion-emotion", emotion.toFixed(3));
    root.style.setProperty("--motion-sway", sway.toFixed(3));
    root.style.setProperty("--motion-shake", shake.toFixed(3));
    return { impact: clampMotion(motion.impact), energy, vocal, lift, build, duck, drop, emotion,
      word: clampMotion(motion.word), sway };
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
    const vocalRaw = bandLevel(220, 3600, binHz);
    let squareSum = 0;
    for (const sample of wave) { const x = (sample - 128) / 128; squareSum += x * x; }
    const rms = Math.sqrt(squareSum / Math.max(1, wave.length));
    lastBass = bass;

    peak = Math.max(bass, peak * Math.exp(-dt / 5));             // adaptive bass ceiling
    const norm = peak > 0.04 ? bass / peak : 0;                   // bass relative to that, 0..1
    avgBass = follow(avgBass, norm, 0.45, 0.8, dt);               // slow running average
    const rise = norm - avgBass;                                  // how far above normal right now
    if (rise > 0.10 && norm > 0.5 && tNow - lastBeat > 160) { pulse = 1; lastBeat = tNow; }
    pulse *= Math.exp(-dt / 0.16);                                // each hit fades out over ~0.16s

    const profile = motionProfile();
    const k = (settings.beatStrength || 100) / 100 * feel.beat;
    outLevel = Math.min(1.4, (pulse * 0.9 + Math.max(0, rise) * 0.8) * k);
    root.style.setProperty("--pulse", (outLevel * profile.impact).toFixed(3));

    energyPeak = Math.max(rms, energyPeak * Math.exp(-dt / 6));
    vocalPeak = Math.max(vocalRaw, vocalPeak * Math.exp(-dt / 6));
    const energyTarget = energyPeak > 0.025 ? Math.min(1, rms / energyPeak) : 0;
    const vocalTarget = vocalPeak > 0.025 ? Math.min(1, vocalRaw / vocalPeak) : 0;

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
    motionEnergy = follow(motionEnergy, energyTarget, 0.045, 0.22, dt);
    motionVocal = follow(motionVocal, vocalTarget, 0.07, 0.28, dt);
    motionLift = follow(motionLift, liftTarget, 0.09, 0.3, dt);

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
    dropFlash *= Math.exp(-dt / 0.28);

    const sway = Math.sin(tNow * 0.003 * profile.rate) * profile.sway * motionEnergy;
    const shake = Math.sin(tNow * 0.052) * profile.shake * outLevel;
    const expressiveVocal = lyricMotionEmotion * lyricMotionLife * motionVocal;
    const motion = applyMusicMotion({
      impact: outLevel * profile.impact,
      energy: motionEnergy * profile.energy,
      vocal: motionVocal * profile.vocal,
      lift: motionLift * profile.lift,
      build: motionBuild * profile.build,
      duck: motionDuck,
      drop: dropFlash * profile.drop,
      emotion: expressiveVocal,
      word: lyricMotionLife,
      sway,
      shake,
    });
    if (tNow - lastSend > 33) { lastSend = tNow; window.tracker.sendBeat(motion); }
  }


