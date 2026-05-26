// Brad Names Tunes / Tap That Track — the practice game.
//
// ONE codebase, two products (selected by VITE_APP_VARIANT, see config.js):
//   'brad' -> Brad Names Tunes: full pool of all songs, "Missed" drill system.
//   'ttt'  -> Tap That Track: an Easy/Medium/Hard pop-up on load filters the
//             pool by difficulty, and there is NO Missed system. Different logo.
// Both stream from the same AUDIO_BASE (the same R2 library).
//
// The big buzzer is the ONE control. It changes job by phase:
//   idle      -> "START": tap to play the first song + begin the 20s countdown
//   playing   -> shows the giant countdown number; tap = lock in (pause + freeze)
//   buzzed    -> "REVEAL": tap to show the title (+ artist, smaller)
//   revealed  -> splits into two half-circles: MISSED | GOT IT (grade + advance)
//   paused    -> "▶": tap to resume (the bottom Pause button paused it)
//   auto-miss -> "NEXT": countdown hit 0, song marked wrong, tap to advance
//   choosing  -> (Tap That Track only) the initial difficulty pop-up
//
// A stats strip (Win / Avg buzz time / Streak) tracks the current session.
// GOT IT bursts confetti. Shimmer orbs drift over the background.

import './styles.css';
import bradLogo from './assets/logo-q.png';
import tttLogo from './assets/logo-ttt.webp';
import manifest from '../tracks/songs.json';
import {
  APP_VARIANT,
  AUDIO_BASE,
  HOOK_FRACTION,
  HOOK_JITTER,
  AUTO_REVEAL_MS,
} from './config.js';
import * as Progress from './progress.js';
import { createPlayer } from './player.js';
import { esc, shuffle } from './util.js';

const isTTT = APP_VARIANT === 'ttt';
const APP_NAME = isTTT ? 'Tap That Track' : 'Brad Names Tunes';
const logoUrl = isTTT ? tttLogo : bradLogo;

const app = document.getElementById('app');
const confettiLayer = document.getElementById('confetti');
const modalRoot = document.getElementById('modalRoot');

const state = {
  player: null,
  library: [], // the full manifest set, never mutated
  difficulty: null, // TTT only: 'Easy' | 'Medium' | 'Hard'
  allTracks: [], // the active pool (full, or difficulty-filtered for TTT)
  tracks: [], // active set (pool, or wrong-only when Brad's filter is on)
  queue: [], // shuffled, not-yet-played this run
  current: null,
  currentStartMs: null,
  wrongOnly: false, // Brad only
  phase: 'idle', // choosing | idle | playing | paused | buzzed | revealed
  autoMissed: false, // true when the current reveal came from the timer expiring
  timeLeftMs: AUTO_REVEAL_MS,
  timerId: null,
  prevSecs: null,
  roundStart: 0, // Date.now() when the song started playing
  timeToBuzzMs: 0, // how long he took to buzz on the current song
  confirmingDelete: false, // Brad only: the remove-song confirm dialog is open
  busy: false,
  error: null,
};

// Session stats (reset on reload) for the top strip.
const stats = {
  streak: 0,
  bestStreak: 0,
  correct: 0,
  wrong: 0,
  timesMs: [],
};
function recordStats(correct, timeToBuzzMs) {
  if (correct) {
    stats.correct++;
    stats.streak++;
    if (stats.streak > stats.bestStreak) stats.bestStreak = stats.streak;
    if (typeof timeToBuzzMs === 'number' && timeToBuzzMs > 0) {
      stats.timesMs.push(timeToBuzzMs);
      if (stats.timesMs.length > 20) stats.timesMs.shift();
    }
  } else {
    stats.wrong++;
    stats.streak = 0;
  }
}
function avgGuessSec() {
  if (!stats.timesMs.length) return null;
  return stats.timesMs.reduce((a, b) => a + b, 0) / stats.timesMs.length / 1000;
}

// ---- manifest -> track objects ---------------------------------------------

// Percent-encode each path segment but keep the slashes, so
// "Easy/Bad Romance.mp3" -> "Easy/Bad%20Romance.mp3".
function trackUrl(file) {
  const enc = String(file).split('/').map(encodeURIComponent).join('/');
  return `${AUDIO_BASE}/${enc}`;
}

