// PNG -> 지도에 올릴 { imageDataUrl, bbox } 변환. PNG은 GeoTIFF 같은 표준 지오태그가 없어서
// 위치좌표를 두 가지 경로로 찾는다: (1) 같은 폴더의 월드파일(.pgw/.wld, 같은 파일명)
// (2) PNG 자체에 박힌 tEXt/iTXt 청크 중 좌표처럼 보이는 값. 좌표계는 DWG/TIFF와 동일하게
// UTM-K(EPSG:5179) 계열을 가정한다.

// 월드파일 6줄: pixelSizeX, rotationY, rotationX, pixelSizeY(음수), 좌상단픽셀중심X, 좌상단픽셀중심Y
export function parseWorldFileText(text, width, height) {
  const nums = text.split(/\s+/).map(Number).filter(n => !Number.isNaN(n));
  if (nums.length < 6) throw new Error('월드파일 형식을 읽지 못했습니다 (숫자 6개 필요).');
  const [pixelSizeX, , , pixelSizeY, centerX, centerY] = nums;
  const topLeftX = centerX - pixelSizeX / 2;
  const topLeftY = centerY - pixelSizeY / 2;
  const bottomRightX = topLeftX + pixelSizeX * width;
  const bottomRightY = topLeftY + pixelSizeY * height;
  return {
    minX: Math.min(topLeftX, bottomRightX),
    maxX: Math.max(topLeftX, bottomRightX),
    minY: Math.min(topLeftY, bottomRightY),
    maxY: Math.max(topLeftY, bottomRightY),
  };
}

// PNG의 tEXt/iTXt/zTXt 청크를 훑어서 { keyword: text } 로 돌려줌 (zTXt는 압축이라 건너뜀).
function extractPngTextChunks(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const chunks = {};
  let offset = 8; // PNG 시그니처(8바이트) 다음부터
  while (offset + 8 <= view.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
    const dataStart = offset + 8;
    if (type === 'tEXt' || type === 'iTXt') {
      const bytes = new Uint8Array(arrayBuffer, dataStart, length);
      const nullIdx = bytes.indexOf(0);
      if (nullIdx > -1) {
        const keyword = new TextDecoder('latin1').decode(bytes.subarray(0, nullIdx));
        // iTXt는 keyword 뒤에 압축플래그/방법/언어태그/번역키워드가 더 있지만, 일반 텍스트로 대충 디코딩 시도
        const rest = type === 'tEXt'
          ? new TextDecoder('latin1').decode(bytes.subarray(nullIdx + 1))
          : new TextDecoder('utf-8').decode(bytes.subarray(nullIdx + 1));
        chunks[keyword] = rest;
      }
    }
    if (type === 'IEND') break;
    offset = dataStart + length + 4; // +4 = CRC
  }
  return chunks;
}

// PNG 텍스트 청크들 중 좌표/월드파일처럼 보이는 걸 찾아본다 (best-effort).
function findEmbeddedBBoxHint(textChunks) {
  for (const [keyword, text] of Object.entries(textChunks)) {
    const key = keyword.toLowerCase();
    if (key.includes('world') || key.includes('geo') || key.includes('pgw') || key.includes('coord') || key.includes('bbox') || key.includes('extent')) {
      return { keyword, text };
    }
  }
  return null;
}

export async function parsePngToOverlay(arrayBuffer, worldFileText) {
  const blob = new Blob([arrayBuffer], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  let img;
  try {
    img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('PNG 이미지를 디코딩하지 못했습니다.'));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  const width = img.naturalWidth;
  const height = img.naturalHeight;

  let bbox;
  if (worldFileText) {
    bbox = parseWorldFileText(worldFileText, width, height);
  } else {
    const textChunks = extractPngTextChunks(arrayBuffer);
    const hint = findEmbeddedBBoxHint(textChunks);
    if (!hint) {
      throw new Error('이 PNG에서 위치좌표를 찾지 못했습니다. 같은 폴더에 같은 이름의 .pgw/.wld 월드파일을 올려주세요.');
    }
    try {
      bbox = parseWorldFileText(hint.text, width, height);
    } catch {
      throw new Error(`PNG에 "${hint.keyword}" 메타데이터가 있지만 월드파일 형식으로 해석하지 못했습니다: ${hint.text}`);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  // TIFF와 동일하게, 흰 배경(여백)은 투명 처리해서 지도가 비치게 한다.
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const WHITE_THRESHOLD = 250;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  return { imageDataUrl: canvas.toDataURL('image/png'), bbox };
}
