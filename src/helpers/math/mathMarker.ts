/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// Inline math (`$x$`) is carried through the markdown / RichText pipeline as a base64-encoded source
// wrapped in STX (\x02) sentinels. base64 contains no markdown-special characters, so the LaTeX
// source survives the emphasis / escape passes and parseMarkdown untouched; the IV later decodes &
// renders it with Temml (see instantViewMath). Mirrors how WebA (telegram-tt) renders `textMath`.

const STX = '\x02';

export const MATH_MARKER_RE = /\x02([A-Za-z0-9+/=]+)\x02/g;

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for(let i = 0; i < bytes.length; ++i) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeInlineMath(source: string): string {
  return STX + toBase64(source) + STX;
}

export function decodeInlineMath(encoded: string): string {
  return fromBase64(encoded);
}
