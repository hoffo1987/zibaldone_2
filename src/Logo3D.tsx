import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ===== IL LOGO IN TRE DIMENSIONI =====
// Costruito dalla geometria del logo SVG (riquadro 64×64, arco della "C", pista, tre nodi), non da un modello esterno.
//   - Piastra smaltata con il gradiente del logo, spessa e smussata, con il filo bianco interno del logo originale.
//   - La "C" e la pista sono tubi perlati; la corrente scorre DENTRO i tubi (shader): parte dal nodo bianco, fa il giro
//     della C, arriva al nodo ambra che si accende di colpo, poi corre lungo la pista. Le fasi si integrano nel tempo,
//     quindi nessun salto né inversione quando la velocità cambia.
//   - Due orbite sottili con un elettrone ciascuno, che lascia una scia.
//   - Sul retro, il circuito stampato.
// Interazione: guarda il puntatore; al passaggio si avvicina e la corrente si fa più intensa; si può TRASCINARE per farlo
// girare (con inerzia); ogni clic aggiunge una spinta che si somma alla rotazione in corso (non ricomincia mai daccapo);
// quando rallenta, una molla lo riporta dolcemente a guardarti. Da tastiera: Invio o Spazio.
// Riflessi: un piccolo studio fotografico costruito qui (pannelli bianco, verde e ambra), coerente con i colori del sito.

const TAU = Math.PI * 2;
const A0 = Math.atan2(9.6, 11.5); // l'arco parte dal nodo in alto a destra e, passando a sinistra, arriva al nodo ambra
const arcAt = (t: number, z: number) => { const a = A0 + t * (TAU - 2 * A0); return new THREE.Vector3(Math.cos(a) * 15, Math.sin(a) * 15, z); };
const lineAt = (t: number, z: number) => new THREE.Vector3(-1 + 16 * t, 0, z);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const ease = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const back = (k: number) => { k = clamp01(k); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

const glowTexture = () => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.6)"); r.addColorStop(0.5, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const roundedSquare = (h: number, r: number, path?: any) => {
  const s = path || new THREE.Shape();
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r); s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h); s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r); s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};
const polyline = (pts: number[][], z: number) => {
  const p = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) p.add(new THREE.LineCurve3(new THREE.Vector3(pts[i - 1][0], pts[i - 1][1], z), new THREE.Vector3(pts[i][0], pts[i][1], z)));
  return p;
};
// studio fotografico per i riflessi: fondo scuro, una grande luce morbida bianca, un pannello verde e una striscia ambra
const studio = (renderer: any) => {
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x07110f);
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (w: number, h: number, color: number, k: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.scale.set(w, h, 1); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); return m;
  };
  panel(9, 5, 0xffffff, 3.2, 3, 5, 6);      // luce principale, in alto a destra davanti
  panel(14, 3, 0xffffff, 0.9, 0, -2, 9);    // riempimento basso e frontale
  panel(4, 10, 0x2dd4bf, 2.2, -8, 1, 1);    // verde a sinistra: i bordi della piastra riprendono il colore del sito
  panel(10, 1.2, 0xfbbf24, 2.4, 4, -6, -2); // striscia ambra in basso
  panel(16, 16, 0x0e3b36, 0.5, 0, 0, -10);  // fondo verde scurissimo
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(sc, 0.035).texture;
  pm.dispose(); geo.dispose(); sc.traverse((o: any) => o.material?.dispose?.());
  return tex;
};
// materiale perlato in cui scorre la corrente: una testa luminosa con una scia, guidata dalla fase uPh (0 = inizio del tubo, 1 = fine)
const currentMaterial = (uniforms: any) => {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xf4fffd, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 1, sheenColor: new THREE.Color(0x9ff3e4), sheenRoughness: 0.4, iridescence: 0.25, iridescenceIOR: 1.4, emissive: 0xffffff, emissiveIntensity: 0.04, envMapIntensity: 0.9 });
  m.onBeforeCompile = (sh: any) => {
    sh.uniforms.uPh = uniforms.uPh; sh.uniforms.uGain = uniforms.uGain;
    sh.vertexShader = "attribute float aT;\nvarying float vT;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vT = aT;");
    // il tubo è perlato, quasi bianco: un bagliore sommato si perderebbe nei riflessi (misurato: da 216,221,220 a 243,233,195).
    // Il colore della corrente si applica quindi alla fine, dopo il tone mapping: nucleo caldo quasi bianco, scia ambra che sfuma.
    sh.fragmentShader = `uniform float uPh;
uniform float uGain;
varying float vT;
` + sh.fragmentShader.replace(
      "#include <colorspace_fragment>",
      `#include <colorspace_fragment>
  {
    float d = uPh - vT;
    float head = exp(-d * d * 1400.0);
    float tail = d > 0.0 ? exp(-d * 6.0) * 0.75 : 0.0;
    float k = clamp((head + tail) * uGain, 0.0, 1.0);
    vec3 hot = mix(vec3(1.0, 0.56, 0.08), vec3(1.0, 0.93, 0.72), clamp(head * 1.2, 0.0, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, hot, k * 0.92);
  }`
    );
  };
  m.customProgramCacheKey = () => "corrente";
  return m;
};
const withT = (g: any) => { const uv = g.attributes.uv, a = new Float32Array(uv.count); for (let i = 0; i < uv.count; i++) a[i] = uv.getX(i); g.setAttribute("aT", new THREE.BufferAttribute(a, 1)); return g; };

