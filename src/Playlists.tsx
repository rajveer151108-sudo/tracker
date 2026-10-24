import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "./supabase";

const BUCKET = "own-files";

interface Playlist { id: string; name: string; cover_path: string | null; coverUrl?: string | null }
interface FileRow { id: string; title: string; artist: string; album: string | null; file_path: string }
interface Entry { id: string; position: number; file: FileRow }

const extOf = (name: string) => (name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function Playlists() {
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [lists, setLists] = useState<Playlist[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [name, setName] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const logged = useRef(false);

  async function loadLists() {
    const { data, error: e } = await supabase
      .from("playlists")
      .select("id, name, cover_path")
      .order("created_at", { ascending: false });
    if (e) {
      setError(e.message);
      return;
    }
    const rows = (data ?? []) as Playlist[];
    const paths = rows.map((r) => r.cover_path).filter((p): p is string => !!p);
    const urls = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
      });
    }
    setLists(rows.map((r) => ({ ...r, coverUrl: r.cover_path ? urls.get(r.cover_path) ?? null : null })));
  }

  async function loadEntries(id: string) {
    const { data, error: e } = await supabase
      .from("playlist_items")
      .select("id, position, file_id")
      .eq("playlist_id", id)
      .order("position");
    if (e) {
      setError(e.message);
      return;
    }
    const byId = new Map(files.map((f) => [f.id, f]));
    const rows = (data ?? []) as { id: string; position: number; file_id: string }[];
    setEntries(
      rows.flatMap((r) => {
        const f = byId.get(r.file_id);
        return f ? [{ id: r.id, position: r.position, file: f }] : [];
      })
    );
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (uid) {
        const { data: p } = await supabase.from("profiles").select("id").maybeSingle();
        setProfileId(p?.id ?? null);
        const { data: f } = await supabase
          .from("own_files")
          .select("id, title, artist, album, file_path")
          .order("title");
        setFiles((f ?? []) as FileRow[]);
        await loadLists();
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    setSrc(null);
    setPlayingIdx(null);
    if (openId) loadEntries(openId);
    else setEntries([]);
  }, [openId, files.length]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !userId || !profileId) return;
    setBusy(true);
    setError(null);
    const id = crypto.randomUUID();
    const coverPath = cover ? `${userId}/covers/pl-${id}.${extOf(cover.name)}` : null;
    try {
      if (cover && coverPath) {
        const up = await supabase.storage.from(BUCKET).upload(coverPath, cover, { contentType: cover.type || undefined });
        if (up.error) throw new Error(up.error.message);
      }
      const { error: ie } = await supabase
        .from("playlists")
        .insert({ id, profile_id: profileId, name: name.trim(), cover_path: coverPath });
      if (ie) {
        if (coverPath) await supabase.storage.from(BUCKET).remove([coverPath]);
        throw new Error(ie.message);
      }
      setName("");
      setCover(null);
      setFormKey((k) => k + 1);
      await loadLists();
      setOpenId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the playlist");
    } finally {
      setBusy(false);
    }
  }

  async function removeList(p: Playlist) {
    if (!window.confirm(`Delete the playlist "${p.name}"? Your files are not deleted.`)) return;
    if (p.cover_path) await supabase.storage.from(BUCKET).remove([p.cover_path]);
    const { error: e } = await supabase.from("playlists").delete().eq("id", p.id);
    if (e) setError(e.message);
    if (openId === p.id) setOpenId(null);
    await loadLists();
  }

  async function addFile() {
    if (!openId || !pick) return;
    const position = entries.reduce((m, x) => Math.max(m, x.position), -1) + 1;
    const { error: e } = await supabase.from("playlist_items").insert({ playlist_id: openId, file_id: pick, position });
    if (e) {
      setError(e.message);
      return;
    }
    setPick("");
    await loadEntries(openId);
  }

  async function removeEntry(entry: Entry) {
    if (!openId) return;
    const { error: e } = await supabase.from("playlist_items").delete().eq("id", entry.id);
    if (e) setError(e.message);
    await loadEntries(openId);
  }

  async function move(i: number, dir: -1 | 1) {
    const a = entries[i];
    const b = entries[i + dir];
    if (!a || !b || !openId) return;
    const r1 = await supabase.from("playlist_items").update({ position: b.position }).eq("id", a.id);
    const r2 = await supabase.from("playlist_items").update({ position: a.position }).eq("id", b.id);
    const err = r1.error ?? r2.error;
    if (err) setError(err.message);
    await loadEntries(openId);
  }

  async function playAt(i: number) {
    const entry = entries[i];
    if (!entry) return;
    const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(entry.file.file_path, 3600);
    if (e || !data) {
      setError(e?.message ?? "Could not open this file");
      return;
    }
    logged.current = false;
    setPlayingIdx(i);
    setSrc(data.signedUrl);
  }

  async function logPlay(f: FileRow) {
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
    if (!a || playingIdx === null || logged.current) return;
    if (a.currentTime >= Math.min(30, (a.duration || 60) / 2)) {
      logged.current = true;
      logPlay(entries[playingIdx].file);
    }
  }

  function onEnded() {
    logged.current = false;
    if (playingIdx !== null && playingIdx + 1 < entries.length) playAt(playingIdx + 1);
    else {
      setPlayingIdx(null);
      setSrc(null);
    }
  }

  if (!ready) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (!userId) {
    return (
      <main className="shell">
        <h2>Playlists</h2>
        <p className="muted">Log in on the Dashboard first, then come back here.</p>
      </main>
    );
  }

  const open = lists.find((l) => l.id === openId) ?? null;
  const available = files.filter((f) => !entries.some((en) => en.file.id === f.id));

  return (
    <main className="shell">
      <h2>Playlists</h2>
      <p className="muted">Playlists are made from the files you uploaded in My files.</p>

      <form className="upload" key={formKey} onSubmit={create}>
        <label htmlFor="pl-name">New playlist name</label>
        <input id="pl-name" className="field" value={name} required onChange={(e) => setName(e.target.value)} />
        <label htmlFor="pl-cover">Cover image (optional)</label>
        <input id="pl-cover" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
        <div>
          <button className="btn" type="submit" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create playlist"}
          </button>
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {lists.length === 0 ? (
        <p className="muted">No playlists yet.</p>
      ) : (
        <ol className="list">
          {lists.map((p) => (
            <li key={p.id} className={p.id === openId ? "active" : undefined}>
              <button className="rowbtn" onClick={() => setOpenId(p.id)} aria-pressed={p.id === openId}>
                <img src={p.coverUrl ?? undefined} alt="" className="cover" />
                <div className="meta"><strong>{p.name}</strong></div>
              </button>
              <button className="iconbtn" onClick={() => removeList(p)} aria-label={`Delete ${p.name}`}>Delete</button>
            </li>
          ))}
        </ol>
      )}

      {open && (
        <section className="card" style={{ marginTop: 40 }}>
          <div className="plhead">
            <h3>{open.name}</h3>
            <button className="btn" disabled={entries.length === 0} onClick={() => playAt(0)}>Play all</button>
          </div>

          {src && playingIdx !== null && entries[playingIdx] && (
            <>
              <p className="nowplaying">Now playing: {entries[playingIdx].file.title} · {entries[playingIdx].file.artist}</p>
              <audio ref={audioRef} className="player" src={src} controls autoPlay onTimeUpdate={onTime} onEnded={onEnded} />
            </>
          )}

          <div className="picker">
            <select className="field" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Add a file">
              <option value="">Add a file…</option>
              {available.map((f) => (
                <option key={f.id} value={f.id}>{f.title} · {f.artist}</option>
              ))}
            </select>
            <button className="iconbtn" disabled={!pick} onClick={addFile}>Add</button>
          </div>

          {entries.length === 0 ? (
            <p className="muted">This playlist is empty.</p>
          ) : (
            <ol className="list">
              {entries.map((en, i) => (
                <li key={en.id} className={i === playingIdx ? "active" : undefined}>
                  <span className="rank">{i + 1}</span>
                  <div className="meta">
                    <strong>{en.file.title}</strong>
                    <span>{en.file.artist}</span>
                  </div>
                  <button className="iconbtn" onClick={() => playAt(i)}>Play</button>
                  <button className="iconbtn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${en.file.title} up`}>↑</button>
                  <button className="iconbtn" disabled={i === entries.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${en.file.title} down`}>↓</button>
                  <button className="iconbtn" onClick={() => removeEntry(en)} aria-label={`Remove ${en.file.title}`}>Remove</button>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
