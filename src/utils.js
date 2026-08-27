import CryptoJS from 'crypto-js'; 

export const CLIENT_ID = 'OKTcz8ajCfiPi58oU4bNpZc0hGXpGFG2GPJPG6EEMhO02QRa';
export const REDIRECT_URI = window.location.origin;
// 💡 뷰어 렌더링 권한인 'viewables:read'를 반드시 추가해야 합니다.
export const SCOPES = 'data:read data:write data:create viewables:read';

// 🗺️ 영상기록 탭의 GPS-도면 오버레이 지도용 카카오맵 JS 키.
// 도메인 화이트리스트로 제한되는 공개 키라 CLIENT_ID와 같은 방식으로 코드에 둔다.
// 카카오 디벨로퍼스 콘솔의 "Web 플랫폼 도메인"에 이 앱이 뜨는 모든 주소(localhost, LAN IP, 배포 주소)를 등록해야 지도가 로드된다.
export const KAKAO_JS_KEY = 'b743ae7a4c4a88894b5c0ecc3219d5dd';

// 🛰️ 동영상 기록 PDF의 "경로표시" 배경 지도용 VWorld(국토교통부 공간정보 오픈플랫폼) API 키.
// vworld.kr에서 발급하는 개발키(3개월, 최대 3회 연장) — 만료되면 새로 발급받아 교체.
export const VWORLD_API_KEY = 'E41C5303-5FAD-3654-A887-5FEC7308BBD9';

export function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

export async function generateCodeChallenge(codeVerifier) {
  const hash = CryptoJS.SHA256(codeVerifier);
  return hash.toString(CryptoJS.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 1MB 타겟팅 스마트 압축 함수
export const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        
        const MAX_SIZE = 2048; 
        if (width > height && width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        } else if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        let quality = 0.95; 
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        while (dataUrl.length * 0.75 > 1024 * 1024 && quality > 0.5) {
          quality -= 0.05; 
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
    };
  });
};