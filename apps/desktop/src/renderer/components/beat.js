// =====================================================================
  // Beat reaction: listens to system audio, finds bass hits, pulses the UI + screen glow
  // =====================================================================
  let audioCtx = null, analyser = null, freq = null, wave = null, beatStream = null;
  let beatOn = false, beatStarting = false;
  let pulse = 0, avgBass = 0, lastBeat = 0, outLevel = 0, lastSend = 0, lastBass = 0, peak = 0;
  let motionEnergy = 0, motionVocal = 0, motionLift = 0, energyPeak = 0.08, vocalPeak = 0.08;
  let lyricMotionLife = 0;

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
      analyser.fftSize = 2048;
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
    motionEnergy = motionVocal = motionLift = pulse = outLevel = 0;
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
    root.style.setProperty("--motion-energy", energy.toFixed(3));
    root.style.setProperty("--motion-vocal", vocal.toFixed(3));
    root.style.setProperty("--motion-lift", lift.toFixed(3));
    return { impact: clampMotion(motion.impact), energy, vocal, lift, word: clampMotion(motion.word) };
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

    const k = (settings.beatStrength || 100) / 100 * feel.beat;
    outLevel = Math.min(1.4, (pulse * 0.9 + Math.max(0, rise) * 0.8) * k);
    root.style.setProperty("--pulse", outLevel.toFixed(3));

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

    const motion = applyMusicMotion({ impact: outLevel, energy: motionEnergy, vocal: motionVocal, lift: motionLift, word: lyricMotionLife });
    if (tNow - lastSend > 33) { lastSend = tNow; window.tracker.sendBeat(motion); }
  }


