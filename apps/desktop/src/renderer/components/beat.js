// =====================================================================
  // Beat reaction: listens to system audio, finds bass hits, pulses the UI + screen glow
  // =====================================================================
  let audioCtx = null, analyser = null, freq = null, beatStream = null;
  let beatOn = false, beatStarting = false;
  let pulse = 0, avgBass = 0, lastBeat = 0, outLevel = 0, lastSend = 0, lastBass = 0, peak = 0;

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
      analyser.fftSize = 1024;
      analyser.minDecibels = -95;
      analyser.maxDecibels = -10;                                  // more headroom, so loud songs don't max out
      analyser.smoothingTimeConstant = 0.45;
      src.connect(analyser);                                      // not connected to speakers, so no echo
      freq = new Uint8Array(analyser.frequencyBinCount);
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
    beatStream = null; audioCtx = null; analyser = null;
    setBeatStatus(msg || "");
  }

  // live sound level in the settings row, so you can see whether audio is reaching the app
  setInterval(() => {
    if (beatOn && $("settings").classList.contains("open")) {
      setBeatStatus("Listening \u00B7 bass level " + Math.round(lastBass * 100) + "% (stays at 0% if no sound reaches the app)");
    }
  }, 300);

  function beatStep(tNow, dt) {
    if (!beatOn || !analyser) {
      if (outLevel !== 0) {
        outLevel = 0; pulse = 0;
        root.style.setProperty("--pulse", "0");
        window.tracker.sendBeat(0);
      }
      return;
    }
    analyser.getByteFrequencyData(freq);
    const binHz = audioCtx.sampleRate / analyser.fftSize;
    const lo = Math.max(1, Math.floor(40 / binHz));
    const hi = Math.max(lo + 1, Math.ceil(170 / binHz));
    let sum = 0;
    for (let i = lo; i <= hi; i++) sum += freq[i];
    const bass = sum / ((hi - lo + 1) * 255);
    lastBass = bass;

    peak = Math.max(bass, peak * 0.9985);                         // loudest recent bass; adapts to how loud the song is
    const norm = peak > 0.04 ? bass / peak : 0;                   // bass relative to that, 0..1
    avgBass = avgBass * 0.96 + norm * 0.04;                       // slow running average
    const rise = norm - avgBass;                                  // how far above normal right now
    if (rise > 0.10 && norm > 0.5 && tNow - lastBeat > 160) { pulse = 1; lastBeat = tNow; }
    pulse *= Math.exp(-dt / 0.16);                                // each hit fades out over ~0.16s

    const k = (settings.beatStrength || 100) / 100 * feel.beat;
    outLevel = Math.min(1.4, (pulse * 0.9 + Math.max(0, rise) * 0.8) * k);
    root.style.setProperty("--pulse", outLevel.toFixed(3));
    if (tNow - lastSend > 33) { lastSend = tNow; window.tracker.sendBeat(outLevel); }
  }


