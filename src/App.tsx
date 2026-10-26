import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface Ranked { name: string; artist: string | null; image: string | null; n: number }
interface Recent { track_name: string; artist_names: string[]; album_image: string | null; played_at: string }

const SCOPES =
  "user-read-private user-read-email user-read-recently-played user-top-read user-library-read user-read-playback-state user-modify-playback-state streaming";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function RankList({ title, items }: { title: string; items: Ranked[] }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <ol className="list">
          {items.map((r, i) => (
            <li key={r.name + (r.artist ?? "")}>
              <span className="rank">{i + 1}</span>
              <img src={r.image ?? undefined} alt="" className="cover" />
              <div className="meta">
                <strong>{r.name}</strong>
                {r.artist && <span>{r.artist}</span>}
              </div>
              <span className="count">{r.n} plays</span>
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

  const login = () =>
    supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: { redirectTo: window.location.origin + window.location.pathname, scopes: SCOPES },
    });

  if (!ready) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!session) {
    return (
      <main className="shell hero">
        <h1>Every song you play, kept.</h1>
        <p className="lede">
          Connect Spotify and Tracker starts recording what you listen to, so your stats
          grow for as long as you use it.
        </p>
        <button className="btn" onClick={login}>Connect Spotify</button>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
    );
  }

  const meta = session.user.user_metadata ?? {};
  const avatar = meta.avatar_url ?? meta.picture;
  const empty = loaded && recent.length === 0 && artists.length === 0;

  return (
    <main className="shell">
      <header className="bar">
        <div className="who">
          {avatar && <img src={avatar} alt="" className="avatar" />}
          <h2>{meta.name ?? meta.full_name ?? session.user.email}</h2>
        </div>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Log out</button>
      </header>

      {empty && (
        <p className="note">
          No plays saved yet. The collector runs about every 20 minutes, so check back soon.
        </p>
      )}

      <RankList title="Top artists, last 30 days" items={artists} />
      <RankList title="Top albums, last 30 days" items={albums} />
      <RankList title="Top songs, last 30 days" items={songs} />

      <section className="card">
        <h3>Last 15 songs</h3>
        <ol className="list">
          {recent.map((r) => (
            <li key={r.played_at + r.track_name}>
              <img src={r.album_image ?? undefined} alt="" className="cover" />
              <div className="meta">
                <strong>{r.track_name}</strong>
                <span>{r.artist_names.join(", ")}</span>
              </div>
              <time>{timeAgo(r.played_at)}</time>
            </li>
          ))}
        </ol>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
