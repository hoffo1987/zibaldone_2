import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// ===== IL LOGO IN TRE DIMENSIONI =====
// Costruito dalla stessa geometria del logo SVG (riquadro 64×64, arco della "C", pista, tre nodi), non da un modello esterno:
//   - una piastra smaltata con il gradiente verde del logo, spessa e smussata;
//   - la "C" e la pista come tubi bianchi in rilievo, i nodi come sfere; il nodo ambra è una piccola lampada accesa;
//   - la corrente scorre lungo l'arco e la pista; un anello di elettroni gira attorno al logo;
//   - sul retro c'è il circuito stampato: cliccando il logo si gira e lo mostra.
// Il logo guarda il puntatore. All'apertura si assembla: la piastra arriva ruotando, l'arco e la pista si disegnano, i nodi si accendono.

const A0 = Math.atan2(9.6, 11.5); // l'arco parte dal nodo in alto a destra e, passando a sinistra, arriva al nodo ambra
const arcAt = (t: number, z: number) => { const a = A0 + t * (Math.PI * 2 - 2 * A0); return new THREE.Vector3(Math.cos(a) * 15, Math.sin(a) * 15, z); };
const lineAt = (t: number, z: number) => new THREE.Vector3(-1 + 16 * t, 0, z);
const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const back = (k: number) => { k = Math.min(1, Math.max(0, k)); const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const inOut = (k: number) => { k = Math.min(1, Math.max(0, k)); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };

const glowTexture = () => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const roundedSquare = (h: number, r: number) => {
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r); s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h); s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r); s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};
// curva fatta di segmenti dritti (per le piste del circuito stampato)
const polyline = (pts: number[][], z: number) => {
  const p = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) p.add(new THREE.LineCurve3(new THREE.Vector3(pts[i - 1][0], pts[i - 1][1], z), new THREE.Vector3(pts[i][0], pts[i][1], z)));
  return p;
};

type Props = { intro?: boolean; spd?: number; fallback: React.ReactNode; className?: string };

