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
  XCircle,
  LogOut
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

let app: any, auth: any, db: any;
try {
  if (isConfigured) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.error("Firebase init error", e);
}

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
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

// RIDOTTE LE PARTICELLE PER MOBILE (Da 60 a 40 totali)
const dustParticles = Array.from({ length: 40 }).map((_, i) => ({
  id: i,
  left: `${Math.random() * 100}%`,
  width: `${Math.random() * 4 + 2}px`, 
  delay: `${Math.random() * 10}s`,
  duration: `${Math.random() * 15 + 15}s`, 
  opacity: Math.random() * 0.4 + 0.1, 
  xSway: `${Math.random() * 40 - 20}vw` 
}));

const FountainPenNib = () => (
  <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: "drop-shadow(6px 8px 4px rgba(0,0,0,0.3))" }}>
    <defs>
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#C59B27" />
        <stop offset="40%" stopColor="#F9E596" />
        <stop offset="60%" stopColor="#F9E596" />
        <stop offset="100%" stopColor="#8A6614" />
      </linearGradient>
      <linearGradient id="blackBody" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#0a0a0a" />
        <stop offset="40%" stopColor="#333" />
        <stop offset="60%" stopColor="#1a1a1a" />
        <stop offset="100%" stopColor="#000" />
      </linearGradient>
    </defs>
    <path d="M 37 45 L 63 45 L 68 5 L 32 5 Z" fill="url(#blackBody)" />
    <path d="M 41 45 L 43 5" stroke="rgba(255,255,255,0.2)" strokeWidth="2" fill="none" />
    <path d="M 42 70 L 58 70 L 63 45 L 37 45 Z" fill="#111" />
    <path d="M 45 70 L 47 45" stroke="rgba(255,255,255,0.1)" strokeWidth="1" fill="none" />
    <rect x="37" y="45" width="26" height="4" fill="url(#goldGrad)" />
    <rect x="36" y="42" width="28" height="2" fill="url(#goldGrad)" />
    <rect x="32" y="10" width="36" height="6" fill="url(#goldGrad)" />
    <path d="M 32 5 L 68 5 C 68 -8, 32 -8, 32 5 Z" fill="#050505" />
    <path d="M 66 8 C 76 8, 79 12, 75 16 L 70 48 C 69 52, 65 52, 65 48 L 68 18 C 69 14, 67 12, 66 11 Z" fill="url(#goldGrad)" />
    <path d="M 50 96 C 46 86, 42 76, 42 70 L 58 70 C 58 76, 54 86, 50 96 Z" fill="url(#goldGrad)" />
    <line x1="50" y1="96" x2="50" y2="76" stroke="#111" strokeWidth="1.5" />
    <circle cx="50" cy="75" r="1.5" fill="#111" />
    <path d="M 50 96 C 49.5 92, 48 88, 48 85 L 52 85 C 52 88, 50.5 92, 50 96 Z" fill="#111" />
  </svg>
);

