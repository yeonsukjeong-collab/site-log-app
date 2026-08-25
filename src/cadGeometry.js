// DWG/DXF 파서가 공통으로 쓰는 도형 테셀레이션 + 경계선 계산 헬퍼.
import { computeBoundaryHull } from './concaveHull';

export function tessellateArc(cx, cy, radius, startAngle, endAngle) {
  let span = endAngle - startAngle;
  if (span <= 0) span += 2 * Math.PI;
  const segments = Math.max(6, Math.round(48 * (span / (2 * Math.PI))));
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (span * i) / segments;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return points;
}

export function tessellateEllipse(cx, cy, majorAxisEndPoint, axisRatio, startAngle, endAngle) {
  const semiMajor = Math.hypot(majorAxisEndPoint.x, majorAxisEndPoint.y);
  const semiMinor = semiMajor * axisRatio;
  const rotation = Math.atan2(majorAxisEndPoint.y, majorAxisEndPoint.x);
  let span = endAngle - startAngle;
  if (span <= 0) span += 2 * Math.PI;
  const segments = Math.max(6, Math.round(48 * (span / (2 * Math.PI))));
  const points = [];
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  for (let i = 0; i <= segments; i++) {
    const t = startAngle + (span * i) / segments;
    const ex = semiMajor * Math.cos(t);
    const ey = semiMinor * Math.sin(t);
    points.push([cx + ex * cosR - ey * sinR, cy + ex * sinR + ey * cosR]);
  }
  return points;
}

function bboxArea(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return (maxX - minX) * (maxY - minY);
}

// 실제 CAD 도면에는 대개 부지/건물 외곽선이 하나의 폴리라인 엔티티로 이미
// 그려져 있다. 점 구름에서 concave hull을 계산하는 것보다 이 실제 경계선을
// 그대로 쓰는 게 정확하므로, 전체 도면 바운딩박스의 50% 이상을 차지하는
// 폴리라인이 있으면 그것을 경계로 쓴다. 없을 때만 concave hull로 근사한다.
export function findBoundary(polylines, allPoints) {
  const overallArea = bboxArea(allPoints);
  let best = null;
  let bestArea = 0;
  for (const pl of polylines) {
    if (pl.length < 4) continue;
    const area = bboxArea(pl);
    if (area > bestArea) {
      bestArea = area;
      best = pl;
    }
  }
  if (best && overallArea > 0 && bestArea / overallArea >= 0.5) return best;
  return computeBoundaryHull(allPoints, 0.5, 4);
}
