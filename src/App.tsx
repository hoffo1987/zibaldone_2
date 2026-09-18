import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  confirmPasswordReset
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where
} from "firebase/firestore";
import {
  PenTool,
  BookOpen,
  Bookmark,
  Send,
  Loader2,
  Feather,
  Star,
  X,
  ChevronDown,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  ListChecks,
  CheckCircle2,
  Circle,
  Bold,
  Italic,
  Underline,
  Image as ImageIcon,
  LogOut,
  Pencil
} from "lucide-react";

const firebaseConfig = {
  apiKey: "AIzaSyAq02XXQkepvHsgHEN4zTZni8pp20r1jUU",
  authDomain: "zibaldone-1-prova.firebaseapp.com",
  projectId: "zibaldone-1-prova",
  storageBucket: "zibaldone-1-prova.firebasestorage.app",
  messagingSenderId: "578635223914",
  appId: "1:578635223914:web:74e1adc0de09af1a03cb13",
  measurementId: "G-S3KW241D85",
};

const isConfigured = !firebaseConfig.apiKey.includes("INCOLLA");

let app, auth, db;
try {
  if (isConfigured) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase init error", e);
}

const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = (error) => reject(error);
    };
  });
};

const FountainPenNib = () => (
  <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: "drop-shadow(10px 15px 8px rgba(0,0,0,0.4))" }}>
    <defs>
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#C59B27" />
        <stop offset="30%" stopColor="#F9E596" />
        <stop offset="70%" stopColor="#C59B27" />
        <stop offset="100%" stopColor="#8A6614" />
      </linearGradient>
    </defs>
    <path d="M 37 52 L 63 52 L 66 15 L 34 15 Z" fill="#111" />
    <path d="M 42 52 L 45 15" stroke="rgba(255,255,255,0.15)" strokeWidth="3" fill="none" />
    <path d="M 58 52 L 60 15" stroke="rgba(0,0,0,0.5)" strokeWidth="4" fill="none" />
    <path d="M 42 75 L 58 75 L 63 52 L 37 52 Z" fill="#1A1A1A" />
    <path d="M 45 75 L 48 52" stroke="rgba(255,255,255,0.08)" strokeWidth="2" fill="none" />
    <rect x="37" y="52" width="26" height="3" fill="url(#goldGrad)" />
    <rect x="34" y="10" width="32" height="5" fill="url(#goldGrad)" />
    <path d="M 34 10 L 66 10 C 66 -4, 34 -4, 34 10 Z" fill="#0A0A0A" />
    <path d="M 65 12 C 73 12, 76 14, 73 18 L 69 45 C 68 48, 65 48, 65 45 L 68 20 C 69 17, 66 15, 65 14 Z" fill="url(#goldGrad)" />
    <path d="M 50 92 C 47 84, 42 79, 42 75 L 58 75 C 58 79, 53 84, 50 92 Z" fill="url(#goldGrad)" />
    <line x1="50" y1="92" x2="50" y2="78" stroke="#111" strokeWidth="1.5" />
    <circle cx="50" cy="77" r="1.5" fill="#111" />
    <path d="M 50 92 C 49.5 89, 49 87, 49 85 L 51 85 C 51 87, 50.5 89, 50 92 Z" fill="#111" />
  </svg>
);

const dustParticles = Array.from({ length: 40 }).map((_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  width: `${Math.random() * 4 + 2}px`, 
  delay: `${Math.random() * 10}s`,
  duration: `${Math.random() * 15 + 15}s`, 
  opacity: Math.random() * 0.4 + 0.1, 
  xSway: `${Math.random() * 40 - 20}vw` 
}));

