// The gem's cut — a port of LuxDiamondGeometry / LuxDiamondRounding /
// LuxDiamondSparkleGeometry from the iOS demo. Computed once on load: an
// octagon with broad facets, rounded edges and corners.

import {v3, mat4, Mat4, Vec2, Vec3, Vec4} from '@components/wallet/visual/math';

export const ROUNDING = 0.055;
const CROWN_ROUNDING = 0.32865;
const GIRDLE_ROUNDING = 0.073114;
const OUTLINE_BOW = 0.106987;

export const REFERENCE_PITCH = -0.104458;

// The gem's camera: far away, almost orthographic.
export const CAMERA_DISTANCE = 6;
export const CAMERA_SCALE = 0.948985;

export function cameraW(z: number): number {
  return (1 - z / CAMERA_DISTANCE) / CAMERA_SCALE;
}

export function cameraPoint(p: Vec3): Vec2 {
  const w = cameraW(p[2]);
  return [p[0] / w, p[1] / w];
}

export interface Ray {
  origin: Vec3,
  direction: Vec3
}

export function cameraRay(x: number, y: number): Ray {
  return {
    origin: [0, 0, CAMERA_DISTANCE],
    direction: v3.normalize([x / CAMERA_SCALE, y / CAMERA_SCALE, -CAMERA_DISTANCE])
  };
}

/** Rotation: around the gem's own vertical axis, then the whole gem is tilted. */
export function rotation(pitch: number, yaw: number): Mat4 {
  return mat4.mul(mat4.rotationX(pitch), mat4.rotationY(yaw));
}

/** The gem's projection, column-major as on iOS (depth in [0, 1] fits GL too). */
export function projection(aspect: number, zoom: number): Mat4 {
  const halfHeight = 1.52 / zoom * Math.max(1, 1 / Math.max(aspect, 0.01));
  const halfWidth = halfHeight * aspect;
  const w0 = 1 / CAMERA_SCALE, wz = -w0 / CAMERA_DISTANCE;
  const framing = 0.12 / halfHeight;
  return new Float32Array([
    1 / halfWidth, 0, 0, 0,
    0, 1 / halfHeight, 0, 0,
    0, framing * wz, -w0 / 6, wz,
    0, framing * w0, 0.5 * w0, w0
  ]);
}

/** Projection of the stars around the gem — no perspective, the field keeps the screen layout. */
export function starProjection(aspect: number, zoom: number): Mat4 {
  const halfHeight = 1.52 / zoom * Math.max(1, 1 / Math.max(aspect, 0.01));
  const halfWidth = halfHeight * aspect;
  return new Float32Array([
    1 / halfWidth, 0, 0, 0,
    0, 1 / halfHeight, 0, 0,
    0, 0, -1 / 12, 0,
    0, 0.12 / halfHeight, 0.5, 1
  ]);
}

// Vertex: position (3), normal (3), surface (4): xy — weights of the table
// and the crown on the roundings, z — facet kind, w — sector.
export const VERTEX_FLOATS = 10;

/** A mesh vertex while building: VERTEX_FLOATS numbers. */
type MeshVertex = number[];

interface Sample {
  normal: Vec3,
  material: Vec3
}

interface Edge {
  a: number,
  b: number,
  faces: number[]
}

