import React, { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { FaCamera, FaVideo, FaHardHat, FaList, FaSync, FaFileAlt, FaCloudUploadAlt, FaImage, FaTimes, FaPlus, FaTrashAlt, FaStop } from 'react-icons/fa';
import { SiAutodesk } from 'react-icons/si';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import * as pdfjsLib from 'pdfjs-dist';


pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

import { CLIENT_ID, REDIRECT_URI, SCOPES, KAKAO_JS_KEY, generateRandomString, generateCodeChallenge, compressImage } from './utils';
import { styles, pdfStyles } from './styles';
import { SITE_DRAWINGS } from './siteDrawings';
import { parseDwgToDrawing } from './dwgParser';
import { parseDxfToDrawing } from './dxfParser';
import { parseTiffToOverlay } from './tiffParser';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [userProfile, setUserProfile] = useState(null); // { given_name, family_name, name, ... }
  const [videoLogPdfData, setVideoLogPdfData] = useState(null); // { dateStr, timeStr, author, snapshotUrl } — ACC 업로드 시 잠깐 채워서 캡처용으로만 씀
  
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
  // 🎥 [영상기록] 관련 상태 및 Ref (카카오맵 GPS-도면 오버레이용)
  // ==========================================
  const mapIframeRef = useRef(null); // 도면+GPS를 보여주는 kakao-map.html iframe
  const [mapReady, setMapReady] = useState(false); // iframe이 {type:'ready'}를 보내면 true
  const [mapError, setMapError] = useState(''); // iframe에서 온 {type:'error'} 메시지 (지도 SDK/GPS 오류 등)
  const pendingDrawingRef = useRef(null); // mapReady 되기 전에 보내려던 도면 데이터 대기열
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState(0);

  const [showDwgModal, setShowDwgModal] = useState(false);
  const [dwgList, setDwgList] = useState([]);
  const [loadingDwgList, setLoadingDwgList] = useState(false);
  const [dwgParseStatus, setDwgParseStatus] = useState('');
  const [selectedDwgName, setSelectedDwgName] = useState('');

  const isRecordingRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [videoBlob, setVideoBlob] = useState(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  const videoPreviewRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordingMimeTypeRef = useRef('video/webm');
  const videoStartTimeRef = useRef(null);
  const videoEndTimeRef = useRef(null);

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

  // 동영상 기록 PDF의 "작성자"란에 쓸 ACC 로그인 사용자 이름
  useEffect(() => {
    if (!accessToken) return;
    fetch('https://api.userprofile.autodesk.com/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(res => res.json())
      .then(data => setUserProfile(data))
      .catch(err => console.error('사용자 정보 조회 에러:', err));
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
  // 🎥 영상기록 전용: 도면을 kakao-map.html iframe으로 전달 (등록된 정적 도면 / ACC에서 즉석 파싱한 DWG 공용 경로)
  // ==========================================
  const selectedProjectName = projects.find(p => p.id === selectedProject)?.name;
  const projectDrawings = SITE_DRAWINGS[selectedProjectName] || [];
  const selectedDrawing = projectDrawings[selectedDrawingIndex] || projectDrawings[0] || null;

  // iframe이 준비됐다는 신호({type:'ready'})를 받으면 mapReady를 세팅하고, 마지막으로
  // 보여주던 도면이 있으면 바로 재전송한다. 영상기록 탭을 벗어났다 돌아오면 iframe이
  // 통째로 재마운트되어 이 'ready'가 다시 오므로, 그때도 자동으로 다시 그려진다.
  useEffect(() => {
    const handleMapMessage = (event) => {
      if (event.source !== mapIframeRef.current?.contentWindow) return;
      const msg = event.data;
      if (msg?.type === 'ready') {
        setMapReady(true);
        setMapError('');
        if (pendingDrawingRef.current) {
          mapIframeRef.current.contentWindow.postMessage(pendingDrawingRef.current, window.location.origin);
        }
      } else if (msg?.type === 'error') {
        setMapError(msg.message || '지도에서 알 수 없는 오류가 발생했습니다.');
      } else if (msg?.type === 'debug') {
        console.debug('[kakao-map]', msg.message);
      }
    };
    window.addEventListener('message', handleMapMessage);
    return () => window.removeEventListener('message', handleMapMessage);
  }, []);

  // 영상기록 탭이 열려있는 동안 GPS를 최상위 페이지에서 직접 구독해 지도(iframe)로 밀어넣는다.
  // 모바일 브라우저는 iframe 안에서 도는 watchPosition을 백그라운드 취급해 첫 위치 이후로
  // 갱신을 멈추는 경우가 있어(특히 iOS Safari), iframe 자체 GPS 구독 대신 이 방식을 쓴다.
  useEffect(() => {
    if (activeMenu !== 'video') return;
    if (!('geolocation' in navigator)) {
      const t = setTimeout(() => setMapError('이 브라우저는 GPS(geolocation)를 지원하지 않습니다.'), 0);
      return () => clearTimeout(t);
    }

    const pushPosition = (pos) => {
      mapIframeRef.current?.contentWindow?.setUserLocation?.(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    };
    const handleError = (err) => {
      setMapError(`GPS 위치 수신 실패: ${err.message}`);
    };
    const watchId = navigator.geolocation.watchPosition(pushPosition, handleError, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [activeMenu]);

  // message는 자신의 type을 포함한 완전한 postMessage 페이로드
  // (예: {type:'renderDrawing', polylines, hull} 또는 {type:'renderTiffOverlay', imageDataUrl, bbox}).
  const sendOverlayToMap = (message) => {
    pendingDrawingRef.current = message; // 마지막 도면으로 기억해뒀다가 iframe이 재마운트되면 다시 보냄
    if (mapReady) {
      mapIframeRef.current?.contentWindow?.postMessage(message, window.location.origin);
    }
  };

  // 도면 윤곽 + 촬영 중 이동 경로를 그린 이미지(PNG data URL)를 지도(iframe)에 요청.
  // 실제 카카오 지도 타일은 CORS 때문에 캡처가 안 돼서, iframe이 갖고 있는 좌표로
  // 직접 캔버스에 그려서 돌려준다 (kakao-map.html의 captureSnapshot 참고).
  const requestMapSnapshot = () => new Promise((resolve) => {
    const win = mapIframeRef.current?.contentWindow;
    if (!win) return resolve(null);
    const timeoutId = setTimeout(() => { window.removeEventListener('message', handler); resolve(null); }, 3000);
    function handler(event) {
      if (event.source !== win || event.data?.type !== 'snapshot') return;
      clearTimeout(timeoutId);
      window.removeEventListener('message', handler);
      resolve(event.data.dataUrl || null);
    }
    window.addEventListener('message', handler);
    win.postMessage({ type: 'captureSnapshot' }, window.location.origin);
  });

  // SITE_DRAWINGS 레지스트리에서 도면을 고르면 정적 JSON을 읽어 지도로 보냄
  useEffect(() => {
    if (!selectedDrawing) return;
    fetch(selectedDrawing.file)
      .then(res => res.json())
      .then(data => { setSelectedDwgName(''); sendOverlayToMap({ type: 'renderDrawing', ...data }); })
      .catch(() => alert(`등록된 도면을 불러올 수 없습니다: ${selectedDrawing.file}`));
  }, [selectedDrawing?.file]);

  // ACC의 '99 TEST/Site_log/floor_plan' 폴더에서 도면(DWG) 또는 위치좌표 포함 TIFF 파일 목록 조회
  const loadDwgList = async () => {
    if (!selectedProject) return alert("프로젝트를 선택해주세요.");
    setShowDwgModal(true); setLoadingDwgList(true); setDwgList([]);
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
      const filesRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/folders/${fpFolder.id}/contents`, { headers: authHeader });
      const filesData = await filesRes.json();
      setDwgList(filesData.data.filter(item => {
        if (item.type !== 'items') return false;
        const name = item.attributes.displayName.toLowerCase();
        return name.endsWith('.dwg') || name.endsWith('.dxf') || name.endsWith('.tif') || name.endsWith('.tiff');
      }));
    } catch (err) { alert("도면 폴더를 불러올 수 없습니다."); setShowDwgModal(false); }
    finally { setLoadingDwgList(false); }
  };

  // 선택한 DWG/DXF/TIFF를 ACC에서 다운로드해 브라우저에서 바로 파싱하고 지도로 전송
  const selectDwg = async (item) => {
    setShowDwgModal(false);
    setSelectedDwgName(item.attributes.displayName);
    const isTiff = /\.tiff?$/i.test(item.attributes.displayName);
    const isDxf = /\.dxf$/i.test(item.attributes.displayName);
    setDwgParseStatus(isTiff ? '이미지 다운로드 중...' : '도면 다운로드 중...');
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

      if (isTiff) {
        setDwgParseStatus('이미지 처리 중...');
        const { imageDataUrl, bbox } = await parseTiffToOverlay(arrayBuffer);
        sendOverlayToMap({ type: 'renderTiffOverlay', imageDataUrl, bbox });
      } else if (isDxf) {
        setDwgParseStatus('DXF 파싱 중...');
        const drawing = await parseDxfToDrawing(arrayBuffer);
        sendOverlayToMap({ type: 'renderDrawing', ...drawing });
      } else {
        setDwgParseStatus('도면 파싱 중... (최초 1회는 변환 엔진 로드 때문에 다소 걸릴 수 있습니다)');
        const drawing = await parseDwgToDrawing(arrayBuffer);
        sendOverlayToMap({ type: 'renderDrawing', ...drawing });
      }
      setDwgParseStatus('');
    } catch (err) {
      setDwgParseStatus('');
      alert(`도면 처리 실패!\n${err.message}`);
    }
  };

  // ==========================================
  // 🎥 4. 카메라 녹화 (MediaRecorder)
  // ==========================================
  const handleStartRecording = () => {
    if (!cameraStreamRef.current) return alert('카메라가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
    if (!window.MediaRecorder) return alert('이 브라우저는 영상 녹화를 지원하지 않습니다.');

    recordedChunksRef.current = [];
    setVideoBlob(null);
    videoStartTimeRef.current = new Date();
    videoEndTimeRef.current = null;

    // 촬영 중 이동 경로를 지도 위에 표시 (kakao-map.html의 위치추적 시작)
    mapIframeRef.current?.contentWindow?.startTracking?.();
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
    mapIframeRef.current?.contentWindow?.finishTracking?.();
    isRecordingRef.current = false;
    setIsRecording(false);
    videoEndTimeRef.current = new Date();
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

      const ts = new Date().getTime();
      const ext = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const fileName = `현장영상_${ts}.${ext}`;
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
      if (!itemRes.ok) throw new Error("생성 실패");
      const videoItemUrn = (await itemRes.json()).data.id;

      // ------------------------------------------
      // 🎥 동영상과 같이 "공사 현황 동영상 기록" PDF 생성 + 업로드
      // ------------------------------------------
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      const fmtTime = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
      const start = videoStartTimeRef.current;
      const end = videoEndTimeRef.current;
      const dateStr = start ? `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일 (${days[start.getDay()]})` : '';
      const timeStr = start && end ? `${fmtTime(start)} ~ ${fmtTime(end)}` : '';
      const author = userProfile ? ((userProfile.family_name || userProfile.given_name)
        ? `${userProfile.family_name || ''}${userProfile.given_name || ''}`
        : (userProfile.name || '')) : '';
      const snapshotUrl = await requestMapSnapshot();
      // ACC Docs 상세보기 딥링크 (커뮤니티에 통용되는 형식 기반 best-effort — 실제로 눌러서 확인 필요)
      const videoLinkUrl = `https://acc.autodesk.com/docs/files/projects/${project.id.replace(/^b\./, '')}/folders/${encodeURIComponent(videoFolder.id)}/detail/viewer/items/${encodeURIComponent(videoItemUrn)}`;

      flushSync(() => setVideoLogPdfData({ dateStr, timeStr, author, snapshotUrl }));
      const pageEl = document.getElementById('video-log-pdf-page');
      const pageCanvas = await html2canvas(pageEl, { scale: 2, useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pdfW, pdfH);

      const pageRect = pageEl.getBoundingClientRect();
      const iconRect = document.getElementById('video-link-icon').getBoundingClientRect();
      pdf.link(
        (iconRect.left - pageRect.left) / pageRect.width * pdfW,
        (iconRect.top - pageRect.top) / pageRect.height * pdfH,
        iconRect.width / pageRect.width * pdfW,
        iconRect.height / pageRect.height * pdfH,
        { url: videoLinkUrl }
      );
      setVideoLogPdfData(null);

      const pdfFileName = `현장영상_${ts}.pdf`;
      const pdfStorageRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/storage`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({ jsonapi: { version: "1.0" }, data: { type: "objects", attributes: { name: pdfFileName }, relationships: { target: { data: { type: "folders", id: videoFolder.id } } } } })
      });
      const pdfObjectId = (await pdfStorageRes.json()).data.id;
      const pdfS3UrlRes = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${pdfObjectId.split('/')[0].split(':')[3]}/objects/${pdfObjectId.split('/')[1]}/signeds3upload`, { headers: authHeader });
      const pdfS3UrlData = await pdfS3UrlRes.json();

      await fetch(pdfS3UrlData.urls[0], { method: 'PUT', body: pdf.output('blob') });
      await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${pdfObjectId.split('/')[0].split(':')[3]}/objects/${pdfObjectId.split('/')[1]}/signeds3upload`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadKey: pdfS3UrlData.uploadKey })
      });
      await fetch(`https://developer.api.autodesk.com/data/v1/projects/${project.id}/items`, {
        method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({
          jsonapi: { version: "1.0" },
          data: { type: "items", attributes: { displayName: pdfFileName, extension: { type: "items:autodesk.bim360:File", version: "1.0" } }, relationships: { tip: { data: { type: "versions", id: "1" } }, parent: { data: { type: "folders", id: videoFolder.id } } } },
          included: [{ type: "versions", id: "1", attributes: { name: pdfFileName, extension: { type: "versions:autodesk.bim360:File", version: "1.0" } }, relationships: { storage: { data: { type: "objects", id: pdfObjectId } } } }]
        })
      });

      alert("🎉 현장 영상과 기록 PDF가 업로드되었습니다!");
      setVideoBlob(null);
    } catch (error) { alert(`업로드 중 문제가 발생했습니다.\n${error.message}`); } finally { setIsUploadingVideo(false); setVideoLogPdfData(null); }
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
            <div>
              {/* 1. ACC floor_plan 폴더의 DWG를 즉석에서 선택 */}
              <div
                style={{ ...styles.inputWithIcon, cursor: 'pointer', padding: '12px', justifyContent: 'space-between', marginBottom: '10px' }}
                onClick={loadDwgList}
              >
                <span style={{ fontSize: '15px', color: selectedDwgName ? '#2C3E50' : '#000000', fontWeight: selectedDwgName ? 'bold' : 'normal' }}>
                  {selectedDwgName || 'ACC에서 도면(DWG/DXF/TIFF) 선택...'}
                </span>
                <FaFileAlt color="#3498DB" size={20} />
              </div>

              {/* 1-1. 이 프로젝트에 미리 등록된 도면이 여러 개면 선택 */}
              {projectDrawings.length > 1 && (
                <div style={{ ...styles.inputWithIcon, padding: '12px', gap: '8px', marginBottom: '10px' }}>
                  <select
                    value={selectedDrawingIndex}
                    onChange={(e) => setSelectedDrawingIndex(Number(e.target.value))}
                    style={{ flex: 1, border: 'none', fontSize: '15px', background: 'transparent' }}
                  >
                    {projectDrawings.map((d, i) => (
                      <option key={d.file} value={i}>{d.name}</option>
                    ))}
                  </select>
                  <FaFileAlt color="#3498DB" size={20} />
                </div>
              )}

              {/* 2. 도면 오버레이 지도 (기존 높이의 2/3) */}
              <div style={{ position: 'relative', width: '100%', height: '233px', backgroundColor: '#ecf0f1', borderRadius: '5px', overflow: 'hidden', marginBottom: '15px', border: '1px solid #D5D8DC' }}>

                <iframe
                  ref={mapIframeRef}
                  title="현장 도면 GPS 지도"
                  src={`/kakao-map.html?key=${encodeURIComponent(KAKAO_JS_KEY)}`}
                  allow="geolocation"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />

                {dwgParseStatus && (
                   <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '10px', boxSizing: 'border-box', textAlign: 'center', color: '#fff', backgroundColor: 'rgba(44, 62, 80, 0.85)', fontSize: '13px', whiteSpace: 'pre-wrap', zIndex: 1000 }}>
                     {dwgParseStatus}
                   </div>
                )}

                {mapError && (
                   <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', padding: '10px', boxSizing: 'border-box', textAlign: 'center', color: '#fff', backgroundColor: 'rgba(192, 57, 43, 0.9)', fontSize: '12px', whiteSpace: 'pre-wrap', zIndex: 1000 }}>
                     ⚠️ {mapError}
                   </div>
                )}
              </div>

              {/* 3. 실시간 카메라 뷰 (지도와 같은 폭, 그에 준해 높이도 키움) */}
              <div style={{ width: '100%', height: '233px', backgroundColor: '#000', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', marginBottom: '15px' }}>
                 <video ref={videoPreviewRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} autoPlay muted playsInline />
              </div>

              {/* 4. 촬영/업로드 버튼 (한 줄, 동일 크기) */}
              <div style={styles.buttonRow}>
                {!isRecording ? (
                  <button type="button" style={{ ...styles.btnCamera, backgroundColor: '#E74C3C', height: '55px', fontSize: '16px' }} onClick={handleStartRecording}>
                    <FaVideo style={{ marginRight: '5px' }} /> 영상 촬영 시작
                  </button>
                ) : (
                  <button type="button" style={{ ...styles.btnCamera, backgroundColor: '#34495E', height: '55px', fontSize: '16px' }} onClick={handleStopRecording}>
                    <FaStop style={{ marginRight: '5px' }} /> 촬영 종료
                  </button>
                )}
                <button
                  type="button"
                  style={{ ...styles.btnUpload, width: 'auto', flex: 1, backgroundColor: (videoBlob && !isUploadingVideo) ? '#E67E22' : '#BDC3C7' }}
                  disabled={!videoBlob || isUploadingVideo}
                  onClick={handleUploadVideoToACC}
                >
                  <FaCloudUploadAlt style={{ marginRight: '8px', fontSize: '18px' }} /> {isUploadingVideo ? '업로드 중...' : 'ACC 업로드'}
                </button>
              </div>
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
      {/* 🎥 도면(DWG) 목록 모달 (영상기록용) */}
      {/* ============================================== */}
      {showDwgModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>현장 도면(DWG/DXF/TIFF) 목록</h3>
              <button onClick={() => setShowDwgModal(false)} style={styles.closeBtn}><FaTimes /></button>
            </div>
            <div style={styles.modalBody}>
              {loadingDwgList ? ( <div style={{ textAlign: 'center', padding: '20px', color: '#7f8c8d' }}>도면 폴더 스캔 중...</div> ) : dwgList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#e74c3c' }}>해당 폴더에 DWG/DXF/TIFF 도면 파일이 없습니다.</div>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: '10px' }}>
                  {dwgList.map(item => (
                    <li key={item.id} style={styles.planItem} onClick={() => selectDwg(item)}>
                      <FaFileAlt style={{ marginRight: '10px', color: '#3498DB', fontSize: '18px' }}/>
                      <span style={{ fontSize: '14px', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.attributes.displayName}</span>
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

        {/* 🎥 영상기록 ACC 업로드 시 같이 만드는 "공사 현황 동영상 기록" PDF (캡처 직전에만 데이터를 채움) */}
        <div id="video-log-pdf-page" style={pdfStyles.page}>
          <h1 style={pdfStyles.title}>공사 현황 동영상 기록</h1>
          <table style={pdfStyles.mainTable}>
            <colgroup><col style={{ width: '15%' }} /><col style={{ width: '35%' }} /><col style={{ width: '15%' }} /><col style={{ width: '35%' }} /></colgroup>
            <tbody>
              <tr>
                <th style={pdfStyles.th}>날 짜</th><td style={pdfStyles.td}>{videoLogPdfData?.dateStr || ''}</td>
                <th style={pdfStyles.th}>시 간</th><td style={pdfStyles.td}>{videoLogPdfData?.timeStr || ''}</td>
              </tr>
              <tr>
                <th style={pdfStyles.th}>위 치</th><td style={pdfStyles.td}></td>
                <th style={pdfStyles.th}>작성자</th><td style={pdfStyles.td}>{videoLogPdfData?.author || ''}</td>
              </tr>
              <tr>
                <th style={pdfStyles.th}>내 용</th><td colSpan="3" style={pdfStyles.td}></td>
              </tr>
            </tbody>
          </table>
          <div style={pdfStyles.routeBox}>
            {videoLogPdfData?.snapshotUrl
              ? <img src={videoLogPdfData.snapshotUrl} style={pdfStyles.image} alt="이동 경로" />
              : <span style={{ color: '#999', fontSize: '14px' }}>경로 데이터 없음</span>}
          </div>
          <div style={pdfStyles.linkRow}>
            <span>동영상 링크</span>
            <span id="video-link-icon" style={{ display: 'inline-flex', width: '22px', height: '22px', backgroundColor: '#000', color: '#fff', borderRadius: '4px', alignItems: 'center', justifyContent: 'center' }}>
              <FaVideo size={13} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}