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
const TRACKER_BG_KEY = "afterglow-tracker-background";
const TRACKER_BG_OPACITY_KEY = "afterglow-tracker-background-opacity";

function storedValue(key: string, fallback = "") {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

async function prepareBackground(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("That image could not be opened"));
      node.src = url;
    });
    const scale = Math.min(1, 1920 / image.naturalWidth, 1200 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", .82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function TrackerBackgroundControl({ image, opacity, onImage, onOpacity }: {
  image: string;
  opacity: number;
  onImage: (value: string) => void;
  onOpacity: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setNote("Preparing background…");
    try {
      onImage(await prepareBackground(file));
      setNote("Background saved on this device");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Couldn't use that image");
    }
  }

  return (
    <div className="background-control">
      <button className="background-trigger" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} title="Customize tracker background">
        <i aria-hidden="true" /> <span>Backdrop</span>
      </button>
      {open && <div className="background-popover">
        <div className="background-popover-head"><span>PERSONAL DISPLAY</span><button type="button" onClick={() => setOpen(false)}>×</button></div>
        <h3>Make it yours</h3>
        <p>Choose an image stored only on this device, then balance it behind your listening data.</p>
        <label className="background-file"><input type="file" accept="image/*" onChange={choose} /><span>{image ? "Change image" : "Choose image"}</span></label>
        <label className="background-opacity">
          <span><b>IMAGE PRESENCE</b><strong>{Math.round(opacity * 100)}%</strong></span>
          <input type="range" min="0" max="100" value={Math.round(opacity * 100)} onChange={(event) => onOpacity(Number(event.target.value) / 100)} />
        </label>
        <div className="background-popover-foot"><small role="status">{note || (image ? "Custom background active" : "Default atmosphere active")}</small>{image && <button type="button" onClick={() => { onImage(""); setNote("Default background restored"); }}>Reset</button>}</div>
      </div>}
    </div>
  );
}

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
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    async function check(session: Session | null) {
      if (!session) {
        setConnected(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("spotify", { body: { action: "status" } });
      setConnected(!error && !!(data as { connected?: boolean } | null)?.connected);
    }
    supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => check(session), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!connected) return null;

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
  const [trackerBackground, setTrackerBackground] = useState(() => storedValue(TRACKER_BG_KEY));
  const [trackerBackgroundOpacity, setTrackerBackgroundOpacity] = useState(() => {
    const value = Number(storedValue(TRACKER_BG_OPACITY_KEY, ".42"));
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : .42;
  });
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
  useEffect(() => {
    try {
      if (trackerBackground) localStorage.setItem(TRACKER_BG_KEY, trackerBackground);
      else localStorage.removeItem(TRACKER_BG_KEY);
      localStorage.setItem(TRACKER_BG_OPACITY_KEY, String(trackerBackgroundOpacity));
    } catch {
      // Keep the current session's image even if browser storage is full.
    }
  }, [trackerBackground, trackerBackgroundOpacity]);
  const requestedRoute = routeFor(hash);
  const route = embeddedInAfterglow && requestedRoute === "host" ? "home" : requestedRoute;
  return (
    <>
      <div className="tracker-user-background" aria-hidden="true" style={{ backgroundImage: trackerBackground ? `url(${JSON.stringify(trackerBackground)})` : undefined, opacity: trackerBackgroundOpacity }} />
      <nav className="nav" aria-label="Main">
        <a className="tracker-brand" href="#" aria-label="Afterglow Tracker dashboard">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span><b>AFTERGLOW</b><small>TRACKER</small></span>
        </a>
        <div className="nav-links">
          <a href="#" aria-current={route === "home" ? "page" : undefined}><i>⌂</i><span>Dashboard</span></a>
          <a href="#stats" aria-current={route === "stats" ? "page" : undefined}><i>⌁</i><span>Insights</span></a>
          {!embeddedInAfterglow && <a href="#host" aria-current={route === "host" ? "page" : undefined}><i>◉</i><span>Host</span></a>}
          <a href="#files" aria-current={route === "files" ? "page" : undefined}><i>◇</i><span>Files</span></a>
          <a href="#playlists" aria-current={route === "playlists" ? "page" : undefined}><i>≋</i><span>Playlists</span></a>
          <a href="#import" aria-current={["imports", "lastfm", "spotify-import"].includes(route) ? "page" : undefined}><i>↓</i><span>Import</span></a>
          <a href="#account" aria-current={route === "account" ? "page" : undefined}><i>◌</i><span>Account</span></a>
        </div>
        <TrackerBackgroundControl image={trackerBackground} opacity={trackerBackgroundOpacity} onImage={setTrackerBackground} onOpacity={setTrackerBackgroundOpacity} />
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
