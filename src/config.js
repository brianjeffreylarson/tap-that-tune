// Central configuration. Values that change per-environment come from Vite env
// vars (VITE_*), which are inlined at build time.

// Which app this build is. One codebase, two products:
//   'brad' (default) -> Brad Names Tunes: full pool, Missed drill system.
//   'ttt'            -> Tap That Track: difficulty pop-up, no Missed system,
//                       different logo. Both stream from the same AUDIO_BASE.
// Set VITE_APP_VARIANT=ttt for the Tap That Track build/deploy.
export const APP_VARIANT =
  (import.meta.env.VITE_APP_VARIANT || 'brad').toLowerCase() === 'ttt'
    ? 'ttt'
    : 'brad';

// Base URL the MP3s are served from.
//   - In local dev, leave VITE_AUDIO_BASE unset: it falls back to "/tracks",
//     which the Vite dev middleware (see vite.config.js) serves straight from
//     the local tracks/ folder, with HTTP range support so seeking works.
//   - In production (Cloudflare Pages), set VITE_AUDIO_BASE to your public
//     bucket URL, e.g. https://tunes.bradnamestunes.com  (a custom domain in
//     front of an R2 bucket) or the r2.dev public URL. No trailing slash.
//
// The full URL for a song is `${AUDIO_BASE}/${encodedFilePath}`, where the file
// path comes from songs.json (e.g. "Easy/Bad Romance.mp3") and each path
// segment is percent-encoded at request time.
export const AUDIO_BASE = (import.meta.env.VITE_AUDIO_BASE || '/tracks').replace(/\/+$/, '');

// How far into each track to start playback (0–1). ~0.22 tends to land in the
// first verse / pre-chorus: past the cryptic intro, but usually BEFORE the
// first chorus, where the title is often sung (which would give the answer
// away). Tunable.
export const HOOK_FRACTION = 0.22;

// Random ± wander applied to HOOK_FRACTION on each play, so the same song isn't
// always clipped at the exact same spot. Keeps Brad recognizing the song rather
// than memorizing one specific snippet, and spreads out where the clip lands.
export const HOOK_JITTER = 0.13;

// Auto-reveal a song as a miss after this long with no buzz-in.
export const AUTO_REVEAL_MS = 20000;

// Tap That Track only: per-difficulty countdown (ms). Brad uses AUTO_REVEAL_MS.
export const TTT_COUNTDOWN_MS = {
  Easy: 30000,
  Medium: 20000,
  Hard: 10000,
};

// A wrong-flagged song clears only after this many CONSECUTIVE correct answers.
export const STREAK_TO_CLEAR = 3;
