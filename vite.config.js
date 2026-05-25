import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const tracksDir = path.join(rootDir, 'tracks');

// ---------------------------------------------------------------------------
// Local-dev audio server.
//
// In production the MP3s live on Cloudflare (R2 / a public bucket) and the app
// reads VITE_AUDIO_BASE. In dev we leave that unset, so AUDIO_BASE falls back
// to "/tracks" and this middleware streams files straight out of the local
// tracks/ folder — WITH HTTP range support, which the <audio> element needs to
// seek to the hook (and to buffer efficiently). We never copy the 4.9 GB of
// audio into the bundle; it's served on demand from disk.
// ---------------------------------------------------------------------------
function serveTracks() {
  const handler = (req, res, next) => {
    try {
      // connect strips the "/tracks" mount prefix, so req.url is e.g.
      // "/Easy/Bad%20Romance.mp3".
      const urlPath = decodeURIComponent((req.url || '').split('?')[0]);

      // Only ever serve audio. Anything else under /tracks (notably
      // songs.json, which the app imports as a module) must fall through to
      // Vite so it gets transformed properly — otherwise the import breaks.
      if (!/\.mp3$/i.test(urlPath)) return next();

      const rel = path.normalize(urlPath).replace(/^([/\\])+/, '');
      const filePath = path.join(tracksDir, rel);

      // Path-traversal guard.
      if (!filePath.startsWith(tracksDir)) {
        res.statusCode = 403;
        return res.end('Forbidden');
      }

      fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) return next();

        const total = stat.size;
        const range = req.headers.range;
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', 'audio/mpeg');

        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = m && m[1] ? parseInt(m[1], 10) : 0;
          let end = m && m[2] ? parseInt(m[2], 10) : total - 1;
          if (Number.isNaN(start)) start = 0;
          if (Number.isNaN(end) || end >= total) end = total - 1;
          if (start > end || start >= total) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${total}`);
            return res.end();
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
          res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
          res.statusCode = 200;
          res.setHeader('Content-Length', total);
          fs.createReadStream(filePath).pipe(res);
        }
      });
    } catch (e) {
      next(e);
    }
  };

  return {
    name: 'serve-tracks',
    configureServer(server) {
      server.middlewares.use('/tracks', handler);
    },
    // So `vite preview` of a build made WITHOUT VITE_AUDIO_BASE also plays audio.
    configurePreviewServer(server) {
      server.middlewares.use('/tracks', handler);
    },
  };
}

// Fill the app name into index.html based on the build variant, so the same
// index.html serves both products. Brad Names Tunes is the default.
function appHtmlVars() {
  const variant = (process.env.VITE_APP_VARIANT || 'brad').toLowerCase();
  const name = variant === 'ttt' ? 'Tap That Track' : 'Brad Names Tunes';
  return {
    name: 'app-html-vars',
    transformIndexHtml(html) {
      return html.replace(/%APP_NAME%/g, name);
    },
  };
}

export default defineConfig({
  plugins: [serveTracks(), appHtmlVars()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