export default function Logo3D({ intro = true, spd = 1, fallback, className = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState(false);
  const spdRef = useRef(spd); spdRef.current = spd;

  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (e) { setFail(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;cursor:pointer;touch-action:manipulation";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000); camera.position.set(0, 0, 182);
    const disposables: any[] = [envTex, pmrem];
    const keep = (x: any) => { disposables.push(x); return x; };

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(50, 70, 120); scene.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 2.4); rim.position.set(-90, -30, -60); scene.add(rim);
    const warm = new THREE.DirectionalLight(0xfbbf24, 0.8); warm.position.set(80, -60, 40); scene.add(warm);

    const root = new THREE.Group(); scene.add(root);      // segue il puntatore e fluttua
    const spin = new THREE.Group(); root.add(spin);       // giro completo al clic
    const badge = new THREE.Group(); spin.add(badge);     // l'oggetto vero e proprio

    // --- piastra smaltata con il gradiente del logo ---
    const plateGeo = keep(new THREE.ExtrudeGeometry(roundedSquare(30, 15), { depth: 6, bevelEnabled: true, bevelThickness: 2.4, bevelSize: 2, bevelSegments: 8, curveSegments: 40 }));
    plateGeo.translate(0, 0, -3);
    const ca = new THREE.Color("#17C3AE"), cb = new THREE.Color("#0A4F49"), pos = plateGeo.attributes.position, col = new Float32Array(pos.count * 3), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = Math.min(1, Math.max(0, (x + 32 + (32 - y)) / 128));
      tmp.copy(ca).lerp(cb, t); if (z < 0) tmp.multiplyScalar(0.55); // il retro è più scuro: lì sta il circuito stampato
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    plateGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const plateMat = keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4, sheenColor: new THREE.Color("#7ff5e3") }));
    badge.add(new THREE.Mesh(plateGeo, plateMat));
    const FRONT = 5.4, BACK = -5.4;

    // --- la "C", la pista e i nodi ---
    const white = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, metalness: 0, clearcoat: 1, emissive: 0xffffff, emissiveIntensity: 0.06 }));
    const arcCurve = new (class extends THREE.Curve { getPoint(t: number, v = new THREE.Vector3()) { return v.copy(arcAt(t, FRONT + 1.2)); } })();
    const arcGeo = keep(new THREE.TubeGeometry(arcCurve, 160, 2.5, 20, false));
    const arc = new THREE.Mesh(arcGeo, white); badge.add(arc);
    const lineGeo = keep(new THREE.TubeGeometry(new THREE.LineCurve3(lineAt(0, FRONT + 1), lineAt(1, FRONT + 1)), 40, 1.5, 14, false));
    const line = new THREE.Mesh(lineGeo, white); badge.add(line);
    const capGeo = keep(new THREE.SphereGeometry(1, 32, 24));
    const cap = (p: any, r: number, m: any) => { const s = new THREE.Mesh(capGeo, m); s.position.copy(p); s.scale.setScalar(r); badge.add(s); return s; };
    const amberMat = keep(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.2, roughness: 0.25 }));
    const n1 = cap(arcAt(0, FRONT + 2), 4.2, white), n2 = cap(arcAt(1, FRONT + 2), 4.2, amberMat), n3 = cap(lineAt(0, FRONT + 2), 3.2, white);
    const nodes = [n1, n3, n2];
    const lamp = new THREE.PointLight(0xfbbf24, 0, 70, 1); lamp.position.copy(arcAt(1, FRONT + 9)); badge.add(lamp);

    // --- bagliori: la lampada ambra e gli impulsi di corrente ---
    const glowTex = keep(glowTexture());
    const sprite = (color: number, s: number) => { const m = keep(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); const sp = new THREE.Sprite(m); sp.scale.setScalar(s); return sp; };
    const halo = sprite(0xfbbf24, 0.1); halo.position.copy(arcAt(1, FRONT + 4)); badge.add(halo);
    const pulses = Array.from({ length: 4 }, (_, i) => { const p = sprite(i === 3 ? 0xfbbf24 : 0xffe9a8, 7); p.material.opacity = 0; badge.add(p); return p; });

    // --- retro: il circuito stampato (piste dorate, piazzole, un chip) ---
    const gold = keep(new THREE.MeshStandardMaterial({ color: 0xe8b04a, metalness: 1, roughness: 0.28 }));
    const TR = [[[-22, -20], [-22, -6], [-12, 4], [-12, 18]], [[-4, 22], [-4, 10], [6, 0], [20, 0]], [[22, -22], [10, -22], [2, -14], [2, -4]], [[-24, 12], [-16, 20], [-6, 20]], [[14, 24], [14, 12], [22, 4]], [[-14, -24], [-4, -24], [4, -16]]];
    TR.forEach((pts) => {
      const g = keep(new THREE.TubeGeometry(polyline(pts, BACK - 0.5), pts.length * 12, 0.65, 8, false)); badge.add(new THREE.Mesh(g, gold));
      [pts[0], pts[pts.length - 1]].forEach(([x, y]) => { const d = new THREE.Mesh(capGeo, gold); d.position.set(x, y, BACK - 0.6); d.scale.set(1.9, 1.9, 0.6); badge.add(d); });
    });
    const chipGeo = keep(new THREE.BoxGeometry(16, 11, 2.2));
    const chip = new THREE.Mesh(chipGeo, keep(new THREE.MeshPhysicalMaterial({ color: 0x0b1f1d, roughness: 0.45, clearcoat: 0.6 }))); chip.position.set(8, -10, BACK - 1.4); badge.add(chip);
    const pinGeo = keep(new THREE.BoxGeometry(1.1, 2.6, 0.8));
    for (let k = 0; k < 6; k++) [-1, 1].forEach((s) => { const p = new THREE.Mesh(pinGeo, gold); p.position.set(8 - 6.25 + k * 2.5, -10 + s * 6.6, BACK - 0.9); badge.add(p); });

    // --- anello di elettroni attorno al logo ---
    const N = 140, ringPos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, r = 43 + Math.sin(i * 7.3) * 1.6; ringPos[i * 3] = Math.cos(a) * r; ringPos[i * 3 + 1] = Math.sin(a) * r; ringPos[i * 3 + 2] = Math.sin(i * 3.1) * 1.5; }
    const ringGeo = keep(new THREE.BufferGeometry()); ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
    const ringMat = keep(new THREE.PointsMaterial({ size: 3.2, map: glowTex, color: 0x5eead4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Points(ringGeo, ringMat); ring.rotation.set(1.15, 0.35, 0); root.add(ring);
    const electrons = [0, 1].map(() => sprite(0xfbbf24, 9)); electrons.forEach((e) => { e.material.opacity = 0; root.add(e); });

    // --- scintille del clic ---
    const SP = 60, spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3);
    const spGeo = keep(new THREE.BufferGeometry()); spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3));
    const spMat = keep(new THREE.PointsMaterial({ size: 4, map: glowTex, color: 0xfbbf24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    root.add(new THREE.Points(spGeo, spMat));
    let sparkT = -1;
    const burst = () => {
      for (let i = 0; i < SP; i++) {
        const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * Math.PI, v = 40 + Math.random() * 70;
        spPos[i * 3] = spPos[i * 3 + 1] = spPos[i * 3 + 2] = 0;
        spVel[i * 3] = Math.cos(a) * Math.cos(b) * v; spVel[i * 3 + 1] = Math.sin(a) * Math.cos(b) * v; spVel[i * 3 + 2] = Math.sin(b) * v + 30;
      }
      sparkT = 0;
    };

    // --- puntatore, clic, dimensioni, visibilità ---
    const ptr = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      ptr.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      ptr.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    };
    window.addEventListener("pointermove", move, { passive: true });
    let flipT = -1, flips = 0, boost = 0;
    const click = () => { flipT = 0; flips++; boost = 1; burst(); };
    renderer.domElement.addEventListener("click", click);
    const fit = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    fit();
    const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(el);
    let vis = true;
    const io = "IntersectionObserver" in window ? new IntersectionObserver(([e]) => { vis = e.isIntersecting; }) : null; io?.observe(el);

    // --- animazione ---
    let raf = 0, last = performance.now(), T = intro ? 0 : 5; // T in secondi (scalati dalla velocità globale)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !vis) { last = now; return; }
      step(now);
    };
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (spdRef.current || 1); last = now; T += dt;

      // ingresso: la piastra arriva ruotando da lontano, l'arco e la pista si disegnano, i nodi si accendono
      const kIn = back((T - 0.05) / 1.0);
      badge.scale.setScalar(0.35 + 0.65 * Math.min(1.08, kIn));
      badge.position.z = -70 * (1 - ease((T - 0.05) / 0.9));
      badge.rotation.set(0.9 * (1 - ease(T / 1.0)), -2.6 * (1 - ease(T / 1.1)), 0.4 * (1 - ease(T / 1.0)));
      arcGeo.setDrawRange(0, Math.floor(arcGeo.index.count * ease((T - 0.35) / 0.8) / 3) * 3);
      lineGeo.setDrawRange(0, Math.floor(lineGeo.index.count * ease((T - 0.95) / 0.35) / 3) * 3);
      nodes.forEach((n, i) => n.scale.setScalar((i === 1 ? 3.2 : 4.2) * Math.max(0.0001, back((T - 0.85 - i * 0.14) / 0.45))));
      const on = ease((T - 1.25) / 0.5);
      amberMat.emissiveIntensity = 0.2 + 1.6 * on + 0.35 * on * Math.sin(T * 2.4);
      lamp.intensity = 5 * on * (0.85 + 0.15 * Math.sin(T * 2.4));
      halo.scale.setScalar(0.1 + 26 * on * (0.9 + 0.1 * Math.sin(T * 2.4)));
      halo.material.opacity = 0.75 * on;
      ringMat.opacity = 0.55 * ease((T - 1.4) / 0.8);
      ring.rotation.z += dt * 0.25;
      electrons.forEach((e, i) => {
        const a = T * (0.9 + i * 0.35) + i * Math.PI, v = new THREE.Vector3(Math.cos(a) * 43, Math.sin(a) * 43, 0).applyEuler(ring.rotation);
        e.position.copy(v); e.material.opacity = 0.9 * ease((T - 1.6) / 0.6);
      });

      // la corrente percorre l'arco (dal nodo bianco al nodo ambra) e la pista
      boost = Math.max(0, boost - dt * 0.6);
      const sp = 0.42 * (1 + boost * 3), flow = ease((T - 1.45) / 0.4);
      pulses.forEach((p, i) => {
        if (i < 3) { const u = (T * sp + i / 3) % 1; p.position.copy(arcAt(u, FRONT + 4.2)); p.material.opacity = flow * Math.sin(u * Math.PI); }
        else { const u = (T * sp * 1.6) % 1; p.position.copy(lineAt(u, FRONT + 3.6)); p.material.opacity = flow * Math.sin(u * Math.PI); }
      });

      // segue il puntatore, fluttua; al clic fa un giro completo e mostra il circuito sul retro
      cur.x += (ptr.x - cur.x) * (1 - Math.exp(-dt * 6)); cur.y += (ptr.y - cur.y) * (1 - Math.exp(-dt * 6));
      root.rotation.y = cur.x * 0.75 + Math.sin(T * 0.5) * 0.12;
      root.rotation.x = cur.y * 0.5 + Math.sin(T * 0.7) * 0.06;
      root.position.y = Math.sin(T * 1.2) * 2;
      if (flipT >= 0) { flipT += dt; spin.rotation.y = (flips - 1) * Math.PI * 2 + inOut(flipT / 1.4) * Math.PI * 2; if (flipT > 1.4) flipT = -1; }
      if (sparkT >= 0) {
        sparkT += dt;
        for (let i = 0; i < SP * 3; i++) { spPos[i] += spVel[i] * dt; spVel[i] *= 1 - dt * 1.8; }
        spGeo.attributes.position.needsUpdate = true;
        spMat.opacity = Math.max(0, 1 - sparkT / 1.1);
        if (sparkT > 1.1) sparkT = -1;
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); ro?.disconnect(); io?.disconnect();
      window.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("click", click);
      disposables.forEach((d) => d?.dispose?.());
      renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  if (fail) return <>{fallback}</>;
  return <div ref={host} className={className} role="img" aria-label="Il Circuito" title="Clicca: gira il logo e guarda il circuito sul retro" />;
}
