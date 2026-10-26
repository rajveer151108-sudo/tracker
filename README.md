# Tracker

A Last.fm-style listening tracker on top of Spotify. This is build step 1:
site scaffold, GitHub Pages deploy, Spotify login, and a "last 15 songs" preview.

The repository now also contains **Afterglow**, the macOS Spotify companion player that will become the desktop side of Tracker.

## Repository layout

- `src/` - Tracker web application.
- `scripts/` - scheduled Spotify history collector.
- `supabase/` - versioned database migration and Spotify Edge Function.
- `apps/desktop/` - Afterglow Electron application.

The website remains at the repository root so the existing GitHub Pages workflow continues to deploy without changes.

## Set up (about 15 minutes)

### 1. GitHub repo
1. Create an empty repo on GitHub (e.g. `tracker`). Keep it public (free Pages needs that).
2. Upload everything in this folder to it (or `git push`). Keep the `.github` folder.
3. Repo **Settings -> Pages -> Source: GitHub Actions**.

### 2. Spotify app
1. Go to https://developer.spotify.com/dashboard -> **Create app**.
2. Keep the app open; after creating Supabase below, add its Spotify callback URL as the redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`.
3. Tick **Web API** and **Web Playback SDK**. Save, then copy the **Client ID**.
4. Under **User Management**, add your own Spotify name and email (and friends later).

### 3. Create the backend
1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), then authenticate and link this checkout:
   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
3. In Supabase Authentication, enable Spotify and enter the Spotify client ID and secret. Under URL Configuration, set the deployed site as the Site URL and add `http://127.0.0.1:5173/` as a redirect URL for local development.
4. Deploy the server function and its Spotify credentials:
   ```sh
   supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
   supabase functions deploy spotify
   ```

The migration creates profiles, play history, private uploads, playlists, statistics functions, row-level security, and the private `own-files` storage bucket. No SQL needs to be pasted by hand.

### 4. Configure GitHub
Repo **Settings -> Secrets and variables -> Actions**:

- Variable: `SPOTIFY_CLIENT_ID`
- Secrets: `SPOTIFY_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- Variables used by the web build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Optional web-build variable: `VITE_LASTFM_API_KEY`

### 5. Deploy
Push to `main` (or Actions tab -> "Deploy site to GitHub Pages" -> Run workflow).
In a minute your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Run locally (optional)
```
cp .env.example .env.local     # add your Supabase project URL and publishable key
npm install
npm run dev                    # open http://127.0.0.1:5173/
```

Run `npm run backend:check` to verify that all backend objects required by the app remain versioned.
