import {simplifyDouglasPeucker} from './algo';
import {simplifyRadialDist} from './radial';

type vec2 = [number, number];

function dot(a: vec2, b: vec2) {
  return a[0] * b[0] + a[1] * b[1]
}

function add(out: vec2, a: vec2, b: vec2) {
  out[0] = a[0] + b[0]
  out[1] = a[1] + b[1]
  return out
}

function subtract(out: vec2, a: vec2, b: vec2) {
  out[0] = a[0] - b[0]
  out[1] = a[1] - b[1]
  return out
}

function set(out: vec2, x: number, y: number) {
  out[0] = x
  out[1] = y
  return out
}

function normalize(out: vec2, a: vec2) {
  const x = a[0];
  const y = a[1];
  let len = x*x + y*y
  if(len > 0) {
    len = 1 / Math.sqrt(len)
    out[0] = a[0] * len
    out[1] = a[1] * len
  }
  return out
}

export function computeMiter(tangent: vec2, miter: vec2, lineA: vec2, lineB: vec2, halfThick: number) {
  add(tangent, lineA, lineB)
  normalize(tangent, tangent)

  set(miter, -tangent[1], tangent[0])
  const tmp: vec2 = [0, 0];
  set(tmp, -lineA[1], lineA[0])

  return halfThick / dot(miter, tmp)
}

export function normal(out: vec2, dir: vec2) {
  set(out, -dir[1], dir[0])
  return out
}

export function direction(out: vec2, a: vec2, b: vec2) {
  subtract(out, a, b)
  normalize(out, out)
  return out
}

function addNext(out: any[], normal: vec2, length: number) {
  out.push([[normal[0], normal[1]], length])
}

export function duplicate(nestedArray: any[], mirror: boolean) {
  const out: any[] = []
  nestedArray.forEach(x => {
    const x1 = mirror ? -x : x
    out.push(x1, x)
  })
  return out
}


export function simplify(points: number[][], tolerance: number) {
  points = simplifyRadialDist(points, tolerance);
  points = simplifyDouglasPeucker(points, tolerance);
  return points;
}
