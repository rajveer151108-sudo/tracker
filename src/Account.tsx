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
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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
    if (!window.confirm("Stop scheduled Spotify tracking and log out? Your existing stats will stay.")) return;
    await run("Tracking disconnected", "disconnect");
    await supabase.auth.signOut();
    setLoggedIn(false);
  }

  async function clearHistory() {
    if (!window.confirm("Permanently delete your complete listening history? Uploads and playlists will stay.")) return;
    await run("Listening history deleted", "delete_history");
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
        <h3>Tracking status</h3>
        <p>{status?.connected ? "Spotify tracking is connected." : "Spotify tracking is disconnected."}</p>
        <p className="muted">Last background sync: {formatSync(status?.last_synced_at ?? null)}</p>
        {status && !status.healthy && <p className="error">The last background sync failed. Reconnect Spotify to refresh permission.</p>}
        <button className="btn ghost" disabled={!!busy} onClick={disconnect}>Disconnect tracking</button>
      </section>

      <section className="card account-card">
        <h3>Your data</h3>
        <p className="muted">You control the listening data stored by Tracker.</p>
        <div className="account-actions">
          <button className="btn ghost" disabled={!!busy} onClick={clearHistory}>Delete listening history</button>
          <button className="btn danger" disabled={!!busy} onClick={deleteAccount}>Delete account</button>
        </div>
      </section>
      {busy && <p className="muted">{busy}…</p>}
      {message && <p className="note" role="status">{message}</p>}
    </main>
  );
}
