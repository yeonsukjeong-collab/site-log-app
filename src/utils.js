import CryptoJS from 'crypto-js'; 

export const CLIENT_ID = 'OKTcz8ajCfiPi58oU4bNpZc0hGXpGFG2GPJPG6EEMhO02QRa'; 
export const REDIRECT_URI = window.location.origin;
// 💡 뷰어 렌더링 권한인 'viewables:read'를 반드시 추가해야 합니다.
export const SCOPES = 'data:read data:write data:create viewables:read';

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