function opticalPlanes(): Vec4[] {
  const girdle: Vec2[] = [[0.70024, 1], [1, 0.70024], [1, -0.70024], [0.70024, -1], [-0.70024, -1],
    [-1, -0.70024], [-1, 0.70024], [-0.70024, 1]];
  const table: Vec2[] = [[0.498552, 0.631807], [0.631807, 0.498552], [0.631807, -0.498552], [0.498552, -0.631807],
    [-0.498552, -0.631807], [-0.631807, -0.498552], [-0.631807, 0.498552], [-0.498552, 0.631807]];
  const sections: [number, number, boolean][] = [
    [0.965, 0.583526, true], [1, 0.571526, true],
    [0.990, -0.081806, false], [1, -0.112806, false], [0.978, -0.151806, false],
    [0.025, -1.07157, false], [0.009, -1.08757, false]
  ];
  const rings = sections.map(([scale, y, isTable]) =>
    (isTable ? table : girdle).map((o): Vec3 => [o[0] * scale, y, o[1] * scale]));
  const planes: Vec4[] = [];
  const f = Math.fround;
  function face(points: Vec3[], kind: number) {
    const p = points;
    let n = v3.normalize(v3.cross(v3.sub(p[1], p[0]), v3.sub(p[2], p[0])));
    const center = v3.scale(p.reduce((a, b) => v3.add(a, b), [0, 0, 0]), 1 / p.length);
    if(v3.dot(n, v3.sub(center, [0, -0.12, 0])) < 0) n = v3.scale(n, -1);
    // Large facets make the optical hull; the micro-bevels are only rasterized.
    if(kind !== 3) planes.push([f(n[0]), f(n[1]), f(n[2]), f(-v3.dot(n, p[0]))]);
  }
  face(rings[0], 0);
  for(let band = 0; band < rings.length - 1; band++) {
    for(let i = 0; i < 8; i++) {
      const next = (i + 1) % 8;
      face([rings[band][i], rings[band + 1][i], rings[band + 1][next], rings[band][next]],
        band === 1 ? 1 : (band === 4 ? 2 : 3));
    }
  }
  return planes;
}

/**
 * Roundings of varying width with spherical ends: broad crown shoulders, a
 * narrow tip. Returns a flat array of triangle vertices.
 */
