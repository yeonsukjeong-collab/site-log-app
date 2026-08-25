// DXF(ASCII) -> { polylines, hull } 변환. dwgParser.js와 같은 도형만 다룬다
// (LINE, LWPOLYLINE/POLYLINE 직선 구간, ARC, CIRCLE, ELLIPSE).
// 좌표는 DXF 원본 값을 그대로 반환한다 (호출부에서 UTM-K로 해석).
// dxf-parser는 텍스트(ASCII DXF)만 읽는다 — 바이너리 DXF는 지원 안 함.
import DxfParser from 'dxf-parser';
import { tessellateArc, tessellateEllipse, findBoundary } from './cadGeometry';

export async function parseDxfToDrawing(arrayBuffer) {
  const text = new TextDecoder('utf-8').decode(arrayBuffer);
  const parser = new DxfParser();
  let dxf;
  try {
    dxf = parser.parseSync(text);
  } catch (e) {
    throw new Error(`DXF 해석 실패: ${e.message}`, { cause: e });
  }
  if (!dxf || !dxf.entities) {
    throw new Error('이 파일에서 DXF 도형 데이터를 읽지 못했습니다. ASCII(텍스트) DXF인지 확인해주세요.');
  }

  const polylines = [];
  for (const entity of dxf.entities) {
    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          polylines.push([
            [entity.vertices[0].x, entity.vertices[0].y],
            [entity.vertices[1].x, entity.vertices[1].y],
          ]);
        }
        break;
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const points = (entity.vertices || []).map((v) => [v.x, v.y]);
        if (entity.shape && points.length > 0) points.push(points[0]);
        if (points.length >= 2) polylines.push(points);
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

  if (polylines.length === 0) throw new Error('이 DXF에서 표시할 도형(LINE/POLYLINE/ARC/CIRCLE/ELLIPSE)을 찾지 못했습니다.');

  const allPoints = polylines.flat();
  const hull = findBoundary(polylines, allPoints);
  return { polylines, hull };
}
