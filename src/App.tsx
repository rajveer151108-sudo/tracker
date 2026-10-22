import { useEffect, useState } from "react";
import { getAccessToken, getMe, getRecent, handleCallback, login, logout } from "./spotify";
import type { RecentItem, SpotifyUser } from "./spotify";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default function App() {
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await handleCallback();
        if (await getAccessToken()) {
          setUser(await getMe());
          setRecent((await getRecent(15)).items);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!user) {
    return (
      <main className="shell hero">
        <h1>Every song you play, kept.</h1>
        <p className="lede">
          Connect Spotify and Tracker starts recording what you listen to, so your stats
          grow for as long as you use it.
        </p>
        <button className="btn" onClick={() => login().catch((e) => setError(e.message))}>
          Connect Spotify
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="bar">
        <div className="who">
          {user.images[0] && <img src={user.images[0].url} alt="" className="avatar" />}
          <h2>{user.display_name ?? user.id}</h2>
        </div>
        <button
          className="btn ghost"
          onClick={() => {
            logout();
            setUser(null);
            setRecent([]);
          }}
        >
          Log out
        </button>
      </header>

      <h3>Last 15 songs</h3>
      {recent.length === 0 ? (
        <p className="muted">Nothing here yet. Play a song on Spotify, then refresh.</p>
      ) : (
        <ol className="list">
          {recent.map((r) => (
            <li key={r.played_at + r.track.id}>
              <img src={r.track.album.images.at(-1)?.url} alt="" className="cover" />
              <div className="meta">
                <strong>{r.track.name}</strong>
                <span>{r.track.artists.map((a) => a.name).join(", ")}</span>
              </div>
              <time>{timeAgo(r.played_at)}</time>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
