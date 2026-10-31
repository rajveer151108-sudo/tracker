// =====================================================================
  // Settings. To add a new setting: add a default in main.js, then add a row here.
  // =====================================================================
  const SETTINGS_UI = [
    { type: "heading", label: "Home" },
    { key: "homeMode", label: "Home style", type: "choice",
      hint: "The same music library, rebuilt as three different listening spaces.",
      options: [["arcade", "Arcade"], ["vinyl", "Vinyl player"], ["cd", "CD player"]] },

    { type: "heading", label: "Lyrics" },
    { key: "showLyrics", label: "Show lyrics", type: "toggle" },
    { key: "lyricsWordSource", label: "Use real word timing when available", type: "toggle",
      hint: "Asks community lyric services that have word-by-word timing. Falls back to estimates if none is found." },
    { type: "button", label: "Check lyric sources", hint: "Shows what each lyric service returns for the song that's playing.",
      button: "Run check", action: () => runLyricsDiag() },
    { key: "lyricsHighlight", label: "Highlight", type: "choice",
      hint: "Uses exact word timing when a source provides it, then falls back to a musical estimate.",
      options: [["word", "Word by word"], ["sweep", "Sweep"], ["whole", "Whole line"]] },
    { key: "lyricsLayout", label: "Layout", type: "choice",
      hint: "Classic views, both lyric transitions from your newest reference, and Afterglow's creative layouts.",
      options: [["scroll", "Scrolling"], ["stack", "Lyric stack"], ["wordstack", "Word stack"], ["flash", "Flash line"], ["wordstream", "Word stream"],
        ["kinetic", "Kinetic stack"], ["morphstack", "Morph stack"], ["prism", "Prism roll"], ["buildstack", "Phrase builder"],
        ["constellation", "Constellation"], ["captioncards", "Caption cards"], ["poster", "Poster cutout"]] },
    { key: "phraseAccents", label: "Phrase builder accents", type: "choice",
      hint: "Optional editorial contrast for Phrase builder. Cards highlights selected words; Editorial also adds a restrained type tilt.",
      options: [["off", "Clean"], ["cards", "Cards"], ["editorial", "Cards + tilt"]] },
    { key: "lyricsHistoryLines", label: "Lines in lyric stack", type: "range", min: 2, max: 6, step: 1, unit: "" },
    { key: "lyricsMotion", label: "Word transition", type: "choice",
      hint: "Cube rolls each word away like one face turning into the next—without drawing a literal cube.",
      options: [["punch", "Punch"], ["slide", "Slide"], ["glide", "Glide"], ["cube", "Cube"]] },
    { key: "lyricsEmoji", label: "Emoji accents", type: "toggle",
      hint: "Adds semantic emojis to expressive lyric lines and words without changing the lyric text." },
    { key: "lyricsKeywords", label: "Highlight keywords", type: "toggle",
      hint: "Gives words like love, fire, ice, and money a visual accent in Word stream." },
    { key: "lyricsFit", label: "Auto-fit lyric box", type: "toggle",
      hint: "Word-focused modes grow short words and shrink long ones to fill the invisible lyric box. Constellation stays compact so its full star map remains readable." },
    { key: "lyricsEstimate", label: "Estimate timing for unsynced songs", type: "toggle",
      hint: "If a song has no synced lyrics, spread the plain lyrics over the song. Use \u2190 \u2192 to nudge." },
    { key: "lyricsAlign", label: "Position", type: "choice", options: [["center", "Center"], ["left", "Left"]] },
    { key: "lyricsFont", label: "Font", type: "choice", options: [["sans", "Sans"], ["serif", "Serif"], ["round", "Rounded"]] },
    { key: "lyricsSize", label: "Lyric box", type: "range", min: 18, max: 160, step: 2, unit: "px",
      hint: "Sets the invisible lyric box. Short words grow to fill it; long words shrink automatically so they never spill out." },
    { key: "lyricsBlur", label: "Blur lines that aren't playing", type: "toggle" },

    { type: "heading", label: "Scenes & automation" },
    { key: "songPresetsEnabled", label: "Saved looks for each song", type: "toggle", status: true,
      hint: "When enabled, a saved song look temporarily overrides Director Mode for that track. Your normal defaults return afterward." },
    { type: "button", label: "Save this song's current look",
      hint: "Remembers the lyric style, type, background, glow and motion currently on screen.",
      button: "Save / replace", action: () => saveCurrentSongPreset() },
    { type: "button", label: "Forget this song's saved look",
      hint: "Only removes the current song's custom look. Your global settings stay untouched.",
      button: "Forget", action: () => forgetCurrentSongPreset() },
    { key: "cinematicTransitions", label: "Cinematic track transitions", type: "toggle",
      hint: "Choreographs artwork, colour and typography when the actual song changes. Seeking and pausing do not trigger it." },
    { key: "directorMode", label: "Director Mode", type: "toggle", status: true,
      hint: "Scores vocals, loudness, bass, instruments, drum pattern, harmonic colour, beat confidence, timbre, WPM, flow, emotion and upcoming lyrics. Normal scenes land between lines; verified production pivots can cut on the next word, and a cadence timer keeps the look evolving. A manual change locks only that control." },
    { key: "automationNotifications", label: "Show automation notices", type: "toggle",
      hint: "Shows the small top-right card when a saved look or Director scene is applied. Turning this off keeps every visual change silent." },

    { type: "heading", label: "Background" },
    { key: "backdrop", label: "Show background", type: "toggle" },
    { key: "backdropStyle", label: "Style", type: "choice",
      hint: "Canvas uses Spotify's looping visual when available. Blackout removes every background light for distraction-free lyrics.",
      options: [["blur", "Blurred"], ["album", "Album tour"], ["canvas", "Canvas"], ["black", "Blackout"]] },
    { key: "backdropTourFocus", label: "Album tour focus", type: "choice",
      hint: "Smart artwork finds detailed, colourful areas automatically. Center stage stays near the middle; Classic corners keeps the original route.",
      options: [["smart", "Smart artwork"], ["center", "Center stage"], ["corners", "Classic corners"]] },
    { key: "backdropTourZoom", label: "Tour zoom", type: "range", min: 20, max: 140, step: 10, unit: "%" },
    { key: "backdropOpacity", label: "Opacity", type: "range", min: 0, max: 100, step: 5, unit: "%" },

    { type: "heading", label: "Screen glow" },
    { key: "glow", label: "Screen glow", hint: "Lights the edges of your screen", type: "toggle" },
    { key: "glowStyle", label: "Animation", type: "choice",
      hint: "Choose a distinct light language: drifting Aurora, a soft Halo, faceted Prism, a rising Horizon, or the original edge treatments.",
      options: [["steady", "Steady"], ["rotate", "Rotating"], ["comet", "Comet"], ["frame", "Broken frame"],
        ["flowline", "Flow streak"], ["aurora", "Aurora curtains"], ["halo", "Halo bloom"],
        ["prism", "Prism facets"], ["horizon", "Horizon beams"]] },
    { key: "glowStrength", label: "Glow level", type: "range", min: 10, max: 200, step: 10, unit: "%" },
    { key: "glowThickness", label: "Thickness", type: "range", min: 40, max: 400, step: 10, unit: "%" },
    { key: "glowOverride", label: "Use my own colours", hint: "Otherwise the glow takes two colours from the album cover.", type: "toggle" },
    { key: "glowColorA", label: "Colour 1", type: "color" },
    { key: "glowColorB", label: "Colour 2", type: "color" },
    { key: "glowScope", label: "Glow shows", type: "choice", options: [["everywhere", "Everywhere"], ["tracker", "Only with Afterglow open"]] },
    { key: "glowDisplays", label: "Screens", type: "choice", options: [["all", "All screens"], ["main", "Main screen"]] },

    { type: "heading", label: "Window" },
    { type: "button", label: "Fullscreen lyrics", hint: "Same as pressing F. Press Esc to leave.", button: "Enter / exit",
      action: () => window.tracker.toggleFullscreen() },

    { type: "heading", label: "Genre feel" },
    { key: "genreFeel", label: "Match the feel to the genre", type: "toggle",
      hint: "Rap: fast and punchy. R&B: slow and dreamy, with lines lighting up whole. Pop, rock and electronic get their own speeds." },

    { type: "heading", label: "Music motion" },
    { key: "beat", label: "Listen and react to the song", type: "toggle", status: true,
      hint: "Analyses the audio your Mac is playing. macOS may ask for permission the first time." },
    { key: "lyricsDance", label: "Lyrics dance", type: "toggle",
      hint: "Lets the type follow vocals, syllables, melodic lift and beat drops." },
    { key: "glowDance", label: "Glow dance", type: "toggle",
      hint: "Lets the screen-edge glow react independently from the lyrics." },
    { key: "lyricsDanceStyle", label: "Lyrics dance style", type: "choice",
      hint: "Auto gives each genre its own movement, or choose one style for every song.",
      options: [["auto", "Auto by genre"], ["float", "Vocal float"], ["punch", "Rap punch"], ["sway", "Jazz sway"],
        ["shake", "Rock shake"], ["bounce", "Pop bounce"], ["snap", "Electronic snap"], ["subtle", "Subtle"]] },
    { key: "motionStrength", label: "Dance strength", type: "range", min: 0, max: 200, step: 10, unit: "%" },
    { key: "beatStrength", label: "Beat punch", type: "range", min: 0, max: 200, step: 10, unit: "%" },

    { type: "heading", label: "Performance" },
    { key: "performanceMode", label: "Visual refresh", type: "choice",
      hint: "Balanced saves substantial CPU while CSS keeps motion smooth. Battery saver is best for long listening sessions.",
      options: [["battery", "Battery saver"], ["balanced", "Balanced"], ["smooth", "Maximum smoothness"]] },
  ];
  let settings = {};
  const controlsByKey = {};

  function buildSettingsPanel() {
    const rows = $("settingsRows");
    rows.innerHTML = "";
    for (const def of SETTINGS_UI) {
      if (def.type === "heading") {
        const h = document.createElement("div"); h.className = "heading"; h.textContent = def.label;
        rows.appendChild(h);
        continue;
      }
      const row = document.createElement("div");
      row.className = "row";
      if (def.key) row.dataset.setting = def.key;
      const left = document.createElement("div");
      const lbl = document.createElement("div"); lbl.className = "lbl"; lbl.textContent = def.label;
      left.appendChild(lbl);
      if (def.hint) {
        const hint = document.createElement("div"); hint.className = "hint"; hint.textContent = def.hint;
        left.appendChild(hint);
      }
      if (def.status) {
        const st = document.createElement("div"); st.className = "hint status"; st.id = "status_" + def.key;
        left.appendChild(st);
      }
      row.appendChild(left);

      if (def.type === "toggle") {
        const sw = document.createElement("label"); sw.className = "switch";
        const input = document.createElement("input"); input.type = "checkbox";
        input.addEventListener("change", () => {
          if (typeof markVisualControlManual === "function") markVisualControlManual(def.key);
          window.tracker.setSettings({ [def.key]: input.checked });
          if (def.key === "beat" && input.checked && typeof startBeat === "function") startBeat(true);
        });
        sw.appendChild(input); sw.appendChild(document.createElement("span"));
        row.appendChild(sw);
        controlsByKey[def.key] = (v) => { input.checked = !!v; };
      } else if (def.type === "choice") {
        const seg = document.createElement("div"); seg.className = "seg";
        const btns = def.options.map(([val, text]) => {
          const b = document.createElement("button"); b.textContent = text;
          b.addEventListener("click", () => {
            if (typeof markVisualControlManual === "function") markVisualControlManual(def.key);
            window.tracker.setSettings({ [def.key]: val });
          });
          seg.appendChild(b); return [val, b];
        });
        row.appendChild(seg);
        controlsByKey[def.key] = (v) => btns.forEach(([val, b]) => b.classList.toggle("active", val === v));
      } else if (def.type === "color") {
        const input = document.createElement("input"); input.type = "color"; input.className = "colorIn";
        input.addEventListener("input", () => {
          if (typeof markVisualControlManual === "function") markVisualControlManual(def.key);
          window.tracker.setSettings({ [def.key]: input.value });
        });
        row.appendChild(input);
        controlsByKey[def.key] = (v) => { if (input.value !== v) input.value = v; };
      } else if (def.type === "button") {
        const b = document.createElement("button"); b.className = "btn"; b.textContent = def.button;
        b.addEventListener("click", def.action);
        row.appendChild(b);
      } else if (def.type === "range") {
        const box = document.createElement("div"); box.className = "rng";
        const input = document.createElement("input");
        input.type = "range"; input.min = def.min; input.max = def.max; input.step = def.step;
        const val = document.createElement("span");
        input.addEventListener("input", () => {
          if (typeof markVisualControlManual === "function") markVisualControlManual(def.key);
          val.textContent = input.value + (def.unit || "");
          window.tracker.setSettings({ [def.key]: Number(input.value) });
        });
        box.appendChild(input); box.appendChild(val);
        row.appendChild(box);
        controlsByKey[def.key] = (v) => { input.value = v; val.textContent = v + (def.unit || ""); };
      }
      rows.appendChild(row);
    }
  }

  let lyricsWereOn = true;
  let appliedLyricsLayout = null;
  let appliedBackdropZoom = null;
  let lyricsLayoutTransition = 0;
  function applySettings() {
    for (const def of SETTINGS_UI) if (def.key && controlsByKey[def.key]) controlsByKey[def.key](settings[def.key]);

    document.body.classList.toggle("noblur", !settings.lyricsBlur);
    document.body.classList.toggle("center", settings.lyricsAlign === "center");
    document.body.dataset.font = settings.lyricsFont;
    document.body.dataset.motion = settings.lyricsMotion || "slide";
    document.body.dataset.phraseAccents = settings.phraseAccents || "editorial";
    document.body.classList.toggle("word-emoji", !!settings.lyricsEmoji);
    document.body.classList.toggle("word-keywords", !!settings.lyricsKeywords);
    const lyricsDance = settings.lyricsDance !== false;
    const glowDance = settings.glowDance !== false;
    document.body.classList.toggle("music-motion", lyricsDance);
    document.body.classList.toggle("lyrics-motion", lyricsDance);
    document.body.classList.toggle("glow-motion", glowDance);
    document.body.dataset.performance = settings.performanceMode || "balanced";
    const previousHomeMode=document.body.dataset.homeMode||"",nextHomeMode=settings.homeMode||"arcade";
    document.body.dataset.homeMode = nextHomeMode;
    if (typeof renderHome === "function") renderHome();
    if(previousHomeMode&&typeof onHomeModeChange==="function")onHomeModeChange(previousHomeMode,nextHomeMode);
    const layoutChanged = appliedLyricsLayout !== null && appliedLyricsLayout !== settings.lyricsLayout;
    if (layoutChanged) document.body.classList.add("lyrics-layout-switching");
    document.body.dataset.layout = settings.lyricsLayout;
    document.body.dataset.glowStyle = settings.glowStyle || "steady";
    appliedLyricsLayout = settings.lyricsLayout;
    root.style.setProperty("--lyric-size", settings.lyricsSize + "px");
    root.style.setProperty("--lyric-box-control", String(settings.lyricsSize));
    if (typeof refreshLyricBoxSizing === "function") refreshLyricBoxSizing();
    applyFeel();
    if (layoutChanged) {
      rebuildLyricsLayout();
      const transition = ++lyricsLayoutTransition;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (transition === lyricsLayoutTransition) document.body.classList.remove("lyrics-layout-switching");
      }));
    }
    activeIdx = -2;                   // re-measure and re-centre the current line after a layout change

    $("lines").style.display = settings.showLyrics ? "" : "none";
    if (!settings.showLyrics) {
      clearLyrics();
      setNotice("Lyrics are off. Turn them on in settings.");
    } else if (!lyricsWereOn) {
      trackId = null;                 // forces a fresh lyrics lookup on the next poll
      setNotice("");
    }
    lyricsWereOn = settings.showLyrics;

    const backdrop = $("backdrop");
    const backdropStyle = settings.backdropStyle || "blur";
    document.body.dataset.backdropStyle = settings.backdrop ? backdropStyle : "off";
    backdrop.style.display = settings.backdrop ? "" : "none";
    root.style.setProperty("--bdop", backdropStyle === "black" ? "1" : String((settings.backdropOpacity == null ? 60 : settings.backdropOpacity) / 100));
    const wantedBackdropKey = settings.backdropStyle + ":" + (settings.backdropTourFocus || "smart");
    if (settings.backdrop && backdropStyle === "black" && (!backdrop.children.length || backdropKey !== wantedBackdropKey)) setBackdrop("", lastBackdropTrackUri);
    else if (settings.backdrop && lastArtwork && (!backdrop.children.length || backdropKey !== wantedBackdropKey)) setBackdrop(lastArtwork, lastBackdropTrackUri);
    else if (settings.backdrop && !lastArtwork && backdropKey !== wantedBackdropKey) {
      backdrop.replaceChildren();
      backdropKey = wantedBackdropKey;
      backdropRequest++;
    }
    const backdropZoomChanged = appliedBackdropZoom !== null && appliedBackdropZoom !== settings.backdropTourZoom;
    appliedBackdropZoom = settings.backdropTourZoom;
    if (backdropZoomChanged && settings.backdropStyle === "album" && typeof refreshAlbumTours === "function") refreshAlbumTours();

    if (typeof onVisualAutomationSettingsApplied === "function") onVisualAutomationSettingsApplied();

    if (settings.beat && !beatOn && !beatStarting) startBeat();
    if (!settings.beat && beatOn) stopBeat("Off");
    if (!settings.beat && !beatOn) setBeatStatus("");
  }

  const openSettings = () => { closeAccountPanel(); $("settings").classList.add("open"); };
  const closeSettings = () => $("settings").classList.remove("open");
  $("gear").addEventListener("click", () => $("settings").classList.contains("open") ? closeSettings() : openSettings());
  $("closeSettings").addEventListener("click", closeSettings);
  $("minBtn").addEventListener("click", () => window.tracker.minimize());
  $("closeBtn").addEventListener("click", () => window.tracker.quit());


