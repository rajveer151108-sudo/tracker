# Tracker

A Last.fm-style listening tracker on top of Spotify. This is build step 1:
site scaffold, GitHub Pages deploy, Spotify login, and a "last 15 songs" preview.

## Set up (about 15 minutes)

### 1. GitHub repo
1. Create an empty repo on GitHub (e.g. `tracker`). Keep it public (free Pages needs that).
2. Upload everything in this folder to it (or `git push`). Keep the `.github` folder.
3. Repo **Settings -> Pages -> Source: GitHub Actions**.

### 2. Spotify app
1. Go to https://developer.spotify.com/dashboard -> **Create app**.
2. Redirect URIs - add both (the trailing slash matters):
   - `https://YOUR-USERNAME.github.io/YOUR-REPO/`
   - `http://127.0.0.1:5173/`   (only if you want to run it on your computer)
3. Tick **Web API** and **Web Playback SDK**. Save, then copy the **Client ID**.
4. Under **User Management**, add your own Spotify name and email (and friends later).

### 3. Tell the site your Client ID
Repo **Settings -> Secrets and variables -> Actions -> Variables tab -> New repository variable**:
- Name: `SPOTIFY_CLIENT_ID`
- Value: your Client ID (it is public, not a secret)

### 4. Deploy
Push to `main` (or Actions tab -> "Deploy site to GitHub Pages" -> Run workflow).
In a minute your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

## Run locally (optional)
```
cp .env.example .env.local     # put your Client ID in it
npm install
npm run dev                    # open http://127.0.0.1:5173/
```

## Supabase (needed from the next step)
Create a free project at https://supabase.com, then run `sql/schema.sql` in its SQL Editor.
