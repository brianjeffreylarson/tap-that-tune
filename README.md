# Brad Names Tunes

A mobile-first web app for practicing the *Name That Tune* **Golden Medley** round — rapid song identification, played from a curated library of local MP3s.

Built to live as an iPhone home-screen bookmark: open it and drill. The whole game is on one screen. No login, no Spotify — the audio is just files, hosted on Cloudflare.

**Two products, one codebase.** A build flag (`VITE_APP_VARIANT`) produces two apps that share the same music library:

- **Brad Names Tunes** (default) — the full pool of all songs, plus the "Missed" drill system (flag songs you miss; clear a flag with 3 correct in a row).
- **Tap That Track** (`VITE_APP_VARIANT=ttt`) — opens with an Easy/Medium/Hard pop-up that loads just that difficulty; no Missed system; its own logo. Everything else (buzzer, countdown, stats, confetti) is identical.

They deploy as two separate Cloudflare Pages projects, both pointing at the same R2 bucket. See [Deploy](#deploy-cloudflare-pages-app--r2-audio).

---

## How to play

The big circular **buzzer** is the only control you need — it changes job as you go:

1. It opens on **START**. Tap it: the song starts near the hook and a **20-second countdown** begins *inside the buzzer* as one big number.
2. The moment you know it, slam the buzzer. That **pauses the song and freezes the clock** — you've locked in.
3. Tap again (now **REVEAL**) to show the title, with the artist smaller beneath.
4. Grade yourself: the buzzer splits into two half-circles — **MISSED** (left) and **GOT IT** (right). Tap one; it scores and jumps straight to the next song.
   - There is **no skip button** — to skip a song, just buzz it and mark it MISSED.
5. If the **countdown hits 0** with no buzz, the song is auto-marked wrong and revealed (tap **NEXT** to move on) so Brad learns it.

The bottom row has **Pause** (take a break mid-song; tap the buzzer to resume) and the **Missed only** filter.

**Missed-song drilling.** Every song you miss gets **flagged**. The **Missed only** toggle filters the round down to just the flagged songs. A flag clears only after you get that song right **3 times in a row** — so a lucky single guess won't retire it. Flags persist in the browser (`localStorage`), so progress survives reloads.

---

## How it works (architecture)

- **Static site, no backend, no auth.** Everything runs in the browser.
- **One playback engine.** A single HTML5 `<audio>` element plays the MP3s — same code on desktop and mobile, no device picker. Pause/seek are instant and local. (This replaced the old Spotify Web Playback SDK / Connect split.)
- **The library is one big pool.** All songs from `tracks/songs.json` are loaded and shuffled into a single practice set. The `Easy` / `Medium` / `Hard` folders still exist on disk and in the manifest's `difficulty` field, but the game currently ignores difficulty and plays everything — difficulty filtering is a future toggle.
- **Hook-seeking.** Songs start ~22% of the way in (`HOOK_FRACTION` in `src/config.js`), with a small random wander (`HOOK_JITTER`) so the same track isn't always clipped at the same spot. The element stays muted until the seek lands, so the listener never hears the intro before the clip. This skips cryptic intros while usually landing *before* the first chorus.
- **Where the audio comes from** is a single config value, `AUDIO_BASE` (from `VITE_AUDIO_BASE`):
  - **Local dev:** unset → falls back to `/tracks`, which a small Vite middleware (`vite.config.js`) streams straight from the local `tracks/` folder, **with HTTP range support** so seeking works. The 4.9 GB is never bundled.
  - **Production:** set to your Cloudflare audio bucket URL; the app fetches `${VITE_AUDIO_BASE}/Easy/Bad%20Romance.mp3`, etc.
- **Progress** (wrong flags + consecutive-correct streaks) is stored in `localStorage` under `bnt_progress`, keyed by the song's file path.

---

## The track library

`tracks/songs.json` is the single source of truth — the app imports it at build time. Each entry:

```json
{
  "title": "Bad Romance",
  "artist": "Lady Gaga",
  "difficulty": "Easy",
  "duration": 294.58,
  "file": "Easy/Bad Romance.mp3",
  "snippet": false
}
```

The MP3s themselves live under `tracks/Easy/`, `tracks/Medium/`, `tracks/Hard/` (956 songs, ~4.9 GB). **These folders are git-ignored** — they're far too big to commit and are hosted on Cloudflare instead. `tracks/songs.json` and `tracks/README.md` *are* committed.

If you re-curate the library, regenerate `songs.json` so its `file` paths match what you upload to the bucket, then rebuild and redeploy.

---

## Run it locally

Requires Node 18+.

```bash
cd "Brad Names Tunes"
npm install
npm run dev          # Brad Names Tunes
npm run dev:ttt      # Tap That Track (difficulty pop-up, no Missed, TTT logo)
```

Open **http://localhost:5173/** for whichever you ran. Leave `VITE_AUDIO_BASE` unset (the default `.env` is blank) — the dev server streams the MP3s from your local `tracks/` folder, so you can test the full game with no Cloudflare setup at all.

> `npm run dev:ttt` is just `VITE_APP_VARIANT=ttt vite` — the same code, run as the Tap That Track variant. (Stop one with Ctrl+C before starting the other; they both use port 5173.) There are matching `build:ttt` and `preview:ttt` scripts too.

To sanity-check a production build locally (still serving local audio):

```bash
npm run build
npm run preview     # http://localhost:4173/
```

---

## Deploy: Cloudflare Pages (app) + R2 (audio)

The app is tiny and static; the audio is big and lives in object storage. Both on Cloudflare.

### 1. Host the MP3s on R2

1. In the Cloudflare dashboard: **R2 → Create bucket** (e.g. `brad-names-tunes`).
2. Upload the contents of your local `tracks/` folder **preserving the folder structure**, so the object keys are `Easy/Bad Romance.mp3`, `Medium/...`, `Hard/...`. The fastest way for ~5 GB is [rclone](https://rclone.org/) with an R2 (S3-compatible) remote:
   ```bash
   rclone copy "tracks/Easy"   r2:brad-names-tunes/Easy   --transfers 16
   rclone copy "tracks/Medium" r2:brad-names-tunes/Medium --transfers 16
   rclone copy "tracks/Hard"   r2:brad-names-tunes/Hard   --transfers 16
   ```
   (Don't upload `songs.json` / `README.md` to the bucket — only the audio.)
3. Make the bucket publicly readable, either:
   - **Custom domain (recommended):** R2 → your bucket → **Settings → Public access → Connect a custom domain**, e.g. `tunes.bradnamestunes.com`. Clean URLs, your own domain.
   - **Or the dev URL:** enable **r2.dev** public access to get a `https://pub-xxxx.r2.dev` URL (rate-limited; fine for personal use).

   > **CORS is not required** for plain playback. The app deliberately does *not* set `crossOrigin` on the audio element, so cross-origin range requests work without any CORS headers. (Only add a CORS policy later if you build something that reads raw audio samples, like a visualizer.)

### 2. Deploy the app on Cloudflare Pages

1. Push this folder to a GitHub repo (the git-ignored audio won't go up — that's intended).
2. Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick the repo.
3. Build settings:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables → add** `VITE_AUDIO_BASE` = your bucket URL from step 1 (no trailing slash), e.g. `https://tunes.bradnamestunes.com`.
5. Deploy. SPA routing fallback is handled by `public/_redirects`.
6. On the iPhone, open the Pages URL and use **Share → Add to Home Screen** for an app-like icon.

### 3. Deploy the second product (Tap That Track)

Both products build from this same repo — you just make a **second** Cloudflare Pages project pointing at the same GitHub repo:

1. **Workers & Pages → Create → Pages → Connect to Git**, pick the *same* repo.
2. Same build command (`npm run build`) and output dir (`dist`).
3. **Environment variables** — add **both**:
   - `VITE_AUDIO_BASE` = the *same* bucket URL as the Brad project (shared library).
   - `VITE_APP_VARIANT` = `ttt`
4. Deploy. This project renders as Tap That Track (difficulty pop-up, no Missed, its logo); the first project stays Brad Names Tunes. Give it its own domain/subdomain.

> The Brad project should leave `VITE_APP_VARIANT` unset (or `brad`). The only differences between the two deploys are these env vars — no separate branch or folder.

> `netlify.toml` is left in the repo from the previous Netlify setup; Cloudflare ignores it. You can delete it.

---

## Tunables (`src/config.js`)

| Constant | Meaning |
|---|---|
| `HOOK_FRACTION` | How far into each track the clip starts (0–1). Default `0.22`. |
| `HOOK_JITTER` | Random ± wander applied to the start point each play. Default `0.13`. |
| `AUTO_REVEAL_MS` | The countdown length before an auto-miss. Default `20000`. |
| `STREAK_TO_CLEAR` | Consecutive correct answers needed to clear a missed flag. Default `3`. |
| `AUDIO_BASE` | Derived from `VITE_AUDIO_BASE`; where MP3s are fetched from. |

---

## Project structure

```
Brad Names Tunes/
├── index.html            # app shell, viewport + iOS meta tags
├── vite.config.js        # dev server + the /tracks range-streaming middleware
├── public/_redirects     # Cloudflare Pages SPA fallback
├── .env.example          # copy to .env for production builds
├── tracks/
│   ├── songs.json        # the manifest (committed) — app's source of truth
│   ├── README.md         # library curation notes (committed)
│   └── Easy|Medium|Hard/ # the MP3s (git-ignored; hosted on R2)
└── src/
    ├── main.js           # game state machine + UI (buzzer-as-everything, in-buzzer timer, split grading, filter)
    ├── styles.css        # game-show-bold theme; single-screen mobile fit
    ├── config.js         # AUDIO_BASE + gameplay tunables
    ├── player.js         # HTML5 <audio> playback layer (mute-until-seeked)
    ├── progress.js       # wrong-flag + 3-in-a-row streak persistence (localStorage)
    └── util.js           # shuffle, escaping, helpers
```

> `src/auth.js` and `src/spotify-api.js` are leftover from the Spotify version and are no longer imported (so they're stripped from the build). Safe to delete.

---

## Known limitations

- **Title-drop.** Because the clip start is a fixed fraction of the track, it sometimes lands right where the vocalist sings the title, giving the answer away. There's no lyric-timing data to avoid this automatically. A future option is a per-song manual start-offset override.
- **No difficulty filter yet.** Easy/Medium/Hard are in the data but the game plays one combined pool. Adding a difficulty toggle is straightforward (filter `allTracks` by `track.difficulty`).
- **A few non-pristine files.** ~20 entries are 30-second snippets and a handful are re-records/remixes/alts (flagged via `snippet`/`note` in the manifest); usable for practice but noted in `tracks/README.md`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Songs won't play in production / "Track not found" | Check `VITE_AUDIO_BASE` is set on Pages (no trailing slash) and the bucket is public. Open one MP3 URL directly in the browser to confirm. |
| Plays locally but not deployed | The audio is git-ignored — it must be uploaded to R2 separately; the repo only carries the app + manifest. |
| 404 on one specific song | The `file` path in `songs.json` must exactly match the R2 object key (case + spaces included). |
| Nothing plays on first tap | Browsers require a user gesture before audio; the START tap supplies it. If a later song fails, it's usually a bad URL, not a gesture issue. |

---

## Status

Feature-complete for practice: one-tap START, hook-seeking local-MP3 playback, a 20-second in-buzzer countdown, two-stage buzzer (lock-in → reveal), split-buzzer self-grading (MISSED / GOT IT), wrong-song flagging with a 3-in-a-row clear, and a Missed-only drill filter — all on a single, mobile-first screen. Likely next steps: an Easy/Medium/Hard difficulty filter, session stats, and per-song start-offset overrides for the title-drop problem.