function roundedMesh(planes: Vec4[], radius: number, segments = 12): Float32Array {
  const normals = planes.map((p): Vec3 => [p[0], p[1], p[2]]);
  const materials = planes.map((_, i): Vec3 => i === 0 ? [1, 0, 0] : (i <= 8 ? [0, 1, 0] : [0, 0, 1]));
  const offsets = planes.map((p) => p[3] + radius);
  const incidenceTolerance = 2e-6;
  const corners: Vec3[] = [];
  const P = planes.length;
  for(let a = 0; a < P - 2; a++) for(let b = a + 1; b < P - 1; b++) for(let c = b + 1; c < P; c++) {
    const na = normals[a], nb = normals[b], nc = normals[c];
    const det = v3.dot(na, v3.cross(nb, nc));
    if(Math.abs(det) < 1e-8) continue;
    const point = v3.scale(v3.add(v3.add(
      v3.scale(v3.cross(nb, nc), -offsets[a]),
      v3.scale(v3.cross(nc, na), -offsets[b])),
    v3.scale(v3.cross(na, nb), -offsets[c])), 1 / det);
    let ok = true;
    for(let i = 0; i < P; i++) if(v3.dot(normals[i], point) + offsets[i] >= 2e-7) {
      ok = false;
      break;
    }
    if(!ok) continue;
    if(!corners.some((q) => v3.dist2(q, point) < 1e-10)) corners.push(point);
  }

  const sharpPoints: Vec3[] = [], insetDirections: Vec3[] = [];
  for(const corner of corners) {
    const incident: number[] = [];
    for(let i = 0; i < P; i++) if(Math.abs(v3.dot(normals[i], corner) + offsets[i]) < incidenceTolerance) incident.push(i);
    let inset: Vec3 = [0, 0, 0];
    outer: for(let a = 0; a < incident.length - 2; a++) for(let b = a + 1; b < incident.length - 1; b++)
      for(let c = b + 1; c < incident.length; c++) {
        const na = normals[incident[a]], nb = normals[incident[b]], nc = normals[incident[c]];
        const det = v3.dot(na, v3.cross(nb, nc));
        if(Math.abs(det) < 1e-8) continue;
        inset = v3.scale(v3.add(v3.add(v3.cross(nb, nc), v3.cross(nc, na)), v3.cross(na, nb)), 1 / det);
        break outer;
      }
    sharpPoints.push(v3.add(corner, v3.scale(inset, radius)));
    insetDirections.push(inset);
  }
  const radiusScale = radius / ROUNDING;
  const radii = sharpPoints.map((p) => p[1] > 0.4 ? Math.min(CROWN_ROUNDING * radiusScale, 0.34) :
    (p[1] > -0.5 ? GIRDLE_ROUNDING * radiusScale : radius));
  const points = sharpPoints.map((p, i) => v3.sub(p, v3.scale(insetDirections[i], radii[i])));

  function cyclicOrder(indices: number[], values: Vec3[], normal: Vec3): number[] {
    const center = v3.scale(indices.reduce((s, i) => v3.add(s, values[i]), [0, 0, 0]), 1 / indices.length);
    const axis: Vec3 = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = v3.normalize(v3.cross(axis, normal)), v = v3.cross(normal, u);
    const angle = (i: number) => {
      const d = v3.sub(values[i], center);
      return Math.atan2(v3.dot(d, v), v3.dot(d, u));
    };
    return indices.slice().sort((a, b) => angle(a) - angle(b));
  }
  const key = (a: number, b: number) => a < b ? `${a},${b}` : `${b},${a}`;

  const faces = planes.map((): number[] => []);
  const incidentFaces = corners.map((): number[] => []);
  const edgeFaces = new Map<string, Edge>();
  for(let face = 0; face < P; face++) {
    const idx: number[] = [];
    for(let i = 0; i < corners.length; i++)
      if(Math.abs(v3.dot(normals[face], corners[i]) + offsets[face]) < incidenceTolerance) idx.push(i);
    if(idx.length < 3) continue;
    faces[face] = cyclicOrder(idx, corners, normals[face]);
    for(let i = 0; i < faces[face].length; i++) {
      const a = faces[face][i], b = faces[face][(i + 1) % faces[face].length];
      incidentFaces[a].push(face);
      const k = key(a, b);
      if(!edgeFaces.has(k)) edgeFaces.set(k, {a: Math.min(a, b), b: Math.max(a, b), faces: []});
      edgeFaces.get(k).faces.push(face);
    }
  }

  function blendNormal(a: Vec3, b: Vec3, step: number, count: number): Vec3 {
    if(step === 0) return a;
    if(step === count) return b;
    const t = step / count;
    return v3.normalize(v3.add(v3.scale(a, 1 - t), v3.scale(b, t)));
  }
  function blend(a: Sample, b: Sample, step: number, count: number): Sample {
    const t = step / count;
    return {normal: blendNormal(a.normal, b.normal, step, count),
      material: v3.add(v3.scale(a.material, 1 - t), v3.scale(b.material, t))};
  }
  const arcs = new Map<string, Sample[]>();
  for(const e of edgeFaces.values()) {
    const fa = Math.min(e.faces[0], e.faces[1]), fb = Math.max(e.faces[0], e.faces[1]);
    const a: Sample = {normal: normals[fa], material: materials[fa]};
    const b: Sample = {normal: normals[fb], material: materials[fb]};
    const arc: Sample[] = [];
    for(let s = 0; s <= segments; s++) arc.push(blend(a, b, s, segments));
    arcs.set(key(fa, fb), arc);
  }

  const out: MeshVertex[] = [];
  const vertex = (p: Vec3, n: Vec3, kind: number, sector = 0, mx = 0, my = 0): MeshVertex =>
    [p[0], p[1], p[2], n[0], n[1], n[2], mx, my, kind, sector];
  const roundedVertex = (i: number, s: Sample) =>
    vertex(v3.add(points[i], v3.scale(s.normal, radii[i])), s.normal, 3, 0, s.material[0], s.material[1]);
  const pos = (v: MeshVertex): Vec3 => [v[0], v[1], v[2]];
  function triangle(a: MeshVertex, b: MeshVertex, c: MeshVertex) {
    const pa = pos(a), pb = pos(b), pc = pos(c);
    const cross = v3.cross(v3.sub(pb, pa), v3.sub(pc, pa));
    const outward = v3.sub(v3.scale(v3.add(v3.add(pa, pb), pc), 1 / 3), [0, -0.12, 0]);
    if(v3.dot(cross, outward) > 0) out.push(a, b, c);
    else out.push(a, c, b);
  }
  const quad = (a: MeshVertex, b: MeshVertex, c: MeshVertex, d: MeshVertex) => {
    triangle(a, b, c);
    triangle(a, c, d);
  };

  const edgeRows = new Map<string, MeshVertex[][]>();
  const sortedEdges = [...edgeFaces.values()].sort((x, y) => x.a === y.a ? x.b - y.b : x.a - y.a);
  for(const edge of sortedEdges) {
    const arc = arcs.get(key(edge.faces[0], edge.faces[1]));
    const A = edge.a, B = edge.b;
    const steps = Math.max(1, Math.ceil(Math.sqrt(v3.dist2(sharpPoints[A], sharpPoints[B])) / 0.10));
    const rows: MeshVertex[][] = [];
    for(let row = 0; row <= steps; row++) {
      if(row === 0) {
        rows.push(arc.map((s) => roundedVertex(A, s)));
        continue;
      }
      if(row === steps) {
        rows.push(arc.map((s) => roundedVertex(B, s)));
        continue;
      }
      const t = row / steps;
      const smooth = t * t * (3 - 2 * t);
      const r = radii[A] + (radii[B] - radii[A]) * smooth;
      const dr = (radii[B] - radii[A]) * 6 * t * (1 - t);
      const inset = v3.mix(insetDirections[A], insetDirections[B], t);
      const center = v3.sub(v3.mix(sharpPoints[A], sharpPoints[B], t), v3.scale(inset, r));
      const tangent = v3.sub(v3.sub(v3.sub(sharpPoints[B], sharpPoints[A]),
        v3.scale(v3.sub(insetDirections[B], insetDirections[A]), r)), v3.scale(inset, dr));
      const axis = v3.normalize(v3.cross(arc[0].normal, arc[arc.length - 1].normal));
      rows.push(arc.map((s, index) => {
        const along = v3.add(tangent, v3.scale(s.normal, dr));
        const across = v3.cross(axis, s.normal);
        let normal = v3.normalize(v3.cross(along, across));
        if(v3.dot(normal, s.normal) < 0) normal = v3.scale(normal, -1);
        if(index === 0 || index === segments) normal = s.normal;
        return vertex(v3.add(center, v3.scale(s.normal, r)), normal, 3, 0, s.material[0], s.material[1]);
      }));
    }
    edgeRows.set(key(A, B), rows);
    for(let row = 0; row < steps; row++)
      for(let i = 0; i < segments; i++) quad(rows[row][i], rows[row + 1][i], rows[row + 1][i + 1], rows[row][i + 1]);
  }

  // Flat facets: the rim follows the varying width of the rounding.
  for(let face = 0; face < P; face++) {
    const cyc = faces[face];
    if(cyc.length < 3) continue;
    const n = normals[face];
    const kind = face === 0 ? 0 : (face <= 8 ? 1 : 2);
    const rim: MeshVertex[] = [];
    for(let i = 0; i < cyc.length; i++) {
      const a = cyc[i], b = cyc[(i + 1) % cyc.length];
      const e = edgeFaces.get(key(a, b));
      const arcIndex = face === Math.min(e.faces[0], e.faces[1]) ? 0 : segments;
      const rows = edgeRows.get(key(a, b));
      const ordered = a < b ? rows : rows.slice().reverse();
      for(let r = 0; r < ordered.length - 1; r++)
        rim.push(vertex(pos(ordered[r][arcIndex]), n, kind, (face - 1) % 8));
    }
    const c = v3.scale(rim.reduce((s, v) => v3.add(s, pos(v)), [0, 0, 0]), 1 / rim.length);
    const middle = vertex(c, n, kind);
    for(let i = 0; i < rim.length; i++) triangle(middle, rim[i], rim[(i + 1) % rim.length]);
  }

  // Spherical caps where the edges meet.
  const radialSteps = 5;
  for(let corner = 0; corner < points.length; corner++) {
    const incident = incidentFaces[corner];
    if(incident.length < 3) continue;
    const centerNormal = v3.normalize(incident.reduce((s, f) => v3.add(s, normals[f]), [0, 0, 0]));
    const centerMaterial = v3.scale(incident.reduce((s, f) => v3.add(s, materials[f]), [0, 0, 0]), 1 / incident.length);
    const centerSample: Sample = {normal: centerNormal, material: centerMaterial};
    const ordered = cyclicOrder(incident, normals, centerNormal);
    const middle = roundedVertex(corner, centerSample);
    for(let i = 0; i < ordered.length; i++) {
      const a = ordered[i], b = ordered[(i + 1) % ordered.length];
      const samples = arcs.get(key(a, b));
      const arc = a < b ? samples : samples.slice().reverse();
      for(let j = 0; j < segments; j++) {
        const sample = (side: number, row: number) => roundedVertex(corner, blend(centerSample, arc[j + side], row, radialSteps));
        triangle(middle, sample(0, 1), sample(1, 1));
        for(let row = 1; row < radialSteps; row++) quad(sample(0, row), sample(1, row), sample(1, row + 1), sample(0, row + 1));
      }
    }
  }

  // A slight bow of the broad X/Z profiles; normals via the inverse Jacobian.
  const bow = OUTLINE_BOW;
  const data = new Float32Array(out.length * VERTEX_FLOATS);
  for(let i = 0; i < out.length; i++) {
    const v = out[i];
    const x = v[0], z = v[2];
    const a = 1 - bow * z * z, b = 1 - bow * x * x, c = -2 * bow * x * z;
    const det = a * b - c * c;
    const n = v3.normalize([(b * v[3] - c * v[5]) / det, v[4], (a * v[5] - c * v[3]) / det]);
    data.set([x * a, v[1], z * b, n[0], n[1], n[2], v[6], v[7], v[8], v[9]], i * VERTEX_FLOATS);
  }
  return data;
}

