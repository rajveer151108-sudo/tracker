import { readFile } from "node:fs/promises";
import ts from "typescript";

const migrationUrl = new URL("../supabase/migrations/202610270001_initial_backend.sql", import.meta.url);
const functionUrl = new URL("../supabase/functions/spotify/index.ts", import.meta.url);
const [sql, edge] = await Promise.all([
  readFile(migrationUrl, "utf8"),
  readFile(functionUrl, "utf8"),
]);

const requirements = [
  ...["profiles", "plays", "spotify_tokens", "own_files", "playlists", "playlist_items"]
    .map((name) => [`table ${name}`, new RegExp(`create table if not exists public\\.${name}\\b`, "i")]),
  ...["top_artists", "top_albums", "top_songs", "artist_suggest"]
    .map((name) => [`function ${name}`, new RegExp(`create or replace function public\\.${name}\\b`, "i")]),
  ["private own-files bucket", /values\s*\(\s*'own-files',\s*'own-files',\s*false/i],
  ["row-level security", /alter table public\.plays enable row level security/i],
  ["user-scoped storage", /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i],
];

const desktopMigration = await readFile(
  new URL("../supabase/migrations/202610270002_desktop_ingestion.sql", import.meta.url),
  "utf8"
);
if (!/function public\.ingest_desktop_play\b/i.test(desktopMigration)) {
  throw new Error("Backend migration is missing desktop play ingestion");
}
if (!/trigger plays_suppress_near_duplicate\b/i.test(desktopMigration)) {
  throw new Error("Backend migration is missing cross-source duplicate protection");
}

for (const [label, pattern] of requirements) {
  if (!pattern.test(sql)) throw new Error(`Backend migration is missing ${label}`);
}

for (const action of ["connect", "disconnect", "status", "delete_history", "delete_account", "token", "sync"]) {
  if (!edge.includes(`action === "${action}"`) && !edge.includes(`action !== "${action}"`)) {
    throw new Error(`Spotify function is missing the ${action} action`);
  }
}

if (!edge.includes("auth.getUser()")) throw new Error("Spotify function does not authenticate callers");
if (!edge.includes('from("spotify_tokens")')) throw new Error("Spotify function does not use server-side tokens");

const transpiled = ts.transpileModule(edge, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  reportDiagnostics: true,
  fileName: "supabase/functions/spotify/index.ts",
});
const syntaxErrors = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
if (syntaxErrors.length) {
  throw new Error(`Spotify function has TypeScript syntax errors: ${syntaxErrors.map((d) => d.messageText).join(", ")}`);
}

console.log("Backend contract OK: schema, RLS, storage, stats RPCs, and Spotify actions are present.");
