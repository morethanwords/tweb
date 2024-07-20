import {simplifyDouglasPeucker} from './algo';
import {simplifyRadialDist} from './radial';

/**
 * Draws a cardinal spline through given point array. Points must be arranged
 * as: [x1, y1, x2, y2, ..., xn, yn]. It adds the points to the current path.
 *
 * The method continues previous path of the context. If you don't want that
 * then you need to use moveTo() with the first point from the input array.
 *
 * The points for the cardinal spline are returned as a new array.
 *
 * @param {CanvasRenderingContext2D} ctx - context to use
 * @param {Array} points - point array
 * @param {Number} [tension=0.5] - tension. Typically between [0.0, 1.0] but can be exceeded
 * @param {Number} [numOfSeg=20] - number of segments between two points (line resolution)
 * @param {Boolean} [close=false] - Close the ends making the line continuous
 * @returns {Float32Array} New array with the calculated points that was added to the path
 */
export function curve(ctx: any, points: any[], tension: number = 0.5, numOfSeg = 20, close = false) {
  // options or defaults
  tension = (typeof tension === 'number') ? tension : 0.5;
  numOfSeg = numOfSeg ? numOfSeg : 25;

  var pts,
    i = 1,
    l = points.length,
    rPos = 0,
    rLen = (l-2) * numOfSeg + 2 + (close ? 2 * numOfSeg: 0),
    res = new Float32Array(rLen),
    cache = new Float32Array((numOfSeg + 2) * 4),
    cachePtr = 4;

  pts = points.slice(0);

  if(close) {
    pts.unshift(points[l - 1]);// insert end point as first point
    pts.unshift(points[l - 2]);
    pts.push(points[0], points[1]);// first point as last point
  }
  else {
    pts.unshift(points[1]);// copy 1. point and insert at beginning
    pts.unshift(points[0]);
    pts.push(points[l - 2], points[l - 1]);// duplicate end-points
  }

  // cache inner-loop calculations as they are based on t alone
  cache[0] = 1;

  for(; i < numOfSeg; i++) {
    var st = i / numOfSeg,
      st2 = st * st,
      st3 = st2 * st,
      st23 = st3 * 2,
      st32 = st2 * 3;

    // eslint-disable-next-line no-tabs
    cache[cachePtr++] =	st23 - st32 + 1;	// c1
    cache[cachePtr++] = st32 - st23;// c2
    cache[cachePtr++] = st3 - 2 * st2 + st;// c3
    cache[cachePtr++] = st3 - st2;// c4
  }

  cache[++cachePtr] = 1;// 0,1,0,0

  // calc. points
  parse(pts, cache, l);

  if(close) {
    // l = points.length;
    pts = [];
    pts.push(points[l - 4], points[l - 3], points[l - 2], points[l - 1]); // second last and last
    pts.push(points[0], points[1], points[2], points[3]); // first and second
    parse(pts, cache, 4);
  }

  function parse(pts: any[], cache: any, l: any) {
    for(var i = 2, t; i < l; i += 2) {
      var pt1 = pts[i],
        pt2 = pts[i+1],
        pt3 = pts[i+2],
        pt4 = pts[i+3],

        t1x = (pt3 - pts[i-2]) * tension,
        t1y = (pt4 - pts[i-1]) * tension,
        t2x = (pts[i+4] - pt1) * tension,
        t2y = (pts[i+5] - pt2) * tension;

      for(t = 0; t < numOfSeg; t++) {
        var c = t << 2, // t * 4;

          c1 = cache[c],
          c2 = cache[c+1],
          c3 = cache[c+2],
          c4 = cache[c+3];

        res[rPos++] = c1 * pt1 + c2 * pt3 + c3 * t1x + c4 * t2x;
        res[rPos++] = c1 * pt2 + c2 * pt4 + c3 * t1y + c4 * t2y;
      }
    }
  }

  // add last point
  l = close ? 0 : points.length - 2;
  res[rPos++] = points[l];
  res[rPos] = points[l+1];

  // add lines to path
  for(i = 0, l = res.length; i < l; i += 2)
    ctx.lineTo(res[i], res[i+1]);

  return res;
}

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

export function polylineNormals(points: any[], closed: boolean) {
  const lineA: vec2 = [0, 0]
  const lineB: vec2 = [0, 0]
  const tangent: vec2 = [0, 0]
  const miter: vec2 = [0, 0]
  let curNormal: vec2 = null
  const out: any[] = [];
  if(closed) {
    points = points.slice()
    points.push(points[0])
  }

  const total = points.length
  for(let i=1; i<total; i++) {
    const last = points[i-1]
    const cur = points[i]
    const next = i<points.length-1 ? points[i+1] : null

    direction(lineA, cur, last)
    if(!curNormal)  {
      curNormal = [0, 0];
      normal(curNormal, lineA)
    }

    if(i === 1) // add initial normals
      addNext(out, curNormal, 1)

    if(!next) { // no miter, simple segment
      normal(curNormal, lineA) // reset normal
      addNext(out, curNormal, 1)
    } else { // miter with last
      // get unit dir of next line
      direction(lineB, next, cur)

      // stores tangent & miter
      const miterLen = computeMiter(tangent, miter, lineA, lineB, 1)
      addNext(out, miter, miterLen)
    }
  }

  // if the polyline is a closed loop, clean up the last normal
  if(points.length > 2 && closed) {
    const last2 = points[total-2]
    const cur2 = points[0]
    const next2 = points[1]

    direction(lineA, cur2, last2)
    direction(lineB, next2, cur2)
    normal(curNormal, lineA)

    const miterLen2 = computeMiter(tangent, miter, lineA, lineB, 1)
    out[0][0] = miter.slice()
    out[total-1][0] = miter.slice()
    out[0][1] = miterLen2
    out[total-1][1] = miterLen2
    out.pop()
  }

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