export default function ZibaldoneApp() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  const [resetCode, setResetCode] = useState<string | null>(null);
  const [isResetScreen, setIsResetScreen] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const [thoughts, setThoughts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("write"); 
  const [sortBy, setSortBy] = useState("newest");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<any>(null);
  const [selectedThought, setSelectedThought] = useState<any>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [thoughtToDelete, setThoughtToDelete] = useState<any>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  
  const [sendState, setSendState] = useState<string>('idle');
  const [isNextEnvelope, setIsNextEnvelope] = useState<boolean>(true); 
  const [animationConfig, setAnimationConfig] = useState({ lines: 1, duration: 2.0, lastLineChars: 10 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');

    if (mode === 'resetPassword' && oobCode) {
      setResetCode(oobCode);
      setIsResetScreen(true);
      setAuthLoading(false);
    }
  }, []);

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
    if (isResetScreen) return;

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
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const fetchedThoughts: any[] = [];
      snapshot.forEach((doc: any) => { fetchedThoughts.push({ id: doc.id, ...doc.data() }); });
      setThoughts(fetchedThoughts);
      setLoading(false);
    }, (error: any) => { setLoading(false); });

    return () => unsubscribe();
  }, [user, isAdmin, activeTab]);

  const handleAuthSubmit = async (e: any) => {
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
    } catch (err: any) {
      setAuthLoading(false);
      if (err.code === 'auth/email-already-in-use') setAuthError("Questa email è già registrata.");
      else if (err.code === 'auth/invalid-credential') setAuthError("Credenziali errate o non esistenti.");
      else if (err.code === 'auth/weak-password') setAuthError("La password deve essere di almeno 6 caratteri.");
      else if (err.code === 'auth/invalid-email') setAuthError("Il formato dell'email non è valido.");
      else if (err.code === 'auth/user-not-found' || err.code === 'auth/missing-email') setAuthError("Non troviamo nessun archivio con questa email.");
      else setAuthError(`Errore tecnico: ${err.message}`);
    }
  };

  const handleNewPasswordSubmit = async (e: any) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setAuthLoading(true);
    try {
      await confirmPasswordReset(auth, resetCode!, newPassword);
      setAuthSuccess("La tua nuova chiave è stata forgiata con successo.");
      setAuthLoading(false);
      window.history.replaceState({}, document.title, window.location.pathname);
      setTimeout(() => {
         setIsResetScreen(false);
         setAuthMode('login');
         setAuthSuccess("");
      }, 3500);
    } catch (err: any) {
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

  const formatText = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      editorRef.current.focus();
      setNewContent(editorRef.current.innerHTML);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setMessage({ type: "error", text: "Immagine troppo grande. Massimo 10MB." }); return; }
    try {
      const compressedBase64 = await compressImage(file);
      setAttachedImage(compressedBase64);
    } catch (error) { setMessage({ type: "error", text: "Errore durante il caricamento dell'immagine." }); }
  };

  const calculateAnimation = (htmlText: string) => {
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlText;
    const text = tempDiv.innerText || tempDiv.textContent || "";
    const charsPerLine = 31;
    let logicalLines = 0;
    const paragraphs = text.split('\n');
    let lastLineChars = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p.trim() === '') {
        logicalLines += 1;
        if (i === paragraphs.length - 1) lastLineChars = 0;
      } else {
        const pLines = Math.ceil(p.length / charsPerLine);
        logicalLines += pLines;
        if (i === paragraphs.length - 1) {
          lastLineChars = p.length % charsPerLine;
          if (lastLineChars === 0) lastLineChars = charsPerLine;
        }
      }
    }
    let finalLastLineChars = lastLineChars;
    if (logicalLines > 6) finalLastLineChars = charsPerLine; 
    const cappedLines = Math.max(1, Math.min(logicalLines, 6)); 
    const duration = cappedLines * 1.5; 
    return { lines: cappedLines, duration, lastLineChars: finalLastLineChars };
  };

  const handleAdminLogin = (e: any) => { 
    e.preventDefault(); 
    if (adminPassword.toLowerCase() === "infinito") { setIsAdmin(true); setActiveTab("read"); setShowAdminModal(false); setAdminPassword(""); } 
    else { setAdminError(true); } 
  };
  
  const toggleSelectionMode = () => { setIsSelectionMode(!isSelectionMode); setSelectedIds([]); };

  const handleCardClick = (thought: any) => {
    if (isSelectionMode) { setSelectedIds(prev => prev.includes(thought.id) ? prev.filter(id => id !== thought.id) : [...prev, thought.id]); } 
    else { setSelectedThought(thought); }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user || (!newContent.trim() && !attachedImage)) return;
    setIsSubmitting(true);
    const config = calculateAnimation(newContent);
    setAnimationConfig(config);

    try {
      const thoughtsRef = collection(db, "pensieri");
      await addDoc(thoughtsRef, {
        title: newTitle.trim() || "Senza Titolo",
        author: user.displayName || "Studente",
        content: newContent.trim(),
        imageUrl: attachedImage,
        timestamp: Date.now(),
        userId: user.uid,
        isStarred: false,
      });

      setIsSubmitting(false);
      const nextAnim = isNextEnvelope ? 'animating_envelope' : 'animating_diary';
      setSendState(nextAnim);
      setIsNextEnvelope(!isNextEnvelope);

      const timeoutDur = nextAnim === 'animating_diary' ? ((5.0 + config.duration) * 1000) : 6000;
      setTimeout(() => { setSendState('thankyou'); }, timeoutDur);
    } catch (error) { setIsSubmitting(false); setMessage({ type: "error", text: "Impossibile salvare il pensiero. Riprova." }); }
  };

  const resetWritingForm = () => { 
    setSendState('idle'); setNewTitle(""); setNewContent(""); setAttachedImage(null);
    if(editorRef.current) editorRef.current.innerHTML = "";
  };
  
  const toggleStar = async (thoughtId: string, currentStatus: boolean) => { if (user && db && isAdmin) await updateDoc(doc(db, "pensieri", thoughtId), { isStarred: !currentStatus }); };
  
  const confirmSingleDelete = async () => {
    if (!user || !db || !isAdmin || !thoughtToDelete) return;
    const id = thoughtToDelete.id;
    
    // Novità: Chiude immediatamente la finestra di lettura per farti vedere l'animazione!
    if (selectedThought?.id === id) {
      setSelectedThought(null); 
    }

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

  const formatDate = (timestamp: number) => { return new Date(timestamp).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); };

  const displayedThoughts = [...thoughts].filter(t => activeTab === "favorites" ? t.isStarred : true).sort((a, b) => {
      switch (sortBy) {
        case "oldest": return a.timestamp - b.timestamp;
        case "longest": return (b.content?.length || 0) - (a.content?.length || 0);
        case "shortest": return (a.content?.length || 0) - (b.content?.length || 0);
        case "newest": default: return b.timestamp - a.timestamp;
      }
  });

  const generateDynamicKeyframes = (lines: number, duration: number, lastLineChars: number) => {
    let penKeyframes = "";
    let maskKeyframes = "";
    
    const lineHeight = 26; 
    const lineWidth = 230; 
    const charsPerLine = 31; 
    const step = 100 / lines; 

    for (let i = 0; i < lines; i++) {
      const startP = i * step;
      const endP = (i + 1) * step;
      const yTop = i * lineHeight;
      const yBot = (i + 1) * lineHeight;

      let lineEndX = lineWidth;
      if (i === lines - 1) { lineEndX = (Math.max(lastLineChars, 1) / charsPerLine) * lineWidth; }

      maskKeyframes += `
        ${startP}% { clip-path: polygon(0px 0px, 230px 0px, 230px ${yTop}px, 0px ${yTop}px, 0px ${yBot}px, 0px ${yBot}px); }
        ${endP - 0.01}% { clip-path: polygon(0px 0px, 230px 0px, 230px ${yTop}px, ${lineEndX}px ${yTop}px, ${lineEndX}px ${yBot}px, 0px ${yBot}px); }
      `;

      const writeY = yTop + 18; 
      penKeyframes += `
        ${startP}% { transform: translate(0px, ${writeY}px); }
        ${startP + (step * 0.25)}% { transform: translate(${lineEndX * 0.25}px, ${writeY - 3}px); }
        ${startP + (step * 0.5)}% { transform: translate(${lineEndX * 0.5}px, ${writeY + 1}px); }
        ${startP + (step * 0.75)}% { transform: translate(${lineEndX * 0.75}px, ${writeY - 2}px); }
        ${endP - 0.01}% { transform: translate(${lineEndX}px, ${writeY}px); }
      `;
    }

    const finalEndX = lines === 1 ? (Math.max(lastLineChars, 1) / charsPerLine) * lineWidth : (lastLineChars / charsPerLine) * lineWidth;
    const totalTime = 4.5 + duration;
    const fadeOutStartP = (duration / (duration + 1.0)) * 100;

    return `
      @keyframes dynamicTextReveal {
        ${maskKeyframes}
        100% { clip-path: polygon(0px 0px, 230px 0px, 230px 100%, 0px 100%, 0px 100%, 0px 100%); }
      }
      @keyframes dynamicPenWrite {
        ${penKeyframes}
        100% { transform: translate(${finalEndX}px, ${(lines - 1) * lineHeight + 18}px); }
      }
      @keyframes penFadeInOut {
        0%, 10% { opacity: 0; transform: translateY(-30px) scale(1.1); }
        20%, ${fadeOutStartP}% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-20px) scale(1.1); }
      }
      @keyframes diaryRiseFall {
        0% { transform: translateY(100vh) rotate(-5deg) scale(0.8); opacity: 0; }
        ${(1.5 / totalTime) * 100}% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
        ${((totalTime - 1.5) / totalTime) * 100}% { transform: translateY(0) rotate(0) scale(1); opacity: 1; }
        100% { transform: translateY(100vh) rotate(5deg) scale(0.8); opacity: 0; }
      }
      @keyframes diaryCoverFlip {
        0%, ${(1.5 / totalTime) * 100}% { transform: rotateY(0deg); }
        ${(1.8 / totalTime) * 100}%, ${((totalTime - 1.8) / totalTime) * 100}% { transform: rotateY(-175deg); }
        ${((totalTime - 1.5) / totalTime) * 100}%, 100% { transform: rotateY(0deg); }
      }
    `;
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
          
          /* GPU ACCELERATION FOR MOBILE */
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
        
        {/* Luci di Sfondo Ottimizzate */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
           <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/20 rounded-full blur-[100px] md:animate-[orbDrift_25s_ease-in-out_infinite_alternate] will-change-transform"></div>
           <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[#902A2A]/10 rounded-full blur-[120px] md:animate-[orbDrift_30s_ease-in-out_infinite_alternate-reverse] will-change-transform"></div>
           <div className="absolute top-[40%] left-[60%] w-[40vw] h-[40vw] bg-[#8B6E4E]/15 rounded-full blur-[100px] md:animate-[orbDrift_20s_ease-in-out_infinite_alternate] will-change-transform"></div>
        </div>

        {/* Particelle Ottimizzate: metà sono nascoste su mobile */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
           {dustParticles.map((p, index) => (
             <div key={p.id} className={`absolute bottom-[-5%] bg-[#D4AF37] rounded-full blur-[1px] will-change-transform ${index > 15 ? 'hidden md:block' : ''}`} style={{ left: p.left, width: p.width, height: p.width, '--max-opacity': p.opacity, '--x-sway': p.xSway, animation: `floatUpParticle ${p.duration} ease-in-out ${p.delay} infinite` } as any} />
           ))}
        </div>
        <div className="fixed inset-0 pointer-events-none opacity-[0.04] mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>
        
        {/* OPTIMIZED GLASSMORPHISM: No backdrop-blur on mobile, opaque background instead */}
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
                  <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="mario.rossi@gmail.com" className="w-full bg-white md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-3.5 text-[#1A1510] text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:bg-white focus:-translate-y-1 focus:shadow-[0_8px_20px_rgba(212,175,55,0.15)] transition-all duration-300 shadow-sm placeholder:text-[#CDB591]" required autoFocus />
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

        <div className="fixed bottom-3 left-4 z-50 text-[10px] font-montserrat font-bold tracking-[0.2em] uppercase text-[#8B6E4E] opacity-40 hover:opacity-100 transition-opacity duration-500 cursor-default">
           v1.4 "Veloce"
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
        @keyframes polaroidDrop { 0% { opacity: 0; transform: translateY(-20px) rotate(-10deg) scale(1.2); } 100% { opacity: 1; transform: translateY(0) rotate(-2deg) scale(1); } }
        
        @keyframes envelopeFly { 0% { transform: translateY(0) scale(1) rotate(0deg); } 20% { transform: translateY(30px) scale(0.95) rotate(-2deg); } 100% { transform: translateY(-150vh) scale(0.4) rotate(12deg); opacity: 0; } }
        @keyframes letterDrop { 0% { transform: translateY(-300px) rotate(3deg); opacity: 0; filter: blur(4px); } 10% { opacity: 1; filter: blur(0px); } 80% { transform: translateY(24px) rotate(-1deg); } 100% { transform: translateY(16px) rotate(0deg); opacity: 1; } }
        @keyframes flapClose { 0% { transform: rotateX(180deg); z-index: 5; } 49% { z-index: 5; } 50% { z-index: 30; } 100% { transform: rotateX(0deg); z-index: 30; } }
        @keyframes sealPop { 0% { transform: scale(4); opacity: 0; filter: blur(6px); } 60% { transform: scale(0.85); opacity: 1; filter: blur(0px); } 100% { transform: scale(1); opacity: 1; filter: blur(0px); } }
        
        @keyframes turnToAsh { 0% { filter: brightness(1); transform: scale(1) translateY(0); } 30% { filter: brightness(0.6) sepia(1) hue-rotate(-20deg) saturate(3); background-color: #2C241B; border-color: #902A2A; transform: scale(0.95) translateY(-5px); } 70% { filter: brightness(0.1) blur(2px); background-color: #000; opacity: 1; transform: scale(0.8) translateY(-30px); } 100% { filter: brightness(0) blur(10px); opacity: 0; transform: scale(0.5) translateY(-80px); } }
        @keyframes fireRise { 0% { transform: translateY(80px) scale(0.5); opacity: 0; } 20% { transform: translateY(20px) scale(1.2); opacity: 1; } 70% { transform: translateY(-40px) scale(1.5); opacity: 1; } 100% { transform: translateY(-120px) scale(0.8); opacity: 0; } }
        @keyframes fireGlow { 0% { opacity: 0; } 30% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes emberFly1 { 0% { transform: translate(0, 0) scale(0); opacity: 0; } 20% { opacity: 1; transform: translate(-10px, -20px) scale(1); } 100% { transform: translate(-30px, -150px) scale(0); opacity: 0; } }
        @keyframes emberFly2 { 0% { transform: translate(0, 0) scale(0); opacity: 0; } 20% { opacity: 1; transform: translate(5px, -15px) scale(1); } 100% { transform: translate(20px, -180px) scale(0); opacity: 0; } }
        @keyframes emberFly3 { 0% { transform: translate(0, 0) scale(0); opacity: 0; } 20% { opacity: 1; transform: translate(15px, -25px) scale(1); } 100% { transform: translate(40px, -140px) scale(0); opacity: 0; } }
        @keyframes emberFly4 { 0% { transform: translate(0, 0) scale(0); opacity: 0; } 20% { opacity: 1; transform: translate(-5px, -10px) scale(1); } 100% { transform: translate(-15px, -160px) scale(0); opacity: 0; } }

        .rich-text-content b { font-weight: 700; color: #1A1510; }
        .rich-text-content i { font-style: italic; font-family: 'Cormorant Garamond', serif; }
        .rich-text-content u { text-decoration: underline; text-underline-offset: 4px; decoration-thickness: 1px; }
        .rich-text-content p, .rich-text-content div { margin: 0; padding: 0; }

        .drop-cap::first-letter {
          font-family: 'Cormorant Garamond', serif;
          font-size: 4.5rem;
          font-weight: 700;
          color: #D4AF37;
          float: left;
          line-height: 0.8;
          margin-right: 0.8rem;
          margin-top: 0.2rem;
          text-shadow: 1px 2px 4px rgba(0,0,0,0.1);
        }

        ${sendState === 'animating_diary' ? generateDynamicKeyframes(animationConfig.lines, animationConfig.duration, animationConfig.lastLineChars) : ''}
      `}</style>

      {/* Sfondo Animato Etereo - OTTIMIZZATO PER MOBILE */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[#D4AF37]/20 rounded-full blur-[100px] md:animate-[orbDrift_25s_ease-in-out_infinite_alternate] will-change-transform"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[#902A2A]/10 rounded-full blur-[120px] md:animate-[orbDrift_30s_ease-in-out_infinite_alternate-reverse] will-change-transform"></div>
         <div className="absolute top-[40%] left-[60%] w-[40vw] h-[40vw] bg-[#8B6E4E]/15 rounded-full blur-[100px] md:animate-[orbDrift_20s_ease-in-out_infinite_alternate] will-change-transform"></div>
      </div>

      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
         {dustParticles.map((p, index) => (
           <div key={p.id} className={`absolute bottom-[-5%] bg-[#D4AF37] rounded-full blur-[1.5px] will-change-transform ${index > 15 ? 'hidden md:block' : ''}`} style={{ left: p.left, width: p.width, height: p.width, '--max-opacity': p.opacity, '--x-sway': p.xSway, animation: `floatUpParticle ${p.duration} ease-in-out ${p.delay} infinite` } as any} />
         ))}
      </div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>

      <header className="pt-16 pb-8 px-6 border-b border-[#E8DAC2]/50 relative z-10 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center relative">
          
          <div className="absolute top-0 right-4 flex items-center gap-3">
            <span className="text-xs font-semibold text-[#8B6E4E] hidden sm:inline tracking-wider uppercase truncate max-w-[120px] md:max-w-[200px] cursor-help hover:text-[#1A1510] transition-colors duration-300" title={user.displayName || "Studente"}>Bentornato, {user.displayName || "Studente"}</span>
            <button onClick={handleLogout} className="w-10 h-10 rounded-full bg-white/95 md:bg-white/60 backdrop-blur-none md:backdrop-blur-md border border-[#E8DAC2] flex items-center justify-center text-[#8B6E4E] hover:bg-[#FDF2F2] hover:text-[#902A2A] hover:border-[#902A2A]/30 hover:scale-110 hover:-translate-y-0.5 active:scale-95 transition-all duration-300 shadow-sm hover:shadow-md" title="Esci dall'Archivio">
              <LogOut size={16} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="relative w-20 h-20 mb-6 flex items-center justify-center group cursor-pointer" onDoubleClick={() => setShowAdminModal(true)} title="Zibaldone">
             <div className="absolute inset-0 border border-[#D4AF37]/30 rounded-full animate-[spin_20s_linear_infinite] group-hover:border-[#D4AF37] group-hover:scale-105 transition-all duration-700"></div>
             <div className="absolute inset-2 border border-[#D4AF37]/20 rounded-full animate-[spin_15s_linear_infinite_reverse] group-hover:scale-95 transition-all duration-700"></div>
             <Feather className="w-8 h-8 text-[#8B6E4E] drop-shadow-md group-hover:scale-110 group-hover:text-[#D4AF37] transition-all duration-500" strokeWidth={1.5} />
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-cormorant font-bold text-[#1A1510] tracking-wide mb-4 relative flex items-center justify-center gap-4">
            Lo Zibaldone
            {isAdmin && (
              <button onClick={() => { setIsAdmin(false); setActiveTab("write"); setIsSelectionMode(false); setSelectedIds([]); }} className="opacity-60 hover:opacity-100 hover:scale-110 active:scale-95 hover:rotate-12 transition-all duration-300 absolute -right-12" title="Chiudi Archivio Redazione">
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

      {/* NAVBAR OTTIMIZZATA MOBILE */}
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
                {displayedThoughts.map((thought: any, index: number) => {
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
                            <div className="absolute w-24 h-24 bg-[#D45A27] rounded-tl-full rounded-br-full rounded-bl-full -rotate-45 -translate-x-8 translate-y-2"></div>
                            <div className="absolute w-28 h-28 bg-[#D45A27] rounded-tl-full rounded-br-full rounded-bl-full -rotate-45 translate-x-6 translate-y-6"></div>
                            <div className="absolute w-16 h-16 bg-[#E8B252] rounded-tl-full rounded-br-full rounded-bl-full -rotate-45 -translate-x-2 translate-y-2 shadow-[0_0_20px_#E8B252]"></div>
                         </div>
                         <div className="absolute w-full h-full overflow-visible">
                            <div className="absolute bottom-10 left-1/4 w-3 h-3 bg-[#D45A27] rounded-full animate-[emberFly1_0.8s_ease-out_0.1s_forwards]"></div>
                            <div className="absolute bottom-8 left-1/2 w-2 h-2 bg-[#E8DAC2] rounded-full animate-[emberFly2_0.9s_ease-out_0.2s_forwards]"></div>
                            <div className="absolute bottom-12 right-1/4 w-4 h-4 bg-[#902A2A] rounded-full animate-[emberFly3_1s_ease-out_0.15s_forwards]"></div>
                            <div className="absolute bottom-4 right-1/3 w-2 h-2 bg-[#E8B252] rounded-full animate-[emberFly4_0.95s_ease-out_0.25s_forwards]"></div>
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
                      <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold text-[#8B6E4E] uppercase tracking-widest mb-3"><span className="truncate max-w-[140px] bg-[#F4EFE6] px-2.5 py-1 rounded-sm cursor-help hover:bg-[#E8DAC2] hover:text-[#1A1510] transition-colors duration-300 shadow-sm" title={thought.author}>DI {thought.author}</span><span className="w-1 h-1 rounded-full bg-[#D4AF37] shrink-0"></span><span className="shrink-0 opacity-80">{formatDate(thought.timestamp)}</span></div>
                      <h2 className="text-2xl font-cormorant font-bold text-[#1A1510] leading-snug break-words line-clamp-2 group-hover:text-[#8B6E4E] transition-colors duration-300">{thought.title}</h2>
                    </header>
                    <div className="flex-grow relative z-10 pl-4"><div className="text-[#3A3228] leading-relaxed whitespace-pre-wrap font-cormorant font-medium text-lg line-clamp-4 break-words rich-text-content" dangerouslySetInnerHTML={{ __html: thought.content }} /></div>
                    
                    {thought.imageUrl && (
                       <div className="mt-5 pl-4 flex items-center gap-2 text-xs text-[#D4AF37] font-semibold tracking-wider uppercase opacity-80 group-hover:opacity-100 transition-opacity duration-300">
                         <ImageIcon className="w-4 h-4" /> Contiene Immagine
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

        {/* EDITOR SCRITTURA OTTIMIZZATO */}
        {activeTab === "write" && (
          <div className="max-w-3xl mx-auto transition-all duration-700 animate-in fade-in slide-in-from-bottom-12 zoom-in-95">
            <div className="text-center mb-10"><p className="text-[#6B5A46] italic font-cormorant text-xl opacity-80 hover:opacity-100 transition-opacity duration-500">"La penna svela ciò che il pensiero nasconde."</p></div>
            <div className="bg-white/95 md:bg-white/80 backdrop-blur-none md:backdrop-blur-xl p-8 md:p-12 rounded-[2rem] shadow-[0_20px_50px_rgba(26,21,16,0.06)] border border-[#E8DAC2]/80 relative overflow-hidden transition-all duration-500 hover:shadow-[0_25px_60px_rgba(26,21,16,0.1)]">
              <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#E8DAC2]/40 rounded-bl-[4rem] opacity-60 pointer-events-none"></div>

              <h2 className="text-3xl font-cormorant font-bold text-[#1A1510] mb-8 text-center relative z-10 drop-shadow-sm">Intingi la Penna</h2>
              <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                <div className="space-y-2 group">
                  <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 block group-focus-within:text-[#D4AF37] group-focus-within:-translate-y-0.5 transition-all duration-300">Il Titolo del tuo Pensiero</label>
                  <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Es: L'infinito" className="w-full bg-white/95 md:bg-white/60 border border-[#E8DAC2] rounded-2xl px-5 py-4 text-[#1A1510] font-cormorant font-bold text-xl placeholder:text-[#CDB591] placeholder:font-sans placeholder:font-normal placeholder:text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:-translate-y-1 focus:shadow-[0_10px_30px_rgba(212,175,55,0.15)] transition-all duration-500 shadow-inner" required />
                </div>
                
                <div className="space-y-2 group">
                  <label className="text-[10px] font-bold text-[#8B6E4E] uppercase tracking-wider pl-2 block group-focus-within:text-[#D4AF37] group-focus-within:-translate-y-0.5 transition-all duration-300">Il tuo scritto</label>
                  <div className="w-full border border-[#E8DAC2] rounded-[15px] bg-white/95 md:bg-white/60 focus-within:ring-2 focus-within:ring-[#D4AF37]/50 focus-within:-translate-y-1 focus-within:shadow-[0_15px_40px_rgba(212,175,55,0.15)] transition-all duration-500 flex flex-col shadow-inner isolate relative">
                    
                    <div className="flex items-center gap-3 p-3 border-b border-[#E8DAC2] bg-[#FDFBF7]/95 md:bg-[#FDFBF7]/80 backdrop-blur-none md:backdrop-blur-md flex-wrap animate-in slide-in-from-top-4 duration-500 rounded-t-[15px]">
                      <div className="flex bg-[#F4EFE6] rounded-lg p-1 border border-[#E8DAC2]/50 shadow-sm">
                        <button type="button" onClick={() => formatText('bold')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5 transition-all duration-300" title="Grassetto"><Bold size={16}/></button>
                        <button type="button" onClick={() => formatText('italic')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5 transition-all duration-300" title="Corsivo"><Italic size={16}/></button>
                        <button type="button" onClick={() => formatText('underline')} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white hover:shadow-sm text-[#4A4036] hover:scale-110 active:scale-90 hover:-translate-y-0.5 transition-all duration-300" title="Sottolineato"><Underline size={16}/></button>
                      </div>
                      
                      <div className="w-[1px] h-6 bg-[#D4AF37]/30 mx-1"></div>
                      
                      <div className="flex gap-2 bg-[#F4EFE6] rounded-lg p-1.5 border border-[#E8DAC2]/50 shadow-sm">
                        <button type="button" onClick={() => formatText('foreColor', '#1A1510')} className="w-6 h-6 rounded-full bg-[#1A1510] border-2 border-white shadow-sm ring-1 ring-black/10 hover:scale-125 active:scale-90 hover:-translate-y-1 transition-all duration-300" title="Inchiostro Nero"></button>
                        <button type="button" onClick={() => formatText('foreColor', '#902A2A')} className="w-6 h-6 rounded-full bg-[#902A2A] border-2 border-white shadow-sm ring-1 ring-black/10 hover:scale-125 active:scale-90 hover:-translate-y-1 transition-all duration-300" title="Inchiostro Rosso Sangue"></button>
                        <button type="button" onClick={() => formatText('foreColor', '#2A5290')} className="w-6 h-6 rounded-full bg-[#2A5290] border-2 border-white shadow-sm ring-1 ring-black/10 hover:scale-125 active:scale-90 hover:-translate-y-1 transition-all duration-300" title="Inchiostro Blu"></button>
                        <button type="button" onClick={() => formatText('foreColor', '#8B6E4E')} className="w-6 h-6 rounded-full bg-[#8B6E4E] border-2 border-white shadow-sm ring-1 ring-black/10 hover:scale-125 active:scale-90 hover:-translate-y-1 transition-all duration-300" title="Inchiostro Seppia"></button>
                      </div>

                      <div className="w-[1px] h-6 bg-transparent mx-auto flex-grow"></div>
                      
                      <label className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#C59B27] hover:shadow-[0_6px_15px_rgba(212,175,55,0.4)] text-[#1A1510] text-[11px] font-bold tracking-wider uppercase rounded-lg cursor-pointer hover:-translate-y-0.5 active:scale-95 transition-all duration-300 shadow-sm" title="Allega Fotografia">
                        <ImageIcon size={14} className="group-hover:scale-110 transition-transform" /> <span className="hidden sm:inline">Aggiungi Foto</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </div>

                    <div 
                      ref={editorRef}
                      className="p-6 min-h-[280px] outline-none text-[#1A1510] font-cormorant font-medium text-xl rich-text-content custom-scrollbar transition-all duration-500 rounded-b-[15px] z-10"
                      contentEditable={true}
                      onInput={(e) => setNewContent(e.currentTarget.innerHTML)}
                      placeholder="Traccia qui le tue parole..."
                      style={{ 
                        emptyCells: "show", 
                        backgroundImage: 'linear-gradient(transparent 31px, rgba(212,175,55,0.25) 32px)', 
                        backgroundSize: '100% 32px', 
                        lineHeight: '32px',
                        backgroundOrigin: 'content-box',
                        backgroundAttachment: 'local'
                      }}
                    />
                    
                    {attachedImage && (
                      <div className="p-6 bg-[#F4EFE6]/95 md:bg-[#F4EFE6]/50 border-t border-[#E8DAC2]/50 relative flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 rounded-b-[15px] z-20">
                        <div className="relative inline-block bg-white p-3 pb-8 shadow-[0_10px_20px_rgba(0,0,0,0.1)] border border-[#E8DAC2] rotate-2 transition-all hover:rotate-0 hover:scale-105 hover:-translate-y-2 duration-500 hover:shadow-[0_20px_40px_rgba(0,0,0,0.15)] group/polaroid">
                           <img src={attachedImage} alt="Attachment" className="max-h-56 object-cover border border-[#F0EBE1] transition-transform duration-700" />
                           <button type="button" onClick={() => setAttachedImage(null)} className="absolute -top-3 -right-3 bg-white rounded-full shadow-md text-[#902A2A] hover:scale-125 active:scale-90 hover:rotate-90 transition-all duration-300"><XCircle size={26} fill="#fff" /></button>
                           <div className="absolute top-[-10px] left-1/2 transform -translate-x-1/2 w-16 h-5 bg-[#E8DAC2]/80 backdrop-blur-sm shadow-sm rotate-[-4deg] group-hover/polaroid:rotate-0 transition-transform duration-500"></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting || (!newContent.trim() && !attachedImage)} className="w-full bg-gradient-to-r from-[#1A1510] to-[#2C241B] text-[#FDFBF7] py-4 rounded-2xl font-semibold text-sm transition-all duration-500 hover:shadow-[0_15px_35px_rgba(26,21,16,0.4)] hover:-translate-y-1.5 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mt-8 border border-[#3A3228] group">
                  {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" /><span className="animate-pulse">Sigillo in corso...</span></> : <><Send className="w-5 h-5 text-[#D4AF37] group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500" />Affida la lettera all'Archivio</>}
                </button>
              </form>
            </div>
          </div>
        )}

        {isSelectionMode && selectedIds.length > 0 && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-none md:backdrop-blur-xl text-[#1A1510] px-6 py-4 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.15)] z-50 flex items-center gap-6 animate-in slide-in-from-bottom-10 duration-500 border border-[#E8DAC2]">
                <span className="font-bold text-sm flex items-center gap-2 tracking-wide"><CheckCircle2 className="w-5 h-5 text-[#D4AF37] drop-shadow-sm animate-pulse"/> {selectedIds.length} Pagine</span>
                <div className="w-[1px] h-6 bg-[#E8DAC2]"></div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedIds([])} className="text-[#8B6E4E] text-xs font-bold uppercase tracking-wider hover:text-[#1A1510] active:scale-95 hover:-translate-y-0.5 transition-all duration-300 px-3 py-2">Annulla</button>
                    <button onClick={() => setShowMultiDeleteModal(true)} className="bg-gradient-to-r from-[#902A2A] to-[#7A1A1A] px-5 py-2.5 rounded-full text-white text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 hover:scale-105 active:scale-95 hover:-translate-y-1 shadow-[0_8px_20px_rgba(144,42,42,0.4)] group"><Trash2 className="w-4 h-4 group-hover:-rotate-12 transition-transform"/> Brucia</button>
                </div>
            </div>
        )}

        {selectedThought && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6" onClick={() => setSelectedThought(null)} style={{ perspective: "1500px" }}>
            <div className="absolute inset-0 bg-[#150F0A]/80 md:bg-[#150F0A]/70 backdrop-blur-none md:backdrop-blur-md" style={{ animation: "fadeInOverlay 0.5s ease-out forwards" }}></div>
            <div className="bg-[#FDFBF7] md:bg-[#FDFBF7]/95 w-full max-w-3xl max-h-[88vh] rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative z-10 flex flex-col overflow-hidden border border-[#E8DAC2] transition-transform duration-500" onClick={(e: any) => e.stopPropagation()} style={{ animation: "paperFloat 0.6s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards" }}>
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#E8DAC2]/30 rounded-bl-[6rem] opacity-80 pointer-events-none z-0"></div>
              
              {/* Novità: Intestazione responsiva per evitare accavallamenti su Mobile (flex-col-reverse su mobile) */}
              <div className="flex flex-col-reverse md:flex-row justify-between items-start gap-4 md:gap-0 p-5 md:p-10 border-b border-[#E8DAC2]/50 sticky top-0 bg-[#FDFBF7] md:bg-[#FDFBF7]/95 backdrop-blur-none md:backdrop-blur-xl z-20 shadow-sm transition-all duration-500 w-full">
                <div className="flex-1 min-w-0 w-full md:pr-4">
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 text-[10px] font-bold text-[#8B6E4E] uppercase tracking-widest mb-3 md:mb-4">
                    <span className="bg-gradient-to-r from-[#D4AF37] to-[#C59B27] text-[#1A1510] px-3 py-1.5 rounded-md truncate max-w-[200px] shadow-sm cursor-help hover:shadow-md hover:-translate-y-0.5 transition-all duration-300" title={selectedThought.author}>FIRMA: {selectedThought.author}</span>
                    <span className="bg-[#F4EFE6] px-3 py-1.5 rounded-md shrink-0 border border-[#E8DAC2] shadow-sm">{formatDate(selectedThought.timestamp)}</span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-cormorant font-bold text-[#1A1510] break-words leading-tight drop-shadow-sm">{selectedThought.title}</h2>
                </div>
                
                {/* Bottoni ancorati a destra su mobile */}
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
                
                <div className={`text-[#3A3228] leading-relaxed whitespace-pre-wrap font-cormorant font-medium text-2xl break-words rich-text-content ${!selectedThought.content.startsWith('<') ? 'drop-cap' : ''}`} dangerouslySetInnerHTML={{ __html: selectedThought.content }} />
                
                {selectedThought.imageUrl && (
                  <div className="mt-16 flex justify-center pb-10">
                     <div className="bg-white p-4 pb-14 shadow-[0_15px_35px_rgba(0,0,0,0.15)] border border-[#E8DAC2] rotate-1 relative max-w-md transition-all duration-700 hover:rotate-0 hover:scale-105 hover:-translate-y-2 hover:shadow-[0_30px_60px_rgba(0,0,0,0.2)] group/readimg" style={{ animation: "polaroidDrop 1s cubic-bezier(0.2, 0.8, 0.2, 1) both" }}>
                        <img src={selectedThought.imageUrl} alt="Polaroid allegata" className="w-full h-auto max-h-[400px] object-cover border border-[#F0EBE1]" />
                        <div className="absolute top-[-18px] left-1/2 transform -translate-x-1/2 w-20 h-7 bg-[#E8DAC2]/95 md:bg-[#E8DAC2]/90 backdrop-blur-none md:backdrop-blur-md shadow-sm rotate-[-3deg] group-hover/readimg:rotate-0 transition-transform duration-500"></div>
                        <div className="absolute bottom-4 left-0 right-0 text-center font-cormorant text-[#8B6E4E] italic opacity-60 group-hover/readimg:opacity-100 transition-opacity duration-300">Allegato Fotografico</div>
                     </div>
                  </div>
                )}

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
        
        {showMultiDeleteModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setShowMultiDeleteModal(false)}>
            <div className="absolute inset-0 bg-[#150F0A]/80 md:bg-[#150F0A]/70 backdrop-blur-none md:backdrop-blur-md" style={{ animation: "fadeInOverlay 0.3s ease-out forwards" }}></div>
            <div className="bg-white/95 md:bg-white/95 backdrop-blur-none md:backdrop-blur-xl p-10 rounded-[2rem] shadow-[0_40px_80px_rgba(0,0,0,0.4)] relative z-10 w-full max-w-sm border border-[#902A2A]/20 text-center" onClick={(e) => e.stopPropagation()} style={{ animation: "paperFloat 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards" }}>
              <div className="w-16 h-16 bg-gradient-to-br from-[#FDF2F2] to-[#FAD4D4] rounded-full flex items-center justify-center mx-auto mb-6 border border-[#902A2A]/30 shadow-inner group hover:scale-110 hover:-translate-y-1 transition-all duration-500">
                <Trash2 className="w-8 h-8 text-[#902A2A] drop-shadow-sm group-hover:-rotate-12 transition-transform duration-500" />
              </div>
              <h3 className="text-3xl font-cormorant font-bold text-[#1A1510] mb-3">Bruciare {selectedIds.length} Pagine?</h3>
              <p className="text-[#6B5A46] text-sm mb-8 leading-relaxed font-medium">Stai per ridurre in cenere <b>{selectedIds.length}</b> scritti. Le fiamme non perdonano.</p>
              <div className="flex gap-4">
                <button onClick={() => setShowMultiDeleteModal(false)} className="flex-1 py-3.5 rounded-2xl text-[#8B6E4E] font-bold text-xs uppercase tracking-wider border border-[#E8DAC2] hover:bg-[#F4EFE6] hover:-translate-y-1 active:scale-95 transition-all duration-300">Annulla</button>
                <button onClick={confirmMultiDelete} className="flex-1 py-3.5 rounded-2xl text-white bg-gradient-to-r from-[#902A2A] to-[#7A1A1A] font-bold text-xs uppercase tracking-wider shadow-[0_5px_15px_rgba(144,42,42,0.3)] hover:-translate-y-1 hover:shadow-[0_10px_25px_rgba(144,42,42,0.5)] active:scale-95 transition-all duration-300">Sì, Bruciale</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {sendState !== 'idle' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden perspective-[1500px]">
          
          <div className="absolute inset-0 transition-all" style={{ animation: "bgCinematicBlur 1s ease-out both" }}></div>

          {sendState === 'thankyou' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[#FDFBF7] px-6 text-center z-10" style={{ animation: "textRevealUp 1.2s cubic-bezier(0.2, 0.8, 0.2, 1) both" }}>
              <div className="w-28 h-28 bg-gradient-to-br from-[#D4AF37]/20 to-transparent rounded-full flex items-center justify-center mb-8 border border-[#D4AF37]/40 shadow-[0_0_50px_rgba(212,175,55,0.2)] backdrop-blur-md group hover:scale-110 transition-transform duration-700">
                <Feather className="w-14 h-14 text-[#D4AF37] drop-shadow-md group-hover:-rotate-12 transition-transform duration-500" strokeWidth={1.5} />
              </div>
              <h2 className="text-5xl md:text-7xl font-cormorant font-bold mb-6 drop-shadow-lg text-white">Affidata all'Archivio</h2>
              <div className="w-20 h-[2px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent mx-auto mb-8"></div>
              <p className="text-xl md:text-2xl text-[#E8DAC2] font-cormorant font-light italic max-w-lg mb-12 drop-shadow-md">La tua scrittura è stata sigillata e riposa al sicuro nelle pagine dello Zibaldone.</p>
              <button onClick={resetWritingForm} className="px-10 py-4 rounded-full bg-gradient-to-r from-[#DFCCB0] to-[#CDB591] text-[#1A1510] font-bold text-sm tracking-[0.2em] uppercase hover:shadow-[0_15px_40px_rgba(223,204,176,0.4)] hover:-translate-y-1.5 active:scale-95 transition-all duration-300 border border-[#E8DAC2]/50 flex items-center gap-3 group"><PenTool className="w-5 h-5 group-hover:-rotate-12 transition-transform duration-300" />Scrivi un'altra pagina</button>
            </div>
          )}

          {sendState === 'animating_envelope' && (
            <div className="relative w-[340px] h-[240px] z-20" style={{ animation: "envelopeFly 1.5s ease-in-out 4.5s both" }}>
               <div className="absolute inset-0 rounded-lg shadow-[0_30px_60px_rgba(0,0,0,0.5)] z-0 overflow-hidden" style={{ background: 'linear-gradient(135deg, #D4C3A3 0%, #B49F76 100%)' }}>
                   <div className="absolute inset-0 opacity-20 mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div>
               </div>
               
               <div className="absolute left-[20px] right-[20px] h-[200px] bg-[#FDFBF7] p-6 border border-[#E8DAC2] z-10 overflow-hidden shadow-[inset_0_2px_15px_rgba(0,0,0,0.05)]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")', animation: "letterDrop 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.5s both" }}>
                  <div className="absolute top-0 bottom-0 left-6 w-[2px] bg-gradient-to-b from-transparent via-[#902A2A]/40 to-transparent"></div>
                  <div className="pl-6 pt-1">
                    <h4 className="font-cormorant font-bold text-[#1A1510] text-[20px] leading-tight line-clamp-1 mb-1">{newTitle || "Senza Titolo"}</h4>
                    <p className="text-[9px] text-[#8B6E4E] uppercase font-bold tracking-widest leading-none mb-3">di {user?.displayName || "Anonimo"}</p>
                    <div className="text-[14px] text-[#4A4036] font-cormorant font-medium leading-relaxed line-clamp-3 rich-text-content" dangerouslySetInnerHTML={{ __html: newContent }} />
                  </div>
               </div>
               
               <div className="absolute inset-y-0 left-0 w-[51%] z-20" style={{ clipPath: 'polygon(0 0, 100% 50%, 0 100%)', background: 'linear-gradient(to right, #DFCCB0, #B49F76)' }}><div className="absolute inset-0 opacity-20 mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div></div>
               <div className="absolute inset-y-0 right-0 w-[51%] z-20" style={{ clipPath: 'polygon(100% 0, 0 50%, 100% 100%)', background: 'linear-gradient(to left, #DFCCB0, #9C855C)' }}><div className="absolute inset-0 opacity-20 mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div></div>
               <div className="absolute bottom-0 inset-x-0 h-[65%] z-20 shadow-[0_-10px_25px_rgba(0,0,0,0.2)]" style={{ clipPath: 'polygon(0 100%, 50% 0, 100% 100%)', background: 'linear-gradient(to top, #E8DAC2, #B49F76)' }}><div className="absolute inset-0 opacity-20 mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div></div>
               
               <div className="absolute top-0 inset-x-0 h-[65%] origin-top" style={{ animation: "flapClose 0.8s cubic-bezier(0.4, 0, 0.2, 1) 2.2s both" }}>
                  <div className="w-full h-full border-b border-white/40 shadow-2xl relative overflow-hidden" style={{ clipPath: 'polygon(0 0, 50% 100%, 100% 0)', background: 'linear-gradient(to bottom, #E8DAC2, #A89269)' }}><div className="absolute inset-0 opacity-20 mix-blend-multiply" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")' }}></div></div>
               </div>
               
               <div className="absolute top-[50%] left-1/2 -ml-10 -mt-10 w-20 h-20 z-40 flex items-center justify-center" style={{ animation: "sealPop 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) 3.0s both" }}>
                  <div className="w-full h-full bg-gradient-to-br from-[#D43B3B] via-[#902A2A] to-[#4A0D0D] rounded-full flex items-center justify-center relative shadow-[0_10px_20px_rgba(0,0,0,0.5),inset_0_4px_8px_rgba(255,100,100,0.4),inset_0_-4px_8px_rgba(0,0,0,0.6)] border border-[#300505]">
                     <div className="absolute inset-[5px] border border-[#FAD4D4]/30 rounded-full shadow-[inset_0_1px_3px_rgba(0,0,0,0.4)]"></div>
                     <Feather className="w-8 h-8 text-[#F4EFE6] drop-shadow-md opacity-90" strokeWidth={2} />
                  </div>
               </div>
            </div>
          )}

          {sendState === 'animating_diary' && (
            <div className="relative w-[300px] h-[400px] z-20" style={{ animation: `diaryRiseFall ${4.5 + animationConfig.duration}s cubic-bezier(0.4, 0, 0.2, 1) both`, transformStyle: "preserve-3d" }}>
              <div className="absolute inset-0 bg-gradient-to-r from-[#201710] to-[#2C241B] rounded-r-xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] border-l-[12px] border-[#150F0A]"></div>
              <div className="absolute inset-y-1.5 right-1.5 left-3 bg-[#D4C3A3] rounded-r-lg shadow-inner"></div>
              
              <div className="absolute inset-y-3 right-3 left-3 bg-[#FDFBF7] rounded-r-md p-7 shadow-[inset_10px_0_20px_rgba(0,0,0,0.05)]" style={{ backgroundImage: 'linear-gradient(transparent 25px, rgba(212,175,55,0.15) 26px), url("https://www.transparenttextures.com/patterns/cream-paper.png")', backgroundSize: '100% 26px, auto' }}>
                <div className="absolute top-0 bottom-0 left-6 w-[2px] bg-gradient-to-b from-transparent via-[#D4AF37]/30 to-transparent"></div>
                
                <div className="pb-1 pl-4 border-b border-[#E8DAC2]/50" style={{ animation: 'textRevealUp 1s ease-out 1.5s both' }}>
                  <h4 className="font-cormorant font-bold text-[#1A1510] text-[20px] leading-tight line-clamp-1">{newTitle || "Senza Titolo"}</h4>
                  <p className="text-[9px] text-[#8B6E4E] uppercase tracking-[0.2em] font-bold mt-1">di {user?.displayName || "Anonimo"}</p>
                </div>

                <div className="relative mt-2 pl-4 w-[240px]">
                  <div className="text-[15px] text-[#2C241B] font-cormorant font-medium leading-[26px] break-words whitespace-pre-wrap text-left rich-text-content" style={{ animation: `dynamicTextReveal ${animationConfig.duration}s linear 1.6s both` }} dangerouslySetInnerHTML={{ __html: newContent }} />

                  <div className="absolute top-0 left-0 pointer-events-none z-50" style={{ animation: `dynamicPenWrite ${animationConfig.duration}s linear 1.6s both` }}>
                    <div style={{ animation: `penFadeInOut ${animationConfig.duration + 1}s ease-in-out 1.6s both` }}>
                      <div style={{ transform: 'translate(-50px, -92px) rotate(25deg) scale(1.4)', transformOrigin: '50px 92px' }}>
                         <FountainPenNib />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 origin-left z-30" style={{ animation: `diaryCoverFlip ${4.5 + animationConfig.duration}s cubic-bezier(0.4, 0, 0.2, 1) both`, transformStyle: "preserve-3d" }}>
                <div className="absolute inset-0 bg-gradient-to-br from-[#2C241B] to-[#150F0A] rounded-r-xl border-l-[12px] border-[#0A0806] flex items-center justify-center shadow-2xl overflow-hidden" style={{ backfaceVisibility: "hidden" }}>
                  <div className="absolute inset-4 border border-[#D4AF37]/30 rounded-lg pointer-events-none"></div>
                  <div className="absolute inset-5 border border-[#D4AF37]/10 rounded-md pointer-events-none"></div>
                  <div className="border border-[#D4AF37]/80 bg-[#0A0806]/40 backdrop-blur-md px-8 py-10 rounded-sm shadow-inner">
                     <span className="text-[#D4AF37] font-cormorant font-bold uppercase tracking-[0.3em] text-lg drop-shadow-md">Zibaldone</span>
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-[#DFCCB0] to-[#CDB591] rounded-l-xl shadow-[inset_-15px_0_30px_rgba(0,0,0,0.2)]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cream-paper.png")', backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                 <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#1A1510]/30 to-transparent rounded-r-xl"></div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