function buildTracks(m) {
  const songs = (m && m.songs) || [];
  return songs.map((s) => ({
    id: s.file, // stable unique key (the path), used by Progress
    title: s.title,
    artist: s.artist,
    difficulty: s.difficulty,
    duration_ms: Math.round((s.duration || 0) * 1000),
    snippet: !!s.snippet,
    note: s.note || null,
    url: trackUrl(s.file),
  }));
}

// The full pool for this build. Brad excludes permanently-removed songs;
// Tap That Track always gets the complete library (deletions don't affect it).
function buildLibrary() {
  const all = buildTracks(manifest);
  return isTTT ? all : all.filter((t) => !Progress.isRemoved(t.id));
}

// ---- haptics ---------------------------------------------------------------
//
// Android Chrome / Firefox / Samsung Internet honour navigator.vibrate() when
// it's called *synchronously* inside a user gesture. Chromium also wants a
// short "priming" vibrate on the first interaction before later calls fire
// reliably, so we do that once.
//
// iOS Safari has NO web haptic API — not in a tab, not in a PWA, not in
// standalone mode (still true as of mid-2025). Calls here are silently
// ignored on iOS. There is no workaround that's both reliable and AppStore-
// safe; previous tricks (label-on-switch-input, AudioContext clicks) have
// all stopped working.

let hapticPrimed = false;
function primeHaptic() {
  if (hapticPrimed) return;
  hapticPrimed = true;
  if (navigator.vibrate) {
    try { navigator.vibrate(1); } catch { /* ignore */ }
  }
}

function haptic(ms = 18) {
  // Must run synchronously inside the gesture — never await before this.
  primeHaptic();
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}

// ---- shimmer orbs over the background --------------------------------------

function buildOrbs() {
  const layer = document.getElementById('orbs');
  if (!layer || layer.childElementCount) return;
  const colors = [
    { c: 'rgba(255, 130, 210, 1)', glow: 'rgba(255, 45, 158, 0.95)' }, // magenta
    { c: 'rgba(190, 210, 255, 1)', glow: 'rgba(47, 123, 255, 0.95)' }, // blue
    { c: 'rgba(255, 255, 255, 1)', glow: 'rgba(255, 255, 255, 0.85)' }, // white
    { c: 'rgba(230, 180, 255, 1)', glow: 'rgba(190, 130, 255, 0.95)' }, // lavender
    { c: 'rgba(150, 235, 255, 1)', glow: 'rgba(0, 210, 255, 0.85)' }, // cyan
  ];
  const N = 60;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < N; i++) {
    const o = document.createElement('span');
    o.className = 'orb';
    const isHero = i % 6 === 0;
    const size = isHero ? 9 + Math.random() * 6 : 3.5 + Math.random() * 5.5;
    const color = colors[i % colors.length];
    o.style.width = o.style.height = size + 'px';
    o.style.left = Math.random() * 100 + '%';
    o.style.top = Math.random() * 100 + '%';
    o.style.background = color.c;
    // hot white core + two colored glow rings -> brighter, sparklier pinpoints
    o.style.boxShadow =
      `0 0 ${(size * 1).toFixed(1)}px rgba(255,255,255,0.9),` +
      `0 0 ${(size * 2.8).toFixed(1)}px ${color.glow},` +
      `0 0 ${(size * 7).toFixed(1)}px ${color.glow}`;
    o.style.setProperty('--dx', (Math.random() * 54 - 27).toFixed(1) + 'px');
    o.style.setProperty('--dy', (Math.random() * 54 - 27).toFixed(1) + 'px');
    o.style.setProperty('--shimmer', (1.2 + Math.random() * 2.2).toFixed(2) + 's');
    o.style.setProperty('--drift', (8 + Math.random() * 11).toFixed(1) + 's');
    o.style.setProperty('--delay', (-Math.random() * 4).toFixed(2) + 's');
    frag.appendChild(o);
  }
  layer.appendChild(frag);
}

// ---- tiny render helpers ---------------------------------------------------

function brandHeader() {
  return `
    <div class="brand">
      <img class="brand-logo" src="${logoUrl}" alt="${esc(APP_NAME)}" />
    </div>`;
}

