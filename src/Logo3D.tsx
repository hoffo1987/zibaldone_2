import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { renderLoop } from "./renderLoop";

const TAU = Math.PI * 2;
const A0 = Math.atan2(9.6, 11.5);
const arcAt = (t: number, z: number) => { const a = A0 + t * (TAU - 2 * A0); return new THREE.Vector3(Math.cos(a) * 15, Math.sin(a) * 15, z); };
const lineAt = (t: number, z: number) => new THREE.Vector3(-1 + 16 * t, 0, z);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
const ease = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const back = (k: number) => { k = clamp01(k); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.abs(Math.pow(k - 1, 2)); };
const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

const glowTexture = () => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.65)"); r.addColorStop(0.5, "rgba(255,255,255,.15)"); r.addColorStop(1, "rgba(255,255,255,0)");
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

const studio = (renderer: any) => {
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0x06100e);
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (w: number, h: number, color: number, k: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.scale.set(w, h, 1); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); return m;
  };
  panel(10, 6, 0xffffff, 3.6, 3.5, 5.5, 6);
  panel(14, 3.5, 0xffffff, 1.1, 0, -2.5, 9);
  panel(4.5, 11, 0x2dd4bf, 2.6, -8, 1.5, 1.5);
  panel(11, 1.5, 0xfbbf24, 2.8, 4, -6, -2);
  panel(3, 3, 0xffffff, 5.0, -4, 7, 5); // punto luce speculare nitido per il clearcoat
  panel(16, 16, 0x0e3b36, 0.55, 0, 0, -10);
  const pm = new THREE.PMREMGenerator(renderer), target = pm.fromScene(sc, 0.03);
  pm.dispose(); geo.dispose(); sc.traverse((o: any) => o.material?.dispose?.());
  return target;
};

// sui telefoni niente velluto (sheen) né iridescenza: a quella misura non si vedono, ma rendono lo shader molto più pesante
// da compilare e da disegnare a ogni fotogramma
const currentMaterial = (uniforms: any, lite: boolean) => {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xf4fffd, roughness: 0.16, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.05,
    sheen: lite ? 0 : 1, sheenColor: new THREE.Color(0x9ff3e4), sheenRoughness: 0.35,
    iridescence: lite ? 0 : 0.32, iridescenceIOR: 1.45, emissive: 0xffffff, emissiveIntensity: 0.05, envMapIntensity: 1.15
  });
  m.onBeforeCompile = (sh: any) => {
    sh.uniforms.uPh = uniforms.uPh; sh.uniforms.uGain = uniforms.uGain;
    sh.vertexShader = "attribute float aT;\nvarying float vT;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vT = aT;");
    sh.fragmentShader = `uniform float uPh;
uniform float uGain;
varying float vT;
` + sh.fragmentShader.replace(
      "#include <colorspace_fragment>",
      `#include <colorspace_fragment>
  {
    float d = uPh - vT;
    float head = exp(-d * d * 1400.0);
    float tail = d > 0.0 ? exp(-d * 6.0) * 0.78 : 0.0;
    float k = clamp((head + tail) * uGain, 0.0, 1.0);
    vec3 hot = mix(vec3(1.0, 0.56, 0.08), vec3(1.0, 0.95, 0.78), clamp(head * 1.25, 0.0, 1.0));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, hot, k * 0.94);
  }`
    );
  };
  m.customProgramCacheKey = () => (lite ? "corrente_v2_lite" : "corrente_v2");
  return m;
};

const withT = (g: any) => { const uv = g.attributes.uv, a = new Float32Array(uv.count); for (let i = 0; i < uv.count; i++) a[i] = uv.getX(i); g.setAttribute("aT", new THREE.BufferAttribute(a, 1)); return g; };

export type Props = { intro?: boolean; spd?: number; fps?: number; fallback: React.ReactNode; className?: string };

