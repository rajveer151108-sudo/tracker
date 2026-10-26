import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface TrackingStatus {
  connected: boolean;
  healthy: boolean;
  last_synced_at: string | null;
}

async function callAccountAction(action: string) {
  const { data, error } = await supabase.functions.invoke("spotify", { body: { action } });
  if (!error) return data;
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) throw new Error(body.error);
    } catch (parsed) {
      if (parsed instanceof Error && parsed.message !== "Unexpected end of JSON input") throw parsed;
    }
  }
  throw new Error(error.message || "Account request failed");
}

function formatSync(value: string | null) {
  if (!value) return "Not synced yet";
  return new Date(value).toLocaleString();
}

export default function Account() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function load() {
    try {
      setStatus(await callAccountAction("status") as TrackingStatus);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load account status");
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const active = !!data.session;
      setLoggedIn(active);
      setEmail(data.session?.user.email ?? "");
      if (active) load();
    });
  }, []);

  async function run(label: string, action: string) {
    setBusy(label);
    setMessage("");
    try {
      await callAccountAction(action);
      setMessage(label);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Disconnect optional Spotify API background sync? Your Tracker account and existing stats will stay.")) return;
    await run("Spotify API disconnected", "disconnect");
  }

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setBusy("Saving password");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(null);
    if (error) {
      setMessage(error.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setMessage("Password saved. You can now sign in without Spotify.");
  }

  async function clearHistory() {
    if (!window.confirm("Permanently delete your complete listening history? Uploads and playlists will stay.")) return;
    await run("Listening history deleted", "delete_history");
  }

  async function readAll(table: "profiles" | "plays" | "own_files" | "playlists" | "playlist_items") {
    const rows: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) return rows;
    }
  }

  async function exportData() {
    setBusy("Exporting data");
    setMessage("");
    try {
      const [profiles, plays, ownFiles, playlists, playlistItems] = await Promise.all([
        readAll("profiles"),
        readAll("plays"),
        readAll("own_files"),
        readAll("playlists"),
        readAll("playlist_items"),
      ]);
      const payload = {
        format: "tracker-export-v1",
        exported_at: new Date().toISOString(),
        profiles,
        plays,
        own_files: ownFiles,
        playlists,
        playlist_items: playlistItems,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Backup downloaded with ${plays.length.toLocaleString()} plays. Uploaded audio files are not included.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data export failed");
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    const answer = window.prompt("This permanently deletes your Tracker account, stats, uploads and playlists. Type DELETE to continue.");
    if (answer !== "DELETE") return;
    setBusy("Deleting account");
    setMessage("");
    try {
      await callAccountAction("delete_account");
      await supabase.auth.signOut();
      setLoggedIn(false);
      setMessage("Account deleted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account deletion failed");
    } finally {
      setBusy(null);
    }
  }

  if (loggedIn === null) return <main className="shell"><p className="muted">Loading…</p></main>;
  if (!loggedIn) return <main className="shell"><h2>Account</h2><p className="muted">Log in from Dashboard to manage your account.</p>{message && <p className="note">{message}</p>}</main>;

  return (
    <main className="shell">
      <h2>Account & privacy</h2>
      <section className="card account-card">
        <h3>Tracker login</h3>
        <p className="muted">{email || "Your signed-in account"}</p>
        <p>Your Tracker login is independent from Spotify. Setting a password keeps this account and all its existing history.</p>
        <form className="password-form" onSubmit={savePassword}>
          <label htmlFor="new-password">New password</label>
          <input id="new-password" className="field" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input id="confirm-password" className="field" type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          <button className="btn" disabled={!!busy}>Save password</button>
        </form>
      </section>

      <section className="card account-card">
        <h3>Spotify API connection</h3>
        <p>{status?.connected ? "Optional Spotify background sync is connected." : "Optional Spotify background sync is not connected."}</p>
        <p className="muted">Afterglow's local listening tracker works independently and does not require this connection.</p>
        <p className="muted">Last background sync: {formatSync(status?.last_synced_at ?? null)}</p>
        {status && !status.healthy && <p className="error">The last background sync failed. Reconnect Spotify to refresh permission.</p>}
        {status?.connected && <button className="btn ghost" disabled={!!busy} onClick={disconnect}>Disconnect Spotify API</button>}
      </section>

      <section className="card account-card">
        <h3>Your data</h3>
        <p className="muted">You control the listening data stored by Tracker.</p>
        <div className="account-actions">
          <button className="btn ghost" disabled={!!busy} onClick={exportData}>Export my data</button>
          <button className="btn ghost" disabled={!!busy} onClick={clearHistory}>Delete listening history</button>
          <button className="btn danger" disabled={!!busy} onClick={deleteAccount}>Delete account</button>
        </div>
      </section>
      {busy && <p className="muted">{busy}…</p>}
      {message && <p className="note" role="status">{message}</p>}
    </main>
  );
}
