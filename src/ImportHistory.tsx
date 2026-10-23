import { useEffect, useState } from "react";
import { unzipSync, strFromU8 } from "fflate";
import { supabase } from "./supabase";

// Handles both the extended history (Streaming_History_Audio_*.json) and the
// smaller "account data" history (StreamingHistory*.json).
const MUSIC_FILE = /(Streaming_History_Audio.*|StreamingHistory(_music)?_?\d*)\.json$/i;
const BATCH = 500;

interface Raw {
  ts?: string;
  ms_played?: number;
  master_metadata_track_name?: string | null;
  master_metadata_album_artist_name?: string | null;
  master_metadata_album_album_name?: string | null;
  spotify_track_uri?: string | null;
  endTime?: string;
  artistName?: string;
  trackName?: string;
  msPlayed?: number;
}

interface Play {
  played_at: string;
  track: string;
  artist: string;
  album: string | null;
  trackId: string | null;
  ms: number;
}

function normalize(r: Raw): Play | null {
  if (r.ts) {
    // Extended history. Podcasts and videos have no track name, so they are skipped.
    if (!r.master_metadata_track_name || !r.master_metadata_album_artist_name) return null;
    const d = new Date(r.ts);
    if (isNaN(d.getTime())) return null;
    return {
      played_at: d.toISOString(),
      track: r.master_metadata_track_name,
      artist: r.master_metadata_album_artist_name,
      album: r.master_metadata_album_album_name ?? null,
      trackId: r.spotify_track_uri?.split(":")[2] ?? null,
      ms: r.ms_played ?? 0,
    };
  }
  if (r.endTime && r.trackName && r.artistName) {
    // Account-data history: "2022-10-23 14:05" in UTC.
    const d = new Date(r.endTime.replace(" ", "T") + ":00Z");
    if (isNaN(d.getTime())) return null;
    return {
      played_at: d.toISOString(),
      track: r.trackName,
      artist: r.artistName,
      album: null,
      trackId: null,
      ms: r.msPlayed ?? 0,
    };
  }
  return null;
}

async function readFiles(files: File[]): Promise<{ raw: Raw[]; used: number }> {
  let raw: Raw[] = [];
  let used = 0;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const unzipped = unzipSync(bytes, { filter: (f) => MUSIC_FILE.test(f.name) });
      for (const data of Object.values(unzipped)) {
        raw = raw.concat(JSON.parse(strFromU8(data)) as Raw[]);
        used++;
      }
    } else if (MUSIC_FILE.test(file.name)) {
      raw = raw.concat(JSON.parse(await file.text()) as Raw[]);
      used++;
    }
  }
  return { raw, used };
}

export default function ImportHistory() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string[] | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session));
  }, []);

  async function run(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      setStatus("Checking your account…");
      const { data: profile, error: pe } = await supabase.from("profiles").select("id").maybeSingle();
      if (pe) throw new Error(pe.message);
      if (!profile) throw new Error("No profile yet. Open the dashboard once and wait for the collector to run, then try again.");

      // Plays saved by the collector are exact; only import what came before them.
      const { data: first, error: fe } = await supabase
        .from("plays")
        .select("played_at")
        .eq("source", "spotify")
        .order("played_at", { ascending: true })
        .limit(1);
      if (fe) throw new Error(fe.message);
      const cutoff: string | null = first && first.length > 0 ? first[0].played_at : null;

      setStatus("Reading files…");
      const { raw, used } = await readFiles(Array.from(fileList));
      if (used === 0) throw new Error("No music history files found. Upload the .zip from Spotify's email.");

      const unique = new Map<string, Play>();
      let skippedOverlap = 0;
      for (const r of raw) {
        const p = normalize(r);
        if (!p) continue;
        if (cutoff && new Date(p.played_at) >= new Date(cutoff)) {
          skippedOverlap++;
          continue;
        }
        unique.set(`${p.played_at}|${p.track}`, p);
      }
      const plays = Array.from(unique.values()).sort((a, b) => a.played_at.localeCompare(b.played_at));
      if (plays.length === 0) throw new Error("Nothing new to import from these files.");

      const rows = plays.map((p) => ({
        profile_id: profile.id,
        played_at: p.played_at,
        source: "import",
        track_id: p.trackId,
        track_name: p.track,
        artist_names: [p.artist],
        album_name: p.album,
        counted: p.ms >= 30000,
      }));

      let added = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        setStatus(`Saving plays… ${Math.min(i + BATCH, rows.length).toLocaleString()} of ${rows.length.toLocaleString()}`);
        const { data, error: ie } = await supabase
          .from("plays")
          .upsert(rows.slice(i, i + BATCH), { onConflict: "profile_id,played_at,track_name", ignoreDuplicates: true })
          .select("id");
        if (ie) throw new Error(ie.message);
        added += data?.length ?? 0;
        setProgress(Math.min(100, Math.round(((i + BATCH) / rows.length) * 100)));
      }

      const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      setProgress(100);
      setStatus("Done.");
      setResult([
        `Read ${used} file${used === 1 ? "" : "s"} covering ${fmt(plays[0].played_at)} to ${fmt(plays[plays.length - 1].played_at)}.`,
        `${plays.length.toLocaleString()} plays found, ${added.toLocaleString()} newly saved, ${(plays.length - added).toLocaleString()} were already there.`,
        ...(skippedOverlap > 0 ? [`${skippedOverlap.toLocaleString()} skipped because the collector already has that period.`] : []),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
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
        <h2>Import history</h2>
        <p className="muted">Log in on the main page first, then come back here.</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <a className="back" href={back}>← Back to dashboard</a>
      <h2>Import your Spotify history</h2>
      <p className="muted">
        Upload the .zip from Spotify's "Extended streaming history" email. It is read in your browser, and only
        song, artist and play time are saved.
      </p>

      <label className="drop">
        <input type="file" accept=".zip,.json" multiple disabled={busy} onChange={(e) => run(e.target.files)} />
        {busy ? "Working…" : "Choose your .zip file"}
      </label>

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