function Logo3D({ intro = true, spd = 1, fps = 30, fallback, className = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [fail, setFail] = useState(false);
  const config = useRef({ spd, fps }); config.current = { spd, fps };

  useEffect(() => {
    const el = host.current; if (!el) return;
    const mobile = window.matchMedia("(max-width:767px), (pointer:coarse)").matches;
    const q = mobile ? { bevel: 6, curve: 24, arc: 96, radial: 14, sphere: 20, rings: 96, particles: 48 } : { bevel: 10, curve: 40, arc: 160, radial: 20, sphere: 32, rings: 144, particles: 80 };
    let renderer: any;
    try { renderer = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: mobile ? "low-power" : "high-performance" }); }
    catch (e) { setFail(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const envTarget = studio(renderer); scene.environment = envTarget.texture;
    const camera = new THREE.PerspectiveCamera(29, 1, 1, 1000); camera.position.set(0, 0, 184);
    const disposables: any[] = [envTarget];
    const keep = (x: any) => { disposables.push(x); return x; };

    scene.add(new THREE.HemisphereLight(0xdffcf7, 0x062521, 0.65));
    const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(60, 80, 115); scene.add(key);
    const rim = new THREE.DirectionalLight(0x2dd4bf, 2.8); rim.position.set(-100, 15, -70); scene.add(rim);
    const ptrLight = new THREE.PointLight(0x99f6e4, 1.4, 220, 1.5); ptrLight.position.set(0, 0, 95); scene.add(ptrLight);

    const root = new THREE.Group(); scene.add(root);
    const spin = new THREE.Group(); root.add(spin);
    const badge = new THREE.Group(); spin.add(badge);
    const fgGroup = new THREE.Group(); badge.add(fgGroup); // gruppo frontale con micro-parallasse 3D

    // --- piastra smaltata con bisellatura più profonda e morbida ---
    const plateGeo = keep(new THREE.ExtrudeGeometry(roundedSquare(29.5, 14.5), { depth: 5.8, bevelEnabled: true, bevelThickness: 3.4, bevelSize: 2.6, bevelSegments: q.bevel, curveSegments: q.curve }));
    plateGeo.translate(0, 0, -2.9);
    const ca = new THREE.Color("#22d8c0"), cb = new THREE.Color("#07423d"), sideCol = new THREE.Color("#0d5c54");
    const pos = plateGeo.attributes.position, nor = plateGeo.attributes.normal, col = new Float32Array(pos.count * 3), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), nz = nor.getZ(i), t = clamp01((x + 32 + (32 - y)) / 128);
      tmp.copy(ca).lerp(cb, t);
      if (Math.abs(nz) < 0.45) tmp.lerp(sideCol, 0.35);
      if (nz < -0.6) tmp.lerp(new THREE.Color("#082e2a"), 0.6);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    plateGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const plateMat = keep(new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.08, roughness: 0.26, clearcoat: 0.95, clearcoatRoughness: 0.1, envMapIntensity: 0.95 }));
    badge.add(new THREE.Mesh(plateGeo, plateMat));

    const FRONT = 5.9, BACK = -5.9;
    const gold = keep(new THREE.MeshPhysicalMaterial({ color: 0xe8b04a, metalness: 1, roughness: 0.22, clearcoat: 0.4, envMapIntensity: 1.35 }));

    // --- filetto bianco interno + sottile ghiera metallica interna ---
    const rimShape = roundedSquare(28.3, 13.5); rimShape.holes.push(roundedSquare(27.2, 12.6, new THREE.Path()));
    const rimGeo = keep(new THREE.ExtrudeGeometry(rimShape, { depth: 0.65, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.12, bevelSegments: mobile ? 2 : 4, curveSegments: q.curve }));
    const rimMesh = new THREE.Mesh(rimGeo, keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.34, roughness: 0.22, clearcoat: 1 })));
    rimMesh.position.z = FRONT - 0.15; badge.add(rimMesh);

    // --- la "C", la pista e le incastonature (socket) sulla piastra ---
    const uArc = { uPh: { value: -1 }, uGain: { value: 0 } }, uLine = { uPh: { value: -1 }, uGain: { value: 0 } };
    const arcCurve = new (class extends THREE.Curve { getPoint(t: number, v = new THREE.Vector3()) { return v.copy(arcAt(t, FRONT + 1.45)); } })();
    const arcGeo = keep(withT(new THREE.TubeGeometry(arcCurve, q.arc, 2.55, q.radial, false)));
    fgGroup.add(new THREE.Mesh(arcGeo, keep(currentMaterial(uArc, mobile))));
    const lineGeo = keep(withT(new THREE.TubeGeometry(new THREE.LineCurve3(lineAt(0, FRONT + 1.25), lineAt(1, FRONT + 1.25)), 8, 1.55, q.radial, false)));
    fgGroup.add(new THREE.Mesh(lineGeo, keep(currentMaterial(uLine, mobile))));

    const capGeo = keep(new THREE.SphereGeometry(1, q.sphere, Math.round(q.sphere * 0.7)));
    const ringSocketGeo = keep(new THREE.TorusGeometry(1, 0.16, 8, 24));
    const pearl = keep(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.06, sheen: mobile ? 0 : 1, sheenColor: new THREE.Color(0x9ff3e4), iridescence: mobile ? 0 : 0.35 }));
    const amberMat = keep(new THREE.MeshPhysicalMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.35, roughness: 0.16, clearcoat: 1 }));

    const addSocket = (p: { x: number; y: number; z: number }, radius: number) => {
      const s = new THREE.Mesh(ringSocketGeo, gold);
      s.position.set(p.x, p.y, FRONT + 0.25);
      s.scale.setScalar(radius * 0.92);
      badge.add(s);
    };
    addSocket(arcAt(0, 0), 4.2); addSocket(lineAt(0, 0), 3.2); addSocket(arcAt(1, 0), 4.2);

    const cap = (p: any, m: any) => { const s = new THREE.Mesh(capGeo, m); s.position.copy(p); fgGroup.add(s); return s; };
    const n1 = cap(arcAt(0, FRONT + 2.15), pearl), n3 = cap(lineAt(0, FRONT + 2.15), pearl), n2 = cap(arcAt(1, FRONT + 2.15), amberMat);
    const nodes: [any, number][] = [[n1, 4.2], [n3, 3.2], [n2, 4.2]];
    const lamp = new THREE.PointLight(0xfbbf24, 0, 68, 1.2); lamp.position.copy(arcAt(1, FRONT + 9.5)); fgGroup.add(lamp);

    // --- bagliori ---
    const glowTex = keep(glowTexture());
    const sprite = (color: number, s: number, parent: any) => {
      const m = keep(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      const sp = new THREE.Sprite(m); sp.scale.setScalar(s); parent.add(sp); return sp;
    };
    const halo = sprite(0xfbbf24, 16, fgGroup); halo.position.copy(arcAt(1, FRONT + 3.8));
    const sparkHead = sprite(0xffe2a0, 9.5, fgGroup);

    // --- retro: circuito stampato ---
    const TR = [[[-22, -20], [-22, -6], [-12, 4], [-12, 18]], [[-4, 22], [-4, 10], [6, 0], [20, 0]], [[22, -22], [10, -22], [2, -14], [2, -4]], [[-24, 12], [-16, 20], [-6, 20]], [[14, 24], [14, 12], [22, 4]], [[-14, -24], [-4, -24], [4, -16]]];
    TR.forEach((pts) => {
      badge.add(new THREE.Mesh(keep(new THREE.TubeGeometry(polyline(pts, BACK - 0.5), pts.length * 2, 0.65, 6, false)), gold));
      [pts[0], pts[pts.length - 1]].forEach(([x, y]) => { const d = new THREE.Mesh(capGeo, gold); d.position.set(x, y, BACK - 0.6); d.scale.set(1.9, 1.9, 0.6); badge.add(d); });
    });
    const chip = new THREE.Mesh(keep(new THREE.BoxGeometry(16, 11, 2.4)), keep(new THREE.MeshPhysicalMaterial({ color: 0x0b1f1d, roughness: 0.35, clearcoat: 0.8 }))); chip.position.set(8, -10, BACK - 1.4); badge.add(chip);
    const pinGeo = keep(new THREE.BoxGeometry(1.1, 2.6, 0.8));
    for (let k = 0; k < 6; k++) [-1, 1].forEach((s) => { const p = new THREE.Mesh(pinGeo, gold); p.position.set(1.75 + k * 2.5, -10 + s * 6.6, BACK - 0.9); badge.add(p); });

    // --- orbite: due anelli sottili + scia ---
    const orbits = [{ r: 44.5, tilt: [1.2, 0.35, 0], speed: 0.55, color: 0x5eead4, ph: 0 }, { r: 48.5, tilt: [1.0, -0.6, 0.4], speed: -0.38, color: 0xfbbf24, ph: 2.1 }].map((o) => {
      const g = new THREE.Group(); g.rotation.set(o.tilt[0], o.tilt[1], o.tilt[2]); root.add(g);
      const ringMat = keep(new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(new THREE.Mesh(keep(new THREE.TorusGeometry(o.r, 0.2, 6, q.rings)), ringMat));
      const trail = Array.from({ length: mobile ? 5 : 9 }, (_, i) => sprite(o.color, 8.2 - i * 0.6, g));
      return { ...o, g, ringMat, trail };
    });

    // --- scintille ---
    const SP = q.particles, spPos = new Float32Array(SP * 3), spVel = new Float32Array(SP * 3), spCol = new Float32Array(SP * 3), spLife = new Float32Array(SP);
    const spGeo = keep(new THREE.BufferGeometry());
    spGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute("color", new THREE.BufferAttribute(spCol, 3));
    root.add(new THREE.Points(spGeo, keep(new THREE.PointsMaterial({ size: 3.8, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))));
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

    const ptr = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    let hover = false, drag = false, pointerId: number | null = null, dragY = 0, dragX = 0, dragMoved = 0, lastMove = 0, ang = 0, vel = 0, settle: number | null = null, boost = 0, hoverK = 0;
    const look = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      ptr.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      ptr.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
    };
    let spins = 0;
    const kick = () => { vel = Math.min(42, vel + 9.5); settle = null; boost = 1; burst(mobile ? 24 : 44); spins++; window.dispatchEvent(new CustomEvent("circuito:giro", { detail: spins })); };
    const cv = renderer.domElement;
    const down = (e: PointerEvent) => { if (!e.isPrimary || e.button !== 0) return; pointerId = e.pointerId; drag = true; dragY = e.clientY; dragX = e.clientX; dragMoved = 0; lastMove = performance.now(); try { cv.setPointerCapture(e.pointerId); } catch {} cv.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => {
      look(e);
      if (!drag || e.pointerId !== pointerId) return;
      const dy = e.clientY - dragY; dragY = e.clientY; dragMoved += Math.abs(dy);
      const dx = e.clientX - dragX, now = performance.now(), dt = Math.max(8, now - lastMove) / 1000;
      dragX = e.clientX; dragMoved += Math.abs(dx); lastMove = now;
      const d = dx * 0.013; ang += d; vel = damp(vel, d / dt, 18, dt); settle = null;
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== pointerId) return; drag = false; pointerId = null; cv.style.cursor = hover ? "grab" : "";
      try { cv.releasePointerCapture(e.pointerId); } catch {}
      if (e.type !== "pointercancel" && dragMoved < 5) kick();
      else if (performance.now() - lastMove > 90) vel = 0;
    };
    const enter = () => { hover = true; if (!drag) cv.style.cursor = "grab"; };
    const leave = () => { hover = false; if (!drag) cv.style.cursor = ""; };
    const keyDown = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kick(); } };
    window.addEventListener("pointermove", move, { passive: true });
    cv.addEventListener("pointerdown", down); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    cv.addEventListener("pointerenter", enter); cv.addEventListener("pointerleave", leave); el.addEventListener("keydown", keyDown);

    const fit = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.z = Math.max(184, 54 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.max(1, 1 / camera.aspect)); camera.updateProjectionMatrix(); };
    fit();
    const ro = "ResizeObserver" in window ? new ResizeObserver(fit) : null; ro?.observe(el);

    let last = performance.now(), T = intro ? 0 : 6;
    let cyc = 0, flash = 0, orbPh = [0, 0];
    const CYCLE = 2.6;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * (config.current.spd || 1); last = now; T += dt;

      const kIn = back((T - 0.05) / 1.0);
      badge.scale.setScalar(0.35 + 0.65 * Math.min(1.06, kIn));
      badge.rotation.set(0.9 * (1 - ease(T / 1.0)), -2.6 * (1 - ease(T / 1.1)), 0.4 * (1 - ease(T / 1.0)));
      arcGeo.setDrawRange(0, Math.floor((arcGeo.index.count * ease((T - 0.35) / 0.8)) / 3) * 3);
      lineGeo.setDrawRange(0, Math.floor((lineGeo.index.count * ease((T - 0.95) / 0.35)) / 3) * 3);
      nodes.forEach(([n, r], i) => n.scale.setScalar(r * Math.max(0.0001, back((T - 0.85 - i * 0.14) / 0.45))));
      const on = ease((T - 1.25) / 0.5);

      hoverK = damp(hoverK, hover ? 1 : 0, 6, dt);
      boost = Math.max(0, boost - dt * 0.5);
      if (T > 1.4) cyc += (dt / CYCLE) * (1 + boost * 2.2 + hoverK * 0.6);
      const c = (cyc % 1) * CYCLE, prevFlash = flash;
      const arcPh = c / 1.15, linePh = (c - 1.2) / 0.4;
      uArc.uPh.value = arcPh < 1.25 ? arcPh : -1; uArc.uGain.value = on * (1 + hoverK * 0.5 + boost * 0.6);
      uLine.uPh.value = linePh > -0.1 && linePh < 1.3 ? linePh : -1; uLine.uGain.value = uArc.uGain.value;
      const headOn = arcPh >= 0 && arcPh <= 1;
      if (headOn) { sparkHead.position.copy(arcAt(arcPh, FRONT + 4.35)); sparkHead.material.opacity = on * 0.92 * Math.sin(Math.min(1, arcPh * 6) * Math.PI / 2); }
      else if (linePh >= 0 && linePh <= 1) { sparkHead.position.copy(lineAt(linePh, FRONT + 3.55)); sparkHead.material.opacity = on * 0.78 * (1 - linePh * 0.5); }
      else sparkHead.material.opacity = 0;

      flash = arcPh >= 1 && arcPh < 1.25 ? 1 : Math.max(0, prevFlash - dt * 1.6);
      amberMat.emissiveIntensity = on * (0.6 + 3.4 * flash + hoverK * 0.45);
      lamp.intensity = on * (1.4 + 6.5 * flash);
      halo.material.opacity = on * (0.28 + 0.72 * flash);
      halo.scale.setScalar(11.5 + 16.5 * flash);
      n2.scale.setScalar(4.2 * (T > 1.5 ? 1 + 0.14 * flash : Math.max(0.0001, back((T - 1.13) / 0.45))));

      orbits.forEach((o, i) => {
        orbPh[i] += dt * o.speed * (1 + boost * 2.5 + hoverK * 0.5);
        o.ringMat.opacity = 0.11 * ease((T - 1.5) / 0.8) * (1 + hoverK * 1.2);
        o.trail.forEach((s: any, j: number) => { const a = orbPh[i] + o.ph - j * 0.035 * Math.sign(o.speed); s.position.set(Math.cos(a) * o.r, Math.sin(a) * o.r, 0); s.material.opacity = ease((T - 1.7) / 0.6) * (0.95 - j * 0.1); });
      });

      if (!drag) {
        if (Math.abs(vel) > 2.4 && settle === null) { vel *= Math.exp(-dt * 0.85); }
        else {
          if (settle === null) {
            const p = (ang + vel * 0.25) / TAU;
            settle = (vel > 0.3 ? Math.ceil(p - 0.08) : vel < -0.3 ? Math.floor(p + 0.08) : Math.round(p)) * TAU;
          }
          vel += (-(ang - settle) * 26 - vel * 8.5) * dt;
          if (Math.abs(ang - settle) < 0.0005 && Math.abs(vel) < 0.002) { ang = settle; vel = 0; }
        }
        ang += vel * dt;
      }
      spin.rotation.y = ang;
      spin.rotation.z = -vel * 0.0045;

      cur.x = damp(cur.x, ptr.x, 6.5, dt); cur.y = damp(cur.y, ptr.y, 6.5, dt);
      root.rotation.y = cur.x * 0.74 + Math.sin(T * 0.55) * 0.11;
      root.rotation.x = cur.y * 0.48 + Math.sin(T * 0.75) * 0.06;
      root.position.y = Math.sin(T * 1.25) * 1.9 + Math.cos(T * 0.65) * 0.5;
      root.position.z = -60 * (1 - ease((T - 0.05) / 0.9)) + hoverK * 12;

      // parallasse interna del gruppo frontale e luce speculare che segue il cursore
      fgGroup.position.x = cur.x * 1.15;
      fgGroup.position.y = -cur.y * 1.15;
      fgGroup.position.z = hoverK * 0.85 + boost * 0.6;
      ptrLight.position.set(cur.x * 65, -cur.y * 55, 95);

      for (let i = 0; i < SP; i++) {
        if (spLife[i] <= 0) { spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; continue; }
        spLife[i] -= dt;
        spPos[i * 3] += spVel[i * 3] * dt; spPos[i * 3 + 1] += spVel[i * 3] * dt; spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
        const f = Math.exp(-dt * 2.2); spVel[i * 3] *= f; spVel[i * 3 + 1] *= f; spVel[i * 3 + 2] *= f;
        const l = Math.max(0, Math.min(1, spLife[i])); spCol[i * 3] = l; spCol[i * 3 + 1] = l * 0.75; spCol[i * 3 + 2] = l * 0.3;
      }
      spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;

      renderer.render(scene, camera);
    };
    const stop = renderLoop(step, () => config.current.fps || 30, el, () => { last = performance.now(); });
    const lost = (event: Event) => { event.preventDefault(); stop(); setFail(true); };
    cv.addEventListener("webglcontextlost", lost);

    return () => {
      stop(); ro?.disconnect(); cv.removeEventListener("webglcontextlost", lost);
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointerenter", enter); cv.removeEventListener("pointerleave", leave); el.removeEventListener("keydown", keyDown);
      disposables.forEach((d) => d?.dispose?.());
      renderer.dispose(); renderer.forceContextLoss(); cv.remove();
    };
  }, [fail]);

  if (fail) return <>{fallback}</>;
  return <div ref={host} className={className} role="button" tabIndex={0} aria-label="Il Circuito: logo in 3D. Premi per farlo girare, o trascinalo" title="Trascinalo o cliccalo: gira e mostra il circuito sul retro" />;
}

export default React.memo(Logo3D);