export interface Anchor {
  position: Vec3,
  normal: Vec3
}

// Ray-mesh intersection — for the sparkle anchors.
function intersect(vertices: Float32Array, origin: Vec3, direction: Vec3): Anchor {
  let nearest = Infinity, result: Anchor = null;
  const F = VERTEX_FLOATS;
  for(let i = 0; i < vertices.length; i += 3 * F) {
    const a: Vec3 = [vertices[i], vertices[i + 1], vertices[i + 2]];
    const b: Vec3 = [vertices[i + F], vertices[i + F + 1], vertices[i + F + 2]];
    const c: Vec3 = [vertices[i + 2 * F], vertices[i + 2 * F + 1], vertices[i + 2 * F + 2]];
    const e1 = v3.sub(b, a), e2 = v3.sub(c, a);
    const cr = v3.cross(direction, e2);
    const det = v3.dot(e1, cr);
    if(Math.abs(det) < 1e-10) continue;
    const off = v3.sub(origin, a);
    const u = v3.dot(off, cr) / det;
    const q = v3.cross(off, e1);
    const v = v3.dot(direction, q) / det;
    const dist = v3.dot(e2, q) / det;
    if(u < -1e-5 || v < -1e-5 || u + v > 1.00001 || dist <= 0 || dist >= nearest) continue;
    nearest = dist;
    const na: Vec3 = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
    const nb: Vec3 = [vertices[i + F + 3], vertices[i + F + 4], vertices[i + F + 5]];
    const nc: Vec3 = [vertices[i + 2 * F + 3], vertices[i + 2 * F + 4], vertices[i + 2 * F + 5]];
    const normal = v3.normalize(v3.add(v3.add(v3.scale(na, 1 - u - v), v3.scale(nb, u)), v3.scale(nc, v)));
    result = {position: v3.add(origin, v3.scale(direction, dist)), normal};
  }
  return result;
}

