// ACC 프로젝트 이름(프로젝트 드롭다운에 뜨는 이름과 정확히 일치) -> 변환된 도면 JSON 매핑.
//
// 새 현장을 추가하려면:
// 1. 현장 DWG 원본을 gps-dwg-mapping/mobile/scripts/convert-dwg.mjs로 변환
//    (node scripts/convert-dwg.mjs <input.dwg> <output.json>)
// 2. 결과 JSON을 이 프로젝트의 public/drawings/ 에 복사
// 3. 아래에 프로젝트 이름 -> 파일 경로로 한 줄 추가
export const SITE_DRAWINGS = {
  '서초타워': [{ name: '서초타워', file: '/drawings/seocho-tower.json' }],
  '성복동': [{ name: '성복동', file: '/drawings/seongbokdong.json' }],
};
