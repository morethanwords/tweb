export function findIsoBox(box: any, type: string): any {
  if(box.type === type) return box;
  if(!box.boxes) return null;
  for(const b of box.boxes) {
    // todo: avoid recursion
    const res = findIsoBox(b, type);
    if(res) return res;
  }
  return null;
}

export function isoBoxToBuffer(box: any) {
  return new Uint8Array(box._raw.buffer, box._raw.byteOffset, box._raw.byteLength);
}

// groupCallStreamChannel.scale is a signed power-of-two exponent: one chunk is
// 1000 ms / 2^scale. Telegram only ever uses a few values around 0; treat
// anything outside this window as a malformed answer rather than a stream.
// Past it the arithmetic itself breaks — `1000 >> 10` is 0, which made the
// buffer size Infinity and the replenish loop an unbounded allocation inside
// the service worker.
export const RTMP_MAX_ABS_SCALE = 3;

export function scaleToChunkTime(scale: number): number {
  if(!Number.isInteger(scale) || Math.abs(scale) > RTMP_MAX_ABS_SCALE) {
    throw new Error(`Invalid stream channel scale: ${scale}`);
  }

  return scale < 0 ? 1000 << -scale : 1000 >> scale;
}