/**
 * Eight sparkle anchors on the rounded mesh: the main one follows the drawn
 * Lottie frame, the rest are rays out of the gem's axis.
 */
function sparkleAnchors(vertices: Float32Array): Anchor[] {
  const reference = rotation(REFERENCE_PITCH, 0);
  let halfWidth = 0, top = -Infinity;
  for(let i = 0; i < vertices.length; i += VERTEX_FLOATS) {
    const p = cameraPoint(mat4.transformPoint(reference, [vertices[i], vertices[i + 1], vertices[i + 2]]));
    halfWidth = Math.max(halfWidth, Math.abs(p[0]));
    top = Math.max(top, p[1]);
  }
  const anchors: Anchor[] = [];
  for(let instance = 0; instance < 8; instance++) {
    if(instance === 0) {
      const scale = halfWidth / (447.9 * 0.75 / 2);
      const ray = cameraRay(42.375 * scale, top - 105.075 * scale);
      const inv = mat4.transpose(reference);
      const p = mat4.transformPoint(inv, ray.origin);
      const d = mat4.transformDirection(inv, ray.direction);
      anchors.push(intersect(vertices, p, d));
      continue;
    }
    const angle = instance * Math.PI / 4 + Math.PI / 8;
    const height = instance % 3 === 0 ? 0.56 : (instance % 3 === 1 ? -0.02 : -0.54);
    anchors.push(intersect(vertices, [0, height, 0], [Math.sin(angle), 0, Math.cos(angle)]));
  }
  return anchors;
}

