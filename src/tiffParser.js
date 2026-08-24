// 위치좌표(GeoTIFF 태그)가 박힌 TIFF -> 지도에 올릴 { imageDataUrl, bbox } 변환.
// 큰 DWG가 WASM 파서에서 안 열리는 문제의 대안 경로. 좌표계는 도면(DWG) 파이프라인과
// 동일하게 UTM-K(EPSG:5179) 계열 투영좌표계를 가정한다 (kakao-map.html의 latLngToUtmK 참고).
import { fromArrayBuffer } from 'geotiff';

const MAX_DIMENSION = 1600; // 너무 큰 이미지는 postMessage/렌더링 부담이 커서 다운샘플링

export async function parseTiffToOverlay(arrayBuffer) {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();

  const geoKeys = image.getGeoKeys();
  if (!geoKeys) {
    throw new Error('이 TIFF에는 위치좌표(GeoTIFF) 정보가 없습니다.');
  }
  if (!geoKeys.ProjectedCSTypeGeoKey && geoKeys.GeographicTypeGeoKey) {
    throw new Error('위경도(지리) 좌표계 TIFF는 지원하지 않습니다. UTM-K 계열 투영좌표계 TIFF만 지원합니다.');
  }

  let bbox;
  try {
    const [minX, minY, maxX, maxY] = image.getBoundingBox();
    if (![minX, minY, maxX, maxY].every(Number.isFinite)) throw new Error('bbox 계산 실패');
    bbox = { minX, minY, maxX, maxY };
  } catch {
    throw new Error('이 TIFF에서 위치좌표 범위를 읽지 못했습니다.');
  }

  const srcWidth = image.getWidth();
  const srcHeight = image.getHeight();
  const scale = Math.min(1, MAX_DIMENSION / Math.max(srcWidth, srcHeight));
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));

  const samplesPerPixel = image.getSamplesPerPixel();
  const raster = await image.readRasters({ width, height, interleave: true });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    let r, g, b, a = 255;
    if (samplesPerPixel === 1) {
      r = g = b = raster[i];
    } else if (samplesPerPixel === 2) {
      r = g = b = raster[i * 2]; a = raster[i * 2 + 1];
    } else if (samplesPerPixel >= 4) {
      r = raster[i * samplesPerPixel]; g = raster[i * samplesPerPixel + 1]; b = raster[i * samplesPerPixel + 2]; a = raster[i * samplesPerPixel + 3];
    } else {
      r = raster[i * 3]; g = raster[i * 3 + 1]; b = raster[i * 3 + 2];
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  ctx.putImageData(imageData, 0, 0);

  return { imageDataUrl: canvas.toDataURL('image/png'), bbox };
}
