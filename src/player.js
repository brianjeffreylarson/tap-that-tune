// Playback layer — a single HTML5 <audio> element streaming MP3s from wherever
// AUDIO_BASE points (the Vite dev middleware in local dev; a Cloudflare R2 /
// public bucket in production).
//
// This replaces the old Spotify Web Playback SDK / Connect backends. One element
// works identically on desktop and mobile, so there's no device picker anymore.
//
// Interface used by the game (main.js):
//   await player.init()
//   player.ready                       -> boolean
//   await player.playTrack(track, positionMs)
//   await player.pause()
//   await player.resume()
//
// `track` is the manifest-derived object: { id, title, artist, duration_ms, url }.

export function createPlayer() {
  return new AudioPlayer();
}

class AudioPlayer {
  constructor() {
    this.mode = 'audio';
    this.ready = false;
    this._audio = null;
    this._seekTo = 0;
    this._seekHandler = null;
    this.onError = null; // optional callback(message)
  }

  async init() {
    const a = new Audio();
    a.preload = 'auto';
    // IMPORTANT: do NOT set crossOrigin. Plain playback (incl. range requests)
    // works cross-origin without CORS; setting it would force a CORS preflight
    // and require the bucket to send CORS headers. We never read raw samples.
    a.addEventListener('error', () => {
      if (this.onError) this.onError(this._mediaErrorMessage());
    });
    this._audio = a;
    this.ready = true;
  }

  // Load `track`, start playing, and jump to `positionMs`. We keep the element
  // muted until the seek lands so the listener never hears the intro (which on a
  // "name that tune" game could give the song away).
  async playTrack(track, positionMs = 0) {
    const a = this._audio;
    if (!a) throw new Error('Audio player not initialized.');

    // Clear any previous one-shot seek listener.
    if (this._seekHandler) {
      a.removeEventListener('loadedmetadata', this._seekHandler);
      this._seekHandler = null;
    }

    const target = Math.max(0, positionMs / 1000);
    this._seekTo = target;

    a.muted = true;
    a.src = track.url;
    a.load();

    const doSeek = () => {
      // Clamp to just shy of the end in case the manifest duration drifted.
      const dur = isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity;
      try {
        a.currentTime = Math.min(this._seekTo, dur - 0.3);
      } catch {
        /* seeking before the element is ready; loadedmetadata will retry */
      }
    };

    // Unmute only once we've actually landed on the seek target.
    const onSeeked = () => {
      a.muted = false;
      a.removeEventListener('seeked', onSeeked);
    };
    a.addEventListener('seeked', onSeeked);

    // Seek as soon as metadata is available (usually before audible playback).
    this._seekHandler = () => {
      doSeek();
    };
    a.addEventListener('loadedmetadata', this._seekHandler, { once: true });

    // Kick off playback. This call must happen with no preceding await so it
    // stays inside the user-gesture that triggered it (first play on iOS).
    const playPromise = a.play();

    // If metadata was already buffered, seek right away too.
    if (a.readyState >= 1) doSeek();

    try {
      await playPromise;
    } catch (e) {
      a.muted = false;
      throw this._wrapPlayError(e);
    }
  }

  async pause() {
    // Local, instant — ideal for the buzz-in.
    if (this._audio) this._audio.pause();
  }

  async resume() {
    if (this._audio) await this._audio.play();
  }

  _wrapPlayError(e) {
    const name = e?.name || '';
    if (name === 'NotAllowedError') {
      return new Error(
        'The browser blocked autoplay. Tap the buzzer to start playback.'
      );
    }
    if (name === 'NotSupportedError') {
      return new Error('Could not load this track (bad URL or unsupported file).');
    }
    return e instanceof Error ? e : new Error(String(e));
  }

  _mediaErrorMessage() {
    const err = this._audio && this._audio.error;
    const code = err && err.code;
    switch (code) {
      case 1: // MEDIA_ERR_ABORTED
        return 'Playback was aborted.';
      case 2: // MEDIA_ERR_NETWORK
        return 'Network error while loading the track. Check your connection or the audio host.';
      case 3: // MEDIA_ERR_DECODE
        return 'The audio file could not be decoded.';
      case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
        return 'Track not found or not playable at that URL. Check VITE_AUDIO_BASE.';
      default:
        return 'Playback error.';
    }
  }
}