type Props = { intro?: boolean; spd?: number; fallback: React.ReactNode; className?: string };

export default function Logo3D({ intro = true, spd = 1, fallback, className = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState(false);
  const spdRef = useRef(spd); spdRef.current = spd;

  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: any;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch (e) { setFail(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const envTex = studio(renderer); scene.environment = envTex;
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000); camera.position.set(0, 0, 182);
    const disposables: any[] = [envTex];
    const keep = (x: any) => { disposables.push(x); return x; };

    scene.add(new THREE.HemisphereLight(0xdffcf7, 0x062521, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(60, 80, 110); scene.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 2.6); rim.position.set(-100, 10, -70); scene.add(rim);

    const root = new THREE.Group(); scene.add(root);   // guarda il puntatore e fluttua
    const spin = new THREE.Group(); root.add(spin);    // rotazione libera (trascinamento, clic)
    const badge = new THREE.Group(); spin.add(badge);  // l'oggetto

    // --- piastra smaltata ---
    const plateGeo = keep(new THREE.ExtrudeGeometry(roundedSquare(29.5, 14.5), { depth: 5, bevelEnabled: true, bevelThickness: 3, bevelSize: 2.5, bevelSegments: 10, curveSegments: 48 }));
    plateGeo.translate(0, 0, -2.5);
    const ca = new THREE.Color("#1fd0b9"), cb = new THREE.Color("#0A4F49"), pos = plateGeo.attributes.position, nor = plateGeo.attributes.normal, col = new Float32Array(pos.count * 3), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), nz = nor.getZ(i), t = clamp01((x + 32 + (32 - y)) / 128);
      tmp.copy(ca).lerp(cb, t);
      if (nz < -0.6) tmp.lerp(new THREE.Color("#0b3b36"), 0.55); // solo la faccia posteriore è più scura (lì c'è il circuito stampato)
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    plateGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const plateMat = keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.05, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.75 }));
    badge.add(new THREE.Mesh(plateGeo, plateMat));
    const FRONT = 5.5, BACK = -5.5;
    // il filo bianco interno del logo originale, in leggero rilievo
    const rimShape = roundedSquare(28.2, 13.4); rimShape.holes.push(roundedSquare(27.2, 12.6, new THREE.Path()));
    const rimGeo = keep(new THREE.ExtrudeGeometry(rimShape, { depth: 0.5, bevelEnabled: false, curveSegments: 48 }));
    const rimMesh = new THREE.Mesh(rimGeo, keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, roughness: 0.3, clearcoat: 1 })));
    rimMesh.position.z = FRONT - 0.15; badge.add(rimMesh);

    // --- la "C", la pista, i nodi: la corrente scorre dentro i tubi ---
    const uArc = { uPh: { value: -1 }, uGain: { value: 0 } }, uLine = { uPh: { value: -1 }, uGain: { value: 0 } };
    const arcCurve = new (class extends THREE.Curve { getPoint(t: number, v = new THREE.Vector3()) { return v.copy(arcAt(t, FRONT + 1.3)); } })();
    const arcGeo = keep(withT(new THREE.TubeGeometry(arcCurve, 220, 2.5, 24, false)));
    badge.add(new THREE.Mesh(arcGeo, keep(currentMaterial(uArc))));
    const lineGeo = keep(withT(new THREE.TubeGeometry(new THREE.LineCurve3(lineAt(0, FRONT + 1.1), lineAt(1, FRONT + 1.1)), 60, 1.5, 16, false)));
    badge.add(new THREE.Mesh(lineGeo, keep(currentMaterial(uLine))));
    const capGeo = keep(new THREE.SphereGeometry(1, 40, 28));
    const pearl = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, clearcoat: 1, sheen: 1, sheenColor: new THREE.Color(0x9ff3e4), iridescence: 0.3 }));
    const amberMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.3, roughness: 0.2, clearcoat: 1 }));
    const cap = (p: any, m: any) => { const s = new THREE.Mesh(capGeo, m); s.position.copy(p); badge.add(s); return s; };
    const n1 = cap(arcAt(0, FRONT + 2), pearl), n3 = cap(lineAt(0, FRONT + 2), pearl), n2 = cap(arcAt(1, FRONT + 2), amberMat);
    const nodes: [any, number][] = [[n1, 4.2], [n3, 3.2], [n2, 4.2]];
    const lamp = new THREE.PointLight(0xfbbf24, 0, 60, 1.2); lamp.position.copy(arcAt(1, FRONT + 9)); badge.add(lamp);

    // --- bagliori (texture radiale, somma additiva) ---
    const glowTex = keep(glowTexture());
    const sprite = (color: number, s: number, parent: any) => {
      const m = keep(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      const sp = new THREE.Sprite(m); sp.scale.setScalar(s); parent.add(sp); return sp;
    };
    const halo = sprite(0xfbbf24, 15, badge); halo.position.copy(arcAt(1, FRONT + 3.5));
    const sparkHead = sprite(0xffe2a0, 9, badge); // la testa della corrente, un po' fuori dal tubo per farla brillare

    // --- retro: circuito stampato ---
    const gold = keep(new THREE.MeshPhysicalMaterial({ color: 0xe8b04a, metalness: 1, roughness: 0.25, envMapIntensity: 1.2 }));
    const TR = [[[-22, -20], [-22, -6], [-12, 4], [-12, 18]], [[-4, 22], [-4, 10], [6, 0], [20, 0]], [[22, -22], [10, -22], [2, -14], [2, -4]], [[-24, 12], [-16, 20], [-6, 20]], [[14, 24], [14, 12], [22, 4]], [[-14, -24], [-4, -24], [4, -16]]];
    TR.forEach((pts) => {
      badge.add(new THREE.Mesh(keep(new THREE.TubeGeometry(polyline(pts, BACK - 0.5), pts.length * 12, 0.65, 8, false)), gold));
      [pts[0], pts[pts.length - 1]].forEach(([x, y]) => { const d = new THREE.Mesh(capGeo, gold); d.position.set(x, y, BACK - 0.6); d.scale.set(1.9, 1.9, 0.6); badge.add(d); });
    });
    const chip = new THREE.Mesh(keep(new THREE.BoxGeometry(16, 11, 2.2)), keep(new THREE.MeshPhysicalMaterial({ color: 0x0b1f1d, roughness: 0.4, clearcoat: 0.7 }))); chip.position.set(8, -10, BACK - 1.4); badge.add(chip);
    const pinGeo = keep(new THREE.BoxGeometry(1.1, 2.6, 0.8));
    for (let k = 0; k < 6; k++) [-1, 1].forEach((s) => { const p = new THREE.Mesh(pinGeo, gold); p.position.set(1.75 + k * 2.5, -10 + s * 6.6, BACK - 0.9); badge.add(p); });

    // --- orbite: due anelli sottili, ognuno con un elettrone e la sua scia ---
    const orbits = [{ r: 44, tilt: [1.2, 0.35, 0], speed: 0.55, color: 0x5eead4, ph: 0 }, { r: 48, tilt: [1.0, -0.6, 0.4], speed: -0.38, color: 0xfbbf24, ph: 2.1 }].map((o) => {
      const g = new THREE.Group(); g.rotation.set(o.tilt[0], o.tilt[1], o.tilt[2]); root.add(g);
      const ringMat = keep(new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(new THREE.Mesh(keep(new THREE.TorusGeometry(o.r, 0.18, 6, 200)), ringMat));
      const trail = Array.from({ length: 9 }, (_, i) => sprite(o.color, 8 - i * 0.6, g));
      return { ...o, g, ringMat, trail };
    });

    // --- scintille: ogni particella ha la sua vita, così più clic di fila non azzerano quelle già partite ---
    const SP = 120, spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spCol = new Float32Array(SP * 3), spLife = new Float32Array(SP);
    const spGeo = keep(new THREE.BufferGeometry());
    spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
    root.add(new THREE.Points(spGeo, keep(new THREE.PointsMaterial({ size: 3.6, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))));
    let spNext = 0;
    const burst = (n: number) => {
      for (let k = 0; k < n; k++) {
        const i = spNext; spNext = (spNext + 1) % SP;
        const a = Math.random() * TAU, b = (Math.random() - 0.5) * Math.PI, v = 45 + Math.random() * 75;
        spPos[i * 3] = spPos[i * 3 + 1] = 0; spPos[i * 3 + 2] = 6;
        spVel[i * 3] = Math.cos(a) * Math.cos(b) * v; spVel[i * 3 + 1] = Math.sin(a) * Math.cos(b) * v; spVel[i * 3 + 2] = Math.sin(b) * v * 0.6 + 25;
        spLife[i] = 0.7 + Math.random() * 0.6;
      }
    };

    // --- interazione: puntatore, passaggio, trascinamento con inerzia, clic che si sommano ---
    const ptr = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    let hover = false, drag = false, dragX = 0, dragMoved = 0, lastMove = 0, ang = 0, vel = 0, settle: number | null = null, boost = 0, hoverK = 0;
    const look = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      ptr.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      ptr.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    };
    let spins = 0;
    // ogni spinta si somma al giro in corso; il terminale del pannello la registra (evento "circuito:giro")
    const kick = () => { vel = Math.min(42, vel + 9.5); settle = null; boost = 1; burst(40); spins++; window.dispatchEvent(new CustomEvent("circuito:giro", { detail: spins })); };
    const cv = renderer.domElement;
    const down = (e: PointerEvent) => { drag = true; dragX = e.clientX; dragMoved = 0; lastMove = performance.now(); try { cv.setPointerCapture(e.pointerId); } catch {} cv.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => {
      look(e);
      if (!drag) return;
      const dx = e.clientX - dragX, now = performance.now(), dt = Math.max(8, now - lastMove) / 1000;
      dragX = e.clientX; dragMoved += Math.abs(dx); lastMove = now;
      const d = dx * 0.013; ang += d; vel = damp(vel, d / dt, 18, dt); settle = null;
    };
    const up = (e: PointerEvent) => {
      if (!drag) return; drag = false; cv.style.cursor = hover ? "grab" : "";
      try { cv.releasePointerCapture(e.pointerId); } catch {}
      if (dragMoved < 5) kick(); // un clic: spinta che si somma al giro in corso
      else if (performance.now() - lastMove > 90) vel = 0; // trascinato e fermato prima di lasciare: niente lancio
    };
    const enter = () => { hover = true; if (!drag) cv.style.cursor = "grab"; };
    const leave = () => { hover = false; if (!drag) cv.style.cursor = ""; };
    const keyDown = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kick(); } };
    window.addEventListener("pointermove", move, { passive: true });
    cv.addEventListener("pointerdown", down); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    cv.addEventListener("pointerenter", enter); cv.addEventListener("pointerleave", leave); el.addEventListener("keydown", keyDown);

    const fit = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    fit();
    const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(el);
    let vis = true;
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { vis = e.isIntersecting; }) : null; io?.observe(el);

    // --- tempo: tutte le fasi si integrano (fase += velocità × dt), quindi cambiare velocità non fa mai saltare nulla ---
    let raf = 0, last = performance.now(), T = intro ? 0 : 6;
    let cyc = 0, flash = 0, orbPh = [0, 0];
    const CYCLE = 2.6; // un giro di corrente: arco (0–1.15 s), lampo del nodo ambra, pista (1.2–1.6 s), pausa
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (spdRef.current || 1); last = now; T += dt;

      // ingresso: la piastra arriva ruotando da lontano, l'arco e la pista si disegnano, i nodi si accendono
      const kIn = back((T - 0.05) / 1.0);
      badge.scale.setScalar(0.35 + 0.65 * Math.min(1.06, kIn));
      badge.rotation.set(0.9 * (1 - ease(T / 1.0)), -2.6 * (1 - ease(T / 1.1)), 0.4 * (1 - ease(T / 1.0)));
      arcGeo.setDrawRange(0, Math.floor((arcGeo.index.count * ease((T - 0.35) / 0.8)) / 3) * 3);
      lineGeo.setDrawRange(0, Math.floor((lineGeo.index.count * ease((T - 0.95) / 0.35)) / 3) * 3);
      nodes.forEach(([n, r], i) => n.scale.setScalar(r * Math.max(0.0001, back((T - 0.85 - i * 0.14) / 0.45))));
      const on = ease((T - 1.25) / 0.5);

      // corrente: la fase del ciclo avanza integrata; i clic e il passaggio del mouse la accelerano senza salti
      hoverK = damp(hoverK, hover ? 1 : 0, 6, dt);
      boost = Math.max(0, boost - dt * 0.5);
      if (T > 1.4) cyc += (dt / CYCLE) * (1 + boost * 2.2 + hoverK * 0.6);
      const c = (cyc % 1) * CYCLE, prevFlash = flash;
      const arcPh = c / 1.15, linePh = (c - 1.2) / 0.4;
      uArc.uPh.value = arcPh < 1.25 ? arcPh : -1; uArc.uGain.value = on * (1 + hoverK * 0.5 + boost * 0.6);
      uLine.uPh.value = linePh > -0.1 && linePh < 1.3 ? linePh : -1; uLine.uGain.value = uArc.uGain.value;
      const headOn = arcPh >= 0 && arcPh <= 1;
      if (headOn) { sparkHead.position.copy(arcAt(arcPh, FRONT + 4.2)); sparkHead.material.opacity = on * 0.9 * Math.sin(Math.min(1, arcPh * 6) * Math.PI / 2); }
      else if (linePh >= 0 && linePh <= 1) { sparkHead.position.copy(lineAt(linePh, FRONT + 3.4)); sparkHead.material.opacity = on * 0.75 * (1 - linePh * 0.5); }
      else sparkHead.material.opacity = 0;
      // il nodo ambra si accende di colpo quando la corrente arriva, poi si spegne piano fino al giro dopo
      flash = arcPh >= 1 && arcPh < 1.25 ? 1 : Math.max(0, prevFlash - dt * 1.6);
      amberMat.emissiveIntensity = on * (0.55 + 3.2 * flash + hoverK * 0.4);
      lamp.intensity = on * (1.2 + 6 * flash);
      halo.material.opacity = on * (0.25 + 0.75 * flash);
      halo.scale.setScalar(11 + 16 * flash);
      n2.scale.setScalar(4.2 * (T > 1.5 ? 1 + 0.12 * flash : Math.max(0.0001, back((T - 1.13) / 0.45))));

      // orbite
      orbits.forEach((o, i) => {
        orbPh[i] += dt * o.speed * (1 + boost * 2.5 + hoverK * 0.5);
        o.ringMat.opacity = 0.09 * ease((T - 1.5) / 0.8) * (1 + hoverK * 1.2);
        o.trail.forEach((s: any, j: number) => { const a = orbPh[i] + o.ph - j * 0.035 * Math.sign(o.speed); s.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r, 0); s.material.opacity = ease((T - 1.7) / 0.6) * (0.95 - j * 0.1); });
      });

      // rotazione libera: inerzia mentre gira veloce, poi una molla la riporta di fronte (sempre in avanti, mai a ritroso)
      if (!drag) {
        if (Math.abs(vel) > 2.4 && settle === null) { vel *= Math.exp(-dt * 0.85); }
        else {
          if (settle === null) { // il prossimo "di fronte" nel verso in cui sta girando (se l'ha appena superato di poco, torna indietro di quel poco)
            const p = (ang + vel * 0.25) / TAU;
            settle = (vel > 0.3 ? Math.ceil(p - 0.08) : vel < -0.3 ? Math.floor(p + 0.08) : Math.round(p)) * TAU;
          }
          vel += (-(ang - settle) * 26 - vel * 8.5) * dt;
          if (Math.abs(ang - settle) < 0.0005 && Math.abs(vel) < 0.002) { ang = settle; vel = 0; }
        }
        ang += vel * dt;
      }
      spin.rotation.y = ang;
      spin.rotation.z = -vel * 0.004; // nel giro veloce si inclina appena, come una moneta

      // sguardo verso il puntatore, galleggiamento, avvicinamento al passaggio
      cur.x = damp(cur.x, ptr.x, 6, dt); cur.y = damp(cur.y, ptr.y, 6, dt);
      root.rotation.y = cur.x * 0.7 + Math.sin(T * 0.5) * 0.1;
      root.rotation.x = cur.y * 0.45 + Math.sin(T * 0.7) * 0.05;
      root.position.y = Math.sin(T * 1.2) * 1.8;
      root.position.z = -60 * (1 - ease((T - 0.05) / 0.9)) + hoverK * 10;

      // scintille
      for (let i = 0; i < SP; i++) {
        if (spLife[i] <= 0) { spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; continue; }
        spLife[i] -= dt;
        spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
        const f = Math.exp(-dt * 2.2); spVel[i * 3] *= f; spVel[i * 3 + 1] *= f; spVel[i * 3 + 2] *= f;
        const l = Math.max(0, Math.min(1, spLife[i])); spCol[i * 3] = l; spCol[i * 3 + 1] = l * 0.75; spCol[i * 3 + 2] = l * 0.3;
      }
      spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !vis) { last = now; return; }
      step(now);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect();
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointerenter", enter); cv.removeEventListener("pointerleave", leave); el.removeEventListener("keydown", keyDown);
      disposables.forEach((d) => d?.dispose?.());
      renderer.dispose(); cv.remove();
    };
  }, []);

  if (fail) return <>{fallback}</>;
  return <div ref={host} className={className} role="button" tabIndex={0} aria-label="Il Circuito: logo in 3D. Premi per farlo girare, o trascinalo" title="Trascinalo o cliccalo: gira e mostra il circuito sul retro" />;
}
