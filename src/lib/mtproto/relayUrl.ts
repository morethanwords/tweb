/* GPL-3.0-only: same-origin routing for the endpoints selected by DcConfigurator. */

export const MTPROTO_RELAY_PATH = process.env.VITE_MTPROTO_RELAY_PATH || '';

/** Keep this allowlist in sync with deploy/relay-routes.caddy (tested in CI). */
export function relayUrl(originalUrl: string, relayPath = MTPROTO_RELAY_PATH, origin?: string): string {
  if(!relayPath) return originalUrl;

  // Only an absolute local path, never a URL, query, fragment or encoded separator.
  if(!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\/?$/.test(relayPath)) {
    throw new Error('VITE_MTPROTO_RELAY_PATH must be an absolute local path');
  }

  const upstream = new URL(originalUrl);
  const ws = upstream.protocol === 'wss:';
  const match = /^(kws[1-5]|pluto|venus|aurora|vesta|flora)(-1)?\.web\.telegram\.org$/.exec(upstream.hostname);
  const endpoint = ws ? /^\/apiws(?:_test)?$/ : /^\/apiw(?:1|_test1)$/;
  if(!match || upstream.username || upstream.password || upstream.port || upstream.search || upstream.hash ||
    (!ws && upstream.protocol !== 'https:') || !endpoint.test(upstream.pathname) ||
    ws !== match[1].startsWith('kws')) {
    throw new Error('Unsupported MTProto endpoint');
  }
  if(upstream.pathname.includes('_test') && /^(kws[45]|vesta|flora)$/.test(match[1])) {
    throw new Error('Unsupported test DC');
  }

  // self.location exists in both windows and workers, including the Safari socket proxy.
  const page = new URL(origin === undefined ? self.location.origin : origin);
  if(page.protocol !== 'http:' && page.protocol !== 'https:') throw new Error('Unsupported page origin');
  const protocol = ws ? (page.protocol === 'https:' ? 'wss:' : 'ws:') : page.protocol;
  return `${protocol}//${page.host}${relayPath.replace(/\/$/, '')}/${match[1]}${match[2] || ''}${upstream.pathname}`;
}
