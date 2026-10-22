// ===== IL TATTO DEL CIRCUITO =====
// Un piccolo vocabolario di vibrazioni, come i "token" aptici dei sistemi operativi: ogni gesto ha la sua, corta e
// precisa, e quelle importanti si riconoscono senza guardare.
//   tap      pulsanti, schede, collegamenti: un colpo secco e cortissimo
//   select   interruttori, selettori, scelte: un doppio clic meccanico leggero
//   nav      cambio di sezione
//   tick     i dentini di un cursore che scorre (al massimo uno ogni 45 ms)
//   success  conferme (pubblicato, svelato, votato): corto e poi più pieno, sale
//   impact   azioni pesanti (segnalibro, eliminazione): un colpo deciso
//   warning  errori: tre colpi
// Dove c'è navigator.vibrate (Android, l'app Android) si usano schemi in millisecondi; su iPhone, dove non esiste, Safari
// 18 fa sentire il tic di sistema quando cambia un interruttore nativo: un <input switch> nascosto fa da motore.
// La forza (Opzioni) allunga o accorcia i colpi, non le pause.
export type Haptic = "tap" | "select" | "nav" | "tick" | "success" | "impact" | "warning";
const PATTERN: Record<Haptic, number[]> = {
  tap: [7], select: [5, 26, 7], nav: [10], tick: [4], success: [8, 70, 18], impact: [24], warning: [20, 55, 20, 55, 20],
};
// quanti tic di sistema per ogni gesto su iPhone (non si può regolare la durata)
const TICKS: Record<Haptic, number> = { tap: 1, select: 1, nav: 1, tick: 1, success: 2, impact: 1, warning: 3 };

const cfg = { on: true, k: 1 };
let last = 0, iosSwitch: HTMLLabelElement | null = null;
const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
const isIOS = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function configureHaptics(on: boolean, strength = 1) { cfg.on = on; cfg.k = strength; }

function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement("label"), input = document.createElement("input");
    input.type = "checkbox"; input.setAttribute("switch", ""); input.tabIndex = -1;
    // data-haptic="off": il clic finto sull'interruttore non deve chiedere a sua volta un tic (girerebbe all'infinito)
    label.setAttribute("aria-hidden", "true"); label.dataset.haptic = "off";
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    label.appendChild(input); document.body.appendChild(label); iosSwitch = label;
  }
  // Safari sposta il focus sull'interruttore cliccato: si rimette dov'era, così un campo resta attivo con la tastiera aperta
  const was = document.activeElement as HTMLElement | null;
  iosSwitch.click();
  if (document.activeElement !== was) { (document.activeElement as HTMLElement | null)?.blur(); was?.focus?.({ preventScroll: true }); }
}

export function haptic(kind: Haptic) {
  if (!cfg.on || typeof document === "undefined") return;
  const now = performance.now();
  // i tic di un cursore non si accavallano; un gesto più importante, se arriva subito dopo, sostituisce il precedente
  if (kind === "tick" && now - last < 45) return;
  last = now;
  if (canVibrate()) {
    const p = PATTERN[kind].map((ms, i) => (i % 2 ? ms : Math.max(2, Math.round(ms * cfg.k))));
    try { navigator.vibrate(p); } catch {}
  } else if (isIOS()) {
    for (let i = 0; i < TICKS[kind]; i++) setTimeout(iosTick, i * 90);
  }
}

// il gesto giusto per ciò che si è toccato
const kindFor = (el: Element): Haptic | null => {
  if (el.closest('[data-haptic="off"]')) return null;
  const own = el.closest("[data-haptic]")?.getAttribute("data-haptic") as Haptic | null;
  if (own) return own;
  if (el.closest('[role=switch],.seg,input[type=checkbox],input[type=radio],label.kind-option,.diary-sign-opt,[role=tab]')) return "select";
  if (el.closest('[data-snd="nav"]')) return "nav";
  if (el.closest(".bt.dng")) return "impact";
  if (el.closest('button,a[href],[role=button],.card,summary,label.bt')) return "tap";
  return null;
};
export function bindUiHaptics() {
  const click = (e: MouseEvent) => {
    const t = e.target as Element | null; if (!t || !t.closest) return;
    const b = t.closest("button,[role=button],[role=switch],a[href]") as HTMLButtonElement | null;
    if (b?.disabled || b?.getAttribute("aria-disabled") === "true") return;
    const k = kindFor(t); if (k) haptic(k);
  };
  // i cursori: un dentino a ogni passo
  const input = (e: Event) => { if ((e.target as HTMLInputElement)?.type === "range") haptic("tick"); };
  document.addEventListener("click", click, true);
  document.addEventListener("input", input, true);
  return () => { document.removeEventListener("click", click, true); document.removeEventListener("input", input, true); };
}
