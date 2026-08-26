export const styles = {
  appWrapper: { display: 'flex', justifyContent: 'center', backgroundColor: '#f0f2f5', minHeight: '100vh', fontFamily: 'sans-serif' },
  container: { width: '100%', maxWidth: '400px', backgroundColor: '#fff', padding: '20px', boxSizing: 'border-box', boxShadow: '0 0 10px rgba(0,0,0,0.1)' },
  loginContainer: { width: '100%', maxWidth: '400px', backgroundColor: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px', boxSizing: 'border-box', boxShadow: '0 0 10px rgba(0,0,0,0.1)' },
  accLoginButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '15px', backgroundColor: '#0696D7', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' },
  
  // 💡 메인 타이틀 투톤 디자인
  headerTitle: { fontSize: '28px', fontWeight: '900', textAlign: 'center', margin: '20px 0 25px 0', letterSpacing: '-0.5px' },
  titleSite: { color: '#2C3E50' },
  titleLog: { color: '#E67E22' },

  menuContainer: { display: 'flex', justifyContent: 'space-between', marginBottom: '15px' },
  menuItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' },
  iconCircle: { width: '50px', height: '50px', borderRadius: '25px', backgroundColor: '#F2F3F4', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '8px', color: '#555' },
  menuText: { fontSize: '13px', color: '#555', fontWeight: '600' },
  divider: { border: 'none', borderTop: '2px solid #1A5276', margin: '0 0 15px 0' },
  formContainer: { backgroundColor: 'white', borderRadius: '10px' },
  projectHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '5px', backgroundColor: '#f8f9fa', borderRadius: '5px' },
  projectSelect: { flex: 1, fontSize: '15px', fontWeight: 'bold', color: '#333', border: 'none', outline: 'none', backgroundColor: 'transparent', cursor: 'pointer', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' },
  
  card: { border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px', backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  cardTitle: { fontSize: '14px', fontWeight: 'bold', color: '#7f8c8d' },
  btnDelete: { background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: '16px' },

  input: { width: '100%', padding: '12px', marginBottom: '10px', border: '1px solid #D5D8DC', borderRadius: '5px', boxSizing: 'border-box', outline: 'none', backgroundColor: '#ffffff', color: '#000000', WebkitAppearance: 'none', colorScheme: 'light', fontSize: '15px', fontFamily: 'inherit' },
  inputWithIcon: { display: 'flex', alignItems: 'center', border: '1px solid #D5D8DC', borderRadius: '5px', padding: '0 10px', marginBottom: '10px', backgroundColor: '#ffffff' },
  flexInput: { flex: 1, padding: '12px 0', border: 'none', outline: 'none', backgroundColor: 'transparent', color: '#000000', WebkitAppearance: 'none', colorScheme: 'light', fontSize: '15px', fontFamily: 'inherit' },
  
  buttonRow: { display: 'flex', gap: '10px', marginBottom: '10px' },
  btnCamera: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 0', border: 'none', borderRadius: '5px', color: 'white', backgroundColor: '#F5B041', fontWeight: 'bold', cursor: 'pointer' },
  btnGallery: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '12px 0', border: 'none', borderRadius: '5px', color: 'white', backgroundColor: '#3498DB', fontWeight: 'bold', cursor: 'pointer' },
  imagePlaceholder: { height: '160px', border: '1px solid #D5D8DC', borderRadius: '5px', backgroundColor: '#F8F9F9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  
  // 💡 [수정] fontSize: '16px'를 두 버튼 모두에 명시적으로 추가하여 글자 크기를 똑같이 맞춤
  btnAddBoard: { 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    width: '100%', 
    height: '55px', 
    backgroundColor: '#fafafa', 
    border: '2px dashed #ccc', 
    borderRadius: '5px', 
    color: '#777', 
    fontWeight: 'bold',
    fontSize: '16px',          // 👈 추가된 부분
    cursor: 'pointer', 
    marginBottom: '10px', 
    boxSizing: 'border-box'
  },
  
  btnUpload: { 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center',
    width: '100%', 
    height: '55px', 
    border: 'none', 
    borderRadius: '5px', 
    color: 'white', 
    fontWeight: 'bold',
    fontSize: '16px',          // 👈 추가된 부분
    cursor: 'pointer', 
    boxSizing: 'border-box'
  },

  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  modalContent: { width: '90%', maxWidth: '450px', backgroundColor: '#fff', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '85vh', boxShadow: '0 5px 15px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '15px' },
  closeBtn: { background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' },
  modalBody: { overflowY: 'auto' },
  planItem: { padding: '15px 10px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'background-color 0.2s', backgroundColor: '#fafafa', borderRadius: '5px', marginBottom: '5px' }
};

export const pdfStyles = {
  page: { width: '210mm', height: '297mm', padding: '15mm 20mm', backgroundColor: '#fff', boxSizing: 'border-box', fontFamily: 'sans-serif' },
  title: { textAlign: 'center', fontSize: '28px', fontWeight: 'bold', margin: '0 0 15px 0', color: '#000', letterSpacing: '5px', height: '10mm', lineHeight: '10mm' },
  mainTable: { width: '100%', borderCollapse: 'collapse', color: '#000', fontSize: '14px', tableLayout: 'fixed', boxSizing: 'border-box' },
  imageTd: { border: '1px solid #000', height: '90mm', padding: '5px', backgroundColor: '#fff', textAlign: 'center', verticalAlign: 'middle' },
  image: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  th: { border: '1px solid #000', padding: '8px 5px', backgroundColor: '#fff', textAlign: 'center', fontWeight: 'bold', height: '10mm', whiteSpace: 'nowrap' },
  td: { border: '1px solid #000', padding: '8px 10px', backgroundColor: '#fff', height: '10mm' },
  routeBox: { border: '1px solid #000', borderTop: 'none', height: '150mm', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', overflow: 'hidden' },
  linkRow: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '14px', color: '#000' }
};