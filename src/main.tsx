import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Stats from "./Stats";
import OwnFiles from "./OwnFiles";
import Playlists from "./Playlists";
import ImportLastfm from "./ImportLastfm";
import "./styles.css";

type Route = "home" | "stats" | "files" | "playlists" | "import";

function routeFor(hash: string): Route {
  if (hash === "#stats") return "stats";
  if (hash === "#files") return "files";
  if (hash === "#playlists") return "playlists";
  if (hash === "#lastfm") return "import";
  return "home";
}

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const route = routeFor(hash);
  return (
    <>
      <nav className="nav" aria-label="Main">
        <a href="#" aria-current={route === "home" ? "page" : undefined}>Dashboard</a>
        <a href="#stats" aria-current={route === "stats" ? "page" : undefined}>Stats</a>
        <a href="#files" aria-current={route === "files" ? "page" : undefined}>My files</a>
        <a href="#playlists" aria-current={route === "playlists" ? "page" : undefined}>Playlists</a>
        <a href="#lastfm" aria-current={route === "import" ? "page" : undefined}>Import</a>
      </nav>
      {route === "stats" ? <Stats />
        : route === "files" ? <OwnFiles />
        : route === "playlists" ? <Playlists />
        : route === "import" ? <ImportLastfm />
        : <App />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
