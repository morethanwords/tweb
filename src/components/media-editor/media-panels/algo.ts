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
