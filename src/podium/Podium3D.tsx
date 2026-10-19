import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderLoop, refreshes, steadyFps } from "../renderLoop";
import { acquirePodiumDevice, releasePodiumDevice, capTier, type Tier } from "./device";
import { PodiumView, podiumQuality } from "./engine";
import { STEP_X, STEP_D, STEP_TOP, DAIS, TROPHY_TOP, TROPHY_K, TROPHY_Z, camera, project, type Cam, type CamMotion } from "./stage";
import { pickSecretPane, WindowSecret } from './secret';
import { loadDrape } from "./cloth";
import { setAmbiencePan } from "../ambience";
import type { SignText } from "./letters";

export type PodiumProps = {
  dark: boolean;
  // targhette dei primi tre (indice 0 = primo posto); null se il posto è vuoto
  plates: (React.ReactNode | null)[];
  onFail: () => void;
  // podio non ancora visibile: un telo copre gradini e coppe, la sala è un cantiere
  covered?: boolean;
  // le scritte sospese nella sala sopra il podio coperto, in 3D (letters.ts)
  sign?: SignText;
  // Opzioni › Avanzate: qualità forzata, risoluzione fissa (0 = adattiva), fotogrammi al secondo
  tune?: PodiumTune;
};
export type PodiumTune = { tier?: Tier | "auto"; scale?: number; fps?: number };
// tetto assoluto dei pixel con la risoluzione scelta a mano (oltre, anche la GPU più potente non regge 60 fps)
const MANUAL_MAX_PIXELS = 16.6e6;

const RETRIES = 1;
const SLOT = "podium-slot"; // spazio lasciato libero nella pagina: lì la camera inquadra il podio
// sotto questa larghezza la sala è un palco a tutta larghezza dentro la pagina e i vincitori sono schede sotto di esso
// (la stessa soglia del CSS: .podium-list e .podium-slot)
const NARROW = "(max-width: 767px)";
// risoluzione di partenza della scena per fascia (rispetto ai pixel del dispositivo)
const START_SCALE: Record<Tier, number> = { low: 0.85, medium: 0.9, high: 1, ultra: 1.25 };
// circa 60 fotogrammi al secondo su un multiplo esatto del refresh (a 144 Hz uno sì e uno no: 72 regolari invece di 48 a
// strappi): in una sala che si muove piano la risoluzione conta più dei fotogrammi in più
const FPS = 60;