// Returns just the children of <div class="stats">. The wrapper is part of the
// persistent shell so we can patch the strip without touching surrounding DOM.
function statsInnerHtml() {
  const avg = avgGuessSec();
  const total = stats.correct + stats.wrong;
  const flameSvg = `<svg class="stat-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2c2 4-1 6-1 9a3 3 0 006 0c0-1.5-.5-2.5-1.5-3.5 3 1 5 4 5 7.5a8 8 0 11-15.4-3.1c.8 1.8 2.6 3.1 4.4 3.1-2-3 0-7 2.5-13z"/></svg>`;
  const clockSvg = `<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
  const targetSvg = `<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>`;
  const avgStr = avg !== null ? avg.toFixed(1) + 's' : '—';
  const winStr = total > 0 ? `${stats.correct}/${total}` : '—';
  return `
    <div class="stat win">
      ${targetSvg}
      <span class="stat-label">Win</span>
      <span class="stat-val">${winStr}</span>
    </div>
    <div class="stat avg">
      ${clockSvg}
      <span class="stat-label">Avg</span>
      <span class="stat-val">${avgStr}</span>
    </div>
    <div class="stat streak">
      ${flameSvg}
      <span class="stat-label">Streak</span>
      <span class="stat-val">${stats.streak}</span>
    </div>`;
}

function mount(html) {
  app.innerHTML = html;
}

function $(id) {
  return document.getElementById(id);
}

function on(id, evt, fn) {
  const node = $(id);
  if (node) node.addEventListener(evt, fn);
}

// ---- difficulty chooser (Tap That Track) -----------------------------------

function renderChooser() {
  // The chooser overwrites #app, so the game shell is no longer there. Force
  // mountGameShell() to rebuild it next time we transition into the game.
  gameShellMounted = false;
  mount(`
    ${brandHeader()}
    <div class="chooser-wrap">
      <div class="modal">
        <div class="modal-title">Choose your level</div>
        <div class="modal-sub">Pick a difficulty to start</div>
        <div class="diff-grid">
          <button class="diff-btn diff-easy" data-diff="Easy">
            <span class="diff-name">Easy</span>
          </button>
          <button class="diff-btn diff-medium" data-diff="Medium">
            <span class="diff-name">Medium</span>
          </button>
          <button class="diff-btn diff-hard" data-diff="Hard">
            <span class="diff-name">Hard</span>
          </button>
        </div>
      </div>
    </div>
  `);
  document.querySelectorAll('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      haptic(18);
      chooseDifficulty(b.getAttribute('data-diff'));
    })
  );
}

function chooseDifficulty(d) {
  state.difficulty = d;
  state.phase = 'idle';
  applyTrackSet();
  renderGame();
}

// ---- the static centre box: instructions / countdown / revealed song -------

function timerNum(extra = '') {
  const secs = Math.ceil(state.timeLeftMs / 1000);
  const cls =
    state.timeLeftMs <= 5000 ? ' low' : state.timeLeftMs <= 10000 ? ' mid' : '';
  return `<div class="timer-num${cls}${extra}" id="timerCount">${secs}</div>`;
}

function infoBoxContent() {
  const cur = state.current;

  if (state.phase === 'revealed' && cur) {
    return `
      <div class="reveal">
        ${state.autoMissed ? `<div class="info-note">Time's up · marked wrong</div>` : ''}
        <div class="np-title">${esc(cur.title)}</div>
        <div class="np-artist">${esc(cur.artist)}</div>
      </div>`;
  }
  if (state.phase === 'playing' && cur) return timerNum();
  if (state.phase === 'buzzed' && cur) return timerNum(' frozen');
  if (state.phase === 'paused' && cur) {
    return `<div class="info-lead">Paused</div><div class="info-sub">Hit the buzzer to resume</div>`;
  }
  // idle
  if (state.tracks.length === 0) {
    return `
      <div class="info-lead">${state.wrongOnly ? 'No missed songs yet' : 'No songs loaded'}</div>
      <div class="info-sub">${
        state.wrongOnly
          ? 'Turn off Missed to practice the full list.'
          : 'Check songs.json in the tracks folder.'
      }</div>`;
  }
  return `<div class="info-lead">Hit the buzzer to start</div>`;
}

// ---- the buzzer, pinned to the bottom --------------------------------------

function buzzerZoneContent() {
  const cur = state.current;

  if (state.phase === 'revealed' && cur) {
    if (state.autoMissed) {
      return `<button data-action="buzzer" id="buzzer" class="bigplay next"><span class="buzz-label">NEXT &#9654;</span></button>`;
    }
    return `
      <div class="bigplay split" role="group" aria-label="Grade your guess">
        <button data-action="miss" id="missBtn" class="half half-miss"><span>MISSED</span></button>
        <button data-action="got" id="gotBtn" class="half half-got"><span>GOT IT</span></button>
      </div>`;
  }
  if (state.phase === 'buzzed' && cur) {
    return `<button data-action="buzzer" id="buzzer" class="bigplay reveal"><span class="buzz-label">REVEAL</span></button>`;
  }
  if (state.phase === 'playing' && cur) {
    return `<button data-action="buzzer" id="buzzer" class="bigplay buzz" ${state.busy ? 'disabled' : ''}>
      ${state.busy ? '<span class="spinner"></span>' : '<span class="buzz-label">BUZZ</span>'}
    </button>`;
  }
  if (state.phase === 'paused' && cur) {
    return `<button data-action="buzzer" id="buzzer" class="bigplay resume"><span class="buzz-label">&#9654;</span></button>`;
  }
  // idle
  if (state.tracks.length === 0) return '';
  return `<button data-action="buzzer" id="buzzer" class="bigplay start"><span class="buzz-label">START</span></button>`;
}

