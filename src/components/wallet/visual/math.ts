// Small vector math, no libraries.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
/** 4×4 matrix, column-major, as in GL and simd. */
export type Mat4 = Float32Array;
/** CATransform3D-style matrix: row vector, m11…m44 in a row (16 numbers). */
export type CAMatrix = number[];

type V = ArrayLike<number>;

export const v3 = {
  add: (a: V, b: V): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: V, b: V): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: V, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: V, b: V): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (a: V): number => Math.hypot(a[0], a[1], a[2]),
  normalize: (a: V): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  dist2: (a: V, b: V): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  mix: (a: V, b: V, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
};

// 4×4 matrices, column-major, as in GL and simd.
export const mat4 = {
  identity: (): Mat4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a: V, b: V): Mat4 {
    const o = new Float32Array(16);
    for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++) {
      let s = 0;
      for(let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  transpose(a: V): Mat4 {
    const o = new Float32Array(16);
    for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++) o[c * 4 + r] = a[r * 4 + c];
    return o;
  },
  rotationX(a: number): Mat4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  },
  rotationY(a: number): Mat4 {
    const c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  },
  transformPoint(m: V, p: V): Vec3 {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  },
  transformDirection(m: V, d: V): Vec3 {
    return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
      m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
      m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
  }
};

// CATransform3D-style matrices: row vector, m11…m44 in a row — exactly the
// order of CSS matrix3d(). Translate/Scale/Rotate(t, …) = the operation, then t.
export const ca = {
  identity: (): CAMatrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  concat(a: CAMatrix, b: CAMatrix): CAMatrix {
    const o: CAMatrix = new Array(16);
    for(let r = 0; r < 4; r++) for(let c = 0; c < 4; c++) {
      let s = 0;
      for(let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      o[r * 4 + c] = s;
    }
    return o;
  },
  translation: (x: number, y: number, z = 0): CAMatrix => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  scaling: (x: number, y: number, z = 1): CAMatrix => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  rotation(angle: number, x: number, y: number, z: number): CAMatrix {
    const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [t * x * x + c, t * x * y + z * s, t * x * z - y * s, 0,
      t * x * y - z * s, t * y * y + c, t * y * z + x * s, 0,
      t * x * z + y * s, t * y * z - x * s, t * z * z + c, 0,
      0, 0, 0, 1];
  },
  translate(m: CAMatrix, x: number, y: number, z = 0): CAMatrix {
    return ca.concat(ca.translation(x, y, z), m);
  },
  scale(m: CAMatrix, x: number, y: number, z = 1): CAMatrix {
    return ca.concat(ca.scaling(x, y, z), m);
  },
  rotate(m: CAMatrix, angle: number, x: number, y: number, z: number): CAMatrix {
    return ca.concat(ca.rotation(angle, x, y, z), m);
  },
  css: (m: CAMatrix): string => `matrix3d(${m.map((v) => +v.toFixed(7)).join(',')})`
};

export const clamp = (v: number, limit: number): number => Math.max(-limit, Math.min(limit, v));
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const smoothstep01 = (v: number): number => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
