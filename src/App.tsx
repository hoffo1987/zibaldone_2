import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
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
  ArrowDownWideNarrow,
  Lock,
  Unlock,
  KeyRound,
  Trash2,
  ChevronDown,
} from "lucide-react";

// I TUOI DATI FIREBASE GIA' INSERITI
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

export default function ZibaldoneApp() {
  const [user, setUser] = useState<any>(null);
  const [thoughts, setThoughts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("write");
  const [sortBy, setSortBy] = useState("newest");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Stati per il form
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<any>(null);
  const [selectedThought, setSelectedThought] = useState<any>(null);

  // Stati per la finestra di Login personalizzata
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState(false);

  // Stato per gestire l'eliminazione
  const [thoughtToDelete, setThoughtToDelete] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Stato per la super animazione di invio rallentata e raffinata
  const [sendState, setSendState] = useState<
    "idle" | "folding" | "flying" | "thankyou"
  >("idle");

  useEffect(() => {
    if (
      selectedThought ||
      showAdminModal ||
      thoughtToDelete ||
      sendState !== "idle"
    ) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedThought, showAdminModal, thoughtToDelete, sendState]);

  useEffect(() => {
    const authenticate = async () => {
      if (!isConfigured) return;
      try {
        await signInAnonymously(auth);
        setUser(auth.currentUser);
      } catch (error) {
        console.error("Errore di autenticazione:", error);
      }
    };
    authenticate();
  }, []);

  useEffect(() => {
    if (!user || !db || !isConfigured || !isAdmin) return;

    setLoading(true);
    const thoughtsRef = collection(db, "pensieri");

    const unsubscribe = onSnapshot(
      thoughtsRef,
      (snapshot: any) => {
        const fetchedThoughts: any[] = [];
        snapshot.forEach((doc: any) => {
          fetchedThoughts.push({ id: doc.id, ...doc.data() });
        });
        setThoughts(fetchedThoughts);
        setLoading(false);
      },
      (error: any) => {
        console.error("Errore nel caricamento:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAdmin]);

  const handleAdminClick = () => {
    if (isAdmin) {
      setIsAdmin(false);
      setActiveTab("write");
      setThoughts([]);
    } else {
      setShowAdminModal(true);
      setAdminPassword("");
      setAdminError(false);
    }
  };

  const handleAdminLogin = (e: any) => {
    e.preventDefault();
    if (adminPassword.toLowerCase() === "infinito") {
      setIsAdmin(true);
      setActiveTab("read");
      setShowAdminModal(false);
      setAdminPassword("");
    } else {
      setAdminError(true);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user || !newContent.trim()) return;

    setIsSubmitting(true);
    try {
      const thoughtsRef = collection(db, "pensieri");
      await addDoc(thoughtsRef, {
        title: newTitle.trim() || "Senza Titolo",
        author: newAuthor.trim() || "Anonimo",
        content: newContent.trim(),
        timestamp: Date.now(),
        userId: user.uid,
        isStarred: false,
      });

      setIsSubmitting(false);

      // Avvia la fantastica animazione rallentata (tempi aumentati per maggiore solennità)
      setSendState("folding");

      setTimeout(() => {
        setSendState("flying"); // La lettera vola via
      }, 3600);

      setTimeout(() => {
        setSendState("thankyou"); // Mostra il messaggio elegante e il tasto per tornare
      }, 4800);
    } catch (error) {
      setIsSubmitting(false);
      setMessage({
        type: "error",
        text: "Impossibile salvare il pensiero. Riprova.",
      });
    }
  };

  const resetWritingForm = () => {
    setSendState("idle");
    setNewTitle("");
    setNewAuthor("");
    setNewContent("");
  };

  const toggleStar = async (thoughtId: string, currentStatus: boolean) => {
    if (!user || !db || !isAdmin) return;
    try {
      const thoughtDocRef = doc(db, "pensieri", thoughtId);
      await updateDoc(thoughtDocRef, {
        isStarred: !currentStatus,
      });
    } catch (error) {}
  };

  const confirmDelete = async () => {
    if (!user || !db || !isAdmin || !thoughtToDelete) return;

    const id = thoughtToDelete.id;
    setThoughtToDelete(null);
    setDeletingId(id);

    setTimeout(async () => {
      try {
        await deleteDoc(doc(db, "pensieri", id));
        if (selectedThought?.id === id) {
          setSelectedThought(null);
        }
        setDeletingId(null);
      } catch (error) {
        console.error("Errore durante l'eliminazione:", error);
        setDeletingId(null);
      }
    }, 400);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getProcessedThoughts = () => {
    let result = [...thoughts];
    if (activeTab === "favorites") {
      result = result.filter((thought: any) => thought.isStarred);
    }
    result.sort((a: any, b: any) => {
      switch (sortBy) {
        case "oldest":
          return a.timestamp - b.timestamp;
        case "longest":
          return (b.content?.length || 0) - (a.content?.length || 0);
        case "shortest":
          return (a.content?.length || 0) - (b.content?.length || 0);
        case "newest":
        default:
          return b.timestamp - a.timestamp;
      }
    });
    return result;
  };

  const displayedThoughts = getProcessedThoughts();

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2C241B] font-sans selection:bg-[#E8DAC2] selection:text-[#2C241B]">
      <style>{`
        @keyframes fadeInOverlay {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes paperFloat {
          from { opacity: 0; transform: translateY(40px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes overlayFadeIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to { opacity: 1; backdrop-filter: blur(12px); }
        }
        /* Lettera che scivola dentro senza strabordare oltre i limiti della busta */
        @keyframes letterSlideSlow {
          0% { transform: translateY(-110%); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(0%); opacity: 1; }
        }
        @keyframes flapCloseSlow {
          0% { transform: rotateX(180deg); }
          100% { transform: rotateX(0deg); }
        }
        @keyframes sealPopSlow {
          0% { transform: scale(4); opacity: 0; filter: blur(6px); }
          60% { transform: scale(0.85); opacity: 1; filter: blur(0px); }
          100% { transform: scale(1); opacity: 1; filter: blur(0px); }
        }
        @keyframes envFloatSlow {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-16px) rotate(1deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        @keyframes envFlySlow {
          0% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
          30% { transform: translateY(40px) scale(0.95) rotate(-3deg); opacity: 1; }
          100% { transform: translateY(-130vh) scale(0.4) rotate(12deg); opacity: 0; }
        }
        @keyframes textFadeInUpSlow {
          0% { transform: translateY(35px); opacity: 0; filter: blur(10px); }
          100% { transform: translateY(0); opacity: 1; filter: blur(0px); }
        }
      `}</style>

      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'url("https://www.transparenttextures.com/patterns/cream-paper.png")',
        }}
      ></div>

      <header className="pt-16 pb-8 px-6 border-b border-[#E8DAC2] relative z-10 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center relative">
          <Feather className="w-10 h-10 text-[#8B6E4E] mb-4" />
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-[#1A1510] tracking-tight mb-4 relative flex items-center justify-center gap-4">
            Lo Zibaldone
            <button
              onClick={handleAdminClick}
              className="opacity-20 hover:opacity-100 transition-opacity absolute -right-12"
              title={isAdmin ? "Chiudi Archivio" : "Accesso Segreto"}
            >
              {isAdmin ? (
                <Unlock className="w-5 h-5 text-[#8B6E4E]" />
              ) : (
                <Lock className="w-5 h-5 text-[#8B6E4E]" />
              )}
            </button>
          </h1>

          <p className="text-lg md:text-xl text-[#6B5A46] font-light max-w-2xl italic">
            "Il più solido piacere di questa vita è il piacer vano delle
            illusioni." <br />
            <span className="text-sm not-italic mt-2 block">
              — Buca delle lettere e scritture della classe.
            </span>
          </p>
        </div>
      </header>

      {isAdmin && (
        <nav className="flex justify-center gap-2 md:gap-4 py-8 relative z-10 flex-wrap px-4 bg-[#FDFBF7] border-b border-[#E8DAC2]/50 mb-8">
          <div className="w-full text-center mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-[#902A2A] bg-[#FDF2F2] px-3 py-1 rounded-full">
              Archivio Segreto Aperto
            </span>
          </div>
          <button
            onClick={() => setActiveTab("read")}
            className={`flex items-center gap-2 px-6 py-3 rounded-full transition-all duration-300 font-medium ${
              activeTab === "read"
                ? "bg-[#1A1510] text-[#FDFBF7] shadow-lg scale-105"
                : "bg-transparent text-[#6B5A46] hover:bg-[#E8DAC2] hover:text-[#1A1510]"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Tutti i Pensieri
          </button>
          <button
            onClick={() => setActiveTab("favorites")}
            className={`flex items-center gap-2 px-6 py-3 rounded-full transition-all duration-300 font-medium ${
              activeTab === "favorites"
                ? "bg-[#1A1510] text-[#FDFBF7] shadow-lg scale-105"
                : "bg-transparent text-[#6B5A46] hover:bg-[#E8DAC2] hover:text-[#1A1510]"
            }`}
          >
            <Star
              className={`w-4 h-4 ${
                activeTab === "favorites" ? "fill-current" : ""
              }`}
            />
            Scelti
          </button>
          <button
            onClick={() => setActiveTab("write")}
            className={`flex items-center gap-2 px-6 py-3 rounded-full transition-all duration-300 font-medium ${
              activeTab === "write"
                ? "bg-[#1A1510] text-[#FDFBF7] shadow-lg scale-105"
                : "bg-transparent text-[#6B5A46] hover:bg-[#E8DAC2] hover:text-[#1A1510]"
            }`}
          >
            <PenTool className="w-4 h-4" />
            Nuovo
          </button>
        </nav>
      )}

      <main
        className={`max-w-5xl mx-auto px-6 pb-24 relative z-10 ${
          isAdmin ? "" : "pt-12"
        } min-h-[50vh]`}
      >
        {message && (
          <div
            className={`mb-8 max-w-2xl mx-auto p-4 rounded-xl text-center transition-all animate-in fade-in slide-in-from-top-4 ${
              message.type === "success"
                ? "bg-[#EAF3EB] text-[#2B5933]"
                : "bg-[#FDF2F2] text-[#902A2A]"
            }`}
          >
            {message.text}
          </div>
        )}

        {isAdmin && (activeTab === "read" || activeTab === "favorites") && (
          <div className="transition-all duration-500 animate-in fade-in zoom-in-95">
            {!loading && thoughts.length > 0 && (
              <div className="flex justify-center md:justify-end mb-8 relative z-30">
                <div className="relative">
                  <button
                    onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                    className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-[#E8DAC2] shadow-sm hover:shadow-md transition-all text-[#4A4036] text-sm font-semibold group"
                  >
                    <ArrowDownWideNarrow className="w-4 h-4 text-[#8B6E4E]" />
                    {sortBy === "newest" && "Dal più recente"}
                    {sortBy === "oldest" && "Dal più vecchio"}
                    {sortBy === "longest" && "I più lunghi"}
                    {sortBy === "shortest" && "I più concisi"}
                    <ChevronDown
                      className={`w-4 h-4 text-[#D4C3A3] transition-transform duration-300 ${
                        isSortMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isSortMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsSortMenuOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-56 bg-[#FDFBF7] border border-[#E8DAC2] rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 zoom-in-95 origin-top-right">
                        <div className="py-2">
                          {[
                            { id: "newest", label: "Dal più recente" },
                            { id: "oldest", label: "Dal più vecchio" },
                            { id: "longest", label: "I più lunghi" },
                            { id: "shortest", label: "I più concisi" },
                          ].map((option) => (
                            <button
                              key={option.id}
                              onClick={() => {
                                setSortBy(option.id);
                                setIsSortMenuOpen(false);
                              }}
                              className={`w-full text-left px-5 py-3 text-sm font-medium transition-colors flex items-center gap-3 ${
                                sortBy === option.id
                                  ? "bg-[#E8DAC2]/30 text-[#1A1510]"
                                  : "text-[#6B5A46] hover:bg-[#FDF2F2] hover:text-[#902A2A]"
                              }`}
                            >
                              <div
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                  sortBy === option.id
                                    ? "bg-[#8B6E4E]"
                                    : "bg-transparent"
                                }`}
                              ></div>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-[#8B6E4E]">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p>Apertura dell'archivio in corso...</p>
              </div>
            ) : displayedThoughts.length === 0 ? (
              <div className="text-center py-20 animate-in fade-in">
                {activeTab === "favorites" ? (
                  <>
                    <Star className="w-12 h-12 text-[#E8DAC2] mx-auto mb-4" />
                    <h3 className="text-xl font-serif text-[#1A1510] mb-2">
                      Nessun pensiero selezionato.
                    </h3>
                  </>
                ) : (
                  <>
                    <Bookmark className="w-12 h-12 text-[#E8DAC2] mx-auto mb-4" />
                    <h3 className="text-xl font-serif text-[#1A1510] mb-2">
                      L'archivio è ancora vuoto.
                    </h3>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {displayedThoughts.map((thought: any, index: number) => (
                  <article
                    key={thought.id}
                    onClick={() => setSelectedThought(thought)}
                    className={`bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-[#F0EBE1] flex flex-col group relative overflow-hidden cursor-pointer transition-all duration-500 hover:shadow-xl hover:-translate-y-2 ${
                      deletingId === thought.id
                        ? "opacity-0 scale-75 blur-md pointer-events-none"
                        : "animate-in fade-in slide-in-from-bottom-8 zoom-in-95"
                    }`}
                    style={
                      deletingId === thought.id
                        ? {}
                        : {
                            animationFillMode: "both",
                            animationDelay: `${index * 80}ms`,
                          }
                    }
                  >
                    <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setThoughtToDelete(thought);
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent hover:bg-[#FDF2F2] transition-all duration-300 group/trash hover:scale-110"
                        title="Elimina questo pensiero"
                      >
                        <Trash2 className="w-5 h-5 text-[#D4C3A3] group-hover/trash:text-[#902A2A] transition-colors block" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(thought.id, thought.isStarred);
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent hover:bg-[#F0EBE1] transition-all duration-300 group/star hover:scale-110"
                        title="Evidenzia questo pensiero"
                      >
                        <Star
                          className={`w-5 h-5 block transition-transform group-hover/star:scale-110 ${
                            thought.isStarred
                              ? "fill-[#D4AF37] text-[#D4AF37]"
                              : "text-[#D4C3A3]"
                          }`}
                        />
                      </button>
                    </div>

                    <header className="mb-4 relative z-10 pr-24">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs font-semibold text-[#8B6E4E] uppercase tracking-wider mb-2">
                        <span
                          className="truncate max-w-[140px]"
                          title={`di ${thought.author}`}
                        >
                          DI {thought.author}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-[#D4C3A3] shrink-0"></span>
                        <span className="shrink-0">
                          {formatDate(thought.timestamp)}
                        </span>
                      </div>
                      <h2 className="text-xl font-serif font-bold text-[#1A1510] leading-snug break-words line-clamp-2">
                        {thought.title}
                      </h2>
                    </header>

                    <div className="flex-grow relative z-10">
                      <p className="text-[#4A4036] leading-relaxed whitespace-pre-wrap font-serif text-lg line-clamp-4 break-words">
                        {thought.content}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-[#F0EBE1] flex justify-between items-center relative z-10">
                      <div className="w-8 h-[1px] bg-[#D4C3A3]"></div>
                      <span className="text-xs font-bold uppercase tracking-widest text-[#8B6E4E] group-hover:text-[#1A1510] transition-colors">
                        Leggi pagina
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "write" && (
          <div className="max-w-2xl mx-auto transition-all duration-700 animate-in fade-in slide-in-from-bottom-12 zoom-in-95">
            {!isAdmin && (
              <div className="text-center mb-8">
                <p className="text-[#6B5A46] italic">
                  Lascia qui un tuo scritto, un pensiero o una riflessione.
                  Verrà consegnato segretamente e custodito nello Zibaldone
                  della classe.
                </p>
              </div>
            )}

            <div className="bg-white p-8 md:p-12 rounded-3xl shadow-sm border border-[#F0EBE1] relative">
              <h2 className="text-3xl font-serif text-[#1A1510] mb-8 text-center">
                Imbuca una lettera
              </h2>

              <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#8B6E4E] uppercase tracking-wider ml-1">
                      Titolo
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Es: L'infinito"
                      className="w-full bg-[#FDFBF7] border border-[#E8DAC2] rounded-xl px-4 py-3 text-[#1A1510] placeholder:text-[#D4C3A3] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-[#8B6E4E] uppercase tracking-wider ml-1">
                      Autore
                    </label>
                    <input
                      type="text"
                      value={newAuthor}
                      onChange={(e) => setNewAuthor(e.target.value)}
                      placeholder="Il tuo nome o pseudonimo"
                      className="w-full bg-[#FDFBF7] border border-[#E8DAC2] rounded-xl px-4 py-3 text-[#1A1510] placeholder:text-[#D4C3A3] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#8B6E4E] uppercase tracking-wider ml-1">
                    Il tuo testo
                  </label>
                  <textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Scrivi qui i tuoi pensieri, le tue riflessioni..."
                    className="w-full bg-[#FDFBF7] border border-[#E8DAC2] rounded-xl px-4 py-4 text-[#1A1510] placeholder:text-[#D4C3A3] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-transparent transition-all min-h-[250px] resize-y font-serif text-lg leading-relaxed"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !newContent.trim()}
                  className="w-full bg-[#1A1510] text-[#FDFBF7] py-4 rounded-xl font-medium transition-all duration-300 hover:bg-[#2C241B] hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 group mt-8 shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Inchiostratura in corso...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      Affida allo Zibaldone
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {isAdmin && selectedThought && (
          <div
            className={`fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 transition-all duration-500 ${
              deletingId === selectedThought.id
                ? "opacity-0 pointer-events-none"
                : "opacity-100"
            }`}
            onClick={() => setSelectedThought(null)}
            style={{ perspective: "1200px" }}
          >
            <div
              className="absolute inset-0 bg-[#1A1510]/60 backdrop-blur-sm transition-opacity duration-500"
              style={{
                animation:
                  deletingId === selectedThought.id
                    ? "none"
                    : "fadeInOverlay 0.4s ease-out forwards",
              }}
            ></div>
            <div
              className={`bg-[#FDFBF7] w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl relative z-10 flex flex-col overflow-hidden border border-[#E8DAC2] transition-all duration-500 ${
                deletingId === selectedThought.id
                  ? "scale-75 blur-md translate-y-12 opacity-0"
                  : ""
              }`}
              onClick={(e: any) => e.stopPropagation()}
              style={{
                animation:
                  deletingId === selectedThought.id
                    ? "none"
                    : "paperFloat 0.5s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards",
              }}
            >
              <div className="flex justify-between items-start p-6 md:p-8 border-b border-[#E8DAC2]/50 sticky top-0 bg-[#FDFBF7]/95 backdrop-blur-md z-20">
                <div className="pr-4 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#8B6E4E] uppercase tracking-wider mb-3">
                    <span
                      className="bg-[#E8DAC2]/30 px-3 py-1 rounded-full truncate max-w-[200px]"
                      title={`Autore: ${selectedThought.author}`}
                    >
                      DI {selectedThought.author}
                    </span>
                    <span className="bg-[#E8DAC2]/30 px-3 py-1 rounded-full shrink-0">
                      {formatDate(selectedThought.timestamp)}
                    </span>
                  </div>
                  <h2 className="text-2xl md:text-3xl font-serif font-bold text-[#1A1510] break-words leading-snug">
                    {selectedThought.title}
                  </h2>
                </div>

                <div className="flex items-center gap-1 shrink-0 bg-white/60 p-1.5 rounded-full border border-[#E8DAC2]/50 shadow-sm">
                  <button
                    onClick={() => setThoughtToDelete(selectedThought)}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FDF2F2] transition-colors group/trash"
                    title="Elimina"
                  >
                    <Trash2 className="w-5 h-5 block text-[#D4C3A3] group-hover/trash:text-[#902A2A] transition-colors" />
                  </button>
                  <div className="w-[1px] h-5 bg-[#E8DAC2]"></div>
                  <button
                    onClick={() => {
                      toggleStar(selectedThought.id, selectedThought.isStarred);
                      setSelectedThought({
                        ...selectedThought,
                        isStarred: !selectedThought.isStarred,
                      });
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#F0EBE1] transition-colors group/star"
                    title="Evidenzia"
                  >
                    <Star
                      className={`w-5 h-5 block transition-transform group-hover/star:scale-110 ${
                        selectedThought.isStarred
                          ? "fill-[#D4AF37] text-[#D4AF37]"
                          : "text-[#D4C3A3]"
                      }`}
                    />
                  </button>
                  <div className="w-[1px] h-5 bg-[#E8DAC2]"></div>
                  <button
                    onClick={() => setSelectedThought(null)}
                    className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[#FDF2F2] hover:text-[#902A2A] transition-colors text-[#8B6E4E] group/close"
                    title="Chiudi pagina"
                  >
                    <X className="w-5 h-5 block transition-transform group-hover/close:scale-110 group-hover/close:rotate-90" />
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-10 overflow-y-auto relative z-10 custom-scrollbar">
                <p className="text-[#3A3228] leading-relaxed whitespace-pre-wrap font-serif text-xl md:text-2xl first-letter:text-6xl first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:text-[#1A1510] selection:bg-[#E8DAC2] selection:text-[#2C241B] break-words">
                  {selectedThought.content}
                </p>
                <div className="mt-12 text-center text-[#D4C3A3]">
                  <Feather className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <span className="text-sm italic font-serif">
                    Fine della pagina
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {showAdminModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={() => setShowAdminModal(false)}
        >
          <div
            className="absolute inset-0 bg-[#1A1510]/60 backdrop-blur-sm"
            style={{ animation: "fadeInOverlay 0.3s ease-out forwards" }}
          ></div>
          <div
            className="bg-[#FDFBF7] p-8 rounded-3xl shadow-2xl relative z-10 w-full max-w-sm border border-[#E8DAC2]"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation:
                "paperFloat 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards",
            }}
          >
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 bg-[#E8DAC2]/30 rounded-full flex items-center justify-center mb-4">
                <KeyRound className="w-6 h-6 text-[#8B6E4E]" />
              </div>
              <h3 className="text-2xl font-serif text-[#1A1510] text-center">
                Archivio Riservato
              </h3>
              <p className="text-[#6B5A46] text-sm text-center mt-2">
                Inserisci la parola d'ordine per accedere ai pensieri della
                classe.
              </p>
            </div>

            <form onSubmit={handleAdminLogin}>
              <div className="mb-4 relative">
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => {
                    setAdminPassword(e.target.value);
                    setAdminError(false);
                  }}
                  className={`w-full bg-white border ${
                    adminError
                      ? "border-[#902A2A] ring-1 ring-[#902A2A]"
                      : "border-[#E8DAC2]"
                  } rounded-xl px-4 py-3 text-center focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 transition-all font-medium`}
                  placeholder="La parola d'ordine..."
                  autoFocus
                />
              </div>

              <div className="h-6 mb-2">
                {adminError && (
                  <p className="text-[#902A2A] text-xs text-center font-medium animate-in slide-in-from-top-2">
                    Parola d'ordine errata. Riprova.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="flex-1 py-3 rounded-xl text-[#6B5A46] font-medium bg-transparent border border-[#E8DAC2] hover:bg-[#F0EBE1] hover:text-[#1A1510] transition-all duration-300 hover:scale-105"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={!adminPassword.trim()}
                  className="flex-1 py-3 rounded-xl text-[#FDFBF7] font-medium bg-[#1A1510] hover:bg-[#2C241B] transition-all duration-300 hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100"
                >
                  Sblocca
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {thoughtToDelete && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          onClick={() => setThoughtToDelete(null)}
        >
          <div
            className="absolute inset-0 bg-[#1A1510]/60 backdrop-blur-sm"
            style={{ animation: "fadeInOverlay 0.3s ease-out forwards" }}
          ></div>
          <div
            className="bg-[#FDFBF7] p-8 rounded-3xl shadow-2xl relative z-10 w-full max-w-sm border border-[#E8DAC2] text-center"
            onClick={(e) => e.stopPropagation()}
            style={{
              animation:
                "paperFloat 0.4s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards",
            }}
          >
            <div className="w-12 h-12 bg-[#FDF2F2] rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-[#902A2A]" />
            </div>
            <h3 className="text-2xl font-serif text-[#1A1510] mb-2">
              Eliminare?
            </h3>
            <p className="text-[#6B5A46] text-sm mb-6">
              Sei sicuro di voler eliminare per sempre questo pensiero? L'azione
              non può essere annullata.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setThoughtToDelete(null)}
                className="flex-1 py-3 rounded-xl text-[#6B5A46] font-medium bg-transparent border border-[#E8DAC2] hover:bg-[#F0EBE1] hover:text-[#1A1510] transition-all duration-300 hover:scale-105"
              >
                Annulla
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-xl text-[#FDFBF7] font-medium bg-[#902A2A] hover:bg-[#7a2222] transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= SUPER ANIMAZIONE RALLENTATA CON MESSAGGIO DI RITORNO ================= */}
      {sendState !== "idle" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
          <div
            className={`absolute inset-0 bg-[#1A1510]/85 transition-opacity duration-1000 ${
              sendState === "idle" ? "opacity-0" : "opacity-100"
            }`}
            style={{ animation: "overlayFadeIn 1s ease-out forwards" }}
          ></div>

          {sendState === "thankyou" && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center text-[#FDFBF7] px-6 text-center z-10"
              style={{ animation: "textFadeInUpSlow 1.2s ease-out forwards" }}
            >
              <Feather className="w-16 h-16 mb-6 text-[#D4AF37] opacity-90" />
              <h2 className="text-4xl md:text-6xl font-serif mb-4 text-[#FDFBF7] tracking-tight">
                Lettera Consegnata
              </h2>
              <div className="w-16 h-[1px] bg-[#D4C3A3] mx-auto mb-4"></div>
              <p className="text-xl md:text-2xl text-[#E8DAC2] font-light italic max-w-lg leading-relaxed mb-10">
                Il tuo pensiero è stato sigillato ed è ora custodito nello
                Zibaldone.
              </p>

              {/* Tasto animato per imbucare un'altra lettera */}
              <button
                onClick={resetWritingForm}
                className="px-8 py-3.5 rounded-full bg-[#DFCCB0] text-[#1A1510] font-medium text-sm tracking-wider uppercase shadow-xl hover:bg-[#E8DAC2] hover:scale-105 transition-all duration-300 border border-[#E8DAC2]/50 animate-in fade-in zoom-in-95 duration-700"
              >
                Imbuca un'altra lettera
              </button>
            </div>
          )}

          {(sendState === "folding" || sendState === "flying") && (
            <div
              className="relative z-20"
              style={{
                animation:
                  sendState === "flying"
                    ? "envFlySlow 1.6s cubic-bezier(0.4, 0, 0.2, 1) forwards"
                    : "envFloatSlow 5s ease-in-out infinite",
                perspective: "1400px",
              }}
            >
              {/* Contenitore Busta */}
              <div className="relative w-72 sm:w-80 h-48 sm:h-56 bg-[#DFCCB0] rounded-md shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden">
                {/* FOGLIO DI CARTA (Rinforzato nei margini e ritmato per non uscire dai bordi) */}
                <div
                  className="absolute inset-x-4 top-0 bg-[#FDFBF7] h-48 sm:h-52 rounded-sm shadow-inner p-4 flex flex-col border border-[#E8DAC2]"
                  style={{
                    animation:
                      "letterSlideSlow 1.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
                    zIndex: 1,
                  }}
                >
                  <div className="w-12 h-1.5 bg-[#D4C3A3] mb-4 rounded-full"></div>
                  <div className="w-full h-1.5 bg-[#F0EBE1] mb-2.5 rounded-full"></div>
                  <div className="w-full h-1.5 bg-[#F0EBE1] mb-2.5 rounded-full"></div>
                  <div className="w-5/6 h-1.5 bg-[#F0EBE1] mb-2.5 rounded-full"></div>
                  <div className="w-full h-1.5 bg-[#F0EBE1] mb-2.5 rounded-full"></div>
                  <Feather className="w-6 h-6 text-[#8B6E4E] opacity-20 mt-auto mx-auto" />
                </div>

                {/* LEMBO SINISTRO */}
                <div
                  className="absolute inset-y-0 left-0 w-1/2 bg-[#D4C3A3]"
                  style={{
                    clipPath: "polygon(0 0, 100% 50%, 0 100%)",
                    zIndex: 2,
                  }}
                ></div>

                {/* LEMBO DESTRO */}
                <div
                  className="absolute inset-y-0 right-0 w-1/2 bg-[#C6B38E]"
                  style={{
                    clipPath: "polygon(100% 0, 0 50%, 100% 100%)",
                    zIndex: 3,
                  }}
                ></div>

                {/* LEMBO INFERIORE */}
                <div
                  className="absolute bottom-0 inset-x-0 h-2/3 bg-[#DFCCB0]"
                  style={{
                    clipPath: "polygon(0 100%, 50% 0, 100% 100%)",
                    zIndex: 4,
                  }}
                ></div>

                {/* LEMBO SUPERIORE */}
                <div
                  className="absolute top-0 inset-x-0 h-[65%] bg-[#E8DAC2]"
                  style={{
                    clipPath: "polygon(0 0, 50% 100%, 100% 0)",
                    transformOrigin: "top",
                    animation:
                      "flapCloseSlow 1s 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
                    transform: "rotateX(180deg)",
                    zIndex: 5,
                    boxShadow: "inset 0 10px 10px rgba(0,0,0,0.05)",
                  }}
                >
                  <div className="absolute top-0 inset-x-0 h-[1px] bg-white/50"></div>
                </div>

                {/* SIGILLO IN CERALACCA */}
                <div
                  className="absolute left-1/2 top-[55%] -ml-6 -mt-6 w-12 h-12 flex items-center justify-center"
                  style={{ zIndex: 6 }}
                >
                  <div
                    className="w-12 h-12 bg-[#902A2A] rounded-full flex items-center justify-center relative"
                    style={{
                      animation:
                        "sealPopSlow 0.7s 2.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
                      opacity: 0,
                      transform: "scale(4)",
                      boxShadow:
                        "0 6px 12px rgba(0,0,0,0.4), inset 0 -3px 6px rgba(0,0,0,0.3), inset 0 3px 6px rgba(255,255,255,0.2)",
                    }}
                  >
                    <div className="absolute inset-[3px] border border-[#7a2222]/80 rounded-full"></div>
                    <Feather className="w-5 h-5 text-[#E8DAC2] relative z-10" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