// Returns just the children of <div class="bottombar"> (the wrapper is part of
// the persistent shell). The inner wrapper class still varies per build because
// TTT uses a single centered button vs Brad's three-button row.
function bottombarInnerHtml() {
  const canPause = state.phase === 'playing' && !state.busy;
  const pauseBtn = `
    <button data-action="pause" id="pauseBtn" class="bar-btn" ${canPause ? '' : 'disabled'}>
      <svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
      <span class="label">Pause</span>
    </button>`;

  // Tap That Track: no Missed filter — just Pause.
  if (isTTT) {
    return `
      <div class="bottombar-inner single">
        ${pauseBtn}
      </div>`;
  }

  // Brad Names Tunes: Pause + remove-song + the Missed drill filter.
  const wrongN = Progress.wrongCount(state.allTracks);
  const canFilter = state.phase === 'idle' || state.phase === 'paused';
  const canRemove = !!state.current; // a song is loaded (any in-round phase)
  return `
    <div class="bottombar-inner">
      ${pauseBtn}
      <button data-action="remove" id="removeBtn" class="bar-btn bar-x" ${canRemove ? '' : 'disabled'} aria-label="Remove this song" title="Remove this song">
        <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      <button data-action="filter" id="filterToggle" class="bar-btn filter-toggle ${
        state.wrongOnly ? 'active' : ''
      }" ${canFilter ? '' : 'disabled'}>
        <svg class="ico" viewBox="0 0 24 24" fill="${
          state.wrongOnly ? 'currentColor' : 'none'
        }" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linejoin="round" stroke-linecap="round" d="M12 3l2.6 5.6L20 9.4l-4.2 4.1 1 5.9L12 16.8 7.2 19.4l1-5.9L4 9.4l5.4-.8z"/></svg>
        <span class="label">Missed${wrongN ? ` (${wrongN})` : ''}</span>
      </button>
    </div>`;
}

// ---- persistent shell ------------------------------------------------------
//
// We build the game DOM (brand / stats / info-box / buzzer-zone / bottombar)
// ONCE and only patch the bits that actually change between phases. The
// previous wholesale innerHTML rebuild was restarting the brand-aura,
// logo-glow, and buzz-glow animations from frame 0 on every tap, which is
// what was making the page "flash" between phases.
//
// All button clicks are dispatched by a single delegated listener on #app, so
// patching innerHTML never costs us bound event handlers.

let gameShellMounted = false;
let firstPaintDone = false;

function mountGameShell() {
  if (gameShellMounted) return;
  const fpClass = firstPaintDone ? '' : ' first-paint';
  app.innerHTML = `
    ${brandHeader()}
    <div class="stats" id="statsRow"></div>
    <div class="info-box card fade-swap${fpClass}" id="infoBox"></div>
    <div id="errorArea"></div>
    <div class="buzzer-zone" id="buzzerZone"></div>
    <div class="bottombar" id="bottomBar"></div>
  `;
  gameShellMounted = true;
}

