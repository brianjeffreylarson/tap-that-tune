// Per-song progress: which tracks are flagged "wrong", and how many times in a
// row they've since been answered correctly. Persisted in localStorage so it
// survives reloads and is there next practice session.
//
// Shape stored under bnt_progress:
//   { [trackId]: { wrong: boolean, streak: number } }
//
// Rules (from the spec):
//   - "Missed it"  -> wrong = true, streak = 0
//   - "Got it"     -> if currently wrong, streak++ ; once streak hits
//                     STREAK_TO_CLEAR the flag clears (wrong = false, streak 0)
//   - a wrong song stays wrong until cleared by that consecutive-correct run

import { STREAK_TO_CLEAR } from './config.js';

const KEY = 'bnt_progress';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getEntry(id) {
  return load()[id] || { wrong: false, streak: 0 };
}

export function isWrong(id) {
  return !!load()[id]?.wrong;
}

// Record a graded answer. Returns the updated entry.
export function recordResult(id, correct) {
  const data = load();
  const e = data[id] || { wrong: false, streak: 0 };

  if (correct) {
    if (e.wrong) {
      e.streak = (e.streak || 0) + 1;
      if (e.streak >= STREAK_TO_CLEAR) {
        e.wrong = false;
        e.streak = 0;
      }
    }
    // If it wasn't flagged, a correct answer needs no tracking.
  } else {
    e.wrong = true;
    e.streak = 0;
  }

  // Keep storage tidy: drop entries that carry no state.
  if (!e.wrong && !e.streak) delete data[id];
  else data[id] = e;

  save(data);
  return e;
}

// How many of the given tracks are currently flagged wrong.
export function wrongCount(tracks) {
  const data = load();
  return tracks.reduce((n, t) => (data[t.id]?.wrong ? n + 1 : n), 0);
}

// Subset of tracks currently flagged wrong.
export function filterWrong(tracks) {
  const data = load();
  return tracks.filter((t) => data[t.id]?.wrong);
}

// ---- Removed songs (Brad Names Tunes only) ---------------------------------
// A permanent per-song exclusion: removed songs drop out of the main pool AND
// the missed list, and stay out across sessions. The MP3 file itself is never
// touched — only Brad's playlist is filtered — so Tap That Track still sees the
// full library. Stored as an array of track ids (file paths) under bnt_removed.

const KEY_REMOVED = 'bnt_removed';

function loadRemoved() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY_REMOVED)) || []);
  } catch {
    return new Set();
  }
}

function saveRemoved(set) {
  localStorage.setItem(KEY_REMOVED, JSON.stringify([...set]));
}

export function isRemoved(id) {
  return loadRemoved().has(id);
}

export function removedCount() {
  return loadRemoved().size;
}

// Permanently exclude a song: add it to the removed set AND drop any missed
// flag it carried, so it's gone from both the main pool and the missed list.
export function addRemoved(id) {
  const set = loadRemoved();
  set.add(id);
  saveRemoved(set);

  const data = load();
  if (data[id]) {
    delete data[id];
    save(data);
  }
}
