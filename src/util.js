// Small shared helpers.

// Treat iPhone, iPad, and Android as "mobile" -> use Spotify Connect.
// Everything else (desktop browsers) -> use the Web Playback SDK.
// Note: modern iPads report as "MacIntel" but expose touch points, so we sniff
// that to avoid mistaking an iPad for a desktop Mac.
export function isMobile() {
  const ua = navigator.userAgent || '';
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  return iOS || android;
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// Seconds with one decimal, e.g. 4.3s
export function formatTime(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

// Escape text before injecting into innerHTML.
export function esc(str) {
  return String(str ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Fisher–Yates shuffle (returns a new array).
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
