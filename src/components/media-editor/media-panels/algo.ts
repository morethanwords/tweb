// @ts-nocheck
import {computeMiter, direction, normal} from './draw.util';

function getSqSegDist(p: number[], p1: number[], p2: number[]) {
  var x = p1[0],
    y = p1[1],
    dx = p2[0] - x,
    dy = p2[1] - y;

  if(dx !== 0 || dy !== 0) {
    var t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

    if(t > 1) {
      x = p2[0];
      y = p2[1];
    } else if(t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;

  return dx * dx + dy * dy;
}

function simplifyDPStep(points: number[][], first: number, last: number, sqTolerance: number, simplified: number[][]) {
  var maxSqDist = sqTolerance,
    index;

  for(var i = first + 1; i < last; i++) {
    var sqDist = getSqSegDist(points[i], points[first], points[last]);

    if(sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }

  if(maxSqDist > sqTolerance) {
    if(index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if(last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

// simplification using Ramer-Douglas-Peucker algorithm
export function simplifyDouglasPeucker(points: number[][], tolerance: number) {
  if(points.length<=1)
    return points;
  tolerance = typeof tolerance === 'number' ? tolerance : 1;
  var sqTolerance = tolerance * tolerance;

  var last = points.length - 1;

  var simplified = [points[0]];
  simplifyDPStep(points, 0, last, sqTolerance, simplified);
  simplified.push(points[last]);

  return simplified;
}

// TRIANGLES


// var util = require('polyline-miter-util')

const number = (num: string | number, def: number): number => {
  return typeof num === 'number' ? num : (typeof def === 'number' ? def : 0)
}

function clone(arr: [number, number]): [number, number] {
  return [arr[0], arr[1]]
}

function create(): [number, number] {
  return [0, 0];
}

const vec = {
  create: create,
  clone: clone,
  copy: (out: [number, number], a: [number, number]): [number, number] => {
    out[0] = a[0]
    out[1] = a[1]
    return out
  },
  scaleAndAdd: (out: [number, number], a: [number, number], b: [number, number], scale: number): [number, number] => {
    out[0] = a[0] + (b[0] * scale)
    out[1] = a[1] + (b[1] * scale)
    return out
  },
  dot: (a: [number, number], b: [number, number]): number => {
    return a[0] * b[0] + a[1] * b[1]
  }
}

var tmp = vec.create()
var capEnd = vec.create()
var lineA = vec.create()
var lineB = vec.create()
var tangent = vec.create()
var miter = vec.create()

export function Stroke(opt): any {
  if(!(this instanceof Stroke))
    return new Stroke(opt)
  opt = opt||{}
  this.miterLimit = number(opt.miterLimit, 10)
  this.thickness = number(opt.thickness, 1)
  this.join = opt.join || 'miter'
  this.cap = opt.cap || 'butt'
  this._normal = null
  this._lastFlip = -1
  this._started = false
}

Stroke.prototype.mapThickness = function(point, i, points) {
  return this.thickness
}

Stroke.prototype.build = function(points: string | any[]) {
  var complex = {
    positions: [],
    cells: []
  }

  if(points.length <= 1)
    return complex

  var total = points.length

  // clear flags
  this._lastFlip = -1
  this._started = false
  this._normal = null

  // join each segment
  for(var i=1, count=0; i<total; i++) {
    var last = points[i-1]
    var cur = points[i]
    var next = i<points.length-1 ? points[i+1] : null
    var thickness = this.mapThickness(cur, i, points)
    var amt = this._seg(complex, count, last, cur, next, thickness/2)
    count += amt
  }
  return complex
}

Stroke.prototype._seg = function(complex: { cells: any; positions: any; }, index: number, last: [number, number], cur: [number, number], next: [number, number], halfThick: number) {
  var count = 0
  var cells = complex.cells
  var positions = complex.positions
  var capSquare = this.cap === 'square'
  var joinBevel = this.join === 'bevel'

  // get unit direction of line
  direction(lineA, cur, last)

  // if we don't yet have a normal from previous join,
  // compute based on line start - end
  if(!this._normal) {
    this._normal = vec.create()
    normal(this._normal, lineA)
  }

  // if we haven't started yet, add the first two points
  if(!this._started) {
    this._started = true

    // if the end cap is type square, we can just push the verts out a bit
    if(capSquare) {
      vec.scaleAndAdd(capEnd, last, lineA, -halfThick)
      last = capEnd
    }

    extrusions(positions, last, this._normal, halfThick)
  }

  cells.push([index+0, index+1, index+2])

  /*
  // now determine the type of join with next segment

  - round (TODO)
  - bevel
  - miter
  - none (i.e. no next segment, use normal)
   */

  if(!next) { // no next segment, simple extrusion
    // now reset normal to finish cap
    normal(this._normal, lineA)

    // push square end cap out a bit
    if(capSquare) {
      vec.scaleAndAdd(capEnd, cur, lineA, halfThick)
      cur = capEnd
    }

    extrusions(positions, cur, this._normal, halfThick)
    cells.push(this._lastFlip===1 ? [index, index+2, index+3] : [index+2, index+1, index+3])

    count += 2
  } else { // we have a next segment, start with miter
    // get unit dir of next line
    direction(lineB, next, cur)

    // stores tangent & miter
    var miterLen = computeMiter(tangent, miter, lineA, lineB, halfThick)

    // normal(tmp, lineA)

    // get orientation
    var flip = (vec.dot(tangent, this._normal) < 0) ? -1 : 1

    var bevel = joinBevel
    if(!bevel && this.join === 'miter') {
      var limit = miterLen / (halfThick)
      if(limit > this.miterLimit)
        bevel = true
    }

    if(bevel) {
      // next two points in our first segment
      vec.scaleAndAdd(tmp, cur, this._normal, -halfThick * flip)
      positions.push(vec.clone(tmp))
      vec.scaleAndAdd(tmp, cur, miter, miterLen * flip)
      positions.push(vec.clone(tmp))


      cells.push(this._lastFlip!==-flip ?
        [index, index+2, index+3] :
        [index+2, index+1, index+3])

      // now add the bevel triangle
      cells.push([index+2, index+3, index+4])

      normal(tmp, lineB)
      vec.copy(this._normal, tmp) // store normal for next round

      vec.scaleAndAdd(tmp, cur, tmp, -halfThick*flip)
      positions.push(vec.clone(tmp))

      // //the miter is now the normal for our next join
      count += 3
    } else { // miter
      // next two points for our miter join
      extrusions(positions, cur, miter, miterLen)
      cells.push(this._lastFlip===1 ?
        [index, index+2, index+3] :
        [index+2, index+1, index+3])

      flip = -1

      // the miter is now the normal for our next join
      vec.copy(this._normal, miter)
      count += 2
    }
    this._lastFlip = flip
  }
  return count
}

function extrusions(positions: [number, number][], point: [number, number], normal: [number, number], scale: number) {
  // next two points to end our segment
  vec.scaleAndAdd(tmp, point, normal, -scale)
  positions.push(vec.clone(tmp))

  vec.scaleAndAdd(tmp, point, normal, scale)
  positions.push(vec.clone(tmp))
}
