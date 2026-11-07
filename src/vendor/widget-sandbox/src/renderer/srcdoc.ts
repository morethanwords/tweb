// Builds the renderer iframe document (security-critical, invariant 6).

/**
 * CSP of the renderer document. The nonce admits exactly one script: ours. `wasm`: the `frame` sync transport compiles
 * QuickJS inside the frame, which needs 'wasm-unsafe-eval' (wasm compilation only; eval / new Function stay blocked).
 */
export function rendererCsp(nonce: string, wasm = false): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'${wasm ? " 'wasm-unsafe-eval'" : ''}`,
    "style-src 'unsafe-inline'",
    'img-src data: blob:',
    'font-src data:',
    'media-src data: blob:',
    "connect-src 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
}

export function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, 'x');
}

/**
 * The CSP <meta> is the first element of the document, so it is in force
 * before anything else is parsed. `rendererJs` is our own bundle.
 */
export function buildSrcdoc(rendererJs: string, nonce: string, wasm = false): string {
  // Keep the inline script from terminating early.
  const js = rendererJs.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  return (
    '<!DOCTYPE html><html><head>' +
    `<meta http-equiv="Content-Security-Policy" content="${rendererCsp(nonce, wasm)}">` +
    '<meta http-equiv="x-dns-prefetch-control" content="off">' +
    `<script nonce="${nonce}">${js}</script>` +
    '</head><body></body></html>'
  );
}