/** A closed Bezier outline: vertices with incoming and outgoing tangents. */
interface Outline {
  vertices: Vec2[],
  incoming: Vec2[],
  outgoing: Vec2[]
}

// Sparkle outlines from GramDiamond.json (Tools/extract_sparkle.py).
const O = (vertices: Vec2[], incoming: Vec2[], outgoing: Vec2[]): Outline => ({vertices, incoming, outgoing});
const coreWide = O(
  [[1.3, -80.9], [17.6, -39.5], [38.9, -20.7], [80.3, -3.1], [38.9, 15.7], [17.6, 37], [0, 80.9], [-17.6, 37], [-38.9, 15.7], [-80.3, -3.1], [-38.9, -20.7], [-16.3, -40.8]],
  [[-6.3, 0], [-6.3, -15.1], [-11.3, -3.8], [0, -6.3], [13.8, -5], [5, -11.3], [6.3, 0], [6.3, 16.3], [11.3, 3.8], [0, 7.5], [-15.1, 5], [-5, 11.3]],
  [[5, 0], [3.8, 10], [13.8, 5], [0, 7.5], [-11.3, 3.8], [-6.3, 16.3], [-6.3, 0], [-3.8, -11.3], [-16.3, -6.3], [0, -6.3], [11.3, -3.8], [6.3, -16.3]]);
const coreNarrow = O(
  [[1.3, -80.9], [9, -23], [20.8, -12.6], [80.3, -3.1], [20.8, 7.6], [9, 19.4], [0, 80.9], [-10.5, 19.4], [-22.3, 7.6], [-80.3, -3.1], [-22.3, -12.6], [-9.8, -23.7]],
  [[-6.3, 0], [-3.5, -8.4], [-6.3, -2.1], [0, -6.3], [7.7, -2.8], [2.8, -6.3], [6.3, 0], [3.5, 9.1], [6.3, 2.1], [0, 7.5], [-8.4, 2.8], [-2.8, 6.3]],
  [[5, 0], [2.1, 5.6], [7.7, 2.8], [0, 7.5], [-6.3, 2.1], [-3.5, 9.1], [-6.3, 0], [-2.1, -6.3], [-9.1, -3.5], [0, -6.3], [6.3, -2.1], [3.5, -9.1]]);
const haloWide = O(
  [[1.8, -113.5], [24.6, -55.4], [54.6, -29], [112.7, -4.4], [54.6, 22], [24.6, 51.9], [0, 113.5], [-24.6, 51.9], [-54.6, 22], [-112.7, -4.4], [-54.6, -29], [-22.9, -57.2]],
  [[-8.8, 0], [-8.8, -21.1], [-15.8, -5.3], [0, -8.8], [19.4, -7], [7, -15.8], [8.8, 0], [8.8, 22.9], [15.8, 5.3], [0, 10.6], [-21.1, 7], [-7, 15.8]],
  [[7, 0], [5.3, 14.1], [19.4, 7], [0, 10.6], [-15.8, 5.3], [-8.8, 22.9], [-8.8, 0], [-5.3, -15.8], [-22.9, -8.8], [0, -8.8], [15.8, -5.3], [8.8, -22.9]]);
const haloNarrow = O(
  [[1.8, -113.5], [12.9, -32], [29.5, -17.3], [112.7, -4.4], [29.5, 11], [12.9, 27.7], [0, 113.5], [-14.5, 27.7], [-31.1, 11], [-112.7, -4.4], [-31.1, -17.3], [-13.5, -32.9]],
  [[-8.8, 0], [-4.9, -11.7], [-8.8, -2.9], [0, -8.8], [10.7, -3.9], [3.9, -8.8], [8.8, 0], [4.9, 12.7], [8.8, 2.9], [0, 10.6], [-11.7, 3.9], [-3.9, 8.8]],
  [[7, 0], [2.9, 7.8], [10.7, 3.9], [0, 10.6], [-8.8, 2.9], [-4.9, 12.7], [-8.8, 0], [-2.9, -8.8], [-12.7, -4.9], [0, -8.8], [8.8, -2.9], [4.9, -12.7]]);
const circle = O(
  [[108.5, 0], [0, 108.5], [-108.5, 0], [0, -108.5]],
  [[0, -59.9], [59.9, 0], [0, 59.9], [-59.9, 0]],
  [[0, 59.9], [-59.9, 0], [0, -59.9], [59.9, 0]]);
