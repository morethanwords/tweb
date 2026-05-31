/*
 * Tiny static file server for the built renderer.
 *
 * We serve the app over http://127.0.0.1 (not file://) so that SharedWorker,
 * ServiceWorker, IndexedDB and CacheStorage all behave exactly as they do on the web —
 * file:// breaks worker scopes and storage partitioning. Loopback-only, no deps.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.tgs': 'application/gzip',
  '.wgsl': 'text/plain; charset=utf-8'
};

function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

class StaticServer {
  /** @param {string} root absolute path to the built app (dist/) */
  constructor(root, log) {
    this.root = root;
    this.log = log || (() => {});
    this.port = 0;
    this.origin = '';
    this._server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      const server = this._server = http.createServer((req, res) => this._handle(req, res));
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        this.port = server.address().port;
        this.origin = 'http://127.0.0.1:' + this.port;
        this.log('static server:', this.origin, '->', this.root);
        resolve(this.origin);
      });
    });
  }

  close() {
    try {
      this._server && this._server.close();
    } catch(e) {}
  }

  _resolve(urlPath) {
    // Strip query/hash, decode, and prevent path traversal.
    let p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
    if(p === '/' || p === '') p = '/index.html';
    const resolved = path.normalize(path.join(this.root, p));
    if(!resolved.startsWith(this.root)) return null;
    return resolved;
  }

  _handle(req, res) {
    let file = this._resolve(req.url);
    const sendIndex = () => this._sendFile(req, res, path.join(this.root, 'index.html'));

    if(!file) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(file, (err, stat) => {
      if(err || !stat.isFile()) {
        // SPA fallback for navigation requests; everything else is a real 404.
        const accept = req.headers['accept'] || '';
        if(accept.includes('text/html')) return sendIndex();
        res.writeHead(404);
        return res.end('Not found');
      }
      this._sendFile(req, res, file, stat);
    });
  }

  _sendFile(req, res, file, stat) {
    const finish = (st) => {
      const headers = {
        'Content-Type': contentType(file),
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'bytes'
      };
      // The MTProto ServiceWorker registers at the app root; allow the widest scope.
      if(file.endsWith('.js') || file.endsWith('.mjs')) headers['Service-Worker-Allowed'] = '/';

      const range = req.headers.range;
      if(range && st) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        if(m) {
          let start = m[1] ? parseInt(m[1], 10) : 0;
          let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
          if(start > end || start >= st.size) {
            res.writeHead(416, {'Content-Range': 'bytes */' + st.size});
            return res.end();
          }
          headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
          headers['Content-Length'] = end - start + 1;
          res.writeHead(206, headers);
          if(req.method === 'HEAD') return res.end();
          return fs.createReadStream(file, {start, end}).pipe(res);
        }
      }

      if(st) headers['Content-Length'] = st.size;
      res.writeHead(200, headers);
      if(req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    };

    if(stat) finish(stat);
    else fs.stat(file, (e, st) => (e ? (res.writeHead(404), res.end('Not found')) : finish(st)));
  }
}

module.exports = {StaticServer};
