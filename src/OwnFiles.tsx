import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./supabase";

const BUCKET = "own-files";
const LASTFM_KEY = import.meta.env.VITE_LASTFM_API_KEY as string | undefined;

interface OwnFile {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  file_path: string;
  cover_path: string | null;
}
interface Item extends OwnFile {
  coverUrl: string | null;
}

const extOf = (name: string) => (name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function OwnFiles() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [now, setNow] = useState<Item | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const logged = useRef(false);

  async function load() {
    const { data, error: e } = await supabase.from("own_files").select("*").order("created_at", { ascending: false });
    if (e) {
      setError(e.message);
      return;
    }
    const files = (data ?? []) as OwnFile[];
    const coverPaths = files.map((f) => f.cover_path).filter((p): p is string => !!p);
    const urls = new Map<string, string>();
    if (coverPaths.length > 0) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(coverPaths, 3600);
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      });
    }
    setItems(files.map((f) => ({ ...f, coverUrl: f.cover_path ? urls.get(f.cover_path) ?? null : null })));
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: p } = await supabase.from("profiles").select("id").maybeSingle();
        setProfileId(p?.id ?? null);
        await load();
      }
      setReady(true);
    })();
  }, []);

  // Artist autocomplete: your own history first, then Last.fm's catalog.
  useEffect(() => {
    const q = artist.trim();
    if (q.length < 2 || !userId) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const names: string[] = [];
      const { data } = await supabase.rpc("artist_suggest", { q });
      (data as { name: string }[] | null)?.forEach((r) => names.push(r.name));
      if (LASTFM_KEY) {
        try {
          const params = new URLSearchParams({
            method: "artist.search",
            artist: q,
            api_key: LASTFM_KEY,
            format: "json",
            limit: "8",
          });
          const res = await fetch(`https://ws.audioscrobbler.com/2.0/?${params}`);
          const json = await res.json();
          const found = json?.results?.artistmatches?.artist;
          const list: { name: string }[] = Array.isArray(found) ? found : found ? [found] : [];
          list.forEach((a) => names.push(a.name));
        } catch {
          // Suggestions are a convenience; ignore failures.
        }
      }
      if (!cancelled) setSuggestions(Array.from(new Set(names)).slice(0, 10));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [artist, userId]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!audio || !title.trim() || !artist.trim() || !userId || !profileId) return;
    setBusy(true);
    setError(null);
    const id = crypto.randomUUID();
    const filePath = `${userId}/${id}.${extOf(audio.name)}`;
    const coverPath = cover ? `${userId}/covers/${id}.${extOf(cover.name)}` : null;
    try {
      const up = await supabase.storage.from(BUCKET).upload(filePath, audio, { contentType: audio.type || undefined });
      if (up.error) throw new Error(up.error.message);
      if (cover && coverPath) {
        const cu = await supabase.storage.from(BUCKET).upload(coverPath, cover, { contentType: cover.type || undefined });
        if (cu.error) throw new Error(cu.error.message);
      }
      const { error: ie } = await supabase.from("own_files").insert({
        id,
        profile_id: profileId,
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim() || null,
        file_path: filePath,
        cover_path: coverPath,
      });
      if (ie) {
        await supabase.storage.from(BUCKET).remove([filePath, ...(coverPath ? [coverPath] : [])]);
        throw new Error(ie.message);
      }
      setTitle("");
      setArtist("");
      setAlbum("");
      setAudio(null);
      setCover(null);
      setFormKey((k) => k + 1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function play(item: Item) {
    const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(item.file_path, 3600);
    if (e || !data) {
      setError(e?.message ?? "Could not open this file");
      return;
    }
    logged.current = false;
    setNow(item);
    setSrc(data.signedUrl);
  }

  async function logPlay(f: OwnFile) {
    if (!profileId) return;
    const { error: e } = await supabase.from("plays").insert({
      profile_id: profileId,
      played_at: new Date().toISOString(),
      source: "upload",
      track_name: f.title,
      artist_names: [f.artist],
      album_name: f.album,
      counted: true,
    });
    if (e && e.code !== "23505") setError(`Could not record this play: ${e.message}`);
  }

  function onTime() {
    const a = audioRef.current;
    if (!a || !now || logged.current) return;
    if (a.currentTime >= Math.min(30, (a.duration || 60) / 2)) {
      logged.current = true;
      logPlay(now);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await supabase.storage.from(BUCKET).remove([item.file_path, ...(item.cover_path ? [item.cover_path] : [])]);
    const { error: e } = await supabase.from("own_files").delete().eq("id", item.id);
    if (e) setError(e.message);
    if (now?.id === item.id) {
      setNow(null);
      setSrc(null);
    }
    await load();
  }

  if (!ready) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!userId) {
    return (
      <main className="shell">
        <h2>My files</h2>
        <p className="muted">Log in on the Dashboard first, then come back here.</p>
      </main>
    );
  }

  return (
    <main className="shell">
      <h2>My files</h2>
      <p className="muted">
        Upload your own audio, like unreleased tracks. Files are private to you. When one plays past 30
        seconds it counts toward the artist name you give it.
      </p>

      <form className="upload" key={formKey} onSubmit={upload}>
        <label htmlFor="of-audio">Audio file (up to 50 MB)</label>
        <input
          id="of-audio"
          type="file"
          accept="audio/*"
          required
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setAudio(f);
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
          }}
        />

        <label htmlFor="of-title">Title</label>
        <input id="of-title" className="field" value={title} required onChange={(e) => setTitle(e.target.value)} />

        <label htmlFor="of-artist">Artist</label>
        <input
          id="of-artist"
          className="field"
          list="artist-options"
          value={artist}
          required
          autoComplete="off"
          onChange={(e) => setArtist(e.target.value)}
        />
        <datalist id="artist-options">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>

        <label htmlFor="of-album">Album (optional)</label>
        <input id="of-album" className="field" value={album} onChange={(e) => setAlbum(e.target.value)} />

        <label htmlFor="of-cover">Cover image (optional)</label>
        <input id="of-cover" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />

        <div>
          <button className="btn" type="submit" disabled={busy || !audio || !title.trim() || !artist.trim()}>
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {src && now && (
        <>
          <p className="nowplaying">Now playing: {now.title} · {now.artist}</p>
          <audio ref={audioRef} className="player" src={src} controls autoPlay onTimeUpdate={onTime} onEnded={() => { logged.current = false; }} />
        </>
      )}

      {items.length === 0 ? (
        <p className="muted">No files yet.</p>
      ) : (
        <ol className="list">
          {items.map((it) => (
            <li key={it.id}>
              <img src={it.coverUrl ?? undefined} alt="" className="cover" />
              <div className="meta">
                <strong>{it.title}</strong>
                <span>{it.artist}{it.album ? ` · ${it.album}` : ""}</span>
              </div>
              <button className="iconbtn" onClick={() => play(it)}>Play</button>
              <button className="iconbtn" onClick={() => remove(it)} aria-label={`Delete ${it.title}`}>Delete</button>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
