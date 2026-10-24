import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { supabase } from "./supabase";

declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

interface Now { uri: string; name: string; artists: string[]; album: string; image: string | null; durationMs: number }
interface Hit { uri: string; name: string; artists: string; image: string | null }
interface Line { t: number; text: string }
type LyricStatus = "idle" | "loading" | "synced" | "plain" | "none" | "error";

let cached: { value: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60000) return cached.value;
  const { data, error } = await supabase.functions.invoke("spotify", { body: { action: "token" } });
  if (error || !data?.access_token) throw new Error("Could not get a Spotify token. Try logging out and in again.");
  cached = { value: data.access_token as string, exp: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  return cached.value;
}

function loadSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement("script");
    s.src = "https://sdk.scdn.co/spotify-player.js";
    s.async = true;
    s.onerror = () => reject(new Error("Could not load Spotify's player script."));
    document.body.appendChild(s);
  });
}

function parseLrc(src: string): Line[] {
  const out: Line[] = [];
  for (const raw of src.split("\n")) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function dominantColor(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 16;
        c.height = 16;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 16, 16);
        const d = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const spread = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
          const weight = 1 + spread / 32; // favour colourful pixels
          r += d[i] * weight;
          g += d[i + 1] * weight;
          b += d[i + 2] * weight;
          w += weight;
        }
        const lift = (v: number) => Math.round(v / w + (255 - v / w) * 0.45); // keep it readable on dark
        resolve(`rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`);
      } catch {
        resolve(null); // image would not allow colour reading
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export default function Host() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState<Now | null>(null);
  const [paused, setPaused] = useState(true);
  const [posMs, setPosMs] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [plain, setPlain] = useState("");
  const [lyricStatus, setLyricStatus] = useState<LyricStatus>("idle");
  const [active, setActive] = useState(-1);
  const [hi, setHi] = useState<string | null>(null);

  const playerRef = useRef<any>(null);
  const pos = useRef({ base: 0, at: 0, paused: true, duration: 0 });
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session));
  }, []);

  // Connect the in-page Spotify player.
  useEffect(() => {
    if (!loggedIn) return;
    cached = null;
    let cancelled = false;
    let player: any = null;
    const fail = (msg: string) => {
      setError(msg);
      setStatus("error");
    };

    (async () => {
      try {
        await loadSdk();
        if (cancelled) return;
        player = new window.Spotify.Player({
          name: "Tracker",
          getOAuthToken: (cb: (t: string) => void) => {
            getToken().then(cb).catch((e) => fail(e instanceof Error ? e.message : "Token problem"));
          },
          volume: 0.7,
        });
        player.addListener("ready", ({ device_id }: { device_id: string }) => {
          setDeviceId(device_id);
          setStatus("ready");
        });
        player.addListener("not_ready", () => setStatus("loading"));
        player.addListener("initialization_error", () =>
          fail("This browser can't run Spotify's player. Try Chrome, Edge or Safari.")
        );
        player.addListener("authentication_error", () => fail("Spotify login expired. Log out and log in again."));
        player.addListener("account_error", () => fail("Playing music here needs Spotify Premium."));
        player.addListener("playback_error", ({ message }: { message: string }) => setError(message));
        player.addListener("player_state_changed", (s: any) => {
          if (!s) return;
          const t = s.track_window.current_track;
          pos.current = { base: s.position, at: performance.now(), paused: s.paused, duration: s.duration };
          setPaused(s.paused);
          setNow({
            uri: t.uri,
            name: t.name,
            artists: t.artists.map((a: any) => a.name),
            album: t.album.name,
            image: t.album.images?.[0]?.url ?? null,
            durationMs: s.duration,
          });
        });
        const ok = await player.connect();
        if (!ok) fail("Could not connect to Spotify.");
        playerRef.current = player;
      } catch (e) {
        fail(e instanceof Error ? e.message : "Could not start the player.");
      }
    })();

    return () => {
      cancelled = true;
      player?.disconnect();
    };
  }, [loggedIn]);

  // Fetch lyrics when the song changes.
  useEffect(() => {
    setLines([]);
    setActive(-1);
    setPlain("");
    boxRef.current?.scrollTo({ top: 0 });
    if (!now) {
      setLyricStatus("idle");
      return;
    }
    let cancelled = false;
    setLyricStatus("loading");
    (async () => {
      try {
        const params = new URLSearchParams({
          track_name: now.name,
          artist_name: now.artists[0],
          album_name: now.album,
          duration: String(Math.round(now.durationMs / 1000)),
        });
        const res = await fetch(`https://lrclib.net/api/get?${params}`);
        let data = res.ok ? await res.json() : null;
        if (!data) {
          const sp = new URLSearchParams({ track_name: now.name, artist_name: now.artists[0] });
          const r2 = await fetch(`https://lrclib.net/api/search?${sp}`);
          if (r2.ok) {
            const arr = await r2.json();
            data = Array.isArray(arr) ? arr.find((x: any) => x.syncedLyrics) ?? arr[0] ?? null : null;
          }
        }
        if (cancelled) return;
        if (data?.syncedLyrics) {
          setLines(parseLrc(data.syncedLyrics));
          setLyricStatus("synced");
        } else if (data?.plainLyrics) {
          setPlain(data.plainLyrics);
          setLyricStatus("plain");
        } else {
          setLyricStatus("none");
        }
      } catch {
        if (!cancelled) setLyricStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [now?.uri]);

  // Colour from the album cover.
  useEffect(() => {
    setHi(null);
    if (!now?.image) return;
    let cancelled = false;
    dominantColor(now.image).then((c) => {
      if (!cancelled) setHi(c);
    });
    return () => {
      cancelled = true;
    };
  }, [now?.image]);

  // Animation loop: progress, current lyric line, sweep fill.
  useEffect(() => {
    let raf = 0;
    let lastIdx = -2;
    let lastUi = 0;
    const loop = (ts: number) => {
      const p = pos.current;
      const cur = p.base + (p.paused ? 0 : performance.now() - p.at);
      if (ts - lastUi > 250) {
        lastUi = ts;
        setPosMs(Math.min(cur, p.duration || cur));
      }
      if (lines.length > 0) {
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].t * 1000 <= cur + 150) idx = i;
          else break;
        }
        if (idx !== lastIdx) {
          lastIdx = idx;
          setActive(idx);
        }
        const el = activeRef.current;
        if (el && idx >= 0) {
          const start = lines[idx].t * 1000;
          const end = idx + 1 < lines.length ? lines[idx + 1].t * 1000 : p.duration;
          const span = Math.max(1, Math.min(end - start, 6000));
          const frac = Math.max(0, Math.min(1, (cur - start) / span));
          el.style.setProperty("--p", `${frac * 100}%`);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lines]);

  // Keep the active line centred.
  useEffect(() => {
    const el = activeRef.current;
    const box = boxRef.current;
    if (!el || !box) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({
      top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active]);

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: "track", limit: "10" })}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = await res.json();
      setHits(
        (data.tracks?.items ?? []).map((t: any) => ({
          uri: t.uri,
          name: t.name,
          artists: t.artists.map((a: any) => a.name).join(", "),
          image: t.album?.images?.[t.album.images.length - 1]?.url ?? null,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  async function playUri(uri: string) {
    if (!deviceId) return;
    try {
      playerRef.current?.activateElement?.(); // lets phones start audio from a tap
    } catch {
      // not needed on desktop
    }
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uris: [uri] }),
      });
      if (!res.ok && res.status !== 204) throw new Error(`Spotify could not start playback (${res.status}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play that song");
    }
  }

  function commitSeek() {
    if (drag === null) return;
    playerRef.current?.seek(drag);
    pos.current.base = drag;
    pos.current.at = performance.now();
    setPosMs(drag);
    setDrag(null);
  }

  if (loggedIn === null) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!loggedIn) {
    return (
      <main className="shell">
        <h2>Host</h2>
        <p className="muted">Log in on the Dashboard first, then come back here.</p>
      </main>
    );
  }

  const statusText =
    status === "ready"
      ? "Ready. This page is now a Spotify device named Tracker."
      : status === "error"
      ? "The player could not start."
      : "Connecting to Spotify…";

  return (
    <main className="shell">
      <h2>Host</h2>
      <p className="muted">{statusText}</p>

      <form className="hostbar" onSubmit={search}>
        <input
          className="field"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a song"
          aria-label="Search for a song"
        />
        <button className="btn" type="submit" disabled={status !== "ready"}>Search</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {hits.length > 0 && (
        <ol className="list hits">
          {hits.map((h) => (
            <li key={h.uri}>
              <img src={h.image ?? undefined} alt="" className="cover" />
              <div className="meta">
                <strong>{h.name}</strong>
                <span>{h.artists}</span>
              </div>
              <button className="iconbtn" onClick={() => playUri(h.uri)}>Play</button>
            </li>
          ))}
        </ol>
      )}

      {now && (
        <section className="stage" style={{ "--hi": hi ?? undefined } as CSSProperties}>
          {now.image && <div className="stage-bg" style={{ backgroundImage: `url(${now.image})` }} />}

          <div className="deck">
            <img src={now.image ?? undefined} alt="" />
            <div className="meta">
              <h3>{now.name}</h3>
              <span>{now.artists.join(", ")} · {now.album}</span>
            </div>
          </div>

          <div className="controls">
            <button className="iconbtn" onClick={() => playerRef.current?.previousTrack()} aria-label="Previous">Prev</button>
            <button className="btn" onClick={() => playerRef.current?.togglePlay()}>{paused ? "Play" : "Pause"}</button>
            <button className="iconbtn" onClick={() => playerRef.current?.nextTrack()} aria-label="Next">Next</button>
          </div>

          <div className="seek">
            <span>{fmt(drag ?? posMs)}</span>
            <input
              type="range"
              min={0}
              max={now.durationMs}
              value={drag ?? posMs}
              aria-label="Seek"
              onChange={(e) => setDrag(Number(e.target.value))}
              onPointerUp={commitSeek}
              onKeyUp={commitSeek}
            />
            <span>{fmt(now.durationMs)}</span>
          </div>

          {lyricStatus === "loading" && <p className="muted">Finding lyrics…</p>}
          {lyricStatus === "none" && <p className="muted">No lyrics found for this song.</p>}
          {lyricStatus === "error" && <p className="muted">Could not load lyrics right now.</p>}

          {lyricStatus === "synced" && (
            <div className="lyrics" ref={boxRef}>
              {lines.map((l, i) => {
                const on = i === active;
                const d = active < 0 ? 3 : Math.abs(i - active);
                return (
                  <p
                    key={i}
                    ref={on ? activeRef : undefined}
                    className={on ? "lyric on" : "lyric"}
                    style={on ? undefined : { opacity: Math.max(0.12, 1 - d * 0.3), filter: `blur(${Math.min(d * 0.7, 4)}px)` }}
                  >
                    {l.text || "♪"}
                  </p>
                );
              })}
            </div>
          )}

          {lyricStatus === "plain" && (
            <>
              <p className="muted">These lyrics are not time-synced.</p>
              <pre className="plain">{plain}</pre>
            </>
          )}
        </section>
      )}
    </main>
  );
}
