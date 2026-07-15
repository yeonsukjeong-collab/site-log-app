import React, { useState, useEffect, useRef } from 'react';
import { FaCamera, FaVideo, FaHardHat, FaList, FaSync, FaFileAlt, FaCloudUploadAlt, FaImage, FaTimes } from 'react-icons/fa';
import { SiAutodesk } from 'react-icons/si';
import CryptoJS from 'crypto-js'; 

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// PDF를 캔버스에 그리기 위한 라이브러리 로드
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ==========================================
// ⚙️ 오토데스크 앱 설정값
// ==========================================
const CLIENT_ID = 'OKTcz8ajCfiPi58oU4bNpZc0hGXpGFG2GPJPG6EEMhO02QRa'; 
const REDIRECT_URI = 'http://10.51.209.20:5173'; 
const SCOPES = 'data:read data:write data:create';

function generateRandomString(length) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[Math.floor(Math.random() * charset.length)];
  }
  return result;
}

async function generateCodeChallenge(codeVerifier) {
  const hash = CryptoJS.SHA256(codeVerifier);
  return hash.toString(CryptoJS.enc.Base64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 각 이미지별 1MB 타겟팅 스마트 압축 함수
const compressImage = (file) => {
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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isUploading, setIsUploading] = useState(false); 

  const [imageSrcs, setImageSrcs] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [workType, setWorkType] = useState(() => localStorage.getItem('last_workType') || '');
  const [locationStr, setLocationStr] = useState(() => localStorage.getItem('last_locationStr') || '');
  const [dateStr, setDateStr] = useState(new Date().toISOString().substring(0, 10));
  const [description, setDescription] = useState(() => localStorage.getItem('last_description') || '');

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const canvasRef = useRef(null); 

  const [showFloorPlanModal, setShowFloorPlanModal] = useState(false);
  const [floorPlans, setFloorPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingPlanView, setLoadingPlanView] = useState(false);
  const [isDrawingRendered, setIsDrawingRendered] = useState(false);
  
  const [selectedFloorPlanName, setSelectedFloorPlanName] = useState('');
  const [pinLocation, setPinLocation] = useState(null);

  useEffect(() => {
    localStorage.setItem('last_workType', workType);
  }, [workType]);

  useEffect(() => {
    localStorage.setItem('last_locationStr', locationStr);
  }, [locationStr]);

  useEffect(() => {
    localStorage.setItem('last_description', description);
  }, [description]);

  useEffect(() => {
    const savedToken = sessionStorage.getItem('access_token');
    if (savedToken) {
      setAccessToken(savedToken);
      setIsLoggedIn(true);
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code'); 
    if (code) {
      async function exchangeToken() {
        const verifier = sessionStorage.getItem('code_verifier'); 
        try {
          const response = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: CLIENT_ID,
              grant_type: 'authorization_code',
              code: code,
              redirect_uri: REDIRECT_URI,
              code_verifier: verifier
            })
          });
          const data = await response.json();
          if (data.access_token) {
            sessionStorage.setItem('access_token', data.access_token);
            setAccessToken(data.access_token); 
            setIsLoggedIn(true);               
            window.history.replaceState(null, null, window.location.pathname);
          }
        } catch (error) { console.error('토큰 교환 에러:', error); }
      }
      exchangeToken();
    }
  }, []);

  useEffect(() => {
    if (accessToken) {
      async function fetchProjects() {
        setIsLoadingProjects(true);
        try {
          const hubRes = await fetch('https://developer.api.autodesk.com/project/v1/hubs', { headers: { Authorization: `Bearer ${accessToken}` } });
          if (hubRes.status === 401) {
            alert("보안을 위해 로그인이 만료되었습니다. 다시 로그인해 주세요.");
            sessionStorage.removeItem('access_token');
            setIsLoggedIn(false);
            setAccessToken('');
            return;
          }
          const hubs = (await hubRes.json()).data;
          if (!hubs) return;

          let allProjects = [];
          for (const hub of hubs) {
            const projRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hub.id}/projects`, { headers: { Authorization: `Bearer ${accessToken}` } });
            const projData = await projRes.json();
            if (projData.data) {
              allProjects = [...allProjects, ...projData.data.map(p => ({ id: p.id, name: p.attributes.name, hubId: hub.id }))];
            }
          }
          setProjects(allProjects);
          if (allProjects.length > 0) setSelectedProject(allProjects[0].id);
        } catch (error) { console.error('프로젝트 에러:', error); } 
        finally { setIsLoadingProjects(false); }
      }
      fetchProjects();
    }
  }, [accessToken]);

  const handleLogin = async () => {
    const verifier = generateRandomString(64);
    sessionStorage.setItem('code_verifier', verifier); 
    const challenge = await generateCodeChallenge(verifier);
    const params = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256' });
    window.location.href = `https://developer.api.autodesk.com/authentication/v2/authorize?${params.toString()}`; 
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      const compressedUrls = await Promise.all(files.map(file => compressImage(file)));
      setImageSrcs(prev => [...prev, ...compressedUrls]);
    }
    e.target.value = null;
  };

  const removeImage = (indexToRemove) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    setImageSrcs(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  // 💡 [변경 완료] 도면 목록 로드: 99 TEST 폴더를 거쳐 Site_log로 진입
  const loadFloorPlans = async () => {
    if (!selectedProject) return alert("프로젝트를 먼저 선택해주세요.");
    setShowFloorPlanModal(true);
    setLoadingPlans(true);
    setFloorPlans([]);
    setIsDrawingRendered(false);
    setPinLocation(null);

    try {
      const project = projects.find(p => p.id === selectedProject);
      const authHeader = { Authorization: `Bearer ${accessToken}` };

      // 1. Project Files 폴더 찾기
      const topRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${project.hubId}/projects/${project.id}/topFolders`, { headers: authHeader });
      const projFolder = (await topRes.json()).data.find(f => f.attributes.name === 'Project Files');
      if (!projFolder) throw new Error("Project Files 폴더를 찾을 수 없습니다.");

      // 2. 💡 Project Files 안에서 '99 TEST' 폴더 찾기
      const testFolderRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${projFolder.id}/contents`, { headers: authHeader });
      const testFolder = (await testFolderRes.json()).data.find(item => item.attributes.name === '99 TEST');
      if (!testFolder) throw new Error("99 TEST 폴더가 없습니다.");

      // 3. 💡 '99 TEST' 폴더 안에서 'Site_log' 폴더 찾기
      const siteLogRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${testFolder.id}/contents`, { headers: authHeader });
      const siteLogFolder = (await siteLogRes.json()).data.find(item => item.attributes.name === 'Site_log');
      if (!siteLogFolder) throw new Error("Site_log 폴더가 없습니다.");

      // 4. 'Site_log' 폴더 안에서 'floor_plan' 찾기
      const fpRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${siteLogFolder.id}/contents`, { headers: authHeader });
      const fpFolder = (await fpRes.json()).data.find(item => item.attributes.name === 'floor_plan');
      if (!fpFolder) throw new Error("floor_plan 폴더가 없습니다.");

      // 5. PDF 파일 목록 가져오기
      const pdfsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${fpFolder.id}/contents`, { headers: authHeader });
      const pdfsData = await pdfsRes.json();
      
      const pdfItems = pdfsData.data.filter(item => item.type === 'items' && item.attributes.displayName.toLowerCase().endsWith('.pdf'));
      setFloorPlans(pdfItems);

    } catch(err) {
      console.error(err);
      alert(`도면 폴더를 불러올 수 없습니다. (${err.message})`);
      setShowFloorPlanModal(false);
    } finally {
      setLoadingPlans(false);
    }
  };

  const viewFloorPlan = async (item) => {
    setLoadingPlanView(true);
    setIsDrawingRendered(false);
    setPinLocation(null); 
    
    const planName = item.attributes.displayName.replace(/\.[^/.]+$/, "");
    setSelectedFloorPlanName(planName);

    try {
      const project = projects.find(p => p.id === selectedProject);
      const authHeader = { Authorization: `Bearer ${accessToken}` };

      const versionId = item.relationships.tip.data.id;
      const verRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/versions/${encodeURIComponent(versionId)}`, { headers: authHeader });
      const verData = await verRes.json();

      const storageId = verData.data.relationships.storage.data.id;
      const parts = storageId.split(':');
      const lastPart = parts[parts.length - 1]; 
      const [bucketKey, objectKey] = lastPart.split('/');

      const objectApiUrl = `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${objectKey}`;
      const fileResponse = await fetch(objectApiUrl, { method: 'GET', headers: authHeader });
      if (!fileResponse.ok) throw new Error("도면 파일을 가져오지 못했습니다.");

      const arrayBuffer = await fileResponse.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 1.5 }); 
      
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      const renderContext = { canvasContext: context, viewport: viewport };
      await page.render(renderContext).promise;
      
      setIsDrawingRendered(true);
      setLocationStr(`${planName} [좌표 설정 대기중]`);

    } catch(err) {
      console.error(err);
      alert("도면 PDF를 캔버스에 렌더링하는 중 오류가 발생했습니다.");
    } finally {
      setLoadingPlanView(false);
    }
  };

  const handleCanvasClick = (e) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    setPinLocation({ x, y });
    setLocationStr(`${selectedFloorPlanName} [X:${Math.round(x)}, Y:${Math.round(y)}]`);
  };

  const generatePDFBlob = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const totalPages = Math.ceil(imageSrcs.length / 2);
    
    for (let i = 0; i < totalPages; i++) {
      const element = document.getElementById(`pdf-page-${i}`);
      const canvas = await html2canvas(element, { scale: 2, useCORS: true });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.9); 
      
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }
    return pdf.output('blob'); 
  };

  // 💡 [변경 완료] 업로드 로직: 99 TEST 폴더를 거쳐 photo_docs로 업로드
  const handleUploadToACC = async () => {
    if (selectedFiles.length === 0) return alert("먼저 사진을 촬영하거나 선택해 주세요.");
    const project = projects.find(p => p.id === selectedProject);
    if (!project) return alert("프로젝트가 선택되지 않았습니다.");

    setIsUploading(true);

    try {
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      
      // 1. Project Files 찾기
      const topRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${project.hubId}/projects/${project.id}/topFolders`, { headers: authHeader });
      const projFolder = (await topRes.json()).data.find(f => f.attributes.name === 'Project Files');
      if (!projFolder) throw new Error("Project Files 누락");
      
      // 2. 💡 '99 TEST' 찾기
      const testFolderRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${projFolder.id}/contents`, { headers: authHeader });
      const testFolder = (await testFolderRes.json()).data.find(item => item.attributes.name === '99 TEST');
      if (!testFolder) { alert("ACC에 '99 TEST' 폴더가 없습니다."); setIsUploading(false); return; }

      // 3. 💡 'Site_log' 찾기
      const siteLogRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${testFolder.id}/contents`, { headers: authHeader });
      const siteLogFolder = (await siteLogRes.json()).data.find(item => item.attributes.name === 'Site_log');
      if (!siteLogFolder) { alert("ACC에 '99 TEST/Site_log' 폴더가 없습니다."); setIsUploading(false); return; }

      // 4. 'photo_docs' 찾기
      const photoDocsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${siteLogFolder.id}/contents`, { headers: authHeader });
      const photoDocsFolder = (await photoDocsRes.json()).data.find(item => item.attributes.name === 'photo_docs');
      if (!photoDocsFolder) { alert("Site_log 안에 'photo_docs' 폴더가 없습니다."); setIsUploading(false); return; }

      const targetFolderId = photoDocsFolder.id; 
      const fileName = `사진대지_${workType || '공종미상'}_${new Date().getTime()}.pdf`; 

      const storageRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/storage`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({ jsonapi: { version: "1.0" }, data: { type: "objects", attributes: { name: fileName }, relationships: { target: { data: { type: "folders", id: targetFolderId } } } } })
      });
      const objectId = (await storageRes.json()).data.id; 

      const s3UrlRes = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${objectId.split('/')[0].split(':')[3]}/objects/${objectId.split('/')[1]}/signeds3upload`, { headers: authHeader });
      const s3UrlData = await s3UrlRes.json();

      const finalPdfBlob = await generatePDFBlob();

      await fetch(s3UrlData.urls[0], { method: 'PUT', body: finalPdfBlob });
      await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${objectId.split('/')[0].split(':')[3]}/objects/${objectId.split('/')[1]}/signeds3upload`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadKey: s3UrlData.uploadKey })
      });

      const itemRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/items`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({
          jsonapi: { version: "1.0" },
          data: { type: "items", attributes: { displayName: fileName, extension: { type: "items:autodesk.bim360:File", version: "1.0" } }, relationships: { tip: { data: { type: "versions", id: "1" } }, parent: { data: { type: "folders", id: targetFolderId } } } },
          included: [{ type: "versions", id: "1", attributes: { name: fileName, extension: { type: "versions:autodesk.bim360:File", version: "1.0" } }, relationships: { storage: { data: { type: "objects", id: objectId } } } }]
        })
      });

      if (itemRes.ok) {
        alert(`🎉 사진대지(PDF) 업로드가 성공적으로 완료되었습니다!`);
        setImageSrcs([]); setSelectedFiles([]); 
      } else throw new Error("생성 실패");

    } catch (error) {
      console.error(error); alert("업로드 중 문제가 발생했습니다. 폴더 상태를 확인하세요.");
    } finally { setIsUploading(false); }
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.appWrapper}>
        <div style={styles.loginContainer}>
          <h1 style={styles.headerTitle}>Site Log</h1>
          <p style={{ color: '#7f8c8d', marginBottom: '40px' }}>건설 현장 통합 기록 솔루션</p>
          <button style={styles.accLoginButton} onClick={handleLogin}>
            <SiAutodesk size={24} style={{ marginRight: '10px' }} /> Autodesk ACC로 로그인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appWrapper}>
      <div style={styles.container}>
        <h1 style={styles.headerTitle}>Site Log</h1>
        
        <div style={styles.menuContainer}>
          <div style={styles.menuItem}><div style={{ ...styles.iconCircle, backgroundColor: '#8BC34A', color: 'white' }}><FaCamera size={24} /></div><span style={{ ...styles.menuText, color: '#E64A19', fontWeight: 'bold' }}>사진대지</span></div>
          <div style={styles.menuItem}><div style={styles.iconCircle}><FaVideo size={24} /></div><span style={styles.menuText}>영상기록</span></div>
          <div style={styles.menuItem}><div style={styles.iconCircle}><FaHardHat size={24} /></div><span style={styles.menuText}>안전대장</span></div>
          <div style={styles.menuItem}><div style={styles.iconCircle}><FaList size={24} /></div><span style={styles.menuText}>자재대장</span></div>
        </div>
        <hr style={styles.divider} />

        <div style={styles.formContainer}>
          <div style={styles.projectHeader}>
            <select style={styles.projectSelect} value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
              {projects.length === 0 ? <option value="">프로젝트가 없습니다.</option> : projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select><FaSync color="#F5B041" size={18} />
          </div>

          <input style={styles.input} type="text" placeholder="작업공종을 입력하세요" value={workType} onChange={e => setWorkType(e.target.value)} />
          
          <div style={styles.inputWithIcon}>
            <input style={styles.flexInput} type="text" placeholder="촬영위치를 입력하세요" value={locationStr} onChange={e => setLocationStr(e.target.value)} />
            <div onClick={loadFloorPlans} title="현장 도면 보기" style={{ padding: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <FaFileAlt color="#3498DB" size={20} />
            </div>
          </div>
          
          <div style={styles.inputWithIcon}>
            <input style={styles.flexInput} type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} />
          </div>
          <input style={styles.input} type="text" placeholder="활동내용을 입력하세요" value={description} onChange={e => setDescription(e.target.value)} />
          
          <div style={styles.buttonRow}>
            <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <input type="file" accept="image/*" multiple ref={galleryInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
            <button style={styles.actionButton} onClick={() => cameraInputRef.current.click()}><FaCamera style={{ marginRight: '5px' }} /> 사진 촬영</button>
            <button style={{ ...styles.actionButton, backgroundColor: '#3498DB' }} onClick={() => galleryInputRef.current.click()}><FaImage style={{ marginRight: '5px' }} /> 사진 열기</button>
          </div>
          
          <div style={styles.imagePlaceholder}>
            {imageSrcs.length > 0 ? (
              <div style={{ display: 'flex', overflowX: 'auto', width: '100%', height: '100%', gap: '10px', padding: '10px', boxSizing: 'border-box' }}>
                {imageSrcs.map((src, index) => (
                  <div key={index} style={{ position: 'relative', minWidth: '140px', height: '100%', flexShrink: 0 }}>
                    <img src={src} alt={`미리보기 ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '5px' }} />
                    <button onClick={() => removeImage(index)} style={{ position: 'absolute', top: '5px', right: '5px', background: '#E74C3C', color: 'white', border: 'none', borderRadius: '50%', width: '26px', height: '26px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}><FaTimes size={12} /></button>
                    <div style={{ position: 'absolute', bottom: '5px', right: '5px', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>
                      압축됨 (1MB 이하)
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#D5D8DC' }}>
                <FaImage size={40} style={{ marginBottom: '10px' }} />
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>사진이 없습니다</span>
              </div>
            )}
          </div>

          <button style={{ ...styles.actionButton, width: '100%', marginTop: '15px', padding: '15px 0', fontSize: '16px', backgroundColor: isUploading ? '#BDC3C7' : '#E67E22' }} onClick={handleUploadToACC} disabled={isUploading || imageSrcs.length === 0}>
            <FaCloudUploadAlt style={{ marginRight: '8px', fontSize: '20px' }} /> 
            {isUploading ? '사진대지 PDF 생성 및 전송 중...' : `${imageSrcs.length}장 사진대지(PDF) 업로드`}
          </button>
        </div>
      </div>

      {/* 도면 모달 */}
      {showFloorPlanModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>현장 도면 목록</h3>
              <button onClick={() => { setIsDrawingRendered(false); setShowFloorPlanModal(false); }} style={styles.closeBtn}><FaTimes /></button>
            </div>
            
            <div style={styles.modalBody}>
              {loadingPlans ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>도면 폴더를 스캔하는 중...</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: '10px' }}>
                  {floorPlans.map(plan => (
                    <li key={plan.id} style={styles.planItem} onClick={() => viewFloorPlan(plan)}>
                      <FaFileAlt style={{ marginRight: '10px', color: '#E74C3C', fontSize: '18px' }}/> 
                      <span style={{ fontSize: '14px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {plan.attributes.displayName}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {loadingPlanView && (
                <div style={{ textAlign: 'center', marginTop: '20px', color: '#3498DB', fontWeight: 'bold' }}>
                  도면을 안전하게 디코딩 중입니다...
                </div>
              )}

              <div style={{ width: '100%', height: '350px', border: '1px solid #D5D8DC', borderRadius: '5px', overflow: 'auto', display: isDrawingRendered ? 'block' : 'none', position: 'relative', backgroundColor: '#ecf0f1' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <canvas 
                    ref={canvasRef} 
                    onClick={handleCanvasClick} 
                    style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }} 
                  />
                  {pinLocation && (
                    <div style={{ position: 'absolute', left: pinLocation.x, top: pinLocation.y, transform: 'translate(-50%, -100%)', fontSize: '32px', pointerEvents: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>📍</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 📜 [백그라운드 템플릿] PDF 생성용 렌더링 영역 */}
      {/* ========================================================= */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div id="pdf-container">
          {Array.from({ length: Math.ceil(imageSrcs.length / 2) }).map((_, pageIndex) => (
            <div id={`pdf-page-${pageIndex}`} key={pageIndex} style={pdfStyles.page}>
              <h1 style={pdfStyles.title}>사 진 대 지</h1>
              
              <table style={pdfStyles.mainTable}>
                <tbody>
                  {/* 상단 사진 및 정보 */}
                  <tr>
                    <td colSpan="4" style={pdfStyles.imageTd}>
                      <img src={imageSrcs[pageIndex * 2]} style={pdfStyles.image} alt="현장사진 상단" crossOrigin="anonymous" />
                    </td>
                  </tr>
                  <tr>
                    <th style={pdfStyles.th}>공 종</th>
                    <td style={pdfStyles.td}>{workType || '-'}</td>
                    <th style={pdfStyles.th}>위 치</th>
                    <td style={pdfStyles.td}>{locationStr || '-'}</td>
                  </tr>
                  <tr>
                    <th style={pdfStyles.th}>내 용</th>
                    <td style={pdfStyles.td}>{description || '-'}</td>
                    <th style={pdfStyles.th}>일 자</th>
                    <td style={pdfStyles.td}>{dateStr.replace(/-/g, '.')}</td>
                  </tr>

                  {/* 하단 사진 및 정보 (홀수장일 경우 렌더링 안 함) */}
                  {imageSrcs[pageIndex * 2 + 1] ? (
                    <>
                      <tr>
                        <td colSpan="4" style={{ ...pdfStyles.imageTd, borderTop: 'none' }}>
                          <img src={imageSrcs[pageIndex * 2 + 1]} style={pdfStyles.image} alt="현장사진 하단" crossOrigin="anonymous" />
                        </td>
                      </tr>
                      <tr>
                        <th style={pdfStyles.th}>공 종</th>
                        <td style={pdfStyles.td}>{workType || '-'}</td>
                        <th style={pdfStyles.th}>위 치</th>
                        <td style={pdfStyles.td}>{locationStr || '-'}</td>
                      </tr>
                      <tr>
                        <th style={pdfStyles.th}>내 용</th>
                        <td style={pdfStyles.td}>{description || '-'}</td>
                        <th style={pdfStyles.th}>일 자</th>
                        <td style={pdfStyles.td}>{dateStr.replace(/-/g, '.')}</td>
                      </tr>
                    </>
                  ) : null}
                </tbody>
              </table>
              
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// 웹 UI 스타일
const styles = {
  appWrapper: { display: 'flex', justifyContent: 'center', backgroundColor: '#f0f2f5', minHeight: '100vh', fontFamily: 'sans-serif' },
  container: { width: '100%', maxWidth: '400px', backgroundColor: '#fff', padding: '20px', boxSizing: 'border-box', boxShadow: '0 0 10px rgba(0,0,0,0.1)' },
  loginContainer: { width: '100%', maxWidth: '400px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', boxSizing: 'border-box', boxShadow: '0 0 10px rgba(0,0,0,0.1)' },
  accLoginButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '15px', backgroundColor: '#0696D7', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  headerTitle: { fontSize: '32px', margin: '10px 0 10px 0', fontWeight: '900', color: '#2c3e50' },
  menuContainer: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px' },
  menuItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' },
  iconCircle: { width: '50px', height: '50px', borderRadius: '25px', backgroundColor: '#F2F3F4', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '8px', color: '#555' },
  menuText: { fontSize: '13px', color: '#555', fontWeight: '600' },
  divider: { border: 'none', borderTop: '2px solid #1A5276', margin: '0 0 15px 0' },
  formContainer: { padding: '20px', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)', border: '1px solid #eee' },
  projectHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '5px', backgroundColor: '#f8f9fa', borderRadius: '5px' },
  projectSelect: { flex: 1, fontSize: '15px', fontWeight: 'bold', color: '#333', border: 'none', outline: 'none', backgroundColor: 'transparent', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' },
  input: { width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #D5D8DC', borderRadius: '5px', boxSizing: 'border-box', outline: 'none' },
  inputWithIcon: { display: 'flex', alignItems: 'center', border: '1px solid #D5D8DC', borderRadius: '5px', padding: '0 10px', marginBottom: '15px', backgroundColor: 'white' },
  flexInput: { flex: 1, padding: '12px 0', border: 'none', outline: 'none', backgroundColor: 'transparent' },
  buttonRow: { display: 'flex', gap: '10px', marginBottom: '15px' },
  actionButton: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 0', border: 'none', borderRadius: '5px', color: 'white', backgroundColor: '#F5B041', fontWeight: 'bold', cursor: 'pointer' },
  imagePlaceholder: { height: '180px', border: '1px solid #D5D8DC', borderRadius: '5px', backgroundColor: '#F8F9F9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { width: '90%', maxWidth: '450px', backgroundColor: '#fff', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '15px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' },
  modalBody: { overflowY: 'auto' },
  planItem: { padding: '15px 10px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background-color 0.2s', backgroundColor: '#fafafa', borderRadius: '5px', marginBottom: '5px' }
};

const pdfStyles = {
  page: { width: '210mm', height: '297mm', padding: '15mm 20mm', backgroundColor: '#fff', boxSizing: 'border-box', fontFamily: 'sans-serif' },
  title: { textAlign: 'center', fontSize: '28px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#000', letterSpacing: '5px', height: '10mm', lineHeight: '10mm' },
  
  mainTable: { width: '100%', borderCollapse: 'collapse', color: '#000', fontSize: '14px', tableLayout: 'fixed', boxSizing: 'border-box' },
  imageTd: { border: '1px solid #000', height: '90mm', padding: '5px', backgroundColor: '#fff', textAlign: 'center', verticalAlign: 'middle' },
  image: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  th: { border: '1px solid #000', padding: '8px 5px', backgroundColor: '#fff', width: '15%', textAlign: 'center', fontWeight: 'bold', height: '10mm' },
  td: { border: '1px solid #000', padding: '8px 10px', width: '35%', backgroundColor: '#fff', height: '10mm' }
};