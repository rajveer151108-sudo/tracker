import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface Ranked { name: string; artist: string | null; image: string | null; n: number }
interface Recent { track_name: string; artist_names: string[]; album_image: string | null; played_at: string }

const SCOPES =
  "user-read-private user-read-email user-read-recently-played user-top-read user-library-read user-read-playback-state user-modify-playback-state streaming";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function RankList({ title, label, items, tone }: { title: string; label: string; items: Ranked[]; tone: string }) {
  const max = Math.max(1, ...items.map((item) => Number(item.n) || 0));
  return (
    <section className={`card rank-card ${tone}`}>
      <header className="section-head">
        <div><span className="eyebrow">{label}</span><h3>{title}</h3></div>
        <span className="section-count">TOP {Math.min(items.length, 6).toString().padStart(2, "0")}</span>
      </header>
      {items.length === 0 ? (
        <div className="empty-state"><span>NO SIGNAL</span><p>Play a few tracks and this panel will wake up.</p></div>
      ) : (
        <ol className="list signal-list">
          {items.slice(0, 6).map((r, i) => (
            <li key={r.name + (r.artist ?? "")} style={{ "--signal": `${Math.max(8, (Number(r.n) / max) * 100)}%` } as CSSProperties}>
              <span className="rank">{String(i + 1).padStart(2, "0")}</span>
              <img src={r.image ?? undefined} alt="" className="cover" />
              <div className="meta">
                <strong>{r.name}</strong>
                {r.artist && <span>{r.artist}</span>}
              </div>
              <span className="count"><b>{Number(r.n).toLocaleString()}</b><small>plays</small></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [artists, setArtists] = useState<Ranked[]>([]);
  const [albums, setAlbums] = useState<Ranked[]>([]);
  const [songs, setSongs] = useState<Ranked[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.provider_refresh_token) {
        // Hand the permission to the server; refresh tokens are never readable from public tables.
        setTimeout(async () => {
          const { error: e } = await supabase.functions.invoke("spotify", {
            body: { action: "connect", refresh_token: s.provider_refresh_token },
          });
          if (e) setError(`Could not save tracking permission: ${e.message}`);
        }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    (async () => {
      const [a, al, s, r] = await Promise.all([
        supabase.rpc("top_artists", { since }),
        supabase.rpc("top_albums", { since }),
        supabase.rpc("top_songs", { since }),
        supabase
          .from("plays")
          .select("track_name, artist_names, album_image, played_at")
          .eq("counted", true)
          .order("played_at", { ascending: false })
          .limit(15),
      ]);
      const err = a.error ?? al.error ?? s.error ?? r.error;
      if (err) setError(err.message);
      setArtists((a.data as Ranked[] | null) ?? []);
      setAlbums((al.data as Ranked[] | null) ?? []);
      setSongs((s.data as Ranked[] | null) ?? []);
      setRecent((r.data as Recent[] | null) ?? []);
      setLoaded(true);
    })();
  }, [session?.user.id]);

  const spotifyLogin = () =>
    supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: { redirectTo: window.location.origin + window.location.pathname, scopes: SCOPES },
    });

  async function submitAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAuthNotice(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setAuthBusy(true);
    try {
      if (authMode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        if (!data.session) {
          setAuthNotice("Account created. Check your email to confirm it, then sign in.");
          setAuthMode("signin");
        }
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Could not continue");
    } finally {
      setAuthBusy(false);
    }
  }

  if (!ready) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!session) {
    return (
      <main className="shell auth-shell">
        <section className="auth-story">
          <span className="eyebrow"><i className="live-dot" /> PERSONAL LISTENING INTELLIGENCE</span>
          <h1>Every sound leaves<br /><em>a signal.</em></h1>
          <p className="lede">Afterglow turns your listening history into a private, living portrait—artists, eras, obsessions and every late-night replay.</p>
          <div className="auth-preview" aria-hidden="true">
            <div className="preview-orbit"><span /><span /><span /></div>
            <div className="preview-card"><small>THIS MONTH</small><strong>1,284</strong><span>plays decoded</span></div>
            <div className="preview-wave">{Array.from({ length: 22 }, (_, i) => <i key={i} />)}</div>
          </div>
        </section>
        <section className="auth-panel">
          <div className="auth-panel-head"><span>SECURE ACCESS</span><b>TRACKER // 01</b></div>
          <h2>{authMode === "signin" ? "Welcome back" : "Start your archive"}</h2>
          <p className="muted">Your history stays yours. Spotify API access remains optional.</p>
          <div className="auth-tabs" role="group" aria-label="Account action">
            <button className="chip" aria-pressed={authMode === "signin"} onClick={() => setAuthMode("signin")}>Sign in</button>
            <button className="chip" aria-pressed={authMode === "signup"} onClick={() => setAuthMode("signup")}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={submitAccount}>
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" className="field" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" className="field" type="password" minLength={8} autoComplete={authMode === "signin" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8+ characters" />
            <button className="btn auth-submit" disabled={authBusy}>{authBusy ? "Working…" : authMode === "signin" ? "Enter Tracker" : "Create archive"}</button>
          </form>
          <div className="optional-login">
            <span>SPOTIFY API BETA</span>
            <button className="btn ghost" onClick={spotifyLogin}>Continue with Spotify <b>↗</b></button>
          </div>
          {authNotice && <p className="note" role="status">{authNotice}</p>}
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      </main>
    );
  }

  const meta = session.user.user_metadata ?? {};
  const avatar = meta.avatar_url ?? meta.picture;
  const empty = loaded && recent.length === 0 && artists.length === 0;
  const displayName = String(meta.name ?? meta.full_name ?? session.user.email ?? "Listener").split(" ")[0];
  const totalPlays = songs.reduce((sum, song) => sum + Number(song.n || 0), 0);
  const topTrack = songs[0];
  const topArtist = artists[0];

  return (
    <main className="shell dashboard-shell">
      <header
        className="dashboard-hero"
        style={topTrack?.image ? { "--hero-art": `url(${topTrack.image})` } as CSSProperties : undefined}
      >
        <div className="hero-copy">
          <span className="eyebrow"><i className="live-dot" /> ARCHIVE ONLINE · LAST 30 DAYS</span>
          <h1>Hey {displayName},<br /><em>here’s your frequency.</em></h1>
          <p>Your listening patterns are alive, synced, and turning into a story only you could make.</p>
          <div className="who">
            {avatar ? <img src={avatar} alt="" className="avatar" /> : <span className="avatar avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}
            <div><strong>{meta.name ?? meta.full_name ?? session.user.email}</strong><span>PRIVATE LISTENING ARCHIVE</span></div>
            <button className="text-button" onClick={() => supabase.auth.signOut()}>Log out ↗</button>
          </div>
        </div>
        <div className="hero-signal">
          <div className="signal-ring ring-a" /><div className="signal-ring ring-b" /><div className="signal-ring ring-c" />
          <div className="signal-core">{topTrack?.image ? <img src={topTrack.image} alt="" /> : <span>AG</span>}</div>
          <div className="signal-caption"><span>DOMINANT SIGNAL</span><strong>{topTrack?.name ?? "Waiting for plays"}</strong><small>{topTrack?.artist ?? "Your next favourite track"}</small></div>
        </div>
      </header>

      {empty && (
        <p className="note">No plays saved yet. The collector runs about every 20 minutes, so check back soon.</p>
      )}

      <section className="metric-grid" aria-label="Listening summary">
        <article className="metric-card primary"><span>PLAYS CAPTURED</span><strong>{loaded ? totalPlays.toLocaleString() : "—"}</strong><small>across your archive</small><i /></article>
        <article className="metric-card"><span>UNIQUE ARTISTS</span><strong>{loaded ? artists.length.toLocaleString() : "—"}</strong><small>in your orbit</small><i /></article>
        <article className="metric-card"><span>TOP FREQUENCY</span><strong className="metric-name">{topArtist?.name ?? "—"}</strong><small>{topArtist ? `${Number(topArtist.n).toLocaleString()} plays` : "waiting for signal"}</small><i /></article>
        <article className="metric-card status"><span>TRACKER STATUS</span><strong><b className="live-dot" /> LIVE</strong><small>listening in real time</small><i /></article>
      </section>

      <div className="dashboard-grid">
        <RankList label="IDENTITY MAP" title="Artists in your orbit" items={artists} tone="tone-violet" />
        <RankList label="ROTATION INDEX" title="Albums on repeat" items={albums} tone="tone-cyan" />
        <RankList label="REPLAY SIGNAL" title="Songs you came back to" items={songs} tone="tone-coral" />
      </div>

      <section className="card activity-card">
        <header className="section-head">
          <div><span className="eyebrow">LIVE LOG</span><h3>Recent transmissions</h3></div>
          <span className="section-count"><i className="live-dot" /> UPDATING</span>
        </header>
        <ol className="list activity-list">
          {recent.map((r, index) => (
            <li key={r.played_at + r.track_name}>
              <span className="activity-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="cover-wrap"><img src={r.album_image ?? undefined} alt="" className="cover" /><i /></div>
              <div className="meta">
                <strong>{r.track_name}</strong>
                <span>{r.artist_names.join(", ")}</span>
              </div>
              <time><span>{timeAgo(r.played_at)}</span><small>{new Date(r.played_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></time>
            </li>
          ))}
        </ol>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