let appDelegationWired = false;
function wireAppDelegation() {
  if (appDelegationWired) return;
  appDelegationWired = true;

  // Disabled <button>s don't fire click events at all, so we don't have to
  // guard for that here.
  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'buzzer') onBuzzerTap();
    else if (action === 'got') onGotIt();
    else if (action === 'miss') onMissed();
    else if (action === 'pause') onPause();
    else if (action === 'filter') onToggleWrongOnly();
    else if (action === 'remove') onRemoveTap();
  });

  // pointerdown fires BEFORE click, which is the spot to do haptic + ripple
  // so the press feels instant. We also have to call haptic() synchronously
  // from within the gesture for Android Chrome to honour the vibrate.
  app.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || t.disabled) return;
    const action = t.dataset.action;
    if (action === 'buzzer') {
      addRipple(t, e);
      // The buzzer is the headline control — give it a slightly meatier tap.
      haptic(state.phase === 'playing' ? 30 : 22);
    } else if (action === 'got') {
      addRipple(t.parentElement, e);
      haptic(28);
    } else if (action === 'miss') {
      addRipple(t.parentElement, e);
      haptic(40);
    } else if (action === 'pause' || action === 'filter' || action === 'remove') {
      haptic(12);
    }
  });
}

function renderGame() {
  if (state.phase === 'choosing') return; // chooser owns its own DOM tree
  mountGameShell();

  // stats strip
  $('statsRow').innerHTML = statsInnerHtml();

  // info-box content + revealed orbit ring
  const ib = $('infoBox');
  ib.innerHTML = infoBoxContent();
  const shouldReveal =
    state.phase === 'revealed' && state.current && !state.autoMissed;
  if (shouldReveal) {
    // Re-trigger the orbit animation cleanly: remove the class, force a
    // reflow, then add it back. Without the reflow the browser would
    // coalesce remove+add into a no-op and the animation wouldn't restart.
    ib.classList.remove('revealed');
    void ib.offsetWidth;
    ib.classList.add('revealed');
  } else {
    ib.classList.remove('revealed');
  }

  // buzzer + bottombar (only their contents change; the wrappers stay put)
  $('buzzerZone').innerHTML = buzzerZoneContent();
  $('bottomBar').innerHTML = bottombarInnerHtml();

  // first-paint fade is one-shot — let it play out, then strip the class so
  // subsequent phase changes are instant (which is what fluid play wants).
  if (!firstPaintDone) {
    setTimeout(() => {
      const elBox = $('infoBox');
      if (elBox) elBox.classList.remove('first-paint');
      firstPaintDone = true;
    }, 360);
  }

  syncModal();

  if (state.error) renderErrorInline(state.error);
}

// ---- remove-song confirm dialog (Brad only) --------------------------------

function syncModal() {
  if (!modalRoot) return;
  if (!state.confirmingDelete || !state.current) {
    modalRoot.innerHTML = '';
    return;
  }
  const cur = state.current;
  modalRoot.innerHTML = `
    <div class="confirm-scrim">
      <div class="modal confirm-modal">
        <div class="modal-title">Remove this song?</div>
        <div class="confirm-song">${esc(cur.title)}<span class="confirm-artist">${esc(cur.artist)}</span></div>
        <div class="modal-sub">Drops it from your playlist and your missed list, for good. The audio file stays — Tap That Track still has it.</div>
        <div class="confirm-actions">
          <button id="cancelRemove" class="confirm-btn cancel">Cancel</button>
          <button id="confirmRemove" class="confirm-btn danger">Remove</button>
        </div>
      </div>
    </div>`;
  on('cancelRemove', 'click', onCancelRemove);
  on('confirmRemove', 'click', onConfirmRemove);
}

async function onRemoveTap() {
  if (!state.current) return;
  haptic(14);
  // Freeze the round while the dialog is up so the timer can't expire under it.
  stopTimer();
  try {
    await state.player.pause();
  } catch {
    /* ignore */
  }
  state.confirmingDelete = true;
  renderGame();
}

async function onCancelRemove() {
  state.confirmingDelete = false;
  // If we interrupted active playback, pick it back up; otherwise just close.
  if (state.phase === 'playing' && state.current) {
    try {
      await state.player.resume();
    } catch (e) {
      state.error = humanizeError(e);
    }
    renderGame();
    startTimer();
  } else {
    renderGame();
  }
}

function onConfirmRemove() {
  const cur = state.current;
  state.confirmingDelete = false;
  if (!cur) {
    renderGame();
    return;
  }
  haptic(40);
  Progress.addRemoved(cur.id); // out of the main pool AND the missed list
  state.library = buildLibrary();
  applyTrackSet();
  // The removed song was the current one; move on to a fresh song.
  if (state.tracks.length) {
    nextRound();
  } else {
    state.current = null;
    state.phase = 'idle';
    renderGame();
  }
}

