export default function Imports() {
  return (
    <main className="shell">
      <h2>Import listening history</h2>
      <p className="muted">Bring older listening history into Tracker from either source. Do not import the same period twice.</p>
      <div className="import-options">
        <a className="import-option" href="#lastfm">
          <strong>Last.fm history</strong>
          <span>Import scrobbles from a public Last.fm profile.</span>
        </a>
        <a className="import-option" href="#spotify-import">
          <strong>Spotify data export</strong>
          <span>Upload the ZIP or JSON files Spotify sends for your streaming history request.</span>
        </a>
      </div>
    </main>
  );
}
