// DWG -> { polylines, hull } 변환. gps-dwg-mapping/mobile/scripts/convert-dwg.mjs의
// 파싱 로직을 브라우저(WASM)에서 그대로 돌리도록 이식한 버전.
// LINE, LWPOLYLINE(직선 구간만), ARC, CIRCLE, ELLIPSE만 변환한다.
// 좌표는 DWG 원본 값을 그대로 반환한다 (호출부에서 UTM-K로 해석).
import { tessellateArc, tessellateEllipse, findBoundary } from './cadGeometry';

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
