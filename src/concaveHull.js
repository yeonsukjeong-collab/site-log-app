// Moreira & Santos (2007) k-nearest-neighbours concave hull.
// Used only at DWG conversion time (Node) to precompute each drawing's
// outer boundary; the result is baked into the drawing JSON so the phone
// never has to run this at runtime.

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function dedupe(points) {
  const seen = new Set();
  const out = [];
  for (const p of points) {
    const key = p[0] + ',' + p[1];
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function nearestPoints(points, p, k) {
  return points
    .slice()
    .sort((a, b) => dist(p, a) - dist(p, b))
    .slice(0, k);
}

function pointAngle(p1, p2) {
  const a = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
  return a < 0 ? a + 2 * Math.PI : a;
}

function sortByAngle(points, currentPoint, refAngle) {
  return points
    .map((p) => {
      const a = pointAngle(currentPoint, p);
      let turn = refAngle - a;
      while (turn < 0) turn += 2 * Math.PI;
      while (turn >= 2 * Math.PI) turn -= 2 * Math.PI;
      return { p, turn };
    })
    .sort((a, b) => b.turn - a.turn)
    .map((o) => o.p);
}

function ccw(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c) {
  return (
    Math.min(a[0], b[0]) <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) &&
    Math.min(a[1], b[1]) <= c[1] &&
    c[1] <= Math.max(a[1], b[1])
  );
}

function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = ccw(p3, p4, p1);
  const d2 = ccw(p3, p4, p2);
  const d3 = ccw(p1, p2, p3);
  const d4 = ccw(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

export function pointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function findMinYPoint(points) {
  return points.reduce((min, p) => {
    if (p[1] < min[1] || (p[1] === min[1] && p[0] < min[0])) return p;
    return min;
  }, points[0]);
}

export function concaveHull(pointsIn, kStart) {
  const points = dedupe(pointsIn);
  if (points.length < 3) return points;

  let k = Math.max(kStart || 3, 3);
  k = Math.min(k, points.length - 1);

  const firstPoint = findMinYPoint(points);
  let currentPoint = firstPoint;
  const hull = [firstPoint];
  let dataset = points.filter((p) => p !== firstPoint);

  let previousAngle = 0;
  let step = 1;

  while ((currentPoint !== firstPoint || step === 1) && dataset.length > 0) {
    if (step === 4) {
      dataset.push(firstPoint);
    }

    const candidates = nearestPoints(dataset, currentPoint, k);
    const sorted = sortByAngle(candidates, currentPoint, previousAngle);

    let found = false;
    let chosen = null;
    for (let i = 0; i < sorted.length; i++) {
      const candidate = sorted[i];
      const lastPoint = candidate === firstPoint;

      let intersects = false;
      const maxJ = hull.length - (lastPoint ? 1 : 0);
      for (let j = 1; j < maxJ - 1; j++) {
        if (segmentsIntersect(currentPoint, candidate, hull[hull.length - 1 - j], hull[hull.length - 2 - j])) {
          intersects = true;
          break;
        }
      }
      if (!intersects) {
        chosen = candidate;
        found = true;
        break;
      }
    }

    if (!found) {
      return concaveHull(pointsIn, k + 1);
    }

    hull.push(chosen);
    previousAngle = pointAngle(chosen, currentPoint);
    currentPoint = chosen;
    dataset = dataset.filter((p) => p !== chosen);
    step++;

    if (step > pointsIn.length * 3) {
      return concaveHull(pointsIn, k + 1);
    }
  }

  hull.pop();

  const allInside = points.every((p) => hull.indexOf(p) !== -1 || pointInPolygon(p, hull));
  if (!allInside && k < points.length - 1) {
    return concaveHull(pointsIn, k + 1);
  }

  return hull;
}

// 격자 기반 다운샘플링: cellSize(같은 단위, 보통 미터) 당 한 점만 남긴다.
// concave hull은 O(n^2 log n)이라 점 개수를 줄이지 않으면 수천 개 점에서 너무 느리다.
export function downsampleFixed(points, cellSize) {
  const grid = new Set();
  const result = [];
  for (const p of points) {
    const key = Math.floor(p[0] / cellSize) + '_' + Math.floor(p[1] / cellSize);
    if (!grid.has(key)) {
      grid.add(key);
      result.push(p);
    }
  }
  return result;
}

// 다운샘플링으로 빠진 점들이 hull 밖으로 튀어나오지 않도록, 벗어난 점들을
// 다시 넣어서 한 번 더 계산한다 (완벽하진 않지만 대부분의 튐을 잡아준다).
export function computeBoundaryHull(allPoints, cellSize, k) {
  const downsampled = downsampleFixed(allPoints, cellSize);
  let hull = concaveHull(downsampled, k);
  const stragglers = allPoints.filter((p) => hull.indexOf(p) === -1 && !pointInPolygon(p, hull));
  if (stragglers.length > 0 && stragglers.length < downsampled.length) {
    hull = concaveHull(downsampled.concat(stragglers), k);
  }
  return hull;
}
