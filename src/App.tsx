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
} from "lucide-react";

// I TUOI DATI FIREBASE
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

// Aggiunto ": any" per far felice Vercel/TypeScript
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
  // Aggiunto "<any>" a tutti gli stati per evitare errori TS
  const [user, setUser] = useState<any>(null);
  const [thoughts, setThoughts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("write");
  const [sortBy, setSortBy] = useState("newest");
  const [isAdmin, setIsAdmin] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newContent, setNewContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<any>(null);
  const [selectedThought, setSelectedThought] = useState<any>(null);

  useEffect(() => {
    if (selectedThought) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [selectedThought]);

  useEffect(() => {
    const authenticate = async () => {
      if (!isConfigured) {
        setMessage({
          type: "error",
          text: "⚠️ Configurazione mancante: Inserisci le tue chiavi Firebase nel codice!",
        });
        return;
      }
      try {
        await signInAnonymously(auth);
        setUser(auth.currentUser);
      } catch (error) {
        console.error("Errore di autenticazione:", error);
        setMessage({
          type: "error",
          text: "Impossibile accedere al diario. Ricarica la pagina.",
        });
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

  const handleAdminToggle = () => {
    if (isAdmin) {
      setIsAdmin(false);
      setActiveTab("write");
      setThoughts([]);
    } else {
      const password = window.prompt(
        "Archivio Riservato. Inserisci la parola d'ordine:"
      );
      if (password === "infinito") {
        setIsAdmin(true);
        setActiveTab("read");
      } else if (password !== null) {
        alert("Parola d'ordine errata. Solo la redazione può accedere.");
      }
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

      setNewTitle("");
      setNewAuthor("");
      setNewContent("");
      setMessage({
        type: "success",
        text: "Il tuo pensiero è stato affidato con successo allo Zibaldone.",
      });

      setTimeout(() => {
        setMessage(null);
      }, 4000);
    } catch (error) {
      setMessage({
        type: "error",
        text: "Impossibile salvare il pensiero. Riprova.",
      });
    } finally {
      setIsSubmitting(false);
    }
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
          to { opacity: 1; backdrop-filter: blur(4px); }
        }
        @keyframes paperFloat {
          from { opacity: 0; transform: translateY(60px) scale(0.92) rotateX(-8deg); }
          to { opacity: 1; transform: translateY(0) scale(1) rotateX(0deg); }
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
              onClick={handleAdminToggle}
              className="opacity-20 hover:opacity-100 transition-opacity absolute -right-12"
              title={isAdmin ? "Chiudi Archivio" : "Accesso Redazione"}
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
              Modalità Redazione Attiva
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
            Archivio Completo
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
            Scelti per il Prof
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
            Nuovo Inserimento
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
              <div className="flex justify-center md:justify-end mb-8 relative z-20">
                <div className="flex items-center gap-3 bg-white/80 backdrop-blur-md px-5 py-2.5 rounded-full border border-[#E8DAC2] shadow-sm hover:shadow-md transition-shadow">
                  <ArrowDownWideNarrow className="w-4 h-4 text-[#8B6E4E]" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-transparent text-[#4A4036] text-sm font-semibold focus:outline-none cursor-pointer appearance-none outline-none pr-2"
                  >
                    <option value="newest">Dal più recente</option>
                    <option value="oldest">Dal più vecchio</option>
                    <option value="longest">I più lunghi</option>
                    <option value="shortest">I più concisi</option>
                  </select>
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
                {displayedThoughts.map((thought: any) => (
                  <article
                    key={thought.id}
                    onClick={() => setSelectedThought(thought)}
                    className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-[#F0EBE1] hover:shadow-md transition-all duration-300 flex flex-col group relative overflow-hidden cursor-pointer"
                  >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#F0EBE1] rounded-bl-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-0"></div>

                    <div className="absolute top-4 right-4 z-20">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(thought.id, thought.isStarred);
                        }}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-transparent hover:bg-[#F0EBE1] transition-all group/star"
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

                    <header className="mb-4 relative z-10 pr-12">
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
          <div className="max-w-2xl mx-auto transition-all duration-500 animate-in fade-in zoom-in-95">
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
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#F0EBE1] rounded-bl-3xl opacity-50 pointer-events-none"></div>

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
                  className="w-full bg-[#1A1510] text-[#FDFBF7] py-4 rounded-xl font-medium hover:bg-[#2C241B] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group mt-8 shadow-md"
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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            onClick={() => setSelectedThought(null)}
            style={{ perspective: "1200px" }}
          >
            <div
              className="absolute inset-0 bg-[#1A1510]/60"
              style={{ animation: "fadeInOverlay 0.5s ease-out forwards" }}
            ></div>
            <div
              className="bg-[#FDFBF7] w-full max-w-3xl max-h-[85vh] rounded-3xl shadow-2xl relative z-10 flex flex-col overflow-hidden border border-[#E8DAC2]"
              onClick={(e: any) => e.stopPropagation()}
              style={{
                animation:
                  "paperFloat 0.6s cubic-bezier(0.2, 0.8, 0.2, 1.05) forwards",
                transformOrigin: "bottom center",
              }}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[#FDFBF7] to-transparent border-b border-l border-[#F0EBE1] rounded-bl-[4rem] opacity-50 pointer-events-none"></div>

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
    </div>
  );
}
