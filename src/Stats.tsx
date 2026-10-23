import { useEffect, useState } from "react";
import { supabase } from "./supabase";

type Range = "today" | "7d" | "30d" | "180d" | "360d" | "all";
type Tab = "artists" | "albums" | "songs" | "order";

interface Ranked { name: string; artist: string | null; image: string | null; n: number }
interface Recent { track_name: string; artist_names: string[]; album_image: string | null; played_at: string }

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "180d", label: "Last 180 days" },
  { id: "360d", label: "Last 360 days" },
  { id: "all", label: "All time" },
];

const TABS: { id: Tab; label: string; fn?: string }[] = [
  { id: "artists", label: "Top artists", fn: "top_artists" },
  { id: "albums", label: "Top albums", fn: "top_albums" },
  { id: "songs", label: "Top songs", fn: "top_songs" },
  { id: "order", label: "Streaming order" },
];

const DAY = 86400000;

function sinceFor(r: Range): Date {
  const now = new Date();
  if (r === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (r === "all") return new Date(0);
  const days = r === "7d" ? 7 : r === "30d" ? 30 : r === "180d" ? 180 : 360;
  return new Date(now.getTime() - days * DAY);
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Stats() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [range, setRange] = useState<Range>("30d");
  const [tab, setTab] = useState<Tab>("artists");
  const [ranked, setRanked] = useState<Ranked[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session));
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const since = sinceFor(range).toISOString();
    const current = TABS.find((t) => t.id === tab)!;

    (async () => {
      try {
        const countQuery = supabase
          .from("plays")
          .select("id", { count: "exact", head: true })
          .eq("counted", true)
          .gte("played_at", since);

        if (current.fn) {
          const [c, r] = await Promise.all([countQuery, supabase.rpc(current.fn, { since, lim: 50 })]);
          if (cancelled) return;
          const err = c.error ?? r.error;
          if (err) throw new Error(err.message);
          setTotal(c.count ?? 0);
          setRanked((r.data as Ranked[] | null) ?? []);
        } else {
          const [c, r] = await Promise.all([
            countQuery,
            supabase
              .from("plays")
              .select("track_name, artist_names, album_image, played_at")
              .eq("counted", true)
              .gte("played_at", since)
              .order("played_at", { ascending: false })
              .limit(100),
          ]);
          if (cancelled) return;
          const err = c.error ?? r.error;
          if (err) throw new Error(err.message);
          setTotal(c.count ?? 0);
          setRecent((r.data as Recent[] | null) ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loggedIn, range, tab]);

  if (loggedIn === null) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!loggedIn) {
    return (
      <main className="shell">
        <h2>Stats</h2>
        <p className="muted">Log in on the Dashboard first, then come back here.</p>
      </main>
    );
  }

  const max = ranked[0]?.n ?? 1;

  return (
    <main className="shell">
      <h2>Stats</h2>

      <div className="chips" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.id} className="chip" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="chips" role="group" aria-label="Stat type">
        {TABS.map((t) => (
          <button key={t.id} className="chip" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {total !== null && <p className="total">{total.toLocaleString()} plays in this range</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && tab !== "order" && (
        ranked.length === 0 ? (
          <p className="muted">Nothing in this range yet.</p>
        ) : (
          <ol className="list">
            {ranked.map((r, i) => (
              <li key={`${r.name}|${r.artist ?? ""}|${i}`} className="ranked">
                <div className="fill" style={{ width: `${(r.n / max) * 100}%` }} />
                <span className="rank">{i + 1}</span>
                <img src={r.image ?? undefined} alt="" className="cover" />
                <div className="meta">
                  <strong>{r.name}</strong>
                  {r.artist && <span>{r.artist}</span>}
                </div>
                <span className="count">{Number(r.n).toLocaleString()} plays</span>
              </li>
            ))}
          </ol>
        )
      )}

      {!loading && tab === "order" && (
        recent.length === 0 ? (
          <p className="muted">Nothing in this range yet.</p>
        ) : (
          <>
            <p className="muted">Showing the latest 100 plays in this range.</p>
            <ol className="list">
              {recent.map((r, i) => (
                <li key={`${r.played_at}|${r.track_name}|${i}`}>
                  <img src={r.album_image ?? undefined} alt="" className="cover" />
                  <div className="meta">
                    <strong>{r.track_name}</strong>
                    <span>{r.artist_names.join(", ")}</span>
                  </div>
                  <time>{when(r.played_at)}</time>
                </li>
              ))}
            </ol>
          </>
        )
      )}
    </main>
  );
}
