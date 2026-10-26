import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import App from "./App";
import Stats from "./Stats";
import OwnFiles from "./OwnFiles";
import Playlists from "./Playlists";
import Host from "./Host";
import ImportLastfm from "./ImportLastfm";
import ImportHistory from "./ImportHistory";
import Imports from "./Imports";
import Account from "./Account";
import { supabase } from "./supabase";
import "./styles.css";

type Route = "home" | "stats" | "host" | "files" | "playlists" | "imports" | "lastfm" | "spotify-import" | "account";

declare global {
  interface Window {
    afterglowDesktop?: {
      connect: (session: {
        supabaseUrl: string;
        publishableKey: string;
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
      }) => void;
      disconnect: () => void;
    };
  }
}

let lastDesktopAccessToken = "";

function connectAfterglow(session: Session | null) {
  if (!window.afterglowDesktop) return;
  if (!session) {
    lastDesktopAccessToken = "";
    window.afterglowDesktop.disconnect();
    return;
  }
  if (session.access_token === lastDesktopAccessToken) return;
  lastDesktopAccessToken = session.access_token;
  window.afterglowDesktop.connect({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? 0,
  });
}

function routeFor(hash: string): Route {
  if (hash === "#stats") return "stats";
  if (hash === "#host") return "host";
  if (hash === "#files") return "files";
  if (hash === "#playlists") return "playlists";
  if (hash === "#import") return "imports";
  if (hash === "#lastfm") return "lastfm";
  if (hash === "#spotify-import") return "spotify-import";
  if (hash === "#account") return "account";
  return "home";
}

function SyncButton({ onDone }: { onDone: () => void }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLoggedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setLoggedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!loggedIn) return null;

  async function sync() {
    setBusy(true);
    setNote("");
    const { data, error } = await supabase.functions.invoke("spotify", { body: { action: "sync" } });
    setBusy(false);
    if (error) {
      let msg = "Sync failed. Try again in a minute.";
      if (error instanceof FunctionsHttpError) {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error;
        } catch {
          // keep the generic message
        }
      }
      setNote(msg);
      return;
    }
    const r = data as { skipped?: boolean; saved?: number };
    setNote(r.skipped ? "Already up to date" : `${r.saved ?? 0} new plays`);
    onDone();
  }

  return (
    <div className="syncwrap">
      <button className="iconbtn" onClick={sync} disabled={busy}>{busy ? "Syncing…" : "Sync now"}</button>
      <span className="syncnote" role="status">{note}</span>
    </div>
  );
}

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  const [tick, setTick] = useState(0);
  const embeddedInAfterglow = !!window.afterglowDesktop;
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => connectAfterglow(data.session));
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => connectAfterglow(session));
    return () => auth.subscription.unsubscribe();
  }, []);
  const requestedRoute = routeFor(hash);
  const route = embeddedInAfterglow && requestedRoute === "host" ? "home" : requestedRoute;
  return (
    <>
      <nav className="nav" aria-label="Main">
        <a href="#" aria-current={route === "home" ? "page" : undefined}>Dashboard</a>
        <a href="#stats" aria-current={route === "stats" ? "page" : undefined}>Stats</a>
        {!embeddedInAfterglow && <a href="#host" aria-current={route === "host" ? "page" : undefined}>Host</a>}
        <a href="#files" aria-current={route === "files" ? "page" : undefined}>My files</a>
        <a href="#playlists" aria-current={route === "playlists" ? "page" : undefined}>Playlists</a>
        <a href="#import" aria-current={["imports", "lastfm", "spotify-import"].includes(route) ? "page" : undefined}>Import</a>
        <a href="#account" aria-current={route === "account" ? "page" : undefined}>Account</a>
        <SyncButton onDone={() => setTick((t) => t + 1)} />
      </nav>
      {route === "stats" ? <Stats key={tick} />
        : route === "host" ? <Host />
        : route === "files" ? <OwnFiles key={tick} />
        : route === "playlists" ? <Playlists key={tick} />
        : route === "imports" ? <Imports />
        : route === "lastfm" ? <ImportLastfm key={tick} />
        : route === "spotify-import" ? <ImportHistory key={tick} />
        : route === "account" ? <Account />
        : <App key={tick} />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
