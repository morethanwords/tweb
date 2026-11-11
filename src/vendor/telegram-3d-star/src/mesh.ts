// star.mesh is a lossless repack of Telegram's star.binobj: each distinct vertex once, three indices per triangle.
// Little-endian:
//   u32 magic 'MESH', u32 vertex count V, u32 index count, u32 flags (MESH_PLANES, MESH_WIDE)
//   f32 positions[3V], f32 uvs[2V] (v already flipped), f32 normals[3V], then the index codes, u16 or u32 (MESH_WIDE)
// Vertices are numbered in order of first use, so each code says how far back its index points: 0 is a new vertex.
// MESH_PLANES stores each array byte-plane by byte-plane, which gzip compresses tighter for noisy floats.

/** Positions 3, uvs 2 and normals 3 per vertex; indices 3 per triangle. */
export interface Mesh {
  positions: Float32Array;
  uvs: Float32Array;
  normals: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** 'MESH' as a little-endian u32. */
export const MESH_MAGIC = 0x4853454d;
export const MESH_PLANES = 1;
export const MESH_WIDE = 2;

export function parseMesh(data: ArrayBuffer): Mesh {
  const view = new DataView(data);
  if (data.byteLength < 16 || view.getUint32(0, true) !== MESH_MAGIC) throw new Error('not a mesh');
  const vertices = view.getUint32(4, true);
  const count = view.getUint32(8, true);
  const flags = view.getUint32(12, true);
  if (flags & ~(MESH_PLANES | MESH_WIDE)) throw new Error('unknown mesh flags');
  const wide = (flags & MESH_WIDE) !== 0;
  if (16 + vertices * 32 + count * (wide ? 4 : 2) !== data.byteLength) throw new Error('corrupt mesh');
  let at = 16;
  // n values of size bytes each, in their own buffer, back in little-endian byte order.
  const take = (n: number, size: number): ArrayBuffer => {
    const bytes = new Uint8Array(data, at, n * size);
    at += n * size;
    if (!(flags & MESH_PLANES)) return bytes.slice().buffer;
    const out = new Uint8Array(n * size);
    for (let b = 0; b < size; b++) for (let i = 0; i < n; i++) out[i * size + b] = bytes[b * n + i]!;
    return out.buffer;
  };
  const positions = new Float32Array(take(vertices * 3, 4));
  const uvs = new Float32Array(take(vertices * 2, 4));
  const normals = new Float32Array(take(vertices * 3, 4));
  const indices = wide ? new Uint32Array(take(count, 4)) : new Uint16Array(take(count, 2));
  let next = 0;
  for (let i = 0; i < count; i++) {
    const back = indices[i]!;
    if (back > next) throw new Error('corrupt mesh');
    indices[i] = next - back;
    if (back === 0) next++;
  }
  if (next !== vertices) throw new Error('corrupt mesh');
  return { positions, uvs, normals, indices };
}
