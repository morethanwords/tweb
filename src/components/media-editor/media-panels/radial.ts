function getSqDist(p1: number[], p2: number[]) {
  var dx = p1[0] - p2[0],
    dy = p1[1] - p2[1];

  return dx * dx + dy * dy;
}

// basic distance-based simplification
export function simplifyRadialDist(points: number[][], tolerance: number) {
  if(points.length<=1)
    return points;
  tolerance = typeof tolerance === 'number' ? tolerance : 1;
  var sqTolerance = tolerance * tolerance;

  var prevPoint = points[0],
    newPoints = [prevPoint],
    point;

  for(var i = 1, len = points.length; i < len; i++) {
    point = points[i];

    if(getSqDist(point, prevPoint) > sqTolerance) {
      newPoints.push(point);
      prevPoint = point;
    }
  }

  if(prevPoint !== point) newPoints.push(point);

  return newPoints;
}
