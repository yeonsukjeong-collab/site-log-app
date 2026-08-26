// DWG -> { polylines, hull } 변환. gps-dwg-mapping/mobile/scripts/convert-dwg.mjs의
// 파싱 로직을 브라우저(WASM)에서 그대로 돌리도록 이식한 버전.
// LINE, LWPOLYLINE(직선 구간만), ARC, CIRCLE, ELLIPSE만 변환한다.
// 좌표는 DWG 원본 값을 그대로 반환한다 (호출부에서 UTM-K로 해석).
import { computeBoundaryHull } from './concaveHull';

function tessellateArc(cx, cy, radius, startAngle, endAngle) {
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

function tessellateEllipse(cx, cy, majorAxisEndPoint, axisRatio, startAngle, endAngle) {
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
function findBoundary(polylines, allPoints) {
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

export async function parseDwgToDrawing(arrayBuffer) {
  const { Dwg_File_Type, LibreDwg } = await import('@mlightcad/libredwg-web');
  // 경로를 안 주면 Emscripten이 import.meta.url 기준으로 wasm을 찾는다.
  // Vite가 이 참조를 인식해서 빌드 시 해시된 정적 자산으로 자동 번들링해준다.
  const libredwg = await LibreDwg.create();

  const dwg = libredwg.dwg_read_data(new Uint8Array(arrayBuffer), Dwg_File_Type.DWG);
  const db = libredwg.convert(dwg);

  const polylines = [];
  for (const entity of db.entities) {
    switch (entity.type) {
      case 'LINE':
        polylines.push([
          [entity.startPoint.x, entity.startPoint.y],
          [entity.endPoint.x, entity.endPoint.y],
        ]);
        break;
      case 'LWPOLYLINE': {
        const points = entity.vertices.map((v) => [v.x, v.y]);
        if ((entity.flag & 1) !== 0 && points.length > 0) points.push(points[0]);
        polylines.push(points);
        break;
      }
      case 'ARC':
        polylines.push(tessellateArc(entity.center.x, entity.center.y, entity.radius, entity.startAngle, entity.endAngle));
        break;
      case 'CIRCLE':
        polylines.push(tessellateArc(entity.center.x, entity.center.y, entity.radius, 0, 2 * Math.PI));
        break;
      case 'ELLIPSE':
        polylines.push(tessellateEllipse(entity.center.x, entity.center.y, entity.majorAxisEndPoint, entity.axisRatio, entity.startAngle, entity.endAngle));
        break;
      default:
        break;
    }
  }

  libredwg.dwg_free(db);

  if (polylines.length === 0) throw new Error('이 DWG에서 표시할 도형(LINE/POLYLINE/ARC/CIRCLE/ELLIPSE)을 찾지 못했습니다.');

  const allPoints = polylines.flat();
  const hull = findBoundary(polylines, allPoints);
  return { polylines, hull };
}