function addRipple(el, e) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = e.clientX - r.left || r.width / 2;
  const y = e.clientY - r.top || r.height / 2;
  const d = Math.max(r.width, r.height);
  const node = document.createElement('span');
  node.className = 'ripple';
  node.style.width = node.style.height = d + 'px';
  node.style.left = x - d / 2 + 'px';
  node.style.top = y - d / 2 + 'px';
  el.appendChild(node);
  setTimeout(() => node.remove(), 750);
}

// ---- countdown timer -------------------------------------------------------

function startTimer() {
  stopTimer();
  state.prevSecs = Math.ceil(state.timeLeftMs / 1000);
  state.timerId = setInterval(() => {
    state.timeLeftMs -= 100;
    if (state.timeLeftMs <= 0) {
      state.timeLeftMs = 0;
      updateTimerDom();
      stopTimer();
      onTimeUp();
      return;
    }
    updateTimerDom();
  }, 100);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

// Update the number in place so we don't re-render (and re-bind) 10x/second.
function updateTimerDom() {
  const c = $('timerCount');
  if (!c) return;
  const secs = Math.ceil(state.timeLeftMs / 1000);
  c.textContent = secs;
  c.classList.toggle('low', state.timeLeftMs <= 5000);
  c.classList.toggle('mid', state.timeLeftMs <= 10000 && state.timeLeftMs > 5000);
  if (state.prevSecs !== secs) {
    c.classList.remove('tick');
    void c.offsetWidth; // restart the animation
    c.classList.add('tick');
    state.prevSecs = secs;
    if (state.timeLeftMs <= 5000) haptic(8);
  }
}

// ---- library loading + filtering -------------------------------------------

function applyTrackSet() {
  let base = state.library;
  if (isTTT && state.difficulty) {
    base = base.filter((t) => t.difficulty === state.difficulty);
  }
  state.allTracks = base;
  state.tracks =
    !isTTT && state.wrongOnly ? Progress.filterWrong(state.allTracks) : state.allTracks;
  state.queue = shuffle(state.tracks);
}

async function stopPlayback() {
  stopTimer();
  try {
    if (state.player) await state.player.pause();
  } catch {
    /* ignore */
  }
}

function loadLibrary() {
  state.error = null;
  state.current = null;
  state.wrongOnly = false;
  state.library = buildLibrary();

  if (state.library.length === 0) {
    state.error = 'No songs found in tracks/songs.json.';
    state.phase = 'idle';
    applyTrackSet();
    renderGame();
    return;
  }

  // Tap That Track opens on the difficulty pop-up.
  if (isTTT && !state.difficulty) {
    state.phase = 'choosing';
    renderChooser();
    return;
  }

  state.phase = 'idle';
  applyTrackSet();
  renderGame();
}

async function onToggleWrongOnly() {
  if (isTTT) return; // no Missed system in Tap That Track
  state.wrongOnly = !state.wrongOnly;
  await stopPlayback();
  applyTrackSet();
  state.current = null;
  state.phase = 'idle';
  renderGame();
}

// ---- the round loop --------------------------------------------------------

// START always deals a brand-new shuffle so the run order is never repeated.
function startFresh() {
  state.queue = shuffle(state.tracks);
  nextRound();
}

async function nextRound() {
  state.autoMissed = false;
  if (state.tracks.length === 0) {
    state.phase = 'idle';
    renderGame();
    return;
  }
  if (state.queue.length === 0) state.queue = shuffle(state.tracks); // reshuffle when exhausted

  const track = state.queue.shift();
  // Start point: HOOK_FRACTION ± a little wander, clamped to a safe window.
  const frac = HOOK_FRACTION + (Math.random() * 2 - 1) * HOOK_JITTER;
  const clamped = Math.min(0.6, Math.max(0.05, frac));
  const positionMs = Math.floor((track.duration_ms || 0) * clamped);

  state.current = track;
  state.currentStartMs = positionMs;
  state.phase = 'playing';
  state.timeLeftMs = AUTO_REVEAL_MS;
  state.error = null;
  state.busy = true;
  renderGame();

  try {
    await state.player.playTrack(track, positionMs);
    state.busy = false;
    state.roundStart = Date.now();
    renderGame();
    startTimer();
  } catch (e) {
    state.busy = false;
    state.error = humanizeError(e);
    state.phase = 'idle';
    renderGame();
  }
}

// The buzzer's job depends on the phase — dispatch accordingly.
async function onBuzzerTap() {
  switch (state.phase) {
    case 'idle':
      haptic(22);
      startFresh(); // START: fresh shuffle, then play the first song
      break;
    case 'playing':
      haptic(28);
      await buzzLockIn(); // lock in: pause + freeze the clock
      break;
    case 'paused':
      haptic(18);
      await resumePlay(); // resume after a neutral pause
      break;
    case 'buzzed':
      haptic(18);
      state.autoMissed = false;
      state.phase = 'revealed'; // REVEAL the answer
      renderGame();
      break;
    case 'revealed':
      if (state.autoMissed) {
        haptic(18);
        nextRound(); // NEXT after an auto-miss
      }
      break;
  }
}

async function buzzLockIn() {
  stopTimer();
  state.timeToBuzzMs = Date.now() - state.roundStart;
  try {
    await state.player.pause();
  } catch (e) {
    state.error = humanizeError(e);
  }
  state.phase = 'buzzed';
  renderGame();
}

async function resumePlay() {
  try {
    await state.player.resume();
  } catch (e) {
    state.error = humanizeError(e);
  }
  state.phase = 'playing';
  renderGame();
  startTimer(); // resumes from the remaining time
}

function onGotIt() {
  haptic(30);
  if (!state.current) return;
  if (!isTTT) Progress.recordResult(state.current.id, true);
  recordStats(true, state.timeToBuzzMs);
  burstConfetti();
  // small delay so the confetti is visibly mid-air when the next round renders
  setTimeout(() => nextRound(), 80);
}

function onMissed() {
  haptic(40);
  if (!state.current) return;
  if (!isTTT) Progress.recordResult(state.current.id, false);
  recordStats(false);
  nextRound();
}

async function onTimeUp() {
  // No buzz in 20s -> automatic miss. Reveal so he learns it.
  try {
    await state.player.pause();
  } catch {
    /* ignore */
  }
  if (state.current) {
    if (!isTTT) Progress.recordResult(state.current.id, false);
    recordStats(false);
  }
  state.autoMissed = true;
  state.phase = 'revealed';
  haptic(40);
  renderGame();
}

async function onPause() {
  haptic(10);
  if (state.phase !== 'playing') return;
  stopTimer();
  try {
    await state.player.pause();
  } catch (e) {
    state.error = humanizeError(e);
  }
  state.phase = 'paused';
  renderGame();
}

// ---- confetti (GOT IT) -----------------------------------------------------

function burstConfetti() {
  if (!confettiLayer) return;
  const cs = ['#ff2d9e', '#2f7bff', '#7a2bd6', '#cbb6f2', '#00d2ff', '#ffffff'];
  const N = 44;
  const ox = 50; // burst origin ~ where the buzzer is
  const oy = 70;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < N; i++) {
    const el = document.createElement('span');
    el.className = 'confetti';
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
    const dist = 180 + Math.random() * 280;
    el.style.left = ox + '%';
    el.style.top = oy + '%';
    el.style.setProperty('--dx', (Math.cos(angle) * dist).toFixed(0) + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist).toFixed(0) + 'px');
    el.style.setProperty('--rz', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    el.style.setProperty('--dur', (1.1 + Math.random() * 0.9).toFixed(2) + 's');
    el.style.background = cs[i % cs.length];
    el.style.transform = `rotate(${(Math.random() * 360).toFixed(0)}deg)`;
    frag.appendChild(el);
  }
  confettiLayer.appendChild(frag);
  setTimeout(() => {
    for (let i = 0; i < N && confettiLayer.firstChild; i++) {
      confettiLayer.firstChild.remove();
    }
  }, 2200);
}

// ---- errors ----------------------------------------------------------------

function humanizeError(e) {
  return e?.message || String(e);
}

function renderErrorInline(msg) {
  const area = $('errorArea');
  if (area) area.innerHTML = `<div class="banner error">${esc(msg)}</div>`;
}

// ---- bootstrap -------------------------------------------------------------

async function bootstrap() {
  // Brad persists the missed + removed lists, so ask the browser to keep its
  // storage durable. Tap That Track is intentionally stateless (a fresh session
  // every load), so it requests nothing and writes nothing.
  if (!isTTT && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  buildOrbs();
  wireAppDelegation();
  state.player = createPlayer();
  try {
    await state.player.init();
  } catch (e) {
    state.error = humanizeError(e);
  }
  loadLibrary();
}

bootstrap();