export default function ZibaldoneApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login');
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  const [resetCode, setResetCode] = useState(null);
  const [isResetScreen, setIsResetScreen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const [thoughts, setThoughts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("write"); 
  const [sortBy, setSortBy] = useState("newest");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedThought, setSelectedThought] = useState(null);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false });
  const [activeImg, setActiveImg] = useState(null);
  const editorRef = useRef(null);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawColor, setDrawColor] = useState('#1A1510');
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState(null);
  const [editorHeight, setEditorHeight] = useState(600); // Altezza dinamica foglio disegno

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [thoughtToDelete, setThoughtToDelete] = useState(null);
  const [deletingIds, setDeletingIds] = useState([]);
  
  const [sendState, setSendState] = useState('idle');
  const [isNextEnvelope, setIsNextEnvelope] = useState(true); 
  const [animationConfig, setAnimationConfig] = useState({ lines: 1, duration: 2.0 });

  useEffect(() => {
    if (selectedThought || showAdminModal || thoughtToDelete || showMultiDeleteModal || sendState !== 'idle') {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [selectedThought, showAdminModal, thoughtToDelete, showMultiDeleteModal, sendState]);

  useEffect(() => {
    if (!isConfigured) { setAuthLoading(false); return; }
    
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const code = urlParams.get('oobCode');

    if (mode === 'resetPassword' && code) {
      setResetCode(code);
      setIsResetScreen(true);
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [isResetScreen]);

  useEffect(() => {
    if (!user || !db || !isConfigured) return;
    let q;
    if (isAdmin && activeTab === "read") {
      q = collection(db, "pensieri");
    } else if (isAdmin && activeTab === "favorites") {
      q = query(collection(db, "pensieri"), where("isStarred", "==", true));
    } else if (activeTab === "my_pages") {
      q = query(collection(db, "pensieri"), where("userId", "==", user.uid));
    } else {
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedThoughts = [];
      snapshot.forEach((doc) => { fetchedThoughts.push({ id: doc.id, ...doc.data() }); });
      setThoughts(fetchedThoughts);
      setLoading(false);
    }, (error) => { setLoading(false); });

    return () => unsubscribe();
  }, [user, isAdmin, activeTab]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, authEmail);
        setAuthSuccess("Una staffetta è partita. Controlla la tua posta per forgiare una nuova chiave.");
        setAuthLoading(false);
        return;
      }

      if (authMode === 'register') {
        const userCred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        await updateProfile(userCred.user, { displayName: authName.trim() || "Studente" });
      } else {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setAuthLoading(false);
    } catch (err) {
      setAuthLoading(false);
      if (err.code === 'auth/email-already-in-use') setAuthError("Questa email è già registrata.");
      else if (err.code === 'auth/invalid-credential') setAuthError("Credenziali errate o non esistenti.");
      else if (err.code === 'auth/weak-password') setAuthError("La password deve essere di almeno 6 caratteri.");
      else if (err.code === 'auth/invalid-email') setAuthError("Il formato dell'email non è valido.");
      else if (err.code === 'auth/user-not-found' || err.code === 'auth/missing-email') setAuthError("Non troviamo nessun archivio con questa email.");
      else setAuthError(`Errore tecnico: ${err.message}`);
    }
  };

  const handleNewPasswordSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      if(resetCode) {
         await confirmPasswordReset(auth, resetCode, newPassword);
         setAuthSuccess("La tua nuova chiave è stata forgiata con successo.");
      }
      setAuthLoading(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
         setIsResetScreen(false);
         setAuthMode('login');
         setAuthSuccess("");
      }, 3500);
    } catch (err) {
      setAuthLoading(false);
      setAuthError("Il link è scaduto o non valido. Richiedi una nuova staffetta.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAdmin(false);
      setActiveTab("write");
    } catch (err) { console.error(err); }
  };

  const formatText = (command, value = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      setNewContent(editorRef.current.innerHTML);
      updateFormattingState();
    }
  };

  const updateFormattingState = () => {
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMessage({ type: "error", text: "Immagine troppo grande. Massimo 10MB." }); return; }
    try {
      const compressedBase64 = await compressImage(file);
      if (editorRef.current) {
        editorRef.current.focus();
        document.execCommand('insertImage', false, compressedBase64);
        
        const imgs = editorRef.current.querySelectorAll('img');
        imgs.forEach(img => {
          if(!img.style.width) {
            img.style.width = '50%'; 
            img.style.display = 'block';
            img.style.margin = '15px auto';
            img.style.transition = 'all 0.3s ease';
          }
        });
        setNewContent(editorRef.current.innerHTML);
      }
    } catch (error) { setMessage({ type: "error", text: "Errore durante il caricamento dell'immagine." }); }
  };

  const handleEditorClick = (e) => {
    if (activeImg) {
      activeImg.classList.remove('ring-4', 'ring-[#D4AF37]', 'ring-offset-2', 'ring-offset-[#FDFBF7]');
    }
    if (e.target.tagName === 'IMG') {
      e.target.classList.add('ring-4', 'ring-[#D4AF37]', 'ring-offset-2', 'ring-offset-[#FDFBF7]');
      setActiveImg(e.target);
    } else {
      setActiveImg(null);
    }
  };

  const handleImageAction = (action) => {
    if (!activeImg) return;
    let currentWidth = parseInt(activeImg.style.width || '100');

    switch(action) {
      case 'shrink': 
        currentWidth = Math.max(20, currentWidth - 10); 
        activeImg.style.width = `${currentWidth}%`; 
        break;
      case 'grow': 
        currentWidth = Math.min(100, currentWidth + 10); 
        activeImg.style.width = `${currentWidth}%`; 
        break;
      case 'left': 
        activeImg.style.float = 'left'; 
        activeImg.style.display = 'inline'; 
        activeImg.style.margin = '5px 25px 5px 0';
        if(currentWidth > 60) { activeImg.style.width = '40%'; }
        
        {
          const parentBlock = activeImg.parentNode;
          if (parentBlock && parentBlock.firstChild !== activeImg) {
              parentBlock.insertBefore(activeImg, parentBlock.firstChild);
          }
          if (parentBlock && (!activeImg.nextSibling || activeImg.nextSibling.nodeName === 'BR')) {
              parentBlock.insertBefore(document.createTextNode('\u00A0'), activeImg.nextSibling);
          }
        }
        break;
      case 'center': 
        activeImg.style.float = 'none'; 
        activeImg.style.display = 'block'; 
        activeImg.style.margin = '15px auto'; 
        break;
      case 'right': 
        activeImg.style.float = 'right'; 
        activeImg.style.display = 'inline'; 
        activeImg.style.margin = '5px 0 5px 25px';
        if(currentWidth > 60) { activeImg.style.width = '40%'; }
        
        {
          const parentBlock = activeImg.parentNode;
          if (parentBlock && parentBlock.firstChild !== activeImg) {
              parentBlock.insertBefore(activeImg, parentBlock.firstChild);
          }
          if (parentBlock) {
              parentBlock.insertBefore(document.createTextNode('\u00A0'), activeImg);
          }
        }
        break;
      case 'delete': 
        activeImg.remove(); 
        setActiveImg(null); 
        break;
      default: break;
    }
    if (editorRef.current) setNewContent(editorRef.current.innerHTML);
  };

  const getCoordinates = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX; clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    if (!isDrawingMode) return;
    e.preventDefault(); 
    if (e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    const { x, y } = getCoordinates(e);
    setCurrentStroke({ color: drawColor, points: [{ x, y }] });
  };

  const handlePointerMove = (e) => {
    if (!currentStroke || !isDrawingMode) return;
    e.preventDefault();
    const { x, y } = getCoordinates(e);
    setCurrentStroke((prev) => ({ ...prev, points: [...prev.points, { x, y }] }));

    // ESPANSIONE INTELLIGENTE TELA (FOGLIO INFINITO)
    if (y > editorHeight - 150) {
      setEditorHeight((prev) => prev + 300);
    }
  };

  const handlePointerUp = (e) => {
    if (!isDrawingMode) return;
    if (e.currentTarget.releasePointerCapture) {
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (currentStroke) {
      setStrokes((prev) => [...prev, currentStroke]);
      setCurrentStroke(null);
    }
  };

  const handleAdminLogin = (e) => { 
    e.preventDefault(); 
    if (adminPassword.toLowerCase() === "infinito") { setIsAdmin(true); setActiveTab("read"); setShowAdminModal(false); setAdminPassword(""); } 
    else { setAdminError(true); } 
  };
  
  const handleAdminLock = () => {
    setIsAdmin(false); 
    setActiveTab("write"); 
    setIsSelectionMode(false); 
    setSelectedIds([]);
  };

  const toggleSelectionMode = () => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); };

  const handleCardClick = (thought) => {
    if (isSelectionMode) { setSelectedIds(prev => prev.includes(thought.id) ? prev.filter(id => id !== thought.id) : [...prev, thought.id]); } 
    else { setSelectedThought(thought); }
  };

  const calculateAnimation = (htmlText) => {
    const plainText = htmlText.replace(/<[^>]*>?/gm, ''); 
    const charsPerLine = 35; 
    const totalLines = Math.max(1, Math.ceil(plainText.length / charsPerLine));
    const cappedLines = Math.min(totalLines, 6); 
    const duration = cappedLines * 1.5; 
    return { lines: cappedLines, duration };
  };

  const generateDynamicKeyframes = (lines, duration) => {
    let penKeyframes = "";
    let maskKeyframes = "";
    const lineHeight = 24; 
    const lineWidth = 230; 
    const step = 100 / lines; 

    for (let i = 0; i < lines; i++) {
      const startP = i * step;
      const endP = (i + 1) * step;
      const yTop = i * lineHeight;
      const yBot = (i + 1) * lineHeight;

      maskKeyframes += `
        ${startP}% { clip-path: polygon(0px 0px, 230px 0px, 230px ${yTop}px, 0px ${yTop}px, 0px ${yBot}px, 0px ${yBot}px); }
        ${endP - 0.01}% { clip-path: polygon(0px 0px, 230px 0px, 230px ${yTop}px, 230px ${yTop}px, 230px ${yBot}px, 0px ${yBot}px); }
      `;

      const writeY = yTop + 16;
      penKeyframes += `
        ${startP}% { transform: translate(0px, ${writeY}px); }
        ${startP + (step * 0.2)}% { transform: translate(${lineWidth * 0.2}px, ${writeY - 2}px); }
        ${startP + (step * 0.4)}% { transform: translate(${lineWidth * 0.4}px, ${writeY + 2}px); }
        ${startP + (step * 0.6)}% { transform: translate(${lineWidth * 0.6}px, ${writeY - 1}px); }
        ${startP + (step * 0.8)}% { transform: translate(${lineWidth * 0.8}px, ${writeY + 1}px); }
        ${endP - 0.01}% { transform: translate(${lineWidth}px, ${writeY}px); }
      `;
    }

    const totalPenTime = duration + 1.0;
    const fadeInP = (0.5 / totalPenTime) * 100;
    const fadeOutP = ((totalPenTime - 0.5) / totalPenTime) * 100;

    const totalTime = 4.5 + duration;
    const riseEnd = (1.5 / totalTime) * 100;
    const fallStart = ((totalTime - 1.5) / totalTime) * 100;

    return `
      @keyframes dynamicTextReveal {
        ${maskKeyframes}
        100% { clip-path: polygon(0px 0px, 230px 0px, 230px 100%, 0px 100%, 0px 100%, 0px 100%); }
      }
      @keyframes dynamicPenWrite {
        ${penKeyframes}
        100% { transform: translate(${lineWidth}px, ${(lines - 1) * lineHeight + 16}px); }
      }
      @keyframes penFadeInOut {
        0% { opacity: 0; transform: translateY(-30px) scale(1.1); }
        ${fadeInP}% { opacity: 1; transform: translateY(0) scale(1); }
        ${fadeOutP}% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-30px) scale(1.1); }
      }
      @keyframes dynamicDiaryRiseFall {
        0% { transform: translateY(100vh) rotate(-5deg) scale(0.8); opacity: 0; }
        ${riseEnd}% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
        ${fallStart}% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
        100% { transform: translateY(100vh) rotate(5deg) scale(0.8); opacity: 0; }
      }
      @keyframes dynamicDiaryCoverFlip {
        0%, ${riseEnd}% { transform: rotateY(0deg); }
        ${(1.8 / totalTime) * 100}%, ${(totalTime - 1.8) / totalTime * 100}% { transform: rotateY(-175deg); }
        ${fallStart}%, 100% { transform: rotateY(0deg); }
      }
    `;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || (!newContent.trim() && strokes.length === 0)) return;
    setIsSubmitting(true);

    const config = calculateAnimation(newContent);
    setAnimationConfig(config);

    try {
      const thoughtsRef = collection(db, "pensieri");
      await addDoc(thoughtsRef, {
        title: newTitle.trim() || "Senza Titolo",
        author: user.displayName || "Studente",
        content: newContent.trim(),
        strokes: strokes,
        timestamp: Date.now(),
        userId: user.uid,
        isStarred: false,
      });

      setIsSubmitting(false);
      
      const nextAnim = isNextEnvelope ? 'animating_envelope' : 'animating_diary';
      setSendState(nextAnim);
      setIsNextEnvelope(!isNextEnvelope);

      const timeoutDur = nextAnim === 'animating_diary' ? ((4.5 + config.duration) * 1000) : 6000;

      setTimeout(() => {
        setSendState('thankyou');
      }, timeoutDur);

    } catch (error) { setIsSubmitting(false); setMessage({ type: "error", text: "Impossibile salvare il pensiero. Riprova." }); }
  };

  const resetWritingForm = () => { 
    setSendState('idle'); 
    setNewTitle(""); 
    setNewContent(""); 
    setStrokes([]);
    setIsDrawingMode(false);
    setActiveImg(null);
    setEditorHeight(600); // Reset della tela estesa
    setActiveFormats({ bold: false, italic: false, underline: false });
    if(editorRef.current) editorRef.current.innerHTML = "";
  };
  
  const toggleStar = async (thoughtId, currentStatus) => { if (user && db && isAdmin) await updateDoc(doc(db, "pensieri", thoughtId), { isStarred: !currentStatus }); };
  
  const confirmSingleDelete = async () => {
    if (!user || !db || !isAdmin || !thoughtToDelete) return;
    const id = thoughtToDelete.id;
    
    if (selectedThought?.id === id) setSelectedThought(null); 
    setThoughtToDelete(null); 
    setDeletingIds([id]); 

    setTimeout(async () => { 
      await deleteDoc(doc(db, "pensieri", id)); 
      setDeletingIds(prev => prev.filter(dId => dId !== id)); 
    }, 1100);
  };

  const confirmMultiDelete = async () => {
    if (!user || !db || !isAdmin || selectedIds.length === 0) return;
    setShowMultiDeleteModal(false); setDeletingIds(selectedIds); 
    setTimeout(async () => {
      const batch = writeBatch(db);
      selectedIds.forEach((id) => { batch.delete(doc(db, "pensieri", id)); });
      try { await batch.commit(); } catch (error) { console.error("Errore Batch:", error); }
      setDeletingIds([]); setSelectedIds([]); setIsSelectionMode(false); 
    }, 1100);
  };

  const formatDate = (timestamp) => { return new Date(timestamp).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

  const displayedThoughts = [...thoughts].filter(t => activeTab === "favorites" ? t.isStarred : true).sort((a, b) => {
      switch (sortBy) {
        case "oldest": return a.timestamp - b.timestamp;
        case "longest": return (b.content?.length || 0) - (a.content?.length || 0);
        case "shortest": return (a.content?.length || 0) - (b.content?.length || 0);
        case "newest": default: return b.timestamp - a.timestamp;
      }
  });

  // CALCOLO DINAMICO TELA IN LETTURA
  const calculateReadMaxY = () => {
    let max = 400; // Altezza minima standard
    if (selectedThought?.strokes) {
      selectedThought.strokes.forEach(stroke => {
        stroke.points.forEach(p => {
          if (p.y > max - 100) max = p.y + 100;
        });
      });
    }
    return max;
  };

  if (authLoading) {
    return ( <div className="min-h-screen bg-[#F4EFE6] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#8B6E4E]" /></div> );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#FDFBF7] via-[#F4EFE6] to-[#E8DAC2] text-[#2C241B] font-montserrat flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Montserrat:wght@300;400;500;600&display=swap');
          .font-cormorant { font-family: 'Cormorant Garamond', serif; }
          .font-montserrat { font-family: 'Montserrat', sans-serif; }
          .will-change-transform { will-change: transform, opacity; }
          @keyframes floatUpParticle {
            0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
            10% { opacity: var(--max-opacity); }
            50% { transform: translate3d(var(--x-sway), -50vh, 0) rotate(180deg); opacity: var(--max-opacity); }
            90% { opacity: var(--max-opacity); }
            100% { transform: translate3d(calc(var(--x-sway) * -0.5), -110vh, 0) rotate(360deg); opacity: 0; }
          }
          @keyframes orbDrift {
            0% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.3; }
            50% { transform: translate3d(5%, 5%, 0) scale(1.1); opacity: 0.6; }
            100% { transform: translate3d(-5%, 10%, 0) scale(0.9); opacity: 0.3; }
          }
        `}</style>
        
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
           <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/20 rounded-full blur-[100px] md:animate-[orbDrift_25s_ease-in-out_infinite_alternate] will-change-transform"></div>
           <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[#902A2A]/10 rounded-full blur-[120px] md:animate-[orbDrift_30s_ease-in-out_infinite_alternate-reverse] will-change-transform"></div>
           <div className="absolute top-[40%] left-[60%] w-[40vw] h-[40vw] bg-[#8B6E4E]/15 rounded-full blur-[100px] md:animate-[orbDrift_20s_ease-in-out_infinite_alternate] will-change-transform"></div>
        </div>

        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
           {dustParticles.map((p, index) => (
             <div key={p.id} className={`absolute bottom-[-5%] bg-[#D4AF37] rounded-full blur-[1px] will-change-transform ${index > 15 ? 'hidden md:block' : ''}`} style={{ left: p.left, width: p.width, height: p.width, '--max-opacity': p.opacity, '--x-sway': p.xSway, animation: `floatUpParticle ${p.duration} ease-in-out ${p.delay} infinite` }} />
           ))}
        </div>
        <div className="fixed inset-0 pointer-events-none opacity-[0.04] mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>
        
        <div className="max-w-md w-full bg-white/95 md:bg-white/70 backdrop-blur-none md:backdrop-blur-xl p-8 md:p-12 rounded-[2rem] shadow-[0_20px_50px_rgba(26,21,16,0.08)] border border-[#E8DAC2]/80 relative z-10 animate-in fade-in zoom-in-95 duration-700">
          {isResetScreen ? (
            <>
              <div className="flex flex-col items-center mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-[#E8DAC2]/50 to-[#D4C3A3]/20 rounded-full flex items-center justify-center mb-4 border border-[#D4AF37]/30 shadow-inner group hover:scale-105 transition-transform duration-500 cursor-default">
                   <KeyRound className="w-8 h-8 text-[#8B6E4E] drop-shadow-sm group-hover:-rotate-12 transition-transform duration-500" strokeWidth={1.5} />
                </div>
                <h1 className="text-4xl font-cormorant font-bold text-[#1A1510] tracking-tight text-center leading-tight">Forgia la <br/>Nuova Chiave</h1>
                <p className="text-sm text-[#8B6E4E] font-medium tracking-widest uppercase mt-4">Archivio Sicuro</p>
              </div>

              {authError && (<div className="mb-6 p-4 rounded-2xl bg-[#FDF2F2]/95 md:bg-[#FDF2F2]/80 backdrop-blur-none md:backdrop-blur-sm border border-[#902A2A]/20 text-[#902A2A] text-xs text-center font-medium shadow-sm animate-in slide-in-from-top-2">{authError}</div>)}
              {authSuccess && (<div className="mb-6 p-4 rounded-2xl bg-[#F4FDF4]/95 md:bg-[#F4FDF4]/80 backdrop-blur-none md:backdrop-blur-sm border border-[#2A9045]/20 text-[#2A9045] text-xs text-center font-medium shadow-sm animate-in slide-in-from-top-2 flex flex-col items-center gap-2"><CheckCircle2 className="w-5 h-5"/>{authSuccess}</div>)}

              {!authSuccess && (
                <form onSubmit={handleNewPasswordSubmit} className="space-y-5 animate-in fade-in">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 block">La Nuova Password</label>
                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Almeno 6 caratteri..." className="w-full bg-white md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-3.5 text-[#1A1510] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:bg-white focus:-translate-y-1 focus:shadow-[0_8px_20px_rgba(212,175,55,0.15)] transition-all duration-300 shadow-sm placeholder:text-[#CDB591]" required minLength={6} autoFocus />
                  </div>
                  <button type="submit" className="w-full bg-gradient-to-r from-[#1A1510] to-[#2C241B] text-[#FDFBF7] py-4 rounded-2xl font-semibold text-sm hover:shadow-[0_12px_25px_rgba(26,21,16,0.4)] hover:-translate-y-1 active:scale-95 active:shadow-md transition-all duration-300 mt-4 flex items-center justify-center gap-2 border border-[#3A3228]">
                    Sigilla Nuova Password
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col items-center mb-6">
                <div className="w-20 h-20 bg-gradient-to-br from-[#E8DAC2]/50 to-[#D4C3A3]/20 rounded-full flex items-center justify-center mb-4 border border-[#D4AF37]/30 shadow-inner group hover:scale-105 transition-transform duration-500 cursor-default">
                   <Feather className="w-8 h-8 text-[#8B6E4E] drop-shadow-sm group-hover:rotate-12 transition-transform duration-500" strokeWidth={1.5} />
                </div>
                <h1 className="text-4xl font-cormorant font-bold text-[#1A1510] tracking-tight">Lo Zibaldone</h1>
                <p className="text-sm text-[#8B6E4E] font-medium tracking-widest uppercase mt-2">Archivio della Classe</p>
              </div>

              {authMode !== 'reset' && (
                <div className="flex bg-[#F4EFE6] md:bg-[#F4EFE6]/80 p-1 rounded-2xl border border-[#E8DAC2]/60 mb-6 backdrop-blur-none md:backdrop-blur-sm relative z-10 w-full max-w-[280px] mx-auto shadow-inner animate-in fade-in">
                  <button type="button" onClick={() => { setAuthMode('login'); setAuthError(""); setAuthSuccess(""); }} className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-300 ${authMode === 'login' ? 'bg-white text-[#1A1510] shadow-[0_2px_10px_rgba(0,0,0,0.05)] scale-100' : 'text-[#8B6E4E] hover:text-[#1A1510] hover:bg-white/40 scale-95'}`}>Accedi</button>
                  <button type="button" onClick={() => { setAuthMode('register'); setAuthError(""); setAuthSuccess(""); }} className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all duration-300 ${authMode === 'register' ? 'bg-white text-[#1A1510] shadow-[0_2px_10px_rgba(0,0,0,0.05)] scale-100' : 'text-[#8B6E4E] hover:text-[#1A1510] hover:bg-white/40 scale-95'}`}>Nuova Firma</button>
                </div>
              )}

              {authError && (<div className="mb-6 p-4 rounded-2xl bg-[#FDF2F2]/95 md:bg-[#FDF2F2]/80 backdrop-blur-none md:backdrop-blur-sm border border-[#902A2A]/20 text-[#902A2A] text-xs text-center font-medium shadow-sm animate-in slide-in-from-top-2">{authError}</div>)}
              {authSuccess && (<div className="mb-6 p-4 rounded-2xl bg-[#F4FDF4]/95 md:bg-[#F4FDF4]/80 backdrop-blur-none md:backdrop-blur-sm border border-[#2A9045]/20 text-[#2A9045] text-xs text-center font-medium shadow-sm animate-in slide-in-from-top-2 flex flex-col items-center gap-2"><CheckCircle2 className="w-5 h-5"/>{authSuccess}</div>)}

              <form onSubmit={handleAuthSubmit} className="space-y-5 animate-in fade-in">
                {authMode === 'register' && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-2">
                    <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 flex items-center justify-between block">Pseudonimo <span className="text-[9px] font-normal lowercase opacity-70">Come firmerai le lettere</span></label>
                    <input type="text" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Giacomo Leopardi..." className="w-full bg-white md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-3.5 text-[#1A1510] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:bg-white focus:-translate-y-1 focus:shadow-[0_8px_20px_rgba(212,175,55,0.15)] transition-all duration-300 shadow-sm placeholder:text-[#CDB591]" required />
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 flex items-center justify-between block">Email <span className="text-[9px] font-normal lowercase opacity-70">{authMode === 'reset' ? 'A cui inviare la staffetta' : 'Privata, mai mostrata'}</span></label>
                  <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="mario.rossi@gmail.com" className="w-full bg-white md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-3.5 text-[#1A1510] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:bg-white focus:-translate-y-1 focus:shadow-[0_8px_20px_rgba(212,175,55,0.15)] transition-all duration-300 shadow-sm placeholder:text-[#CDB591]" required autoFocus={authMode === 'reset'} />
                </div>

                {authMode !== 'reset' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-end pr-2">
                      <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 block">La tua chiave</label>
                      {authMode === 'login' && (
                        <button type="button" onClick={() => { setAuthMode('reset'); setAuthError(""); setAuthSuccess(""); }} className="text-[10px] font-semibold text-[#D4AF37] hover:text-[#1A1510] transition-colors">Dimenticata?</button>
                      )}
                    </div>
                    <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" className="w-full bg-white md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-3.5 text-[#1A1510] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:bg-white focus:-translate-y-1 focus:shadow-[0_8px_20px_rgba(212,175,55,0.15)] transition-all duration-300 shadow-sm placeholder:text-[#CDB591]" required />
                  </div>
                )}
                
                <button type="submit" className="w-full bg-gradient-to-r from-[#1A1510] to-[#2C241B] text-[#FDFBF7] py-4 rounded-2xl font-semibold text-sm hover:shadow-[0_12px_25px_rgba(26,21,16,0.4)] hover:-translate-y-1 active:scale-95 active:shadow-md transition-all duration-300 mt-4 flex items-center justify-center gap-2 border border-[#3A3228]">
                  {authMode === 'login' ? "Sblocca l'Archivio" : authMode === 'register' ? "Registra la tua Firma" : "Invia staffetta di recupero"}
                </button>
              </form>

              {authMode === 'reset' && (
                <div className="mt-8 text-center border-t border-[#E8DAC2]/50 pt-6">
                  <button onClick={() => { setAuthMode('login'); setAuthError(""); setAuthSuccess(""); }} className="text-xs text-[#6B5A46] hover:text-[#1A1510] hover:-translate-y-0.5 font-medium transition-all duration-300">
                    Ricordi la chiave? Torna all'accesso
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF7] via-[#F4EFE6] to-[#E8DAC2] text-[#2C241B] font-montserrat selection:bg-[#D4AF37]/30 selection:text-[#1A1510] pb-24 relative overflow-x-hidden">
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,500&family=Montserrat:wght@300;400;500;600&display=swap');
        .font-cormorant { font-family: 'Cormorant Garamond', serif; }
        .font-montserrat { font-family: 'Montserrat', sans-serif; }
        
        .will-change-transform { will-change: transform, opacity; }

        @keyframes floatUpParticle { 
          0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; } 
          10% { opacity: var(--max-opacity); } 
          50% { transform: translate3d(var(--x-sway), -50vh, 0) rotate(180deg); opacity: var(--max-opacity); }
          90% { opacity: var(--max-opacity); } 
          100% { transform: translate3d(calc(var(--x-sway) * -0.5), -110vh, 0) rotate(360deg); opacity: 0; } 
        }

        @keyframes orbDrift {
          0% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.3; }
          50% { transform: translate3d(5%, 5%, 0) scale(1.1); opacity: 0.6; }
          100% { transform: translate3d(-5%, 10%, 0) scale(0.9); opacity: 0.3; }
        }
        
        @keyframes fadeInOverlay { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(10px); } }
        @keyframes paperFloat { from { opacity: 0; transform: translateY(40px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes textRevealUp { 0% { transform: translateY(40px); opacity: 0; filter: blur(8px); } 100% { transform: translateY(0); opacity: 1; filter: blur(0px); } }
        @keyframes bgCinematicBlur { 0% { opacity: 0; backdrop-filter: blur(0px); background-color: rgba(26, 21, 16, 0); } 100% { opacity: 1; backdrop-filter: blur(16px); background-color: rgba(15, 12, 10, 0.85); } }
        
        @keyframes turnToAsh { 0% { filter: brightness(1); transform: scale(1) translateY(0); } 30% { filter: brightness(0.6) sepia(1) hue-rotate(-20deg) saturate(3); background-color: #2C241B; border-color: #902A2A; transform: scale(0.95) translateY(-5px); } 70% { filter: brightness(0.1) blur(2px); background-color: #000; opacity: 1; transform: scale(0.8) translateY(-30px); } 100% { filter: brightness(0) blur(10px); opacity: 0; transform: scale(0.5) translateY(-80px); } }
        @keyframes fireRise { 0% { transform: translateY(80px) scale(0.5); opacity: 0; } 20% { transform: translateY(20px) scale(1.2); opacity: 1; } 70% { transform: translateY(-40px) scale(1.5); opacity: 1; } 100% { transform: translateY(-120px) scale(0.8); opacity: 0; } }
        @keyframes fireGlow { 0% { opacity: 0; } 30% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
        
        @keyframes letterDrop {
          0% { transform: translateY(-300px) rotate(3deg); opacity: 0; filter: blur(4px); }
          10% { opacity: 1; filter: blur(0px); }
          80% { transform: translateY(24px) rotate(-1deg); }
          100% { transform: translateY(16px) rotate(0deg); opacity: 1; }
        }
        @keyframes flapClose {
          0% { transform: rotateX(180deg); z-index: 5; }
          49% { z-index: 5; }
          50% { z-index: 30; }
          100% { transform: rotateX(0deg); z-index: 30; }
        }
        @keyframes sealPop {
          0% { transform: scale(3); opacity: 0; filter: blur(4px); }
          50% { transform: scale(0.85); opacity: 1; filter: blur(0px); }
          100% { transform: scale(1); opacity: 1; filter: blur(0px); }
        }
        @keyframes envelopeFly {
          0% { transform: translateY(0) scale(1) rotate(0deg); }
          20% { transform: translateY(30px) scale(0.95) rotate(-2deg); }
          100% { transform: translateY(-150vh) scale(0.4) rotate(12deg); opacity: 0; }
        }

        ${sendState === 'animating_diary' ? generateDynamicKeyframes(animationConfig.lines, animationConfig.duration) : ''}

        /* REGOLE DI TESTO ESTREME (Per l'affiancamento e parola infinita) */
        .rich-text-content {
          overflow-wrap: anywhere; 
          word-break: break-word; 
        }
        
        .rich-text-content b { font-weight: 800; color: #1A1510; }
        .rich-text-content i { font-style: italic; font-family: Georgia, serif; }
        .rich-text-content u { text-decoration: underline; text-underline-offset: 4px; decoration-thickness: 1px; }
        
        .rich-text-content div { 
            min-height: 32px; 
        }

        .rich-text-content img { 
            max-width: 100%; 
            height: auto; 
            border-radius: 8px; 
            margin: 15px auto; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
            border: 1px solid #E8DAC2; 
        }
        
        .drop-cap::first-letter { float: left; font-size: 5rem; line-height: 4rem; font-weight: bold; margin-right: 0.5rem; margin-top: 0.5rem; color: #1A1510; font-family: 'Cormorant Garamond', serif; }
      `}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/20 rounded-full blur-[100px] md:animate-[orbDrift_25s_ease-in-out_infinite_alternate] will-change-transform"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[#902A2A]/10 rounded-full blur-[120px] md:animate-[orbDrift_30s_ease-in-out_infinite_alternate-reverse] will-change-transform"></div>
         <div className="absolute top-[40%] left-[60%] w-[40vw] h-[40vw] bg-[#8B6E4E]/15 rounded-full blur-[100px] md:animate-[orbDrift_20s_ease-in-out_infinite_alternate] will-change-transform"></div>
      </div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>

      <header className="pt-16 pb-8 px-6 border-b border-[#E8DAC2]/50 relative z-10 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center relative">
          
          <div className="absolute top-0 right-4 flex items-center gap-3">
            <span className="text-xs font-semibold text-[#8B6E4E] hidden sm:inline tracking-wider uppercase truncate max-w-[120px] md:max-w-[200px] cursor-help hover:text-[#1A1510] transition-colors duration-300" title={user.displayName || "Studente"}>Bentornato, {user.displayName || "Studente"}</span>
            <button onClick={handleLogout} className="w-10 h-10 rounded-full bg-white/95 md:bg-white/60 backdrop-blur-none md:backdrop-blur-md border border-[#E8DAC2] flex items-center justify-center text-[#8B6E4E] hover:bg-[#FDF2F2] hover:text-[#902A2A] hover:border-[#902A2A]/30 hover:scale-110 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 shadow-sm hover:shadow-md group" title="Esci dall'Archivio">
              <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="relative w-20 h-20 mb-6 flex items-center justify-center group cursor-pointer" onDoubleClick={() => { if (!isAdmin) setShowAdminModal(true); }} title={isAdmin ? "Archivio Redazione Aperto" : "Zibaldone"}>
             <div className="absolute inset-0 border border-[#D4AF37]/30 rounded-full animate-[spin_20s_linear_infinite] group-hover:border-[#D4AF37] group-hover:scale-105 transition-all duration-700"></div>
             <div className="absolute inset-2 border border-[#D4AF37]/20 rounded-full animate-[spin_15s_linear_infinite_reverse] group-hover:scale-95 transition-all duration-700"></div>
             <Feather className="w-8 h-8 text-[#8B6E4E] drop-shadow-md group-hover:scale-110 group-hover:text-[#D4AF37] transition-all duration-500" strokeWidth={1.5} />
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-cormorant font-bold text-[#1A1510] tracking-wide mb-4 relative flex items-center justify-center gap-4">
            Lo Zibaldone
            {isAdmin && (
              <button onClick={handleAdminLock} className="opacity-60 hover:opacity-100 hover:scale-110 active:scale-95 hover:rotate-12 transition-all duration-300 absolute -right-12" title="Chiudi Archivio Redazione">
                <Unlock className="w-5 h-5 text-[#D4AF37] drop-shadow-sm" />
              </button>
            )}
          </h1>
          <p className="text-lg md:text-xl font-cormorant text-[#6B5A46] font-light max-w-2xl italic">
            "Il più solido piacere di questa vita è il piacer vano delle illusioni." <br />
            <span className="text-sm not-italic mt-3 block font-montserrat tracking-widest uppercase text-[#8B6E4E] font-semibold transition-colors duration-500 hover:text-[#D4AF37]">— Buca delle lettere e scritture della classe —</span>
          </p>
        </div>
      </header>

      <nav className="flex justify-center gap-3 md:gap-5 py-8 relative z-10 flex-wrap px-4 mb-8">
        <button onClick={() => { setActiveTab("write"); setIsSelectionMode(false); setSelectedIds([]); }} className={`flex items-center gap-2 px-6 py-3.5 rounded-full transition-all duration-500 font-semibold text-sm active:scale-95 ${activeTab === "write" ? "bg-gradient-to-r from-[#1A1510] to-[#2C241B] text-[#FDFBF7] shadow-[0_8px_20px_rgba(26,21,16,0.3)] scale-105" : "bg-white/95 md:bg-white/60 backdrop-blur-none md:backdrop-blur-md text-[#6B5A46] hover:bg-white border border-[#E8DAC2]/50 hover:shadow-lg hover:-translate-y-1 hover:text-[#1A1510]"}`}><PenTool className="w-4 h-4" />Nuova Lettera</button>
        <button onClick={() => { setActiveTab("my_pages"); setIsSelectionMode(false); setSelectedIds([]); }} className={`flex items-center gap-2 px-6 py-3.5 rounded-full transition-all duration-500 font-semibold text-sm active:scale-95 ${activeTab === "my_pages" ? "bg-gradient-to-r from-[#1A1510] to-[#2C241B] text-[#FDFBF7] shadow-[0_8px_20px_rgba(26,21,16,0.3)] scale-105" : "bg-white/95 md:bg-white/60 backdrop-blur-none md:backdrop-blur-md text-[#6B5A46] hover:bg-white border border-[#E8DAC2]/50 hover:shadow-lg hover:-translate-y-1 hover:text-[#1A1510]"}`}><Bookmark className="w-4 h-4" />Le Mie Pagine</button>

        {isAdmin && (
          <>
            <div className="w-[1px] h-8 bg-[#D4AF37]/40 mx-2 self-center"></div>
            <button onClick={() => {setActiveTab("read"); setIsSelectionMode(false); setSelectedIds([]);}} className={`flex items-center gap-2 px-6 py-3.5 rounded-full transition-all duration-500 font-semibold text-sm active:scale-95 ${activeTab === "read" ? "bg-gradient-to-r from-[#7A1A1A] to-[#501010] text-[#FDFBF7] shadow-[0_8px_20px_rgba(122,26,26,0.3)] scale-105" : "bg-[#FDF2F2]/95 md:bg-[#FDF2F2]/80 backdrop-blur-none md:backdrop-blur-md text-[#902A2A] border border-[#902A2A]/20 hover:bg-[#FDF2F2] hover:shadow-lg hover:-translate-y-1"}`}><BookOpen className="w-4 h-4" />Tutti (Redazione)</button>
            <button onClick={() => {setActiveTab("favorites"); setIsSelectionMode(false); setSelectedIds([]);}} className={`flex items-center gap-2 px-6 py-3.5 rounded-full transition-all duration-500 font-semibold text-sm active:scale-95 ${activeTab === "favorites" ? "bg-gradient-to-r from-[#7A1A1A] to-[#501010] text-[#FDFBF7] shadow-[0_8px_20px_rgba(122,26,26,0.3)] scale-105" : "bg-[#FDF2F2]/95 md:bg-[#FDF2F2]/80 backdrop-blur-none md:backdrop-blur-md text-[#902A2A] border border-[#902A2A]/20 hover:bg-[#FDF2F2] hover:shadow-lg hover:-translate-y-1"}`}><Star className="w-4 h-4" />Scelti</button>
            
            {(activeTab === "read" || activeTab === "favorites" || activeTab === "my_pages") && thoughts.length > 0 && (
              <button onClick={toggleSelectionMode} className={`flex items-center gap-2 px-6 py-3.5 rounded-full transition-all duration-500 font-semibold text-sm active:scale-95 ${isSelectionMode ? "bg-gradient-to-r from-[#D4AF37] to-[#C59B27] text-[#1A1510] shadow-[0_8px_20px_rgba(212,175,55,0.4)] scale-105" : "bg-[#FDFBF7]/95 md:bg-[#FDFBF7]/80 backdrop-blur-none md:backdrop-blur-md text-[#D4AF37] border border-[#D4AF37]/30 hover:bg-[#FDFBF7] hover:shadow-lg hover:-translate-y-1 hover:text-[#C59B27]"}`}><ListChecks className="w-4 h-4" /> {isSelectionMode ? "Annulla" : "Seleziona Pagine"}</button>
            )}
          </>
        )}
      </nav>

      <main className={`max-w-5xl mx-auto px-6 relative z-10 min-h-[50vh]`}>
        {(activeTab === "read" || activeTab === "favorites" || activeTab === "my_pages") && (
          <div className="transition-all duration-700 animate-in fade-in slide-in-from-bottom-4">
            {!loading && thoughts.length > 0 && (activeTab === "read" || activeTab === "favorites") && (
              <div className="flex justify-center md:justify-end mb-8 relative z-30">
                <div className="relative">
                  <button onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} className="flex items-center gap-3 bg-white/95 md:bg-white/80 backdrop-blur-none md:backdrop-blur-md px-5 py-3 rounded-full border border-[#E8DAC2]/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95 transition-all duration-300 text-[#4A4036] text-sm font-semibold group"><ChevronDown className="w-4 h-4 text-[#D4AF37]" />{sortBy === "newest" && "Dal più recente"}{sortBy === "oldest" && "Dal più vecchio"}{sortBy === "longest" && "I più lunghi"}{sortBy === "shortest" && "I più concisi"}<ChevronDown className={`w-4 h-4 text-[#D4C3A3] transition-transform duration-300 ${isSortMenuOpen ? 'rotate-180' : ''}`} /></button>
                  {isSortMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsSortMenuOpen(false)}></div>
                      <div className="absolute right-0 mt-3 w-56 bg-white/95 backdrop-blur-none md:backdrop-blur-xl border border-[#E8DAC2]/50 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 zoom-in-95 origin-top-right">
                        <div className="py-2">
                          {[{ id: "newest", label: "Dal più recente" }, { id: "oldest", label: "Dal più vecchio" }, { id: "longest", label: "I più lunghi" }, { id: "shortest", label: "I più concisi" }].map((option) => (
                            <button key={option.id} onClick={() => { setSortBy(option.id); setIsSortMenuOpen(false); }} className={`w-full text-left px-5 py-3.5 text-sm font-semibold transition-all duration-300 flex items-center gap-3 hover:translate-x-1.5 ${sortBy === option.id ? 'bg-[#F4EFE6] text-[#1A1510]' : 'text-[#6B5A46] hover:bg-[#FDF2F2] hover:text-[#902A2A]'}`}><div className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${sortBy === option.id ? 'bg-[#D4AF37]' : 'bg-transparent'}`}></div>{option.label}</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {loading ? ( <div className="flex flex-col items-center justify-center py-20 text-[#8B6E4E]"><Loader2 className="w-10 h-10 animate-spin mb-4 text-[#D4AF37] filter drop-shadow-md" /><p className="font-semibold tracking-widest uppercase text-xs animate-pulse">Apertura in corso...</p></div> ) : displayedThoughts.length === 0 ? (
              <div className="text-center py-20 animate-in fade-in slide-in-from-bottom-4 duration-700 bg-white/90 md:bg-white/40 backdrop-blur-none md:backdrop-blur-sm rounded-3xl border border-[#E8DAC2]/50 p-10 max-w-lg mx-auto shadow-sm">
                <Bookmark className="w-16 h-16 text-[#D4AF37]/40 mx-auto mb-6 drop-shadow-sm hover:scale-110 hover:rotate-6 transition-transform duration-500" />
                <h3 className="text-2xl font-cormorant font-bold text-[#1A1510] mb-2">Nessuna pagina trovata.</h3>
                <p className="text-[#6B5A46] text-sm">Le pagine dello Zibaldone attendono l'inchiostro.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
                {displayedThoughts.map((thought, index) => {
                  const isDeleting = deletingIds.includes(thought.id);
                  const isSelected = selectedIds.includes(thought.id);
                  const canDelete = isAdmin; 
                  
                  return (
                  <article key={thought.id} onClick={() => handleCardClick(thought)} className={`bg-white/95 md:bg-white/80 backdrop-blur-none md:backdrop-blur-sm p-8 rounded-tr-3xl rounded-bl-3xl rounded-tl-md rounded-br-md flex flex-col group relative overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-2 active:scale-[0.98] ${isDeleting ? "animate-[turnToAsh_1.1s_cubic-bezier(0.4,0,0.2,1)_forwards] pointer-events-none z-50" : "animate-in fade-in slide-in-from-bottom-8 zoom-in-95"} ${isSelected ? 'ring-2 ring-[#D4AF37] shadow-[0_15px_35px_rgba(212,175,55,0.2)] bg-white' : 'border border-[#E8DAC2]/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgb(212,175,55,0.15)] hover:border-[#D4AF37]/50'}`} style={isDeleting ? {} : { animationFillMode: "both", animationDelay: `${index * 60}ms` }}>
                    
                    {isDeleting && (
                      <div className="absolute inset-0 pointer-events-none z-[60] flex items-end justify-center rounded-2xl">
                         <div className="absolute inset-0 bg-gradient-to-t from-[#902A2A] via-[#D45A27]/40 to-transparent opacity-0 animate-[fireGlow_1.1s_ease-out_forwards]"></div>
                         <div className="absolute bottom-[-10px] flex items-end justify-center animate-[fireRise_1.1s_ease-in-out_forwards]">
                            <div className="absolute w-32 h-32 bg-[#902A2A] rounded-tl-full rounded-br-full rounded-bl-full -rotate-45 -translate-x-12 translate-y-4"></div>
                            <div className="absolute w-40 h-40 bg-[#902A2A] rounded-tl-full rounded-br-full rounded-bl-full -rotate-45 translate-x-8 translate-y-8"></div>
                         </div>
                      </div>
                    )}

                    <div className="absolute left-6 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-[#D4AF37]/30 to-transparent z-0"></div>

                    {isSelectionMode && canDelete && (
                      <div className="absolute top-5 right-5 z-20 transition-transform duration-300 hover:scale-110 active:scale-95">
                        {isSelected ? <CheckCircle2 className="w-7 h-7 text-[#D4AF37] drop-shadow-md fill-white" /> : <Circle className="w-7 h-7 text-[#E8DAC2] group-hover:text-[#D4AF37]/70 transition-colors duration-300" />}
                      </div>
                    )}

                    {!isSelectionMode && canDelete && (
                      <div className="absolute top-5 right-5 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <button onClick={(e) => { e.stopPropagation(); setThoughtToDelete(thought); }} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/95 md:bg-white/90 backdrop-blur-none md:backdrop-blur-md border border-[#E8DAC2]/50 shadow-sm hover:bg-[#FDF2F2] hover:border-[#902A2A]/30 hover:-translate-y-1 active:scale-90 transition-all duration-300 hover:shadow-md group/trash" title="Brucia"><Trash2 className="w-4 h-4 text-[#8B6E4E] group-hover/trash:text-[#902A2A] transition-colors duration-300" /></button>
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); toggleStar(thought.id, thought.isStarred); }} className="w-9 h-9 rounded-full flex items-center justify-center bg-white/95 md:bg-white/90 backdrop-blur-none md:backdrop-blur-md border border-[#E8DAC2]/50 shadow-sm hover:bg-[#F9F6F0] hover:border-[#D4AF37]/50 hover:-translate-y-1 active:scale-90 transition-all duration-300 hover:shadow-md group/star" title="Evidenzia"><Star className={`w-4 h-4 transition-all duration-300 group-hover/star:scale-110 group-hover/star:rotate-12 ${thought.isStarred ? "fill-[#D4AF37] text-[#D4AF37] drop-shadow-[0_0_4px_rgba(212,175,55,0.5)]" : "text-[#8B6E4E]"}`} /></button>
                        )}
                      </div>
                    )}

                    <header className={`mb-5 relative z-10 pl-4 ${isSelectionMode ? 'pr-12' : 'pr-20'}`}>
                      <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 text-[9px] font-bold text-[#8B6E4E] uppercase tracking-widest mb-3">
                        <span className="truncate max-w-[140px] bg-[#F4EFE6] px-2.5 py-1 rounded-sm cursor-help hover:bg-[#E8DAC2] hover:text-[#1A1510] transition-colors duration-300 shadow-sm" title={thought.author}>DI {thought.author}</span>
                        <span className="hidden sm:inline w-1 h-1 rounded-full bg-[#D4AF37] shrink-0"></span>
                        <span className="shrink-0 opacity-80">{formatDate(thought.timestamp)}</span>
                      </div>
                      <h2 className="text-2xl font-cormorant font-bold text-[#1A1510] leading-snug break-words line-clamp-2 group-hover:text-[#8B6E4E] transition-colors duration-300">{thought.title}</h2>
                    </header>
                    <div className="flex-grow relative z-10 pl-4"><div className="text-[#3A3228] leading-relaxed whitespace-pre-wrap font-cormorant font-medium text-lg line-clamp-4 break-words rich-text-content" dangerouslySetInnerHTML={{ __html: thought.content }} /></div>
                    
                    {thought.strokes && thought.strokes.length > 0 && (
                       <div className="mt-5 pl-4 flex items-center gap-2 text-[10px] text-[#2C5E9E] font-bold tracking-wider uppercase opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                         <Pencil className="w-3 h-3" /> Disegni Inclusi
                       </div>
                    )}

                    {!isSelectionMode && (
                      <div className="mt-6 pt-5 border-t border-[#E8DAC2]/40 flex justify-between items-center relative z-10 pl-4"><div className="w-10 h-[2px] bg-[#E8DAC2] transition-all duration-500 group-hover:w-20 group-hover:bg-[#D4AF37]"></div><span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8B6E4E] group-hover:text-[#D4AF37] group-hover:translate-x-1 transition-all duration-300">Esplora pagina</span></div>
                    )}
                  </article>
                )})}
              </div>
            )}
          </div>
        )}

        {}
        {activeTab === "write" && (
          <div className="max-w-3xl mx-auto transition-all duration-700 animate-in fade-in slide-in-from-bottom-12 zoom-in-95">
            <div className="text-center mb-10"><p className="text-[#6B5A46] italic font-cormorant text-xl opacity-80 hover:opacity-100 transition-opacity duration-500">"La penna svela ciò che il pensiero nasconde."</p></div>
            <div className="bg-white/95 md:bg-white/80 backdrop-blur-none md:backdrop-blur-xl p-8 md:p-12 rounded-[2rem] shadow-[0_20px_50px_rgba(26,21,16,0.06)] border border-[#E8DAC2]/80 relative transition-all duration-500 hover:shadow-[0_25px_60px_rgba(26,21,16,0.1)] isolate">
              
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#E8DAC2]/40 rounded-bl-[4rem] opacity-60 pointer-events-none -z-10"></div>

              <h2 className="text-3xl font-cormorant font-bold text-[#1A1510] mb-8 text-center relative z-10 drop-shadow-sm">Intingi la Penna</h2>
              
              <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                <div className="space-y-2 group">
                  <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 block group-focus-within:text-[#D4AF37] group-focus-within:-translate-y-0.5 transition-all duration-300">Il Titolo del tuo Pensiero</label>
                  <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Es: L'infinito" className="w-full bg-white/95 md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-4 text-[#1A1510] font-cormorant font-bold text-xl placeholder:text-[#CDB591] placeholder:font-sans placeholder:font-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:-translate-y-1 focus:shadow-[0_10px_30px_rgba(212,175,55,0.15)] transition-all duration-500 shadow-inner" required />
                </div>
                
                <div className="space-y-2 group">
                  <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 block group-focus-within:text-[#D4AF37] group-focus-within:-translate-y-0.5 transition-all duration-300 flex items-center justify-between">Il tuo scritto</label>
                  
                  <div className={`w-full border rounded-[15px] bg-white/95 md:bg-white/60 focus-within:ring-2 focus-within:ring-[#D4AF37]/50 focus-within:-translate-y-1 transition-all duration-500 flex flex-col shadow-inner isolate relative ${isDrawingMode ? 'border-[#D4AF37] shadow-[0_15px_40px_rgba(212,175,55,0.2)]' : 'border-[#E8DAC2] focus-within:shadow-[0_15px_40px_rgba(212,175,55,0.15)]'}`}>
                    
                    {/* Toolbar Principale */}
                    <div className="flex items-center justify-between gap-3 p-3 border-b border-[#E8DAC2] bg-[#FDFBF7]/95 md:bg-[#FDFBF7]/80 backdrop-blur-none md:backdrop-blur-md flex-wrap animate-in slide-in-from-top-4 duration-500 rounded-t-[15px] z-40 min-h-[56px]">
                      
                      {activeImg ? (
                        <div className="flex items-center gap-2 w-full animate-in fade-in zoom-in-95 duration-300">
                          <span className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-wider hidden sm:inline mr-2">Foto Selezionata:</span>
                          
                          <div className="flex bg-[#F4EFE6] rounded-lg p-1 border border-[#D4AF37]/50 shadow-sm">
                            <button type="button" onClick={() => handleImageAction('shrink')} className="w-8 h-8 flex items-center justify-center rounded text-[#4A4036] hover:bg-white hover:text-[#1A1510] active:scale-90 transition-all" title="Rimpicciolisci"><span className="text-lg font-bold">-</span></button>
                            <button type="button" onClick={() => handleImageAction('grow')} className="w-8 h-8 flex items-center justify-center rounded text-[#4A4036] hover:bg-white hover:text-[#1A1510] active:scale-90 transition-all" title="Ingrandisci"><span className="text-lg font-bold">+</span></button>
                          </div>
                          
                          <div className="w-[1px] h-6 bg-[#D4AF37]/30 mx-1"></div>
                          
                          <div className="flex bg-[#F4EFE6] rounded-lg p-1 border border-[#E8DAC2]/50 shadow-sm">
                            <button type="button" onClick={() => handleImageAction('left')} className="w-8 h-8 flex items-center justify-center rounded text-[#4A4036] hover:bg-white hover:text-[#1A1510] active:scale-90 transition-all" title="Sposta a Sinistra"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h6M4 18h16"/></svg></button>
                            <button type="button" onClick={() => handleImageAction('center')} className="w-8 h-8 flex items-center justify-center rounded text-[#4A4036] hover:bg-white hover:text-[#1A1510] active:scale-90 transition-all" title="Centra"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M9 12h6M4 18h16"/></svg></button>
                            <button type="button" onClick={() => handleImageAction('right')} className="w-8 h-8 flex items-center justify-center rounded text-[#4A4036] hover:bg-white hover:text-[#1A1510] active:scale-90 transition-all" title="Sposta a Destra"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M14 12h6M4 18h16"/></svg></button>
                          </div>

                          <div className="w-[1px] h-6 bg-[#D4AF37]/30 mx-1"></div>

                          <button type="button" onClick={() => handleImageAction('delete')} className="w-8 h-8 flex items-center justify-center rounded bg-[#FDF2F2] border border-[#902A2A]/30 text-[#902A2A] hover:bg-[#902A2A] hover:text-white active:scale-90 transition-all ml-auto" title="Rimuovi Foto"><Trash2 size={16}/></button>
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2 flex-wrap items-center">
                            <div className="flex bg-[#F4EFE6] rounded-lg p-1 border border-[#E8DAC2]/50 shadow-sm">
                              <button type="button" onClick={() => formatText('bold')} className={`w-8 h-8 flex items-center justify-center rounded transition-all duration-300 ${activeFormats.bold ? 'bg-[#1A1510] text-[#D4AF37] shadow-md scale-110' : 'hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5'}`} title="Grassetto"><Bold size={16}/></button>
                              <button type="button" onClick={() => formatText('italic')} className={`w-8 h-8 flex items-center justify-center rounded transition-all duration-300 ${activeFormats.italic ? 'bg-[#1A1510] text-[#D4AF37] shadow-md scale-110' : 'hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5'}`} title="Corsivo"><Italic size={16}/></button>
                              <button type="button" onClick={() => formatText('underline')} className={`w-8 h-8 flex items-center justify-center rounded transition-all duration-300 ${activeFormats.underline ? 'bg-[#1A1510] text-[#D4AF37] shadow-md scale-110' : 'hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5'}`} title="Sottolineato"><Underline size={16}/></button>
                            </div>
                            
                            <div className="w-[1px] h-6 bg-[#D4AF37]/30 mx-1 hidden sm:block"></div>
                            
                            <div className="flex bg-[#F4EFE6] rounded-lg p-1 border border-[#E8DAC2]/50 shadow-sm">
                               <label className="w-8 h-8 flex items-center justify-center rounded hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer" title="Inserisci Foto al cursore">
                                  <ImageIcon size={16} />
                                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                               </label>
                            </div>
                          </div>
                          
                          <div className="flex bg-[#F4EFE6] rounded-lg p-1 border border-[#E8DAC2]/50 shadow-sm ml-auto">
                            <button type="button" onClick={() => setIsDrawingMode(!isDrawingMode)} className={`w-8 h-8 flex items-center justify-center rounded transition-all duration-300 ${isDrawingMode ? 'bg-[#1A1510] text-[#D4AF37] shadow-md scale-110' : 'hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5'}`} title="Disegna a Mano">
                              <Pencil size={16}/>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {isDrawingMode && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2 px-3 bg-[#F4EFE6]/90 backdrop-blur-sm border-b border-[#E8DAC2] animate-in slide-in-from-top-2 z-40 shadow-inner">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider ml-1 hidden sm:inline">Inchiostro:</span>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setDrawColor('#1A1510')} className={`w-6 h-6 rounded-full bg-[#1A1510] border-2 shadow-sm transition-all ${drawColor === '#1A1510' ? 'border-[#D4AF37] scale-125' : 'border-white hover:scale-110'}`} title="Nero"></button>
                            <button type="button" onClick={() => setDrawColor('#902A2A')} className={`w-6 h-6 rounded-full bg-[#902A2A] border-2 shadow-sm transition-all ${drawColor === '#902A2A' ? 'border-[#D4AF37] scale-125' : 'border-white hover:scale-110'}`} title="Rosso"></button>
                            <button type="button" onClick={() => setDrawColor('#2C5E9E')} className={`w-6 h-6 rounded-full bg-[#2C5E9E] border-2 shadow-sm transition-all ${drawColor === '#2C5E9E' ? 'border-[#D4AF37] scale-125' : 'border-white hover:scale-110'}`} title="Blu"></button>
                            <button type="button" onClick={() => setDrawColor('#2A6B36')} className={`w-6 h-6 rounded-full bg-[#2A6B36] border-2 shadow-sm transition-all ${drawColor === '#2A6B36' ? 'border-[#D4AF37] scale-125' : 'border-white hover:scale-110'}`} title="Verde"></button>
                          </div>
                        </div>
                        <button type="button" onClick={() => setStrokes([])} className="text-[10px] font-bold uppercase text-[#902A2A] bg-white border border-[#902A2A]/20 hover:bg-[#FDF2F2] px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm ml-auto">Svuota</button>
                      </div>
                    )}

                    <div className="relative bg-transparent rounded-b-[15px]">
                      <div className="relative w-full transition-all duration-300" style={{ minHeight: `${editorHeight}px` }}>
                        
                        <div
                          ref={editorRef}
                          contentEditable={!isDrawingMode}
                          onClick={handleEditorClick}
                          onInput={(e) => setNewContent(e.currentTarget.innerHTML)}
                          onKeyUp={updateFormattingState}
                          onMouseUp={updateFormattingState}
                          onTouchEnd={updateFormattingState}
                          className={`p-5 md:p-6 outline-none font-cormorant font-medium text-xl leading-[32px] text-[#2C241B] rich-text-content transition-opacity duration-300 break-words [word-break:break-word] ${isDrawingMode ? 'opacity-50 select-none whitespace-pre-wrap' : 'opacity-100'}`}
                          style={{ 
                            minHeight: `${editorHeight}px`,
                            backgroundImage: 'linear-gradient(transparent 31px, rgba(212,175,55,0.15) 32px)', 
                            backgroundSize: '100% 32px', 
                            backgroundOrigin: 'content-box', 
                            backgroundAttachment: 'local'
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') document.execCommand('formatBlock', false, 'div');
                          }}
                        />

                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
                          {strokes.map((stroke, i) => (
                            <polyline 
                              key={i} 
                              points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')} 
                              fill="none" 
                              stroke={stroke.color} 
                              strokeWidth="3" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                            />
                          ))}
                          {currentStroke && (
                            <polyline 
                              points={currentStroke.points.map((p) => `${p.x},${p.y}`).join(' ')} 
                              fill="none" 
                              stroke={currentStroke.color} 
                              strokeWidth="3" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                            />
                          )}
                        </svg>

                        {isDrawingMode && (
                          <div
                            className="absolute top-0 left-0 w-full h-full z-30 cursor-crosshair"
                            style={{ touchAction: 'none' }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting || (!newContent.trim() && strokes.length === 0)} className="w-full bg-gradient-to-r from-[#1A1510] to-[#2C241B] text-[#FDFBF7] py-4 rounded-2xl font-semibold text-sm transition-all duration-500 hover:shadow-[0_15px_35px_rgba(26,21,16,0.4)] hover:-translate-y-1.5 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mt-8 border border-[#3A3228] group">
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" /><span className="animate-pulse">Sigillo in corso...</span></> : <><Send className="w-5 h-5 text-[#D4AF37] group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500" />Affida la lettera all'Archivio</>}
                </button>
              </form>
            </div>
          </div>
        )}

        {}
        {selectedThought && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" onClick={() => setSelectedThought(null)} style={{ perspective: "1500px" }}>
            <div className="absolute inset-0 bg-[#150F0A]/80 md:bg-[#150F0A]/70 backdrop-blur-none md:backdrop-blur-md" style={{ animation: "fadeInOverlay 0.5s ease-out forwards" }}></div>
            <div className="bg-[#FDFBF7] md:bg-[#FDFBF7]/95 w-full max-w-3xl max-h-[88vh] rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative z-10 flex flex-col overflow-hidden border border-[#E8DAC2] transition-transform duration-500" onClick={(e) => e.stopPropagation()} style={{ animation: "paperFloat 0.6s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards" }}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#E8DAC2]/30 rounded-bl-[6rem] opacity-80 pointer-events-none z-0"></div>
              
              <div className="flex flex-col-reverse md:flex-row justify-between items-start gap-4 md:gap-0 p-5 md:p-10 border-b border-[#E8DAC2]/50 sticky top-0 bg-[#FDFBF7] md:bg-[#FDFBF7]/95 backdrop-blur-none md:backdrop-blur-xl z-20 shadow-sm transition-all duration-500 w-full">
                <div className="flex-1 min-w-0 w-full md:pr-4">
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] font-bold text-[#8B6E4E] uppercase tracking-widest mb-3 md:mb-4">
                    <span className="bg-gradient-to-r from-[#D4AF37] to-[#C59B27] text-[#1A1510] px-3 py-1.5 rounded-md truncate max-w-[200px] shadow-sm cursor-help hover:shadow-md hover:-translate-y-0.5 transition-all duration-300" title={selectedThought.author}>FIRMA: {selectedThought.author}</span>
                    <span className="bg-[#F4EFE6] px-3 py-1.5 rounded-md shrink-0 border border-[#E8DAC2] shadow-sm">{formatDate(selectedThought.timestamp)}</span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-cormorant font-bold text-[#1A1510] break-words leading-tight drop-shadow-sm">{selectedThought.title}</h2>
                </div>
                
                <div className="flex items-center gap-1.5 self-end md:self-start shrink-0 bg-white p-2 rounded-full border border-[#E8DAC2] shadow-[0_4px_15px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_25px_rgba(0,0,0,0.08)] transition-all duration-300">
                  {isAdmin && (
                    <>
                      <button onClick={() => setThoughtToDelete(selectedThought)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FDF2F2] hover:-translate-y-1 active:scale-90 transition-all duration-300 group"><Trash2 className="w-4 h-4 text-[#D4C3A3] group-hover:text-[#902A2A] transition-colors" /></button>
                      <div className="w-[1px] h-6 bg-[#E8DAC2]"></div>
                      <button onClick={() => { toggleStar(selectedThought.id, selectedThought.isStarred); setSelectedThought({ ...selectedThought, isStarred: !selectedThought.isStarred }); }} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F4EFE6] hover:-translate-y-1 active:scale-90 transition-all duration-300"><Star className={`w-4 h-4 transition-all duration-300 ${selectedThought.isStarred ? "fill-[#D4AF37] text-[#D4AF37] drop-shadow-[0_0_5px_rgba(212,175,55,0.6)] scale-125 rotate-12" : "text-[#D4C3A3] hover:scale-110"}`} /></button>
                      <div className="w-[1px] h-6 bg-[#E8DAC2]"></div>
                    </>
                  )}
                  <button onClick={() => setSelectedThought(null)} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FDFBF7] text-[#1A1510] hover:scale-110 hover:rotate-90 active:scale-90 transition-all duration-300 bg-[#F4EFE6]"><X className="w-5 h-5" /></button>
                </div>
              </div>
              
              <div className="p-8 md:p-12 overflow-y-auto relative z-10 custom-scrollbar">
                
                <div className="relative w-full" style={{ minHeight: `${calculateReadMaxY()}px` }}>
                  <div className={`text-[#3A3228] leading-[32px] whitespace-pre-wrap font-cormorant font-medium text-2xl break-words rich-text-content ${selectedThought.content && !selectedThought.content.startsWith('<') ? 'drop-cap' : ''} pb-10`} dangerouslySetInnerHTML={{ __html: selectedThought.content }} />
                  
                  {selectedThought.strokes && selectedThought.strokes.length > 0 && (
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-20">
                      {selectedThought.strokes.map((stroke, i) => (
                        <polyline 
                          key={i} 
                          points={stroke.points.map((p) => `${p.x},${p.y}`).join(' ')} 
                          fill="none" 
                          stroke={stroke.color} 
                          strokeWidth="3" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                        />
                      ))}
                    </svg>
                  )}
                </div>

                <div className="mt-20 flex flex-col items-center justify-center group"><Feather className="w-8 h-8 text-[#D4AF37]/50 mb-3 drop-shadow-sm group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-500" /><div className="w-12 h-[1px] bg-[#D4AF37]/30 mb-3 group-hover:w-20 transition-all duration-500"></div><span className="text-xs font-montserrat font-bold tracking-[0.3em] uppercase text-[#CDB591] group-hover:text-[#8B6E4E] transition-colors duration-500">Fine Pagina</span></div>
              </div>
            </div>
          </div>
        )}

        {showAdminModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={() => setShowAdminModal(false)}>
            <div className="absolute inset-0 bg-[#150F0A]/80 md:bg-[#150F0A]/70 backdrop-blur-none md:backdrop-blur-md" style={{ animation: "fadeInOverlay 0.3s ease-out forwards" }}></div>
            <div className="bg-white/95 md:bg-white/90 backdrop-blur-none md:backdrop-blur-xl p-10 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative z-10 w-full max-w-sm border border-[#E8DAC2]" onClick={(e) => e.stopPropagation()} style={{ animation: "paperFloat 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards" }}>
              <div className="flex flex-col items-center mb-8">
                <div className="w-16 h-16 bg-gradient-to-br from-[#E8DAC2]/50 to-[#D4C3A3]/20 rounded-full flex items-center justify-center mb-4 border border-[#D4AF37]/30 shadow-inner group hover:scale-110 hover:-translate-y-1 transition-all duration-500">
                  <KeyRound className="w-8 h-8 text-[#8B6E4E] drop-shadow-sm group-hover:-rotate-12 transition-transform duration-500" />
                </div>
                <h3 className="text-3xl font-cormorant font-bold text-[#1A1510] text-center tracking-wide">Archivio Segreto</h3>
              </div>
              <form onSubmit={handleAdminLogin}>
                <input type="password" value={adminPassword} onChange={(e) => { setAdminPassword(e.target.value); setAdminError(false); }} className={`w-full bg-[#FDFBF7] border ${adminError ? 'border-[#902A2A] ring-1 ring-[#902A2A]/50' : 'border-[#E8DAC2]'} rounded-2xl px-5 py-4 text-center mb-6 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:-translate-y-1 focus:shadow-md transition-all duration-500 shadow-inner font-medium`} placeholder="La parola d'ordine..." autoFocus />
                <div className="flex gap-4">
                  <button type="button" onClick={() => setShowAdminModal(false)} className="flex-1 py-3.5 rounded-2xl text-[#8B6E4E] font-bold text-sm uppercase tracking-wider hover:bg-[#F4EFE6] hover:-translate-y-1 active:scale-95 transition-all duration-300">Annulla</button>
                  <button type="submit" disabled={!adminPassword.trim()} className="flex-1 py-3.5 rounded-2xl text-white bg-gradient-to-r from-[#1A1510] to-[#2C241B] font-bold text-sm uppercase tracking-wider shadow-[0_5px_15px_rgba(26,21,16,0.3)] hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(26,21,16,0.5)] active:scale-95 transition-all duration-300 disabled:opacity-50">Sblocca</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {thoughtToDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setThoughtToDelete(null)}>
            <div className="absolute inset-0 bg-[#150F0A]/80 md:bg-[#150F0A]/70 backdrop-blur-none md:backdrop-blur-md" style={{ animation: "fadeInOverlay 0.3s ease-out forwards" }}></div>
            <div className="bg-white/95 md:bg-white/95 backdrop-blur-none md:backdrop-blur-xl p-10 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative z-10 w-full max-w-sm border border-[#902A2A]/20 text-center" onClick={(e) => e.stopPropagation()} style={{ animation: "paperFloat 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards" }}>
              <div className="w-16 h-16 bg-gradient-to-br from-[#FDF2F2] to-[#FAD4D4] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#902A2A]/30 shadow-inner group hover:scale-110 hover:-translate-y-1 transition-all duration-500">
                <Trash2 className="w-8 h-8 text-[#902A2A] drop-shadow-sm group-hover:-rotate-12 transition-transform duration-500" />
              </div>
              <h3 className="text-3xl font-cormorant font-bold text-[#1A1510] mb-3">Bruciare il foglio?</h3>
              <p className="text-[#6B5A46] text-sm mb-8 leading-relaxed font-medium">L'azione è irreversibile. Il pensiero sarà ridotto in cenere e perso per sempre.</p>
              <div className="flex gap-4">
                <button onClick={() => setThoughtToDelete(null)} className="flex-1 py-3.5 rounded-2xl text-[#8B6E4E] font-bold text-xs uppercase tracking-wider border border-[#E8DAC2] hover:bg-[#F4EFE6] hover:-translate-y-1 active:scale-95 transition-all duration-300">Annulla</button>
                <button onClick={confirmSingleDelete} className="flex-1 py-3.5 rounded-2xl text-white bg-gradient-to-r from-[#902A2A] to-[#7A1A1A] font-bold text-xs uppercase tracking-wider shadow-[0_5px_15px_rgba(144,42,42,0.3)] hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(144,42,42,0.5)] active:scale-95 transition-all duration-300">Sì, Brucia</button>
              </div>
            </div>
          </div>
        )}

        {isSelectionMode && selectedIds.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[55] animate-in slide-in-from-bottom-8 duration-500">
            <button onClick={() => setShowMultiDeleteModal(true)} className="flex items-center gap-3 bg-gradient-to-r from-[#902A2A] to-[#7A1A1A] text-[#FDFBF7] px-8 py-4 rounded-full font-bold text-sm tracking-widest uppercase shadow-[0_10px_30px_rgba(144,42,42,0.4)] hover:shadow-[0_15px_40px_rgba(144,42,42,0.6)] hover:-translate-y-1 active:scale-95 transition-all duration-300 border border-[#4A1010]">
              <Trash2 className="w-5 h-5" />
              Brucia {selectedIds.length} Pagin{selectedIds.length === 1 ? 'a' : 'e'}
            </button>
          </div>
        )}

        {showMultiDeleteModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setShowMultiDeleteModal(false)}>
            <div className="absolute inset-0 bg-[#150F0A]/80 md:bg-[#150F0A]/70 backdrop-blur-none md:backdrop-blur-md" style={{ animation: "fadeInOverlay 0.3s ease-out forwards" }}></div>
            <div className="bg-white/95 md:bg-white/95 backdrop-blur-none md:backdrop-blur-xl p-10 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative z-10 w-full max-w-sm border border-[#902A2A]/20 text-center" onClick={(e) => e.stopPropagation()} style={{ animation: "paperFloat 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards" }}>
              <div className="w-16 h-16 bg-gradient-to-br from-[#FDF2F2] to-[#FAD4D4] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#902A2A]/30 shadow-inner group hover:scale-110 hover:-translate-y-1 transition-all duration-500">
                <Trash2 className="w-8 h-8 text-[#902A2A] drop-shadow-sm group-hover:-rotate-12 transition-transform duration-500" />
              </div>
              <h3 className="text-3xl font-cormorant font-bold text-[#1A1510] mb-3">Bruciare i fogli?</h3>
              <p className="text-[#6B5A46] text-sm mb-8 leading-relaxed font-medium">L'azione è irreversibile. Le {selectedIds.length} pagine selezionate saranno ridotte in cenere e perse per sempre.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowMultiDeleteModal(false)} className="flex-1 py-3.5 rounded-2xl text-[#8B6E4E] font-bold text-xs uppercase tracking-wider border border-[#E8DAC2] hover:bg-[#F4EFE6] hover:-translate-y-1 active:scale-95 transition-all duration-300">Annulla</button>
                <button onClick={confirmMultiDelete} className="flex-1 py-3.5 rounded-2xl text-white bg-gradient-to-r from-[#902A2A] to-[#7A1A1A] font-bold text-xs uppercase tracking-wider shadow-[0_5px_15px_rgba(144,42,42,0.3)] hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(144,42,42,0.5)] active:scale-95 transition-all duration-300">Sì, Brucia</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================= CINEMATIC SEND ANIMATION ================= */}
      {sendState !== 'idle' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden perspective-[1500px]">
          
          <div className="absolute inset-0 transition-all" style={{ animation: "bgCinematicBlur 1s ease-out both" }}></div>

          {sendState === 'thankyou' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FDFBF7] px-6 text-center z-10" style={{ animation: "textRevealUp 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both" }}>
              <div className="w-24 h-24 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mb-8 backdrop-blur-md border border-[#D4AF37]/30 shadow-[0_0_40px_rgba(212,175,55,0.2)]">
                <Feather className="w-12 h-12 text-[#D4AF37] opacity-90 drop-shadow-lg" />
              </div>
              <h2 className="text-5xl md:text-7xl font-cormorant font-bold mb-6 drop-shadow-lg text-white">Affidata all'Archivio</h2>
              <div className="w-20 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent mx-auto mb-8"></div>
              <p className="text-xl md:text-2xl text-[#E8DAC2] font-cormorant font-light italic max-w-lg mb-12 drop-shadow-md">La tua scrittura è stata sigillata e riposa al sicuro nelle pagine dello Zibaldone.</p>
              <button onClick={resetWritingForm} className="px-10 py-4 rounded-full bg-gradient-to-r from-[#DFCCB0] to-[#CDB591] text-[#1A1510] font-bold text-sm tracking-[0.2em] uppercase hover:shadow-[0_15px_40px_rgba(223,204,176,0.4)] hover:-translate-y-1.5 active:scale-95 transition-all duration-300 border border-[#E8DAC2]/50 flex items-center gap-3 group"><PenTool className="w-5 h-5 group-hover:-rotate-12 transition-transform duration-300" />Scrivi un'altra pagina</button>
            </div>
          )}

          {sendState === 'animating_envelope' && (
            <div className="relative w-[320px] h-[224px] z-20" style={{ animation: "envelopeFly 1.5s ease-in-out 4.5s both" }}>
               <div className="absolute inset-0 bg-[#D4C3A3] rounded-md shadow-2xl z-0"></div>
               <div className="absolute left-[16px] right-[16px] h-[192px] bg-[#FDFBF7] p-5 shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)] border border-[#E8DAC2] z-10 overflow-hidden" style={{ backgroundImage: 'linear-gradient(transparent 23px, #E8DAC2 24px), url("https://www.transparenttextures.com/patterns/cream-paper.png")', backgroundSize: '100% 24px, auto', animation: "letterDrop 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s both" }}>
                  <div className="absolute top-0 bottom-0 left-6 w-[1px] bg-[#902A2A]/30"></div>
                  <div className="pl-6 pt-1">
                    <h4 className="font-cormorant font-bold text-[#1A1510] text-[16px] leading-[24px] line-clamp-1">{newTitle || "Senza Titolo"}</h4>
                    <p className="text-[10px] text-[#8B6E4E] uppercase tracking-widest font-semibold leading-[24px] mb-1">di {user.displayName || "Studente"}</p>
                    <div className="text-[13px] text-[#4A4036] font-cormorant leading-[24px] line-clamp-3 text-justify rich-text-content" dangerouslySetInnerHTML={{ __html: newContent }} />
                  </div>
               </div>
               <div className="absolute inset-y-0 left-0 w-1/2 bg-[#DFCCB0] z-20" style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)' }}></div>
               <div className="absolute inset-y-0 right-0 w-1/2 bg-[#C6B38E] z-20" style={{ clipPath: 'polygon(100% 0, 0 50%, 100% 100%)' }}></div>
               <div className="absolute bottom-0 inset-x-0 h-[65%] bg-[#E8DAC2] z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]" style={{ clipPath: 'polygon(0 100%, 50% 0, 100% 100%)' }}></div>
               <div className="absolute top-0 inset-x-0 h-[65%] origin-top" style={{ animation: "flapClose 0.8s cubic-bezier(0.4, 0, 0.2, 1) 2.2s both" }}>
                 <div className="w-full h-full bg-[#DFCCB0] border-b border-white/30" style={{ clipPath: 'polygon(0 0, 50% 100%, 100% 0)' }}></div>
               </div>
               <div className="absolute top-[50%] left-1/2 -ml-6 -mt-6 w-12 h-12 z-40 flex items-center justify-center" style={{ animation: "sealPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) 3.0s both" }}>
                  <div className="w-full h-full bg-gradient-to-br from-[#902A2A] to-[#601a1a] rounded-full flex items-center justify-center relative shadow-lg border border-[#7a2222]">
                    <div className="absolute inset-[3px] border border-[#D4AF37]/60 rounded-full"></div>
                    <Feather className="w-5 h-5 text-[#E8DAC2]" />
                  </div>
               </div>
            </div>
          )}

          {sendState === 'animating_diary' && (
            <div className="relative w-[280px] h-[380px] z-20" style={{ animation: `dynamicDiaryRiseFall ${4.5 + animationConfig.duration}s cubic-bezier(0.4, 0, 0.2, 1) both`, transformStyle: "preserve-3d" }}>
              <div className="absolute inset-0 bg-[#2C241B] rounded-r-xl shadow-2xl border-l-8 border-[#1A1510]"></div>
              <div className="absolute inset-y-1 right-1 left-2 bg-[#D4C3A3] rounded-r-lg shadow-inner"></div>
              
              <div className="absolute inset-y-2 right-2 left-2 bg-[#FDFBF7] rounded-r-md p-6 flex flex-col shadow-[inset_15px_0_20px_rgba(0,0,0,0.1)]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}>
                <h4 className="font-cormorant font-bold text-[#1A1510] text-lg leading-snug line-clamp-2 pb-1 border-b border-[#E8DAC2]/50">{newTitle || "Senza Titolo"}</h4>
                <p className="text-[10px] text-[#8B6E4E] mt-2 uppercase tracking-widest font-semibold italic">di {user.displayName || "Studente"}</p>
                <div className="relative mt-4 w-[230px]">
                  <div className="text-[14px] text-[#2C241B] font-cormorant leading-[24px] line-clamp-6 text-justify rich-text-content" dangerouslySetInnerHTML={{ __html: newContent }} style={{ animation: `dynamicTextReveal ${animationConfig.duration}s linear 2s both` }} />
                  <div className="absolute top-0 left-0 pointer-events-none z-50" style={{ animation: `dynamicPenWrite ${animationConfig.duration}s linear 2s both` }}>
                    <div style={{ animation: `penFadeInOut ${animationConfig.duration + 1}s ease-in-out 1.5s both` }}>
                      <div style={{ transform: 'translate(-50px, -92px) rotate(25deg)', transformOrigin: '50px 92px' }}><FountainPenNib /></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 origin-left z-30" style={{ animation: `dynamicDiaryCoverFlip ${4.5 + animationConfig.duration}s cubic-bezier(0.4, 0, 0.2, 1) both`, transformStyle: "preserve-3d" }}>
                <div className="absolute inset-0 rounded-r-xl border-l-8 border-[#150F0A] flex items-center justify-center shadow-xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #3A2C1E 0%, #201710 100%)', backfaceVisibility: "hidden" }}>
                  <div className="absolute inset-3 border border-[#D4AF37]/40 rounded-lg pointer-events-none"></div>
                  <div className="absolute inset-4 border border-[#D4AF37]/20 rounded-md pointer-events-none"></div>
                  <div className="border border-[#D4AF37] bg-[#150F0A]/50 backdrop-blur-sm px-6 py-8 rounded-sm shadow-inner"><span className="text-[#D4AF37] font-serif uppercase tracking-[0.3em] text-sm font-bold drop-shadow-md">Zibaldone</span></div>
                </div>
                <div className="absolute inset-0 bg-[#CBA471] rounded-l-xl border-r-8 border-[#9C7951] shadow-[inset_-10px_0_20px_rgba(0,0,0,0.3)]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")', backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                  <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/40 to-transparent rounded-r-xl"></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VERSION */}
      <div className="fixed bottom-3 left-4 z-50 text-[10px] font-montserrat font-bold tracking-[0.2em] uppercase text-[#8B6E4E] opacity-40 hover:opacity-100 transition-opacity duration-500 cursor-default pointer-events-auto">
        v2.9 "Tela Infinita"
      </div>
    </div>
  );
}