const smallCore = O(
  [[0, -53.2], [53.2, 0], [0, 53.2], [-53.2, 0]],
  [[-3.1, 50.4], [-50.8, -2.9], [2.1, -49.7], [50.1, 3.5]],
  [[2.5, 50.2], [-50.8, 3.5], [-3.1, -49.7], [50.1, -2.7]]);

function sampleOutline(o: Outline, i: number, t: number): Vec2 {
  const j = (i + 1) % o.vertices.length;
  const a = o.vertices[i], d = o.vertices[j];
  const b = [a[0] + o.outgoing[i][0], a[1] + o.outgoing[i][1]];
  const c = [d[0] + o.incoming[j][0], d[1] + o.incoming[j][1]];
  const s = 1 - t;
  const k0 = s * s * s, k1 = 3 * s * s * t, k2 = 3 * s * t * t, k3 = t * t * t;
  return [a[0] * k0 + b[0] * k1 + c[0] * k2 + d[0] * k3, a[1] * k0 + b[1] * k1 + c[1] * k2 + d[1] * k3];
}

// Sparkle vertex: wide outline (2), narrow outline (2), layer (1).
function tessellate(wide: Outline, narrow: Outline, layer: number, out: number[]) {
  for(let seg = 0; seg < wide.vertices.length; seg++) {
    for(let step = 0; step < 16; step++) {
      for(const t of [-1, step / 16, (step + 1) / 16]) {
        const a: Vec2 = t < 0 ? [0, 0] : sampleOutline(wide, seg, t);
        const b: Vec2 = t < 0 ? [0, 0] : sampleOutline(narrow, seg, t);
        out.push(a[0], a[1], b[0], b[1], layer);
      }
    }
  }
}

export interface SparkleContours {
  main: Float32Array,
  small: Float32Array
}

function sparkleContours(): SparkleContours {
  const main: number[] = [];
  tessellate(circle, circle, 0, main);
  tessellate(haloWide, haloNarrow, 1, main);
  tessellate(coreWide, coreNarrow, 2, main);
  const k = 256 / 108.5;
  const scaled = (points: Vec2[]) => points.map((p): Vec2 => [p[0] * k, p[1] * k]);
  const smallCircle = O(scaled(circle.vertices), scaled(circle.incoming), scaled(circle.outgoing));
  const small: number[] = [];
  tessellate(smallCircle, smallCircle, 3, small);
  tessellate(smallCore, smallCore, 4, small);
  return {main: new Float32Array(main), small: new Float32Array(small)};
}

/** Thinned-out vertices — for the gem's silhouette (the lens under it). */
function thinned(vertices: Float32Array): Vec3[] {
  const seen = new Set<string>();
  const out: Vec3[] = [];
  for(let i = 0; i < vertices.length; i += VERTEX_FLOATS) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
    const k = `${Math.round(x * 14)},${Math.round(y * 14)},${Math.round(z * 14)}`;
    if(seen.has(k)) continue;
    seen.add(k);
    out.push([x, y, z]);
  }
  return out;
}

export interface GemAssets {
  planes: Vec4[],
  vertices: Float32Array,
  anchors: Anchor[],
  sparkles: SparkleContours,
  outline: Vec3[]
}

let cached: GemAssets = null;

/** Everything the gem computes on the CPU — once per page. */
export function gemAssets(): GemAssets {
  if(cached) return cached;
  const planes = opticalPlanes();
  const vertices = roundedMesh(planes, ROUNDING);
  const anchors = sparkleAnchors(vertices);
  const sparkles = sparkleContours();
  cached = {planes, vertices, anchors, sparkles, outline: thinned(vertices)};
  return cached;
}

/** The gem's convex hull on screen, in points from the canvas centre. */
export function gemHull(outline: Vec3[], yaw: number, pitch: number, scale: number): Vec2[] {
  const model = rotation(pitch, yaw);
  const pts = outline.map((v): Vec2 => {
    const p = mat4.transformPoint(model, v);
    const q = cameraPoint(p);
    return [q[0] * scale, -(q[1] + 0.12) * scale];
  });
  pts.sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]);
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [], upper: Vec2[] = [];
  for(const p of pts) {
    while(lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for(let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while(upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
