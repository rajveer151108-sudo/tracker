import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const API_KEY = import.meta.env.VITE_LASTFM_API_KEY as string | undefined;
const NO_IMAGE = "2a96cbd8b46e442fc41c2b86b821562f"; // Last.fm's grey placeholder cover

interface LfmTrack {
  name: string;
  artist: { "#text": string };
  album?: { "#text": string };
  image?: { "#text": string; size: string }[];
  date?: { uts: string };
  "@attr"?: { nowplaying?: string };
}

interface LfmResponse {
  error?: number;
  message?: string;
  recenttracks?: {
    track?: LfmTrack | LfmTrack[];
    "@attr": { totalPages: string; total: string };
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const asArray = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

async function fetchPage(user: string, page: number, toSec: number): Promise<LfmResponse> {
  const params = new URLSearchParams({
    method: "user.getrecenttracks",
    user,
    api_key: API_KEY ?? "",
    format: "json",
    limit: "200",
    page: String(page),
    to: String(toSec),
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`);
    const data = (await res.json()) as LfmResponse;
    if (data.error === 29 || res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (data.error) throw new Error(data.message ?? `Last.fm error ${data.error}`);
    if (!res.ok) throw new Error(`Last.fm request failed (${res.status})`);
    return data;
  }
  throw new Error("Last.fm is rate limiting requests. Try again in a few minutes.");
}

export default function ImportLastfm() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session));
  }, []);

  async function run() {
    const user = username.trim();
    if (!user) return;
    if (!API_KEY) {
      setError("The Last.fm API key is missing from the site build. Add the VITE_LASTFM_API_KEY variable in GitHub and redeploy.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      setStatus("Checking your account…");
      const { data: profile, error: pe } = await supabase.from("profiles").select("id").maybeSingle();
      if (pe) throw new Error(pe.message);
      if (!profile) throw new Error("No profile yet. Open the dashboard once and wait for the collector to run, then try again.");

      // Only import what came before the collector started (with a margin, since
      // Last.fm records when a song started and the collector records when it ended).
      const { data: first, error: fe } = await supabase
        .from("plays")
        .select("played_at")
        .eq("source", "spotify")
        .order("played_at", { ascending: true })
        .limit(1);
      if (fe) throw new Error(fe.message);
      const toSec =
        first && first.length > 0
          ? Math.floor(new Date(first[0].played_at).getTime() / 1000) - 600
          : Math.floor(Date.now() / 1000);

      setStatus("Contacting Last.fm…");
      const page1 = await fetchPage(user, 1, toSec);
      const totalPages = Number(page1.recenttracks?.["@attr"].totalPages ?? 0);
      const total = Number(page1.recenttracks?.["@attr"].total ?? 0);
      if (!totalPages) throw new Error("No scrobbles found for that username.");

      let seen = 0;
      let saved = 0;
      let newest: string | null = null;
      let oldest: string | null = null;

      for (let page = 1; page <= totalPages; page++) {
        const data = page === 1 ? page1 : await fetchPage(user, page, toSec);
        const rows = asArray(data.recenttracks?.track)
          .filter((t) => t.date?.uts && !t["@attr"]?.nowplaying)
          .map((t) => {
            const img = t.image?.find((i) => i.size === "large")?.["#text"];
            return {
              profile_id: profile.id,
              played_at: new Date(Number(t.date!.uts) * 1000).toISOString(),
              source: "lastfm",
              track_name: t.name,
              artist_names: [t.artist["#text"]],
              album_name: t.album?.["#text"] || null,
              album_image: img && !img.includes(NO_IMAGE) ? img : null,
              counted: true, // Last.fm has already applied its own play rule
            };
          });

        if (rows.length > 0) {
          const { data: inserted, error: ie } = await supabase
            .from("plays")
            .upsert(rows, { onConflict: "profile_id,played_at,track_name", ignoreDuplicates: true })
            .select("id");
          if (ie) throw new Error(ie.message);
          saved += inserted?.length ?? 0;
          seen += rows.length;
          if (!newest) newest = rows[0].played_at;
          oldest = rows[rows.length - 1].played_at;
        }

        setProgress(Math.round((page / totalPages) * 100));
        setStatus(`Importing ${total.toLocaleString()} scrobbles… page ${page} of ${totalPages}`);
        await sleep(250);
      }

      const fmt = (iso: string) =>
        new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      setStatus("Done.");
      setResult([
        `Read ${seen.toLocaleString()} scrobbles${oldest && newest ? ` from ${fmt(oldest)} to ${fmt(newest)}` : ""}.`,
        `${saved.toLocaleString()} newly saved, ${(seen - saved).toLocaleString()} were already there.`,
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      setError(
        msg === "Failed to fetch"
          ? "Could not reach Last.fm. The browser may be blocking the request. Tell me and we will move the import into GitHub Actions."
          : msg
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const back = window.location.pathname;

  if (loggedIn === null) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!loggedIn) {
    return (
      <main className="shell">
        <a className="back" href={back}>← Back</a>
        <h2>Import from Last.fm</h2>
        <p className="muted">Log in on the main page first, then come back here.</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <a className="back" href={back}>← Back to dashboard</a>
      <h2>Import from Last.fm</h2>
      <p className="muted">
        Copies your scrobble history from Last.fm into Tracker. Keep this tab open and in front until it
        finishes, because browsers slow down background tabs. Your Last.fm privacy settings must not hide
        recent listening.
      </p>

      <label>
        <span className="muted">Last.fm username</span>
        <input
          className="field"
          value={username}
          disabled={busy}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your-username"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>
      <button className="btn" disabled={busy || !username.trim()} onClick={run}>
        {busy ? "Importing…" : "Import from Last.fm"}
      </button>

      {(busy || progress > 0) && (
        <div className="bar-track" aria-hidden="true">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      {status && <p className="muted">{status}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {result && (
        <div className="result">
          {result.map((line) => <div key={line}>{line}</div>)}
        </div>
      )}
    </main>
  );
}
