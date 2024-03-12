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
