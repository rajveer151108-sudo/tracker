import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const envDir = fileURLToPath(new URL("../..", import.meta.url));

// base "./" lets the built site work under https://<you>.github.io/<repo>/
export default defineConfig({
  root,
  envDir,
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  // Spotify only allows http for 127.0.0.1 (not "localhost")
  server: { host: "127.0.0.1", port: 5173 },
});