// La sala del podio.
//  - Schermi larghi: a tutto schermo. Lo strato della scena sta dietro ai contenuti (sopra lo sfondo) e scorre con la
//    pagina; le targhette stanno in uno strato sopra i contenuti, proiettate sopra le coppe con la stessa camera.
//  - Telefoni: la scena vive dentro lo spazio della pagina (scorre come il resto) e le targhette diventano schede sotto il
//    palco (le disegna la pagina).
// La sala è viva: la camera respira e segue il puntatore, si trascina per girare attorno al podio, le coppe ruotano sui
// piedistalli e al passaggio si sollevano e brillano; un clic (o un tocco) su coppa o gradino apre lo scritto.
// Qualità e risoluzione seguono la potenza misurata della GPU e il tempo reale di ogni fotogramma.
export default function Podium3D({ dark, plates, onFail, covered = false, sign, tune }: PodiumProps) {
  const tuneRef = useRef(tune); tuneRef.current = tune;
  // la qualità e i fotogrammi ricostruiscono la scena; la risoluzione cambia dal vivo (si regola col cursore)
  const tuneKey = `${tune?.tier || "auto"}:${tune?.fps || FPS}`;
  const host = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  const plateEls = useRef<(HTMLDivElement | null)[]>([]);
  const hoverPlate = useRef(-1);
  const signRef = useRef(sign); signRef.current = sign;
  const signKey = sign ? JSON.stringify(sign) : "";
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null);
  const [root, setRoot] = useState<Element | null>(null);
  const [shown, setShown] = useState(false);
  const [gen, setGen] = useState(0);
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW).matches);
  const [hud, setHud] = useState("");
  const darkRef = useRef(dark); darkRef.current = dark;
  const platesRef = useRef(plates); platesRef.current = plates;
  const fail = useRef(onFail); fail.current = onFail;
  const retries = useRef(0);
  const placeRef = useRef<(() => void) | null>(null);
  const resetSecretRef = useRef<(() => void) | null>(null);
  const showHud = useRef(/podiohud/.test(window.location.search)).current;
  useEffect(() => { setRoot(host.current?.closest(".root") || document.querySelector(".root") || document.body); }, []);
  useEffect(() => { placeRef.current?.(); }, [plates, root, slotEl]);
  useEffect(() => { resetSecretRef.current?.(); }, [dark]);
  useEffect(() => {
    const mq = window.matchMedia(NARROW), on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  useEffect(() => {
    const slot = document.getElementById(SLOT);
    const el = narrow ? slot : host.current;
    if (!el || !slot) { const id = window.setTimeout(() => setGen((g) => g + 1), 120); return () => clearTimeout(id); } // la pagina non ha ancora lo spazio
    setSlotEl(slot);
    const mobile = narrow || window.matchMedia("(pointer:coarse)").matches;
    const cv = document.createElement("canvas");
    cv.className = "podium-canvas";
    cv.setAttribute("aria-hidden", "true");
    let alive = true, view: PodiumView | null = null, tier: Tier = mobile ? "low" : "medium";
    let q = podiumQuality(tier, mobile);
    const cleanups: (() => void)[] = [];
    const secret = new WindowSecret();
    let secretReady = false, secretStart = -1;
    resetSecretRef.current = () => { secret.reset(); secretStart = -1; };
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    // ratio: pixel della scena per pixel CSS; out: pixel del canvas per pixel CSS (quelli dello schermo)
    // ?podiotier e ?podioscale (prove) hanno la precedenza sulle Opzioni
    const params = new URLSearchParams(window.location.search);
    const tune = tuneRef.current, urlScale = Number(params.get("podioscale")) || 0, fps = tune?.fps || FPS;
    let fixedScale = urlScale || tune?.scale || 0;
    let W = 0, H = 0, left = 0, top = 0, ratio = 1, out = 1, scale = START_SCALE[tier], cap = 4, frameMs = 1000 / fps;

    const measure = () => {
      const dpr = window.devicePixelRatio || 1;
      if (narrow) {
        // il palco: larghezza piena, altezza fissata dal CSS su svh (non cambia quando la barra del browser si muove)
        W = el.clientWidth; H = el.clientHeight; left = 0; top = 0;
      } else {
        // inquadratura: area libera della pagina (a destra della barra laterale, sotto titolo e mese)
        W = window.innerWidth; H = window.innerHeight;
        const aside = document.querySelector("aside");
        left = aside && getComputedStyle(aside).display !== "none" ? aside.getBoundingClientRect().right : 0;
        top = Math.max(0, slot.getBoundingClientRect().top + window.scrollY);
        slot.style.height = `${Math.max(460, H - top - 16)}px`;
      }
      out = Math.min(dpr, 2);
      const base = Math.min(dpr, narrow ? 1.5 : 2);
      // tetto dei pixel della fascia (un 4K con la scheda integrata non si disegna a piena risoluzione)
      cap = Math.sqrt((fixedScale ? MANUAL_MAX_PIXELS : q.maxPixels) / Math.max(1, W * H * base * base));
      scale = Math.min(fixedScale || scale, cap);
      ratio = base * scale;
    };
    const cam = (): Cam | null => view?.camera || (W && H ? camera(Math.max(1, Math.round(W * ratio)), Math.max(1, Math.round(H * ratio)), left * ratio, top * ratio) : null);
    const place = () => {
      const c = cam();
      if (!c) return;
      // la camera lavora in pixel dell'immagine: si riporta tutto in pixel CSS
      const k = 1 / ratio;
      if (narrow) return;
      STEP_X.forEach((x, i) => {
        const tp = project(c, [x, TROPHY_TOP[i] + 0.22, TROPHY_Z]), a = project(c, [x - 1.1, STEP_TOP[i], STEP_D]), b = project(c, [x + 1.1, STEP_TOP[i], STEP_D]);
        const p = plateEls.current[i];
        if (p && tp && a && b) { p.style.width = `${Math.max(150, (b.x - a.x) * k * 0.94)}px`; p.style.transform = `translate(${tp.x * k}px, ${tp.y * k}px) translate(-50%, -100%)`; }
      });
    };
    placeRef.current = place;
    const fit = () => { if (!alive) return; measure(); view?.resize(W, H, ratio, out, left, top); place(); };

    // ---------- puntatore: parallasse, trascinamento, coppa sotto il puntatore, clic ----------
    const ptr = { x: 0, y: 0, in: false, cx: -1, cy: -1 };
    const drag = { on: false, id: -1, x0: 0, y0: 0, yaw0: 0, moved: 0, at: -1e9 };
    let yawTarget = 0, hover = -1;
    // coordinate del puntatore nell'immagine della scena (pixel CSS)
    const local = (e: PointerEvent) => {
      if (narrow) { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      return { x: e.clientX, y: e.clientY + window.scrollY };
    };
    // Listen above the slot as well: on desktop the upper glass extends behind the heading.
    // Interactive page controls keep their own clicks, and a drag/scroll/cancel never counts as a tap.
    const tap = { id: -1, x: 0, y: 0, moved: false };
    const paneAt = (e: PointerEvent) => {
      if (!view || !shownCanvas() || !darkRef.current || !el.isConnected) return -1;
      if ((e.target as Element)?.closest?.('button,a,input,textarea,select,[role=button],aside,header,[role=dialog],[aria-modal=true],.cp,.cpov')) return -1;
      const p = local(e), c = cam();
      if (!c || p.x < 0 || p.y < 0 || p.x > W || p.y > H) return -1;
      if (pick(p.x, p.y) >= 0) return -1; // A trophy in front of the glass keeps its normal action.
      return pickSecretPane(c, p.x * ratio, p.y * ratio);
    };
    const shownCanvas = () => cv.classList.contains('on');
    const secretDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) { tap.id = -1; return; }
      tap.id = e.pointerId; tap.x = e.clientX; tap.y = e.clientY; tap.moved = false;
    };
    const secretMove = (e: PointerEvent) => {
      if (e.pointerId === tap.id && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= 8) tap.moved = true;
    };
    const cancelTap = () => { tap.id = -1; };
    const secretUp = (e: PointerEvent) => {
      if (e.pointerId !== tap.id) return;
      tap.id = -1;
      if (tap.moved || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= 8) return;
      const pane = paneAt(e);
      secret.tap(pane, darkRef.current);
      if (secret.progress > 0 && !secretReady) view?.prepareSecret().then(ready => {
        if (!alive) return;
        secretReady = ready;
        if (!ready) secret.reset(); // A failed load can be retried with a fresh sequence.
      });
    };
    document.addEventListener('pointerdown', secretDown, true);
    document.addEventListener('pointermove', secretMove, true);
    document.addEventListener('pointerup', secretUp, true);
    document.addEventListener('pointercancel', cancelTap, true);
    window.addEventListener('scroll', cancelTap, true);
    cleanups.push(() => {
      document.removeEventListener('pointerdown', secretDown, true); document.removeEventListener('pointermove', secretMove, true);
      document.removeEventListener('pointerup', secretUp, true); document.removeEventListener('pointercancel', cancelTap, true);
      window.removeEventListener('scroll', cancelTap, true);
    });
    // il posto (0, 1, 2) sotto il punto: rettangolo proiettato di coppa e gradino
    const pick = (x: number, y: number) => {
      const c = cam(); if (!c || covered) return -1;
      const k = 1 / ratio;
      for (let i = 0; i < 3; i++) {
        if (!platesRef.current[i] && !narrow) continue;
        const t = TROPHY_K[i];
        // Separate the wide step from the narrow trophy: the glass beside the cup is not part of its hit area.
        const boxes = [
          [[STEP_X[i] - 1.1, DAIS, STEP_D], [STEP_X[i] + 1.1, DAIS, STEP_D], [STEP_X[i] - 1.1, STEP_TOP[i], STEP_D], [STEP_X[i] + 1.1, STEP_TOP[i], STEP_D]],
          [[STEP_X[i] - 0.48 * t, STEP_TOP[i], TROPHY_Z], [STEP_X[i] + 0.48 * t, STEP_TOP[i], TROPHY_Z],
            [STEP_X[i] - 0.48 * t, TROPHY_TOP[i] + 0.14 * t, TROPHY_Z], [STEP_X[i] + 0.48 * t, TROPHY_TOP[i] + 0.14 * t, TROPHY_Z]],
        ];
        for (const box of boxes) {
          const pts = box.map(p => project(c, p));
          if (pts.some(p => !p)) continue;
          const xs = pts.map(p => p!.x * k), ys = pts.map(p => p!.y * k);
          if (x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys)) return i;
        }
      }
      return -1;
    };
    const open = (i: number) => {
      const target = narrow ? document.querySelectorAll(".podium-list .pdm-row")[i] : plateEls.current[i]?.querySelector("[role=button]");
      (target as HTMLElement | null)?.click();
    };
    const onMove = (e: PointerEvent) => {
      ptr.x = (e.clientX / window.innerWidth) * 2 - 1; ptr.y = (e.clientY / window.innerHeight) * 2 - 1; ptr.in = true;
      const p = local(e); ptr.cx = p.x; ptr.cy = p.y;
      if (drag.on && e.pointerId === drag.id) {
        drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
        yawTarget = Math.max(-0.42, Math.min(0.42, drag.yaw0 - (e.clientX - drag.x0) * (narrow ? 0.005 : 0.0028)));
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag.on = true; drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.yaw0 = yawTarget; drag.moved = 0;
      const p = local(e); ptr.cx = p.x; ptr.cy = p.y;
      try { slot.setPointerCapture(e.pointerId); } catch {}
    };
    const onUp = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return;
      drag.on = false; drag.at = performance.now();
      try { slot.releasePointerCapture(e.pointerId); } catch {}
      if (e.type !== 'pointercancel' && drag.moved < 8) { const p = local(e);
        const i = pick(p.x, p.y); if (i >= 0) open(i);
      }
    };
    const onLeave = () => { ptr.in = false; ptr.cx = ptr.cy = -1; };
    slot.classList.add("live");
    slot.addEventListener("pointermove", onMove); slot.addEventListener("pointerdown", onDown);
    slot.addEventListener("pointerup", onUp); slot.addEventListener("pointercancel", onUp); slot.addEventListener("pointerleave", onLeave);
    if (!narrow) window.addEventListener("pointermove", onMove, { passive: true });
    cleanups.push(() => {
      slot.classList.remove("live"); slot.style.cursor = "";
      slot.removeEventListener("pointermove", onMove); slot.removeEventListener("pointerdown", onDown);
      slot.removeEventListener("pointerup", onUp); slot.removeEventListener("pointercancel", onUp); slot.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("pointermove", onMove);
    });

    if (narrow) {
      el.appendChild(cv);
      const ro = new ResizeObserver(() => fit());
      ro.observe(el);
      cleanups.push(() => { ro.disconnect(); cv.remove(); });
    } else {
      // la scena scorre con la pagina (è un'apertura a tutto schermo, non uno sfondo fisso)
      let raf = 0;
      const scroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const y = `translate3d(0, ${-window.scrollY}px, 0)`; el.style.transform = y; if (over.current) over.current.style.transform = y; }); };
      window.addEventListener("scroll", scroll, { passive: true }); window.addEventListener("resize", fit);
      const tick = window.setInterval(fit, 1000); // il titolo e la barra del mese possono cambiare altezza
      cleanups.push(() => { window.removeEventListener("scroll", scroll); window.removeEventListener("resize", fit); clearInterval(tick); cancelAnimationFrame(raf); cv.remove(); slot.style.height = ""; });
      el.appendChild(cv);
      scroll();
    }
    measure(); place();

    const lost = () => {
      if (!alive) return; alive = false;
      if (retries.current++ < RETRIES) { setShown(false); setGen((g) => g + 1); } else fail.current();
    };
    acquirePodiumDevice().then(async (dev) => {
      if (!alive) return;
      dev.onLost.add(lost); cleanups.push(() => dev.onLost.delete(lost));
      if (dev.lost) { lost(); return; }
      // ?podiotier=low|medium|high|ultra forza una fascia (prove); ?podiohud mostra fascia, risoluzione e tempi; ?podiot=s
      // ferma la sala all'istante s (confronti fotogramma per fotogramma)
      const forced = (params.get("podiotier") || (tune?.tier !== "auto" ? tune?.tier : null)) as Tier | null;
      const still = params.has("podiot") ? Number(params.get("podiot")) || 0 : null;
      tier = forced && forced in START_SCALE ? forced : capTier(dev.tier, mobile); q = podiumQuality(tier, mobile); scale = Math.min(q.maxScale, START_SCALE[tier]);
      // risoluzione fissa (Opzioni o ?podioscale): niente adattamento
      if (fixedScale) scale = fixedScale;
      const site = covered ? { cloth: await loadDrape() } : null;
      if (!alive) return;
      view = new PodiumView(dev.device, cv, q, dev.timestamps, site);
      view.onError = (err) => { if (alive) { console.warn("Podio 3D: errore WebGPU, si usa il podio semplice.", err.message); alive = false; fail.current(); } };
      await view.ready();
      if (!alive) return;
      if (covered && signRef.current) view.setSign(signRef.current);
      // solo in sviluppo (anteprime, con ?dark): ?podiosegreto apre subito la sorpresa notturna; ?podiosegreto=8.5 la
      // ferma a quell'istante, che window.__podioSegreto può poi spostare (fotogrammi per le prove). Di giorno non c'è.
      const devSecret = process.env.NODE_ENV !== "production" ? params.get("podiosegreto") : null;
      if (devSecret !== null) view.prepareSecret().then((ready) => { if (alive && ready && darkRef.current) { secretReady = true; secret.revealed = true; } });
      fit();
      console.info(`Podio 3D: GPU ${dev.adapter.vendor || "?"} ${dev.adapter.architecture || ""}, ${Math.round(dev.gflops)} GFLOPS → fascia ${tier}`);
      const pace = (vsync: number) => { frameMs = vsync ? refreshes(fps, vsync) * vsync : 1000 / fps; return steadyFps(fps, vsync); };
      const t0 = performance.now();
      let last = t0, first = true, night = darkRef.current ? 1 : 0, frames = 0, slowUntil = 0, avg = 1000 / fps, drawn = t0, hudAt = 0;
      const sm = { x: 0, y: 0, yaw: 0, secretPan: 0 };
      const cups = new Float32Array(12), hot = [0, 0, 0];
      for (let i = 0; i < 3; i++) cups[i * 4] = i * 2.1;
      const motion: CamMotion = { x: 0, y: 0, z: 0, yaw: 0 };
      cleanups.push(renderLoop((now) => {
        // risoluzione scelta nelle Opzioni mentre la sala è aperta: si applica subito
        const wantScale = urlScale || tuneRef.current?.scale || 0;
        if (wantScale !== fixedScale) { fixedScale = wantScale; if (wantScale) scale = wantScale; fit(); }
        const dt = still === null ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
        const t = still ?? (now - t0) / 1000, ease = (rate: number) => 1 - Math.exp(-dt * rate);
        if (!darkRef.current) { secret.reset(); secretStart = -1; }
        if (secret.revealed && secretReady && secretStart < 0) secretStart = now;
        let secretSeconds = secretStart < 0 ? -1 : (now - secretStart) / 1000;
        if (devSecret && secretStart >= 0) secretSeconds = Number((window as { __podioSegreto?: number }).__podioSegreto ?? devSecret) || 0;
        night += ((darkRef.current ? 1 : 0) - night) * ease(2.2); // il sole lascia il posto alla luna piano piano
        // camera: respiro lento, parallasse col puntatore, ritorno dolce dopo il trascinamento
        if (!drag.on && now - drag.at > 2500) yawTarget *= 1 - ease(0.6);
        const amp = narrow ? 0.5 : 1;
        sm.x += ((ptr.in && !narrow ? ptr.x : 0) - sm.x) * ease(2.5); sm.y += ((ptr.in && !narrow ? ptr.y : 0) - sm.y) * ease(2.5);
        sm.yaw += (yawTarget - sm.yaw) * ease(drag.on ? 10 : 3);
        motion.x = (0.45 * Math.sin(t * 0.13) + 0.6 * sm.x) * amp;
        motion.y = (0.14 * Math.sin(t * 0.09 + 1) - 0.3 * sm.y) * amp;
        motion.z = -0.7 * (0.5 + 0.5 * Math.sin(t * 0.06 - 1.2)) * amp;
        motion.yaw = 0.035 * Math.sin(t * 0.05) * amp + sm.yaw;
        // l'ambiente del podio coperto segue la stanza che gira: il cortile si sposta appena tra i due lati
        if (covered) setAmbiencePan(-motion.yaw * 1.4);
        // The left aisle lies outside a portrait crop. Ease it into view only after the secret is revealed.
        // On phones the camera also turns towards the aisle, so the near columns do not hide his walk.
        const pan = secretSeconds >= 0 ? (narrow ? 1.8 : W - left < 900 ? 1 : 0) : 0;
        sm.secretPan += (pan - sm.secretPan) * (reduced.matches ? 1 : 1 - Math.exp(-Math.min(0.05, (now - drawn) / 1000) * 3));
        motion.x -= sm.secretPan;
        if (narrow) { motion.z += sm.secretPan * (4 / 1.8); motion.yaw += sm.secretPan * (0.45 / 1.8); }
        // coppe: girano piano, quella sotto il puntatore (o la cui targhetta è sotto il puntatore) si solleva e brilla
        hover = drag.on && drag.moved > 8 ? -1 : ptr.cx >= 0 ? pick(ptr.cx, ptr.cy) : -1;
        if (hover < 0 && hoverPlate.current >= 0) hover = hoverPlate.current;
        for (let i = 0; i < 3; i++) {
          hot[i] += ((hover === i ? 1 : 0) - hot[i]) * ease(6);
          cups[i * 4] += dt * (0.22 + 2.2 * hot[i]);
          cups[i * 4 + 1] = 0.07 * hot[i] * TROPHY_K[i] + 0.012 * Math.sin(t * 1.3 + i * 2);
          cups[i * 4 + 2] = hot[i];
          plateEls.current[i]?.classList.toggle("hot", hover === i);
        }
        slot.style.cursor = hover >= 0 ? "pointer" : drag.on && drag.moved > 8 ? "grabbing" : "grab";
        if (!view!.render(t, night, motion, cups, secretSeconds, reduced.matches)) return;
        place();
        // risoluzione adattiva sul tempo reale della GPU (marche temporali) o, dove manca, sul ritmo dei fotogrammi. Il
        // bilancio è tre quarti del fotogramma (il resto al browser); la parte fissa (nuvole, ombre, sonde, cubemap) non
        // cambia con i pixel, quella variabile cresce col quadrato della scala: la scala giusta si calcola, poi si
        // raggiunge a passi (in giù subito, in su con calma)
        avg += (now - drawn - avg) * 0.05; drawn = now;
        if (++frames % 30 === 0 && !fixedScale) {
          const gpu = view!.gpuMs, old = scale, budget = frameMs * 0.75;
          if (gpu > 0) {
            const fixed = Math.min(view!.gpuFixedMs, gpu * 0.9);
            const want = Math.min(q.maxScale, cap, Math.max(q.minScale, scale * Math.sqrt(Math.max(0.1, budget - fixed) / (gpu - fixed))));
            if (want < scale * 0.97) { scale = Math.max(want, scale * 0.8); slowUntil = now + 4000; }
            else if (want > scale * 1.03 && now > slowUntil) scale = Math.min(want, scale * 1.1);
            // vicino ai pixel dello schermo si va a 1:1 esatto (ricampionare dell'1% ammorbidisce senza guadagno)
            if (Math.abs(scale - 1) < 0.06 && want > 0.97) scale = Math.min(1, cap);
          } else if (avg > frameMs * 1.3 && scale > q.minScale) { scale = Math.max(q.minScale, scale * 0.9); slowUntil = now + 6000; }
          else if (avg < frameMs * 1.1 && scale < Math.min(1, q.maxScale, cap) && now > slowUntil) scale = Math.min(1, q.maxScale, cap, scale / 0.92 > 0.94 ? 1 : scale / 0.92);
          if (Math.abs(scale - old) > 0.005) fit();
        }
        if (showHud && now - hudAt > 500) {
          hudAt = now;
          const gpu = view!.gpuMs ? `GPU ${view!.gpuMs.toFixed(1)} ms (fissi ${view!.gpuFixedMs.toFixed(1)})` : "GPU n/d";
          setHud(`${tier} · ${Math.round(dev.gflops)} GFLOPS · scena ${Math.round(W * ratio)}×${Math.round(H * ratio)} (×${scale.toFixed(2)}) → ${Math.round(W * out)}×${Math.round(H * out)} · ${gpu} · ${Math.round(1000 / avg)} fps`);
        }
        if (first) { first = false; requestAnimationFrame(() => cv.classList.add("on")); setShown(true); }
      }, pace, el, () => { last = performance.now(); drawn = last; }));
    }).catch((err) => { if (alive) { console.warn("Podio 3D: WebGPU non disponibile, si usa il podio semplice.", err?.message || err); alive = false; fail.current(); } });

    return () => {
      alive = false;
      placeRef.current = null;
      resetSecretRef.current = null;
      cleanups.splice(0).reverse().forEach((fn) => fn());
      plateEls.current.forEach((p) => p?.classList.remove("hot"));
      view?.destroy();
      releasePodiumDevice();
    };
  }, [gen, narrow, showHud, covered, signKey, tuneKey]);

  const hudEl = showHud && hud ? <div className="podium-hud">{hud}</div> : null;
  // le scritte sono disegnate nella sala: ai lettori di schermo arriva lo stesso messaggio come testo
  const signNode = sign ? <p className="sr-only">{sign.label}</p> : null;
  if (narrow) return <><span ref={host as any} hidden>{hudEl && root ? createPortal(hudEl, root) : null}</span>{signNode}</>;
  const order = [1, 0, 2];
  return (
    <>
      <div ref={host} className={`podium-scene ${shown ? "on" : ""}`} aria-hidden="true"><div className="podium-scene-bg" /><i className="podium-scene-scrim" /></div>
      {root && createPortal(
        <div ref={over} className={`podium-over ${shown ? "on" : ""}`}>
          {order.map((i) => plates[i] ? <div key={`p${i}`} ref={(p) => { plateEls.current[i] = p; }} className={`podium3d-plate r${i + 1}`} onPointerEnter={() => { hoverPlate.current = i; }} onPointerLeave={() => { hoverPlate.current = -1; }}>{plates[i]}</div> : null)}
        </div>, root)}
      {signNode}
      {hudEl && root ? createPortal(hudEl, root) : null}
    </>
  );
}
