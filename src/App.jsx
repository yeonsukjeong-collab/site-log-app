import React, { useState, useEffect, useRef } from 'react';
import { FaCamera, FaVideo, FaHardHat, FaList, FaSync, FaFileAlt, FaCloudUploadAlt, FaImage, FaTimes, FaPlus, FaTrashAlt, FaStop } from 'react-icons/fa';
import { SiAutodesk } from 'react-icons/si';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as pdfjsLib from 'pdfjs-dist';


pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import { CLIENT_ID, REDIRECT_URI, SCOPES, generateRandomString, generateCodeChallenge, compressImage } from './utils';
import { styles, pdfStyles } from './styles';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  
  // 💡 탭 상태 관리 ('photo' = 사진대지, 'video' = 영상기록)
  const [activeMenu, setActiveMenu] = useState('photo');

  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isUploading, setIsUploading] = useState(false); 



  // ==========================================
  // 📸 [사진대지] 관련 상태 및 Ref
  // ==========================================
  const createEmptyBoard = () => ({
    id: Date.now() + Math.random(),
    workType: localStorage.getItem('last_workType') || '',
    locationStr: localStorage.getItem('last_locationStr') || '',
    dateStr: new Date().toISOString().substring(0, 10),
    description: localStorage.getItem('last_description') || '',
    images: [] 
  });

  const [boards, setBoards] = useState([createEmptyBoard()]);
  const [targetBoardId, setTargetBoardId] = useState(null);
  
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
  const [activeBoardIdForMap, setActiveBoardIdForMap] = useState(null);

  // ==========================================
  // 🎥 [영상기록] 관련 상태 및 Ref (PDF 도면 + GPS 마커용)
  // ==========================================
  const markerRef = useRef(null);
  const gpsWatchIdRef = useRef(null);
  const pixelPositionRef = useRef(null); // GPS를 변환한 캔버스 픽셀 좌표 저장

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planList, setPlanList] = useState([]);
  const [loadingPlanList, setLoadingPlanList] = useState(false);
  const [selectedPlanItem, setSelectedPlanItem] = useState(null);
  const [planLoadStatus, setPlanLoadStatus] = useState('');
  const planCanvasRef = useRef(null); // 도면 PDF를 그릴 캔버스
  const pathCanvasRef = useRef(null); // 이동 경로 선을 그릴 오버레이 캔버스
  const pathPointsRef = useRef([]); // 촬영 중 기록된 경로 픽셀 좌표들
  const isRecordingRef = useRef(false);

  // 🎯 GPS ↔ 도면 픽셀 좌표 보정(캘리브레이션) 관련
  const [dwgCalibration, setDwgCalibrationState] = useState(null); // {scale, rotation, gpsOrigin, pixelOrigin}
  const dwgCalibrationRef = useRef(null);
  const setDwgCalibration = (calib) => { dwgCalibrationRef.current = calib; setDwgCalibrationState(calib); };
  const calibModeRef = useRef(0); // 0=보정 안 함, 1=기준점1 대기, 2=기준점2 대기
  const calibPointsRef = useRef([]);
  const [calibHint, setCalibHint] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const videoPreviewRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingMimeTypeRef = useRef('video/webm');

  // ------------------------------------------
  // 공통 로그인 및 프로젝트 로드 로직
  // ------------------------------------------
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
            body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT_URI, code_verifier: verifier })
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
    const backup = sessionStorage.getItem('temp_backup');
    if (backup) {
      try {
        const parsedBoards = JSON.parse(backup);
        if (Array.isArray(parsedBoards)) setBoards(parsedBoards);
      } catch (e) { console.error('백업 복구 실패:', e); }
      sessionStorage.removeItem('temp_backup');
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
            setIsLoggedIn(false); setAccessToken(''); return;
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

  // 🎥 영상기록 탭이 열려있는 동안 카메라 스트림을 켜서 PIP 미리보기에 연결
  useEffect(() => {
    if (activeMenu !== 'video') return;
    let cancelled = false;

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        cameraStreamRef.current = stream;
        if (videoPreviewRef.current) videoPreviewRef.current.srcObject = stream;
      })
      .catch((err) => alert(`카메라를 사용할 수 없습니다.\n${err.message}`));

    return () => {
      cancelled = true;
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(t => t.stop());
        cameraStreamRef.current = null;
      }
    };
  }, [activeMenu]);

  const handleLogin = async () => {
    const verifier = generateRandomString(64);
    sessionStorage.setItem('code_verifier', verifier); 
    const challenge = await generateCodeChallenge(verifier);
    const params = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPES, code_challenge: challenge, code_challenge_method: 'S256' });
    window.location.href = `https://developer.api.autodesk.com/authentication/v2/authorize?${params.toString()}`; 
  };

  // ------------------------------------------
  // 사진대지(PDF 뷰어 등) 전용 함수들
  // ------------------------------------------
  const handleBoardChange = (id, field, value) => {
    setBoards(prev => prev.map(board => board.id === id ? { ...board, [field]: value } : board));
    if (field !== 'dateStr') localStorage.setItem(`last_${field}`, value);
  };
  const addBoard = () => {
    setBoards(prev => [...prev, createEmptyBoard()]);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
  };
  const removeBoard = (id) => {
    if (boards.length === 1) return alert("최소 1개의 사진대지는 필요합니다.");
    setBoards(prev => prev.filter(board => board.id !== id));
  };
  const openCamera = (id) => {
    sessionStorage.setItem('temp_backup', JSON.stringify(boards));
    setTargetBoardId(id); 
    cameraInputRef.current.click(); 
  };
  const openGallery = (id) => { setTargetBoardId(id); galleryInputRef.current.click(); };
  
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0 && targetBoardId) {
      const compressedUrls = await Promise.all(files.map(file => compressImage(file)));
      setBoards(prev => prev.map(board => {
        if (board.id === targetBoardId) {
          const newImages = files.map((file, idx) => ({ id: Date.now() + Math.random() + idx, src: compressedUrls[idx], file: file }));
          return { ...board, images: [...board.images, ...newImages] };
        }
        return board;
      }));
    }
    e.target.value = null; 
    setTargetBoardId(null);
  };

  const removeImage = (boardId, imageId) => {
    setBoards(prev => prev.map(board => {
      if (board.id === boardId) return { ...board, images: board.images.filter(img => img.id !== imageId) };
      return board;
    }));
  };

  const pdfData = boards.flatMap(board => board.images.length > 0 ? board.images.map(img => ({ ...board, imageSrc: img.src })) : [{ ...board, imageSrc: null }]);

  const loadFloorPlans = async (boardId) => {
    if (!selectedProject) return alert("프로젝트를 먼저 선택해주세요.");
    setActiveBoardIdForMap(boardId); setShowFloorPlanModal(true); setLoadingPlans(true); setFloorPlans([]); setIsDrawingRendered(false); setPinLocation(null);
    try {
      const project = projects.find(p => p.id === selectedProject);
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const topRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${project.hubId}/projects/${project.id}/topFolders`, { headers: authHeader });
      const projFolder = (await topRes.json()).data.find(f => f.attributes.name === 'Project Files');
      const testFolderRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${projFolder.id}/contents`, { headers: authHeader });
      const testFolder = (await testFolderRes.json()).data.find(item => item.attributes.name === '99 TEST');
      const siteLogRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${testFolder.id}/contents`, { headers: authHeader });
      const siteLogFolder = (await siteLogRes.json()).data.find(item => item.attributes.name === 'Site_log');
      const fpRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${siteLogFolder.id}/contents`, { headers: authHeader });
      const fpFolder = (await fpRes.json()).data.find(item => item.attributes.name === 'floor_plan');
      const pdfsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${fpFolder.id}/contents`, { headers: authHeader });
      const pdfsData = await pdfsRes.json();
      setFloorPlans(pdfsData.data.filter(item => item.type === 'items' && item.attributes.displayName.toLowerCase().endsWith('.pdf')));
    } catch(err) { alert("도면 폴더를 불러올 수 없습니다."); setShowFloorPlanModal(false); } finally { setLoadingPlans(false); }
  };

  const viewFloorPlan = async (item) => {
    setLoadingPlanView(true); setIsDrawingRendered(false); setPinLocation(null); 
    const planName = item.attributes.displayName.replace(/\.[^/.]+$/, "");
    setSelectedFloorPlanName(planName);
    try {
      const project = projects.find(p => p.id === selectedProject);
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const versionId = item.relationships.tip.data.id;
      const verRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/versions/${encodeURIComponent(versionId)}`, { headers: authHeader });
      if (!verRes.ok) throw new Error(`도면 정보 권한/조회 실패 (${verRes.status})`);
      const verData = await verRes.json();
      const storageId = verData.data.relationships.storage.data.id;
      const parts = storageId.split(':');
      const [bucketKey, objectKey] = parts[parts.length - 1].split('/');
      const s3UrlRes = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3download`, { method: 'GET', headers: authHeader });
      if (!s3UrlRes.ok) throw new Error(`다운로드 임시 링크 발급 실패 (${s3UrlRes.status})`);
      const s3UrlData = await s3UrlRes.json();
      const fileResponse = await fetch(s3UrlData.url, { method: 'GET' });
      if (!fileResponse.ok) throw new Error(`실제 도면 파일 다운로드 실패 (${fileResponse.status})`);
      const arrayBuffer = await fileResponse.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 }); 
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      setIsDrawingRendered(true);
      handleBoardChange(activeBoardIdForMap, 'locationStr', `${planName} [좌표 설정 대기중]`);
    } catch(err) { console.error("🔥 PDF 렌더링 상세 오류:", err); alert(`도면 렌더링 실패!\n상세 원인: ${err.message}`); } finally { setLoadingPlanView(false); }
  };

  const handleCanvasClick = (e) => {
    const x = e.nativeEvent.offsetX; const y = e.nativeEvent.offsetY; setPinLocation({ x, y });
    handleBoardChange(activeBoardIdForMap, 'locationStr', `${selectedFloorPlanName} [X:${Math.round(x)}, Y:${Math.round(y)}]`);
  };

  const generatePDFBlob = async () => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const totalPages = Math.ceil(pdfData.length / 2);
    for (let i = 0; i < totalPages; i++) {
      const canvas = await html2canvas(document.getElementById(`pdf-page-${i}`), { scale: 2, useCORS: true });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight());
    }
    return pdf.output('blob'); 
  };

  const handleUploadToACC = async () => {
    if (boards.some(b => b.images.length === 0)) return alert("사진이 한 장도 없는 사진대지 폼이 있습니다. 채우거나 삭제해 주세요.");
    const project = projects.find(p => p.id === selectedProject);
    if (!project) return alert("프로젝트가 선택되지 않았습니다.");
    setIsUploading(true);
    try {
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const topRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${project.hubId}/projects/${project.id}/topFolders`, { headers: authHeader });
      const projFolder = (await topRes.json()).data.find(f => f.attributes.name === 'Project Files');
      const testFolderRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${projFolder.id}/contents`, { headers: authHeader });
      const testFolder = (await testFolderRes.json()).data.find(item => item.attributes.name === '99 TEST');
      const siteLogRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${testFolder.id}/contents`, { headers: authHeader });
      const siteLogFolder = (await siteLogRes.json()).data.find(item => item.attributes.name === 'Site_log');
      const photoDocsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${siteLogFolder.id}/contents`, { headers: authHeader });
      const photoDocsFolder = (await photoDocsRes.json()).data.find(item => item.attributes.name === 'photo_docs');

      const fileName = `사진대지_${boards[0].workType || '다수공종'}_${new Date().getTime()}.pdf`; 
      const storageRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/storage`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({ jsonapi: { version: "1.0" }, data: { type: "objects", attributes: { name: fileName }, relationships: { target: { data: { type: "folders", id: photoDocsFolder.id } } } } })
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
          data: { type: "items", attributes: { displayName: fileName, extension: { type: "items:autodesk.bim360:File", version: "1.0" } }, relationships: { tip: { data: { type: "versions", id: "1" } }, parent: { data: { type: "folders", id: photoDocsFolder.id } } } },
          included: [{ type: "versions", id: "1", attributes: { name: fileName, extension: { type: "versions:autodesk.bim360:File", version: "1.0" } }, relationships: { storage: { data: { type: "objects", id: objectId } } } }]
        })
      });
      if (itemRes.ok) { alert(`🎉 총 ${pdfData.length}장의 사진대지가 병합/업로드되었습니다!`); setBoards([createEmptyBoard()]); } else throw new Error("생성 실패");
    } catch (error) { alert("업로드 중 문제가 발생했습니다."); } finally { setIsUploading(false); }
  };

  // ==========================================
  // 🎥 영상기록 전용 함수들 (PDF 도면 + GPS 보정)
  // ==========================================
  const loadPlanList = async () => {
    if (!selectedProject) return alert("프로젝트를 선택해주세요.");
    setShowPlanModal(true); setLoadingPlanList(true); setPlanList([]);

    try {
      const project = projects.find(p => p.id === selectedProject);
      const authHeader = { Authorization: `Bearer ${accessToken}` };

      const topRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${project.hubId}/projects/${project.id}/topFolders`, { headers: authHeader });
      const projFolder = (await topRes.json()).data.find(f => f.attributes.name === 'Project Files');
      const testFolderRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${projFolder.id}/contents`, { headers: authHeader });
      const testFolder = (await testFolderRes.json()).data.find(item => item.attributes.name === '99 TEST');
      const siteLogRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${testFolder.id}/contents`, { headers: authHeader });
      const siteLogFolder = (await siteLogRes.json()).data.find(item => item.attributes.name === 'Site_log');
      const fpRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${siteLogFolder.id}/contents`, { headers: authHeader });
      const fpFolder = (await fpRes.json()).data.find(item => item.attributes.name === 'floor_plan');

      const pdfsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${fpFolder.id}/contents`, { headers: authHeader });
      const pdfsData = await pdfsRes.json();

      setPlanList(pdfsData.data.filter(item => item.type === 'items' && item.attributes.displayName.toLowerCase().endsWith('.pdf')));
    } catch (err) { alert("도면 폴더를 불러올 수 없습니다."); setShowPlanModal(false); }
    finally { setLoadingPlanList(false); }
  };

  // 🎯 위/경도를 Web Mercator(미터) 평면 좌표로 변환
  const gpsToMercator = (lat, lng) => {
    const rMajor = 6378137.0;
    return {
      x: rMajor * (lng * Math.PI / 180),
      y: rMajor * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))
    };
  };

  // 🎯 기준점 2개(각각 {pixel:{x,y}, gps:{x,y}})로 축척+회전+이동 변환을 계산
  const computeCalibration = (p1, p2) => {
    const dGps = { x: p2.gps.x - p1.gps.x, y: p2.gps.y - p1.gps.y };
    const dPixel = { x: p2.pixel.x - p1.pixel.x, y: p2.pixel.y - p1.pixel.y };
    const pixelDist = Math.hypot(dPixel.x, dPixel.y);
    if (pixelDist < 1e-6) return null; // 두 기준점을 도면상 같은 지점으로 찍음
    const scale = Math.hypot(dGps.x, dGps.y) / pixelDist;
    const rotation = Math.atan2(dGps.y, dGps.x) - Math.atan2(dPixel.y, dPixel.x);
    return { scale, rotation, gpsOrigin: p1.gps, pixelOrigin: p1.pixel };
  };

  // 🎯 보정값을 이용해 GPS(Web Mercator) 좌표를 도면 픽셀 좌표로 역변환
  const gpsToPixel = (calib, gpsPt) => {
    const dx = gpsPt.x - calib.gpsOrigin.x;
    const dy = gpsPt.y - calib.gpsOrigin.y;
    const cosA = Math.cos(-calib.rotation);
    const sinA = Math.sin(-calib.rotation);
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    return { x: calib.pixelOrigin.x + rx / calib.scale, y: calib.pixelOrigin.y + ry / calib.scale };
  };

  const startCalibration = () => {
    if (!selectedPlanItem) return alert('먼저 도면을 선택해주세요.');
    calibPointsRef.current = [];
    calibModeRef.current = 1;
    setCalibHint('🎯 기준점1 위치에 실제로 서서, 도면에서 해당 지점을 탭하세요.');
  };

  const handleCalibrationTap = (pixelPoint, planItemId) => {
    setCalibHint('📡 GPS 수신 중...');
    navigator.geolocation.getCurrentPosition((pos) => {
      const gpsPt = gpsToMercator(pos.coords.latitude, pos.coords.longitude);
      calibPointsRef.current.push({ pixel: pixelPoint, gps: gpsPt });
      if (calibModeRef.current === 1) {
        calibModeRef.current = 2;
        setCalibHint('✅ 기준점1 저장됨. 기준점2 위치로 이동한 후 도면에서 그 지점을 탭하세요.');
      } else {
        const calib = computeCalibration(calibPointsRef.current[0], calibPointsRef.current[1]);
        calibModeRef.current = 0;
        calibPointsRef.current = [];
        setCalibHint('');
        if (!calib) return alert('두 기준점을 도면상에서 같은 위치로 찍어서 계산할 수 없습니다. 다시 시도해주세요.');
        setDwgCalibration(calib);
        localStorage.setItem(`plan_calib_${planItemId}`, JSON.stringify(calib));
        alert('🎉 보정 완료! 이제 GPS 위치가 도면에 표시됩니다.');
        startGpsTracking();
      }
    }, (err) => {
      setCalibHint('');
      alert(`GPS 수신 실패로 기준점을 저장하지 못했습니다.\n코드: ${err.code} 메시지: ${err.message}`);
    }, { enableHighAccuracy: true });
  };

  const handlePlanCanvasClick = (e) => {
    if (calibModeRef.current === 0) return;
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    handleCalibrationTap({ x, y }, selectedPlanItem.id);
  };

  // ==========================================
  // 💡 1. PDF 도면을 캔버스에 렌더링 (Autodesk Viewer 없이, 사진대지와 동일한 방식)
  // ==========================================
  const viewPlan = async (item) => {
    setShowPlanModal(false);
    setSelectedPlanItem(item);
    setPlanLoadStatus('도면 다운로드 중...');
    calibModeRef.current = 0;
    calibPointsRef.current = [];
    setCalibHint('');
    pathPointsRef.current = [];

    const savedCalibRaw = localStorage.getItem(`plan_calib_${item.id}`);
    try { setDwgCalibration(savedCalibRaw ? JSON.parse(savedCalibRaw) : null); } catch { setDwgCalibration(null); }

    try {
      const project = projects.find(p => p.id === selectedProject);
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const versionId = item.relationships.tip.data.id;
      const verRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/versions/${encodeURIComponent(versionId)}`, { headers: authHeader });
      if (!verRes.ok) throw new Error(`도면 정보 조회 실패 (${verRes.status})`);
      const verData = await verRes.json();
      const storageId = verData.data.relationships.storage.data.id;
      const parts = storageId.split(':');
      const [bucketKey, objectKey] = parts[parts.length - 1].split('/');
      const s3UrlRes = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3download`, { headers: authHeader });
      if (!s3UrlRes.ok) throw new Error(`다운로드 링크 발급 실패 (${s3UrlRes.status})`);
      const s3UrlData = await s3UrlRes.json();
      const fileResponse = await fetch(s3UrlData.url);
      if (!fileResponse.ok) throw new Error(`파일 다운로드 실패 (${fileResponse.status})`);
      const arrayBuffer = await fileResponse.arrayBuffer();

      setPlanLoadStatus('도면 렌더링 중...');
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = planCanvasRef.current;
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport }).promise;

      // 경로선 오버레이 캔버스를 도면 캔버스의 "화면에 표시되는 크기"에 맞춰 픽셀 1:1로 맞춤
      // (기준점 탭/마커 위치가 모두 이 화면 표시 크기 기준 좌표라서 동일하게 맞춰야 선이 어긋나지 않음)
      const pathCanvas = pathCanvasRef.current;
      if (pathCanvas) {
        pathCanvas.width = canvas.clientWidth;
        pathCanvas.height = canvas.clientHeight;
        pathCanvas.getContext('2d').clearRect(0, 0, pathCanvas.width, pathCanvas.height);
      }

      setPlanLoadStatus('');
      startGpsTracking();
    } catch (err) {
      setPlanLoadStatus('');
      alert(`도면 렌더링 실패!\n${err.message}`);
    }
  };

  // ==========================================
  // 💡 2. 내 GPS 위치를 도면 픽셀 좌표로 변환
  // ==========================================
  const startGpsTracking = () => {
    if (!('geolocation' in navigator)) return alert("GPS를 지원하지 않습니다.");
    if (!window.isSecureContext) {
      alert(`⚠️ 보안 컨텍스트가 아니라서 GPS를 사용할 수 없습니다.\n\n현재 주소: ${window.location.protocol}//${window.location.host}\n\nhttps:// 또는 localhost가 아니면 브라우저가 GPS를 차단합니다.`);
    }

    const processPosition = (position) => {
      const { latitude, longitude } = position.coords;
      const gpsPt = gpsToMercator(latitude, longitude);

      // 기준점 보정이 끝난 도면만 픽셀 좌표로 변환 가능. 보정 전에는 마커를 표시하지 않음.
      if (!dwgCalibrationRef.current) { pixelPositionRef.current = null; return; }
      pixelPositionRef.current = gpsToPixel(dwgCalibrationRef.current, gpsPt);
      updateMarkerPosition();
      if (isRecordingRef.current) drawPathSegment(pixelPositionRef.current);
    };

    const handleGpsError = (err) => {
      console.log(err);
      alert(`🔥 GPS 위치 수신 실패\n\n코드: ${err.code}\n메시지: ${err.message}`);
    };

    navigator.geolocation.getCurrentPosition(processPosition, handleGpsError, { enableHighAccuracy: true });

    if (gpsWatchIdRef.current) navigator.geolocation.clearWatch(gpsWatchIdRef.current);
    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      processPosition, handleGpsError, { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  // ==========================================
  // 💡 3. 도면 픽셀 좌표 ➔ 마커 위치 렌더링
  // ==========================================
  const updateMarkerPosition = () => {
    if (!pixelPositionRef.current || !markerRef.current) return;
    markerRef.current.style.left = `${pixelPositionRef.current.x - 10}px`;
    markerRef.current.style.top = `${pixelPositionRef.current.y - 10}px`;
    markerRef.current.style.display = 'block';
  };

  // 🎯 촬영 중 GPS로 받은 새 지점을 이전 지점과 이어 도면 위에 선으로 그림
  const drawPathSegment = (point) => {
    const canvas = pathCanvasRef.current;
    if (!canvas) return;
    const prevPoint = pathPointsRef.current[pathPointsRef.current.length - 1];
    pathPointsRef.current.push(point);
    if (!prevPoint) return;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#2ECC71';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prevPoint.x, prevPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  // ==========================================
  // 🎥 4. 카메라 녹화 (MediaRecorder)
  // ==========================================
  const handleStartRecording = () => {
    if (!cameraStreamRef.current) return alert('카메라가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
    if (!window.MediaRecorder) return alert('이 브라우저는 영상 녹화를 지원하지 않습니다.');

    recordedChunksRef.current = [];
    setVideoBlob(null);

    // 새 촬영을 시작하면 이전 경로선을 지우고, 지금 위치부터 새로 그리기 시작
    pathPointsRef.current = pixelPositionRef.current ? [pixelPositionRef.current] : [];
    if (pathCanvasRef.current) {
      const ctx = pathCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, pathCanvasRef.current.width, pathCanvasRef.current.height);
    }
    isRecordingRef.current = true;

    // mp4로 바로 녹화되길 우선 시도하고, 브라우저가 지원하지 않으면 webm으로 대체합니다.
    const mimeCandidates = ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported(m)) || '';

    if (!mimeType.startsWith('video/mp4')) {
      alert('⚠️ 이 브라우저는 mp4로 직접 녹화하는 것을 지원하지 않아, webm 형식으로 저장됩니다.');
    }

    recordingMimeTypeRef.current = mimeType || 'video/webm';
    const recorder = mimeType ? new MediaRecorder(cameraStreamRef.current, { mimeType }) : new MediaRecorder(cameraStreamRef.current);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
    recorder.onstop = () => { setVideoBlob(new Blob(recordedChunksRef.current, { type: recordingMimeTypeRef.current })); };
    recorder.start();

    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    isRecordingRef.current = false;
    setIsRecording(false);
  };

  const handleUploadVideoToACC = async () => {
    if (!videoBlob) return alert("업로드할 영상이 없습니다.");
    const project = projects.find(p => p.id === selectedProject);
    if (!project) return alert("프로젝트가 선택되지 않았습니다.");
    setIsUploadingVideo(true);
    try {
      const authHeader = { Authorization: `Bearer ${accessToken}` };
      const topRes = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${project.hubId}/projects/${project.id}/topFolders`, { headers: authHeader });
      const projFolder = (await topRes.json()).data.find(f => f.attributes.name === 'Project Files');
      const testFolderRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${projFolder.id}/contents`, { headers: authHeader });
      const testFolder = (await testFolderRes.json()).data.find(item => item.attributes.name === '99 TEST');
      const siteLogRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${testFolder.id}/contents`, { headers: authHeader });
      const siteLogFolder = (await siteLogRes.json()).data.find(item => item.attributes.name === 'Site_log');
      const siteLogContentsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${siteLogFolder.id}/contents`, { headers: authHeader });
      const videoFolder = (await siteLogContentsRes.json()).data.find(item => item.attributes.name === 'site_video');
      if (!videoFolder) throw new Error("'site_video' 폴더를 찾을 수 없습니다. ACC의 Site_log 폴더 안에 먼저 만들어주세요.");

      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `현장영상_${new Date().getTime()}.${ext}`;
      const storageRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/storage`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({ jsonapi: { version: "1.0" }, data: { type: "objects", attributes: { name: fileName }, relationships: { target: { data: { type: "folders", id: videoFolder.id } } } } })
      });
      const objectId = (await storageRes.json()).data.id;
      const s3UrlRes = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${objectId.split('/')[0].split(':')[3]}/objects/${objectId.split('/')[1]}/signeds3upload`, { headers: authHeader });
      const s3UrlData = await s3UrlRes.json();

      await fetch(s3UrlData.urls[0], { method: 'PUT', body: videoBlob });
      await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${objectId.split('/')[0].split(':')[3]}/objects/${objectId.split('/')[1]}/signeds3upload`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadKey: s3UrlData.uploadKey })
      });
      const itemRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/items`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({
          jsonapi: { version: "1.0" },
          data: { type: "items", attributes: { displayName: fileName, extension: { type: "items:autodesk.bim360:File", version: "1.0" } }, relationships: { tip: { data: { type: "versions", id: "1" } }, parent: { data: { type: "folders", id: videoFolder.id } } } },
          included: [{ type: "versions", id: "1", attributes: { name: fileName, extension: { type: "versions:autodesk.bim360:File", version: "1.0" } }, relationships: { storage: { data: { type: "objects", id: objectId } } } }]
        })
      });
      if (itemRes.ok) { alert("🎉 현장 영상이 업로드되었습니다!"); setVideoBlob(null); } else throw new Error("생성 실패");
    } catch (error) { alert(`업로드 중 문제가 발생했습니다.\n${error.message}`); } finally { setIsUploadingVideo(false); }
  };

  // ------------------------------------------
  // 화면 렌더링
  // ------------------------------------------
  if (!isLoggedIn) {
    return (
      <div style={styles.appWrapper}>
        <div style={styles.loginContainer}>
          <h1 style={styles.headerTitle}><span style={styles.titleSite}>Site</span> <span style={styles.titleLog}>Log</span></h1>
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
        <h1 style={styles.headerTitle}>
          <span style={styles.titleSite}>Site</span> <span style={styles.titleLog}>Log</span>
        </h1>
        
        {/* 💡 탭 메뉴 인터페이스 */}
        <div style={styles.menuContainer}>
          <div style={styles.menuItem} onClick={() => setActiveMenu('photo')}>
            <div style={{ ...styles.iconCircle, backgroundColor: activeMenu === 'photo' ? '#8BC34A' : '#F2F3F4', color: activeMenu === 'photo' ? 'white' : '#555' }}>
              <FaCamera size={24} />
            </div>
            <span style={{ ...styles.menuText, color: activeMenu === 'photo' ? '#E64A19' : '#555', fontWeight: activeMenu === 'photo' ? 'bold' : 'normal' }}>사진대지</span>
          </div>
          
          <div style={styles.menuItem} onClick={() => setActiveMenu('video')}>
            <div style={{ ...styles.iconCircle, backgroundColor: activeMenu === 'video' ? '#3498DB' : '#F2F3F4', color: activeMenu === 'video' ? 'white' : '#555' }}>
              <FaVideo size={24} />
            </div>
            <span style={{ ...styles.menuText, color: activeMenu === 'video' ? '#E64A19' : '#555', fontWeight: activeMenu === 'video' ? 'bold' : 'normal' }}>영상기록</span>
          </div>
          
          <div style={styles.menuItem}>
            <div style={styles.iconCircle}><FaHardHat size={24} /></div><span style={styles.menuText}>안전대장</span>
          </div>
          <div style={styles.menuItem}>
            <div style={styles.iconCircle}><FaList size={24} /></div><span style={styles.menuText}>자재대장</span>
          </div>
        </div>
        <hr style={styles.divider} />

        <div style={styles.formContainer}>
          <div style={styles.projectHeader}>
            <select style={styles.projectSelect} value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
              {projects.length === 0 ? <option value="">프로젝트가 없습니다.</option> : projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select><FaSync color="#F5B041" size={18} />
          </div>

          {/* ============================================== */}
          {/* 📸 사진대지 (activeMenu === 'photo')             */}
          {/* ============================================== */}
          {activeMenu === 'photo' && (
            <>
              <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleFileChange} />
              <input type="file" accept="image/*" multiple ref={galleryInputRef} style={{ display: 'none' }} onChange={handleFileChange} />

              {boards.map((board, index) => (
                <div key={board.id} style={styles.card}>
                  <div style={styles.cardHeader}>
                    <span style={styles.cardTitle}>사진대지 세트 #{index + 1}</span>
                    <button onClick={() => removeBoard(board.id)} style={styles.btnDelete}><FaTrashAlt /></button>
                  </div>

                  <input style={styles.input} type="text" placeholder="작업공종을 입력하세요" value={board.workType} onChange={e => handleBoardChange(board.id, 'workType', e.target.value)} />
                  <div style={styles.inputWithIcon}>
                    <input style={styles.flexInput} type="text" placeholder="촬영위치를 입력하세요" value={board.locationStr} onChange={e => handleBoardChange(board.id, 'locationStr', e.target.value)} />
                    <div onClick={() => loadFloorPlans(board.id)} title="현장 도면 보기" style={{ padding: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><FaFileAlt color="#3498DB" size={20} /></div>
                  </div>
                  <div style={styles.inputWithIcon}>
                    <input style={styles.flexInput} type="date" value={board.dateStr} onChange={e => handleBoardChange(board.id, 'dateStr', e.target.value)} />
                  </div>
                  <input style={styles.input} type="text" placeholder="활동내용을 입력하세요" value={board.description} onChange={e => handleBoardChange(board.id, 'description', e.target.value)} />
                  
                  <div style={styles.buttonRow}>
                    <button type="button" style={styles.btnCamera} onClick={() => openCamera(board.id)}><FaCamera style={{ marginRight: '5px' }} /> 사진 촬영</button>
                    <button type="button" style={styles.btnGallery} onClick={() => openGallery(board.id)}><FaImage style={{ marginRight: '5px' }} /> 여러장 열기</button>
                  </div>
                  
                  <div style={styles.imagePlaceholder}>
                    {board.images.length > 0 ? (
                      <div style={{ display: 'flex', overflowX: 'auto', width: '100%', height: '100%', gap: '10px', padding: '10px', boxSizing: 'border-box' }}>
                        {board.images.map((img) => (
                          <div key={img.id} style={{ position: 'relative', minWidth: '130px', height: '100%', flexShrink: 0 }}>
                            <img src={img.src} alt="미리보기" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '5px', border: '1px solid #ddd' }} />
                            <button onClick={() => removeImage(board.id, img.id)} style={{ position: 'absolute', top: '5px', right: '5px', background: '#E74C3C', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}><FaTimes size={12} /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#D5D8DC' }}>
                        <FaImage size={35} style={{ marginBottom: '8px' }} />
                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>사진을 추가해주세요</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={styles.btnAddBoard} onClick={addBoard}>
                <FaPlus style={{ marginRight: '8px', fontSize: '16px' }} /> <span>새로운 사진대지 추가</span>
              </div>

              <button style={{ ...styles.btnUpload, backgroundColor: isUploading ? '#BDC3C7' : '#E67E22' }} onClick={handleUploadToACC} disabled={isUploading}>
                <FaCloudUploadAlt style={{ marginRight: '8px', fontSize: '18px' }} /> 
                {isUploading ? '업로드 진행 중...' : `${pdfData.length}장 사진대지(PDF) 업로드`}
              </button>
            </>
          )}

          {/* ============================================== */}
          {/* 🎥 영상기록 (activeMenu === 'video')             */}
          {/* ============================================== */}
          {activeMenu === 'video' && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.cardTitle}>현장 동선 영상 기록</span>
              </div>

              {/* 1. 도면 선택 버튼 (클릭 시 모달 오픈) */}
              <div
                style={{ ...styles.inputWithIcon, cursor: 'pointer', padding: '12px', justifyContent: 'space-between' }}
                onClick={loadPlanList}
              >
                <span style={{ fontSize: '15px', color: selectedPlanItem ? '#2C3E50' : '#000000', fontWeight: selectedPlanItem ? 'bold' : 'normal' }}>
                  {selectedPlanItem ? selectedPlanItem.attributes.displayName : 'ACC에서 도면(PDF) 선택...'}
                </span>
                <FaFileAlt color="#3498DB" size={20} />
              </div>

              {/* 1-1. GPS ↔ 도면 기준점 보정 */}
              <button
                type="button"
                onClick={startCalibration}
                disabled={!selectedPlanItem}
                style={{ ...styles.btnCamera, backgroundColor: !selectedPlanItem ? '#BDC3C7' : (dwgCalibration ? '#27AE60' : '#8E44AD'), width: '100%', marginBottom: '10px' }}
              >
                {dwgCalibration ? '✅ 기준점 설정됨 (다시 설정)' : '🎯 기준점 설정 (GPS 보정)'}
              </button>

              {/* 2. 도면 캔버스 및 실시간 카메라 뷰 */}
              <div style={{ position: 'relative', width: '100%', height: '350px', backgroundColor: '#ecf0f1', borderRadius: '5px', overflow: 'auto', marginBottom: '15px', border: '1px solid #D5D8DC' }}>

                {/* 도면 PDF가 그려지는 캔버스 (사진대지와 동일한 렌더링 방식) */}
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <canvas
                    ref={planCanvasRef}
                    onClick={handlePlanCanvasClick}
                    style={{ maxWidth: '100%', display: selectedPlanItem ? 'block' : 'none', cursor: calibHint ? 'crosshair' : 'default' }}
                  />

                  {/* 촬영 중 이동 경로 선 (클릭 통과) */}
                  <canvas
                    ref={pathCanvasRef}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 500 }}
                  />

                  {/* GPS 마커 */}
                  <div
                    ref={markerRef}
                    style={{
                      position: 'absolute',
                      width: '20px', height: '20px',
                      backgroundColor: '#E74C3C',
                      borderRadius: '50%',
                      border: '3px solid white',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
                      display: 'none',
                      zIndex: 9999,
                      pointerEvents: 'none',
                      transition: 'left 0.1s linear, top 0.1s linear'
                    }}
                  />
                </div>

                {!selectedPlanItem && (
                   <div style={{ position: 'absolute', top: '45%', left: '0', width: '100%', textAlign: 'center', color: '#95A5A6', zIndex: 1 }}>
                     상단 버튼을 눌러 도면을 선택해주세요
                   </div>
                )}

                {planLoadStatus && (
                   <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '10px', boxSizing: 'border-box', textAlign: 'center', color: '#fff', backgroundColor: 'rgba(44, 62, 80, 0.85)', fontSize: '13px', whiteSpace: 'pre-wrap', zIndex: 1000 }}>
                     {planLoadStatus}
                   </div>
                )}

                {!planLoadStatus && calibHint && (
                   <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '10px', boxSizing: 'border-box', textAlign: 'center', color: '#fff', backgroundColor: 'rgba(142, 68, 173, 0.9)', fontSize: '13px', whiteSpace: 'pre-wrap', zIndex: 1000 }}>
                     {calibHint}
                   </div>
                )}

                {/* 우측 하단 카메라 화면 (PIP) */}
                <div style={{ position: 'absolute', bottom: 10, right: 10, width: '100px', height: '140px', backgroundColor: '#000', borderRadius: '8px', border: '2px solid #fff', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', zIndex: 3 }}>
                   <video ref={videoPreviewRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay muted playsInline />
                </div>
              </div>

              {/* 3. 촬영 컨트롤 버튼 */}
              <div style={styles.buttonRow}>
                {!isRecording ? (
                  <button type="button" style={{ ...styles.btnCamera, backgroundColor: '#E74C3C' }} onClick={handleStartRecording}>
                    <FaVideo style={{ marginRight: '5px' }} /> 영상 촬영 시작
                  </button>
                ) : (
                  <button type="button" style={{ ...styles.btnCamera, backgroundColor: '#34495E' }} onClick={handleStopRecording}>
                    <FaStop style={{ marginRight: '5px' }} /> 촬영 종료
                  </button>
                )}
              </div>

              {/* 4. 최종 업로드 버튼 */}
              <button
                type="button"
                style={{ ...styles.btnUpload, backgroundColor: (videoBlob && !isUploadingVideo) ? '#E67E22' : '#BDC3C7' }}
                disabled={!videoBlob || isUploadingVideo}
                onClick={handleUploadVideoToACC}
              >
                <FaCloudUploadAlt style={{ marginRight: '8px', fontSize: '18px' }} /> {isUploadingVideo ? '업로드 진행 중...' : '촬영된 영상 ACC 업로드'}
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ============================================== */}
      {/* 📸 [기존] PDF 도면 목록 모달 (사진대지용) */}
      {/* ============================================== */}
      {showFloorPlanModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>현장 도면 목록</h3>
              <button onClick={() => { setIsDrawingRendered(false); setShowFloorPlanModal(false); }} style={styles.closeBtn}><FaTimes /></button>
            </div>
            <div style={styles.modalBody}>
              {loadingPlans ? ( <div style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>도면 폴더 스캔 중...</div> ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: '10px' }}>
                  {floorPlans.map(plan => (
                    <li key={plan.id} style={styles.planItem} onClick={() => viewFloorPlan(plan)}>
                      <FaFileAlt style={{ marginRight: '10px', color: '#E74C3C', fontSize: '18px' }}/> 
                      <span style={{ fontSize: '14px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.attributes.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
              {loadingPlanView && <div style={{ textAlign: 'center', marginTop: '20px', color: '#3498DB', fontWeight: 'bold' }}>디코딩 중...</div>}
              <div style={{ width: '100%', height: '350px', border: '1px solid #D5D8DC', borderRadius: '5px', overflow: 'auto', display: isDrawingRendered ? 'block' : 'none', position: 'relative', backgroundColor: '#ecf0f1' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }} />
                  {pinLocation && <div style={{ position: 'absolute', left: pinLocation.x, top: pinLocation.y, transform: 'translate(-50%, -100%)', fontSize: '32px', pointerEvents: 'none', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>📍</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================== */}
      {/* 🎥 도면(PDF) 목록 모달 (영상기록용) */}
      {/* ============================================== */}
      {showPlanModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>현장 도면 목록</h3>
              <button onClick={() => setShowPlanModal(false)} style={styles.closeBtn}><FaTimes /></button>
            </div>
            <div style={styles.modalBody}>
              {loadingPlanList ? ( <div style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>도면 폴더 스캔 중...</div> ) : planList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#e74c3c' }}>해당 폴더에 PDF 도면 파일이 없습니다.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: '10px' }}>
                  {planList.map(plan => (
                    <li key={plan.id} style={styles.planItem} onClick={() => viewPlan(plan)}>
                      <FaFileAlt style={{ marginRight: '10px', color: '#3498DB', fontSize: '18px' }}/>
                      <span style={{ fontSize: '14px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{plan.attributes.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 📜 PDF 렌더링 숨김 테이블 */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px' }}>
        <div id="pdf-container">
          {Array.from({ length: Math.ceil(pdfData.length / 2) }).map((_, pageIndex) => {
            const item1 = pdfData[pageIndex * 2];
            const item2 = pdfData[pageIndex * 2 + 1];
            return (
              <div id={`pdf-page-${pageIndex}`} key={pageIndex} style={pdfStyles.page}>
                <h1 style={pdfStyles.title}>사 진 대 지</h1>
                <table style={pdfStyles.mainTable}>
                  <colgroup><col style={{ width: '10%' }} /><col style={{ width: '40%' }} /><col style={{ width: '10%' }} /><col style={{ width: '40%' }} /></colgroup>
                  <tbody>
                    <tr><td colSpan="4" style={pdfStyles.imageTd}>{item1 && item1.imageSrc ? <img src={item1.imageSrc} style={pdfStyles.image} alt="상단" crossOrigin="anonymous" /> : null}</td></tr>
                    <tr><th style={pdfStyles.th}>공 종</th><td style={pdfStyles.td}>{item1?.workType || '-'}</td><th style={pdfStyles.th}>위 치</th><td style={pdfStyles.td}>{item1?.locationStr || '-'}</td></tr>
                    <tr><th style={pdfStyles.th}>내 용</th><td style={pdfStyles.td}>{item1?.description || '-'}</td><th style={pdfStyles.th}>일 자</th><td style={pdfStyles.td}>{item1?.dateStr.replace(/-/g, '.') || '-'}</td></tr>
                    {item2 && (
                      <>
                        <tr><td colSpan="4" style={{ ...pdfStyles.imageTd, borderTop: 'none' }}>{item2.imageSrc ? <img src={item2.imageSrc} style={pdfStyles.image} alt="하단" crossOrigin="anonymous" /> : null}</td></tr>
                        <tr><th style={pdfStyles.th}>공 종</th><td style={pdfStyles.td}>{item2.workType || '-'}</td><th style={pdfStyles.th}>위 치</th><td style={pdfStyles.td}>{item2.locationStr || '-'}</td></tr>
                        <tr><th style={pdfStyles.th}>내 용</th><td style={pdfStyles.td}>{item2.description || '-'}</td><th style={pdfStyles.th}>일 자</th><td style={pdfStyles.td}>{item2.dateStr.replace(/-/g, '.')}</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}