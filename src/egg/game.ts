// Motore del gioco segreto: corridoio → sala del reattore → Sephiroth.
// Gira su un canvas a bassa risoluzione (altezza 288px) ingrandito via CSS con pixel nitidi.
import { CharDef, Puppet, Hit } from "./rig";
import { CLOUD } from "./cloud";
import { CLIVE } from "./clive";
import { SEPH } from "./seph";
import { makeStage, Stage, VH, FLOOR, CORR_END, ARENA_X, ARENA_W } from "./world";

export const CAST: Record<string, CharDef> = { cloud: CLOUD, clive: CLIVE, seph: SEPH };
export type Btn = "left" | "right" | "jump" | "atk" | "dodge" | "spec" | "swap";
export type Scene = "title" | "play" | "over" | "win" | "gallery";
export interface HUD { scene: Scene; hero: string; hp: number; hpMax: number; boss: number; bossMax: number; showBoss: boolean; banner: string; paused: boolean }
export interface GalleryInfo { anim: string; frame: number; frames: number; fps: number; t: number; len: number }

const G = 980, JUMP = 335, SPEED = 122;
type C2 = CanvasRenderingContext2D;
const mk = (w: number, h: number): [HTMLCanvasElement, C2] => {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d")!; x.imageSmoothingEnabled = false; return [c, x];
};

// ---------- suoni sintetizzati (niente file da scaricare) ----------
class Sfx {
  ac: AudioContext | null = null; on = true;
  private ctx() {
    if (!this.on) return null;
    try { if (!this.ac) { const AC = (window as any).AudioContext || (window as any).webkitAudioContext; this.ac = new AC(); } if (this.ac!.state === "suspended") this.ac!.resume(); } catch { return null; }
    return this.ac;
  }
  private tone(f0: number, f1: number, d: number, type: OscillatorType, v = 0.05) {
    const a = this.ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02);
  }
  private noise(d: number, f: number, v = 0.08, q = 1) {
    const a = this.ctx(); if (!a) return;
    const n = Math.floor(a.sampleRate * d), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    s.buffer = b; fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = q; g.gain.value = v;
    s.connect(fl); fl.connect(g); g.connect(a.destination); s.start();
  }
  swing(heavy = false) { this.noise(heavy ? 0.22 : 0.13, heavy ? 900 : 1800, heavy ? 0.12 : 0.08, 0.8); }
  hit(heavy = false) { this.tone(heavy ? 160 : 260, 50, 0.12, "square", 0.06); this.noise(0.08, 3000, 0.07); }
  jump() { this.tone(240, 520, 0.09, "square", 0.025); }
  land() { this.noise(0.06, 300, 0.06); }
  roll() { this.noise(0.18, 600, 0.05, 0.5); }
  fire() { this.noise(0.35, 500, 0.1, 0.4); this.tone(120, 60, 0.3, "sawtooth", 0.03); }
  hurt() { this.tone(400, 90, 0.2, "sawtooth", 0.05); }
  swap() { this.tone(330, 990, 0.16, "triangle", 0.05); }
  boom() { this.tone(90, 30, 0.5, "sine", 0.18); this.noise(0.4, 200, 0.12, 0.6); }
  gate() { this.tone(70, 40, 0.6, "square", 0.05); this.noise(0.5, 150, 0.1, 0.5); }
}

// ---------- sprite: burattino + canvas + tinte ----------
class Sprite {
  p: Puppet; cv: HTMLCanvasElement; cx: C2; img: ImageData; tcv: HTMLCanvasElement; tcx: C2;
  flash = 0; alpha = 1;
  constructor(public def: CharDef) {
    this.p = new Puppet(def);
    const r = this.p.r;
    [this.cv, this.cx] = mk(r.w, r.h); [this.tcv, this.tcx] = mk(r.w, r.h);
    this.img = new ImageData(new Uint8ClampedArray(r.col.buffer), r.w, r.h);
  }
  paint() { this.p.render(); this.cx.putImageData(this.img, 0, 0); }
  tint(col: string, dst?: C2) {
    const x = dst || this.tcx; x.clearRect(0, 0, this.cv.width, this.cv.height);
    x.globalCompositeOperation = "source-over"; x.drawImage(this.cv, 0, 0);
    x.globalCompositeOperation = "source-atop"; x.fillStyle = col; x.fillRect(0, 0, this.cv.width, this.cv.height);
    x.globalCompositeOperation = "source-over";
  }
  draw(x: C2, ox: number, oy: number) {
    const p = this.p, r = p.r;
    x.save(); x.globalAlpha = this.alpha;
    x.translate(Math.round(p.x - ox), Math.round(p.y - oy)); x.scale(p.face, 1);
    if (this.flash > 0) { this.tint("#ffffff"); x.drawImage(this.tcv, -r.ax, -r.ay); }
    else x.drawImage(this.cv, -r.ax, -r.ay);
    x.restore();
  }
}

interface Ghost { cv: HTMLCanvasElement; cx: C2; x: number; y: number; face: number; life: number; max: number; ax: number; ay: number }
interface Part { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; s: number; g: number; k?: string }
interface Shot { x: number; y: number; vx: number; life: number; t: number; hit: boolean }
interface Pillar { x: number; t: number; hit: boolean }
interface Num { x: number; y: number; v: number; life: number; col: string }

const DIG = [0x7b6f, 0x2c97, 0x73e7, 0x73cf, 0x5bc9, 0x79cf, 0x79ef, 0x7292, 0x7bef, 0x7bcf];

interface Hero { s: Sprite; id: string }

export class Game {
  x: C2; W = 480; stage: Stage; sfx = new Sfx();
  scene: Scene = "title"; paused = false; t = 0; acc = 0; last = 0; raf = 0;
  cam = 0; shake = 0; stop = 0;
  heroes: Record<string, Hero> = {}; hero!: Hero; boss!: Sprite;
  // stato del giocatore
  vx = 0; vy = 0; ground = true; air = 0; airUsed = false; st = "move"; combo = 0; inv = 0; hp = 100; swapCd = 0; hits: Record<string, boolean> = {}; jumpHeld = false; shotDone = false;
  // stato del boss
  bvx = 0; bst = "wait"; btime = 0; bhp = 420; bhits: Record<string, boolean> = {}; locked = false; gate = 0; introT = 0; bossShown = false; pillarsDone = false; teleDone = false; deadT = 0;
  keys: Record<string, boolean> = {}; buf: Record<string, number> = {};
  parts: Part[] = []; ghosts: Ghost[] = []; shots: Shot[] = []; pillars: Pillar[] = []; nums: Num[] = [];
  banner = ""; bannerT = 0; hudKey = "";
  // galleria
  gal = { id: "cloud", anim: "idle", speed: 1, face: 1, paused: false, fluid: false, dist: 0, wait: 0, key: "" };
  hdead = 0;
  galSprites: Record<string, Sprite> = {};

  constructor(public canvas: HTMLCanvasElement, public onHud: (h: HUD) => void, public onGal?: (g: GalleryInfo) => void) {
    this.x = canvas.getContext("2d")!;
    this.stage = makeStage();
    ["cloud", "clive"].forEach((id) => { this.heroes[id] = { s: new Sprite(CAST[id]), id }; });
    this.hero = this.heroes.cloud;
    this.boss = new Sprite(SEPH);
    this.resize(480);
    this.title();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    window.addEventListener("keydown", this.kd); window.addEventListener("keyup", this.ku);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.kd); window.removeEventListener("keyup", this.ku);
    try { this.sfx.ac?.close(); } catch {}
  }
  resize(W: number) { this.W = W; this.canvas.width = W; this.canvas.height = VH; this.x.imageSmoothingEnabled = false; }

  // ---------- input ----------
  private KEYMAP: Record<string, Btn> = {
    ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right",
    ArrowUp: "jump", w: "jump", W: "jump", " ": "jump", j: "atk", J: "atk", x: "atk", X: "atk",
    k: "dodge", K: "dodge", c: "dodge", C: "dodge", Shift: "dodge", l: "spec", L: "spec", v: "spec", V: "spec", q: "swap", Q: "swap", Tab: "swap",
  };
  kd = (e: KeyboardEvent) => {
    const b = this.KEYMAP[e.key]; if (!b || this.scene !== "play") return;
    e.preventDefault(); if (!e.repeat) this.setBtn(b, true);
  };
  ku = (e: KeyboardEvent) => { const b = this.KEYMAP[e.key]; if (b) this.setBtn(b, false); };
  setBtn(b: Btn, down: boolean) {
    this.keys[b] = down;
    if (b === "jump") this.jumpHeld = down;
    if (down && b !== "left" && b !== "right") this.buf[b] = 0.22;
  }
  private take(b: Btn) { if (this.buf[b] > 0) { this.buf[b] = 0; return true; } return false; }

  // ---------- scene ----------
  title() {
    this.scene = "title"; this.paused = false;
    const a = this.heroes.cloud.s.p, b = this.heroes.clive.s.p;
    a.x = 470; a.y = FLOOR; a.face = 1; a.play("idle", true); a.resetChains();
    b.x = 430; b.y = FLOOR; b.face = 1; b.play("idle", true); b.resetChains();
    this.cam = 300; this.emit(true);
  }
  start(id: string) {
    this.scene = "play"; this.paused = false;
    this.hero = this.heroes[id] || this.heroes.cloud;
    const p = this.hero.s.p; p.x = 60; p.y = FLOOR; p.face = 1; p.play("idle", true); p.resetChains();
    this.vx = this.vy = 0; this.ground = true; this.st = "move"; this.hp = 100; this.inv = 0; this.combo = 0; this.swapCd = 0; this.hdead = 0; this.airUsed = false;
    const B = this.boss.p; B.x = ARENA_X + ARENA_W - 140; B.y = -160; B.face = -1; B.play("intro", true); B.resetChains();
    this.bst = "wait"; this.bhp = 420; this.locked = false; this.gate = 0; this.bossShown = false; this.boss.alpha = 1; this.deadT = 0;
    this.parts = []; this.ghosts = []; this.shots = []; this.pillars = []; this.nums = [];
    this.cam = 0; this.keys = {}; this.buf = {};
    this.say("IL CORRIDOIO");
    this.emit(true);
  }
  gallery(id: string, anim: string) {
    this.scene = "gallery";
    if (!this.galSprites[id]) this.galSprites[id] = new Sprite(CAST[id]);
    const p = this.galSprites[id].p;
    if (this.gal.id !== id || this.gal.anim !== anim || p.anim !== anim) { p.play(anim, true); p.resetChains(); this.gal.dist = 0; }
    this.gal.id = id; this.gal.anim = anim; this.emit(true);
  }
  galStep(dir: number) {
    const p = this.galSprites[this.gal.id]?.p; if (!p) return;
    const fps = p.A.fps || 15; p.t = Math.max(0, Math.floor(p.t * fps + 1e-6) / fps + dir / fps); if (p.A.loop) p.t %= p.A.len; p.done = false;
  }
  setPaused(v: boolean) { this.paused = v; this.emit(true); }
  private say(s: string) { this.banner = s; this.bannerT = 2.2; this.emit(true); }
  private emit(force = false) {
    const h: HUD = { scene: this.scene, hero: this.hero.id, hp: Math.max(0, Math.ceil(this.hp)), hpMax: 100, boss: Math.max(0, Math.ceil(this.bhp)), bossMax: 420, showBoss: this.bossShown, banner: this.bannerT > 0 ? this.banner : "", paused: this.paused };
    const k = JSON.stringify(h); if (!force && k === this.hudKey) return; this.hudKey = k; this.onHud(h);
  }

  // ---------- ciclo ----------
  loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (document.hidden) return;
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= 1 / 60) { this.acc -= 1 / 60; this.tick(1 / 60); }
    }
    this.render();
  };

  private tick(dt: number) {
    this.t += dt;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.emit(); }
    if (this.scene === "gallery") return this.tickGallery(dt);
    if (this.scene === "title") {
      [this.heroes.cloud, this.heroes.clive].forEach((h) => { h.s.p.update(dt); h.s.p.solve(); h.s.p.stepChains(dt, FLOOR); });
      return;
    }
    for (const k in this.buf) this.buf[k] -= dt;
    if (this.stop > 0) { this.stop -= dt; this.fx(dt * 0.25); return; }
    this.tickHero(dt);
    this.tickBoss(dt);
    this.fx(dt);
    // camera
    const p = this.hero.s.p;
    let tx = p.x - this.W * 0.42 + p.face * 26, lo = 0, hi = ARENA_X + ARENA_W - this.W;
    if (this.locked) {
      if (this.W >= ARENA_W) { tx = ARENA_X + ARENA_W / 2 - this.W / 2; lo = hi = tx; }
      else { lo = ARENA_X; hi = ARENA_X + ARENA_W - this.W; }
    }
    tx = Math.max(lo, Math.min(hi, tx));
    this.cam += (tx - this.cam) * Math.min(1, dt * (this.locked ? 4 : 7));
    this.shake = Math.max(0, this.shake - dt * 30);
    this.emit();
  }

  private tickGallery(dt: number) {
    const s = this.galSprites[this.gal.id]; if (!s) return;
    const p = s.p, g = this.gal;
    p.face = g.face; p.fluid = g.fluid;
    if (!g.paused) {
      p.update(dt * g.speed);
      if (p.done && !p.A.loop && p.t >= p.A.len) { g.wait += dt * g.speed; if (g.wait > 0.6) { p.play(g.anim, true); p.resetChains(); g.wait = 0; } }
    }
    p.solve();
    // la galleria simula lo spostamento, così capelli e mantelli reagiscono alla corsa
    const v = (p.A.speed || 0) * (g.paused ? 0 : g.speed);
    p.x += v * dt * p.face; g.dist += v * dt;
    p.stepChains(g.paused ? 0.0001 : dt * g.speed, FLOOR);
    const fps = p.A.fps || 15;
    const info = { anim: g.anim, frame: Math.min(p.frameIdx(), Math.max(0, Math.round(p.A.len * fps) - 1)), frames: Math.max(1, Math.round(p.A.len * fps)), fps, t: p.t, len: p.A.len };
    const k = g.id + info.anim + info.frame; if (k !== g.key) { g.key = k; this.onGal?.(info); }
  }

  // ---------- giocatore ----------
  private box(h: Hit, p: Puppet): [number, number, number, number] {
    const [a, b, c, d] = h.box;
    return p.face > 0 ? [p.x + a, p.y + b, p.x + c, p.y + d] : [p.x - c, p.y + b, p.x - a, p.y + d];
  }
  private hurtBox(p: Puppet, w: number, h: number): [number, number, number, number] { return [p.x - w, p.y - h, p.x + w, p.y]; }
  private overlap(a: number[], b: number[]) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }

  private act(name: string) {
    const p = this.hero.s.p; p.play(name, true); this.hits = {};
    const heavy = name === "atk3";
    if (name.indexOf("atk") === 0 || name === "air") setTimeout(() => this.sfx.swing(heavy), heavy ? 180 : 40);
  }

  private tickHero(dt: number) {
    const H = this.hero, p = H.s.p, A = p.A, dir = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const cine = this.bst === "intro" || this.bst === "dead";
    this.inv = Math.max(0, this.inv - dt); this.swapCd = Math.max(0, this.swapCd - dt);
    H.s.flash = Math.max(0, H.s.flash - dt);
    const fric = (k: number) => { this.vx -= this.vx * Math.min(1, k * dt); };

    if (this.st === "dead") { fric(6); }
    else if (cine) {
      fric(10); if (this.ground && this.st !== "hurt") { this.st = "move"; p.play(Math.abs(this.vx) > 15 ? "run" : "idle"); }
      p.face = this.boss.p.x > p.x ? 1 : -1;
      if (this.bst === "dead" && this.deadT > 2.4 && this.st !== "win") { this.st = "win"; p.play("win", true); }
    }
    else if (this.st === "move") {
      if (dir) p.face = dir;
      const target = dir * SPEED, k = this.ground ? 14 : 8;
      this.vx += (target - this.vx) * Math.min(1, k * dt);
      if (this.take("swap") && this.swapCd <= 0) this.swap();
      else if (this.take("jump") && this.ground) { this.vy = -JUMP; this.ground = false; p.play("jump", true); this.sfx.jump(); this.dust(p.x, 4); }
      else if (this.take("dodge") && this.ground) { this.st = "roll"; p.play("roll", true); this.sfx.roll(); if (dir) p.face = dir; }
      else if (this.take("atk")) {
        if (this.ground) { this.st = "atk"; this.combo = 1; this.act("atk1"); this.vx = p.face * 70; }
        else if (!this.airUsed) { this.st = "air"; this.airUsed = true; this.act("air"); this.vy = Math.min(this.vy, -60); }
      }
      else if (this.take("spec") && this.ground) {
        if (H.id === "clive") { this.st = "cast"; p.play("cast", true); this.shotDone = false; }
        else { this.st = "atk"; this.combo = 3; this.act("atk3"); }
      }
      if (this.st === "move") {
        if (this.ground) { if (p.anim !== "land" || p.done || dir) p.play(Math.abs(this.vx) > 18 ? "run" : "idle"); }
        else p.play(this.vy < 0 ? "jump" : "fall");
        if (this.ground && p.anim === "run" && p.frameIdx() % 6 === 0 && Math.random() < 0.3) this.dust(p.x - p.face * 6, 1);
      }
      if (!this.jumpHeld && this.vy < -140) this.vy = -140;
    }
    else if (this.st === "atk") {
      fric(9);
      if (p.anim === "atk3" && p.t > 0.12 && p.t < 0.22) this.vx = p.face * 110;
      if (p.anim === "atk3" && Math.abs(p.t - 0.24) < dt * 0.6) { this.shake = 6; this.sfx.boom(); this.dust(p.x + p.face * 40, 10); }
      if (this.buf.atk > 0 && A.cancel != null && p.t >= A.cancel && this.combo < 3) {
        this.buf.atk = 0; this.combo++; this.act("atk" + this.combo); this.vx = p.face * (this.combo === 3 ? 40 : 80);
        if (dir) p.face = dir;
      } else if (this.buf.dodge > 0 && A.cancel != null && p.t >= A.cancel) { this.buf.dodge = 0; this.st = "roll"; p.play("roll", true); if (dir) p.face = dir; this.sfx.roll(); }
      else if (p.done) { this.st = "move"; p.play("idle"); }
      this.strike(p, A.hit);
    }
    else if (this.st === "air") {
      this.vx += (dir * SPEED * 0.7 - this.vx) * Math.min(1, 4 * dt);
      this.strike(p, A.hit);
      if (p.done) { this.st = "move"; }
    }
    else if (this.st === "roll") {
      const k = p.t / A.len; this.vx = p.face * (H.id === "clive" ? 260 : 215) * (k < 0.75 ? 1 : (1 - k) * 4);
      if (Math.floor(p.t * 60) % 4 === 0) this.ghost(H.s, H.id === "clive" ? "rgba(255,138,42,.9)" : "rgba(120,220,255,.9)");
      if (p.done) { this.st = "move"; p.play("idle"); }
    }
    else if (this.st === "cast") {
      fric(10);
      if (!this.shotDone && p.t >= 0.14) {
        this.shotDone = true; this.sfx.fire();
        const sh = this.hero.s.p.skel.arm.b.w;
        this.shots.push({ x: p.x + sh.x * p.face + p.face * 4, y: p.y + sh.y, vx: p.face * 250, life: 1.6, t: 0, hit: false });
      }
      if (p.done) { this.st = "move"; p.play("idle"); }
    }
    else if (this.st === "hurt") { fric(5); if (p.done && this.ground) { this.st = "move"; p.play("idle"); } }
    else if (this.st === "win") { fric(10); }

    // fisica
    this.vy += G * dt; p.x += this.vx * dt; p.y += this.vy * dt;
    if (p.y >= FLOOR) {
      if (!this.ground) {
        this.ground = true; this.airUsed = false; this.sfx.land(); this.dust(p.x, this.vy > 300 ? 6 : 3);
        if (this.st === "air") this.st = "move";
        if (this.st === "move" && this.air > 0.25) p.play("land", true);
      }
      p.y = FLOOR; this.vy = 0; this.air = 0;
    } else { this.ground = false; this.air += dt; }
    const lo = this.locked ? ARENA_X + 14 : 14, hi = ARENA_X + ARENA_W - 14;
    p.x = Math.max(lo, Math.min(hi, p.x));
    if (!this.locked && p.x > ARENA_X + 60 && this.bst === "wait") this.lockArena();

    p.update(dt); p.solve(); p.stepChains(dt, FLOOR);
    if (this.st === "dead" && p.done && this.scene === "play") { this.hdead += dt; if (this.hdead > 1) { this.scene = "over"; this.emit(true); } }
  }

  private swap() {
    const old = this.hero, nid = old.id === "cloud" ? "clive" : "cloud", nh = this.heroes[nid];
    const a = old.s.p, b = nh.s.p;
    this.ghost(old.s, "rgba(255,255,255,.9)");
    b.x = a.x; b.y = a.y; b.face = a.face; b.play(this.ground ? "idle" : "fall", true); b.resetChains();
    this.hero = nh; this.swapCd = 0.8; this.sfx.swap();
    for (let i = 0; i < 14; i++) { const an = (i / 14) * Math.PI * 2; this.parts.push({ x: a.x, y: a.y - 30, vx: Math.cos(an) * 90, vy: Math.sin(an) * 90, life: 0.35, max: 0.35, col: nid === "clive" ? "#ffb13b" : "#9fe8ff", s: 2, g: 0 }); }
    this.emit(true);
  }

  private strike(p: Puppet, hits?: Hit[]) {
    if (!hits || this.bst === "wait" || this.bst === "intro" || this.bst === "dead") return;
    const B = this.boss.p;
    hits.forEach((h, i) => {
      if (p.t < h.t0 || p.t > h.t1 || this.hits[p.anim + i]) return;
      if (this.boss.alpha < 0.5) return;
      if (!this.overlap(this.box(h, p), this.hurtBox(B, 10, 66))) return;
      this.hits[p.anim + i] = true;
      this.damageBoss(h.dmg, p.face, h.kb > 150, B.x - p.face * 6, B.y - 34);
    });
  }
  private damageBoss(dmg: number, from: number, heavy: boolean, hx: number, hy: number) {
    const B = this.boss.p;
    this.bhp -= dmg; this.boss.flash = 0.08; this.stop = heavy ? 0.09 : 0.05; this.shake = Math.max(this.shake, heavy ? 5 : 2.5);
    this.sfx.hit(heavy); this.sparks(hx, hy, from, heavy ? "#ffffff" : "#fff3b0");
    this.nums.push({ x: B.x + (Math.random() - 0.5) * 10, y: B.y - 72, v: dmg, life: 0.8, col: heavy ? "#ffd75a" : "#ffffff" });
    if (this.bhp <= 0) { this.bhp = 0; this.bst = "dead"; B.play("death", true); this.bvx = 0; this.deadT = 0; this.say("SEPHIROTH È CADUTO"); this.stop = 0.25; this.shake = 8; return; }
    if (this.bst === "think" || this.bst === "walk") { this.bst = "hurt"; B.play("hurt", true); this.bvx = from * 60; }
    if (this.bhp < 210 && !this.pillarsDone) { this.pillarsDone = true; this.say("ONE-WINGED ANGEL"); }
  }
  private damageHero(dmg: number, from: number, kb: number, ky?: number) {
    if (this.inv > 0 || this.st === "roll" && this.hero.s.p.t > 0.02 && this.hero.s.p.t < 0.34 || this.st === "dead") return false;
    const p = this.hero.s.p;
    this.hp -= dmg; this.inv = 0.9; this.hero.s.flash = 0.1; this.shake = 5; this.stop = 0.06; this.sfx.hurt();
    this.sparks(p.x, p.y - 34, from, "#c9b8ff");
    this.nums.push({ x: p.x, y: p.y - 66, v: dmg, life: 0.8, col: "#ff6a6a" });
    if (this.hp <= 0) { this.hp = 0; this.st = "dead"; p.play("death", true); this.vx = from * 120; this.hdead = 0; this.say("SCONFITTA"); }
    else { this.st = "hurt"; p.play("hurt", true); this.vx = from * kb * 0.7; if (ky) { this.vy = ky; this.ground = false; } p.face = -from; }
    this.emit(true); return true;
  }

  // ---------- Sephiroth ----------
  private lockArena() {
    this.locked = true; this.bst = "intro"; this.introT = 0; this.sfx.gate();
    const B = this.boss.p; B.y = -160; B.play("intro", true); B.resetChains();
    this.say("SEPHIROTH");
  }
  private tickBoss(dt: number) {
    const S = this.boss, B = S.p, P = this.hero.s.p;
    S.flash = Math.max(0, S.flash - dt);
    if (this.locked) this.gate = Math.min(1, this.gate + dt * 2.2);
    if (this.bst === "wait") { B.update(dt); B.solve(); B.stepChains(dt, FLOOR); return; }
    const rage = this.bhp < 210 ? 1.22 : 1, d = P.x - B.x, ad = Math.abs(d), face = d > 0 ? 1 : -1;
    const think = (a: number, b: number) => { this.bst = "think"; this.btime = (a + Math.random() * (b - a)) / rage; B.play("idle"); };
    const bdt = dt * rage;

    if (this.bst === "intro") {
      this.introT += dt; const k = Math.min(1, this.introT / 1.8), e = 1 - Math.pow(1 - k, 3);
      B.y = -160 + (FLOOR + 160) * e; B.face = face;
      if (Math.random() < 0.3) this.feather();
      if (k >= 1) { B.y = FLOOR; this.dust(B.x, 8); this.bossShown = true; think(0.8, 1.2); this.emit(true); }
    }
    else if (this.bst === "think") {
      B.face = face; this.bvx *= 0.8; this.btime -= dt;
      if (this.st === "dead") { B.play("idle"); }
      else if (this.btime <= 0) {
        const r = Math.random();
        if (ad < 100) { if (r < 0.55) this.bst = "slash"; else if (r < 0.8) this.bst = "thrust"; else this.bst = "tele"; }
        else if (ad < 190) { if (r < 0.4) this.bst = "thrust"; else if (r < 0.7) { this.bst = "dash"; this.btime = 0.8; } else this.bst = "cast"; }
        else { if (r < 0.45) { this.bst = "walk"; this.btime = 1; } else if (r < 0.75) this.bst = "cast"; else this.bst = "tele"; }
        if (this.bst === "slash" || this.bst === "thrust" || this.bst === "cast" || this.bst === "tele") { B.play(this.bst, true); this.bhits = {}; this.teleDone = false; this.pillarsDone2 = false; }
      }
    }
    else if (this.bst === "walk") {
      B.face = face; B.play("walk"); this.bvx = face * 48; this.btime -= dt;
      if (ad < 90 || this.btime <= 0) think(0.2, 0.5);
    }
    else if (this.bst === "dash") {
      B.face = face; B.play("dash"); this.bvx = face * 270; this.btime -= dt;
      if (Math.floor(this.t * 60) % 3 === 0) this.ghost(S, "rgba(150,120,255,.85)");
      if (ad < 70 || this.btime <= 0) { this.bst = "slash"; B.play("slash", true); this.bhits = {}; this.bvx = face * 120; }
    }
    else if (this.bst === "slash" || this.bst === "thrust") {
      const t = B.t;
      if (this.bst === "slash") this.bvx = t > 0.38 && t < 0.52 ? B.face * 90 : this.bvx * 0.85;
      else this.bvx = t > 0.3 && t < 0.46 ? B.face * 300 : this.bvx * 0.82;
      if (Math.abs(t - (this.bst === "slash" ? 0.4 : 0.32)) < bdt * 0.6) this.sfx.swing(true);
      (B.A.hit || []).forEach((h, i) => {
        if (t < h.t0 || t > h.t1 || this.bhits[i]) return;
        if (this.overlap(this.box(h, B), this.hurtBox(P, 8, 58))) { this.bhits[i] = true; this.damageHero(h.dmg, B.face, h.kb, h.ky); }
      });
      if (B.done) think(0.5, 1.1);
    }
    else if (this.bst === "cast") {
      this.bvx *= 0.8; B.face = face;
      if (!this.pillarsDone2 && B.t >= 0.3) {
        this.pillarsDone2 = true;
        const n = rage > 1 ? 4 : 3;
        for (let i = 0; i < n; i++) this.pillars.push({ x: P.x + (i - (n - 1) / 2) * 46, t: -i * 0.18, hit: false });
      }
      if (B.done) think(0.6, 1);
    }
    else if (this.bst === "tele") {
      this.bvx = 0; const t = B.t;
      S.alpha = t < 0.22 ? 1 - t / 0.22 : t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 0.15);
      if (!this.teleDone && t >= 0.24) {
        this.teleDone = true; this.ghost(S, "rgba(150,120,255,.9)");
        B.x = Math.max(ARENA_X + 30, Math.min(ARENA_X + ARENA_W - 30, P.x - P.face * 56)); B.face = P.x > B.x ? 1 : -1; B.resetChains();
        for (let i = 0; i < 6; i++) this.feather(B.x, B.y - 50);
      }
      if (B.done) { S.alpha = 1; this.bst = "slash"; B.play("slash", true); this.bhits = {}; }
    }
    else if (this.bst === "hurt") { this.bvx *= 0.85; if (B.done) think(0.15, 0.4); }
    else if (this.bst === "dead") {
      this.bvx *= 0.9; this.deadT += dt;
      if (Math.random() < 0.5) this.feather(B.x + (Math.random() - 0.5) * 40, B.y - 60);
      if (this.deadT > 1.6) S.alpha = Math.max(0, 1 - (this.deadT - 1.6) / 1.2);
      if (this.deadT > 4 && this.scene === "play") { this.scene = "win"; this.emit(true); }
    }
    if (this.bst !== "intro") { B.x += this.bvx * dt; B.x = Math.max(ARENA_X + 20, Math.min(ARENA_X + ARENA_W - 20, B.x)); B.y = FLOOR; }
    B.update(this.bst === "intro" || this.bst === "dead" ? dt : bdt); B.solve(); B.stepChains(dt, FLOOR);
  }
  pillarsDone2 = false;

  // ---------- effetti ----------
  private dust(x: number, n: number) {
    for (let i = 0; i < n; i++) this.parts.push({ x: x + (Math.random() - 0.5) * 10, y: FLOOR - 1, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 30, life: 0.5, max: 0.5, col: i % 2 ? "#6b6080" : "#4a4260", s: 2, g: 40 });
  }
  private sparks(x: number, y: number, dir: number, col: string) {
    for (let i = 0; i < 12; i++) {
      const a = (Math.random() - 0.5) * 2.2, v = 80 + Math.random() * 180;
      this.parts.push({ x, y, vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v - 40, life: 0.3, max: 0.3, col: i % 3 ? col : "#ffffff", s: 1 + (i % 2), g: 300, k: "spark" });
    }
  }
  private feather(x?: number, y?: number) {
    this.parts.push({ x: x != null ? x : ARENA_X + Math.random() * ARENA_W, y: y != null ? y : -10, vx: (Math.random() - 0.5) * 20, vy: 18 + Math.random() * 20, life: 4, max: 4, col: "#0b0a10", s: 3, g: 0, k: "feather" });
  }
  private ghost(s: Sprite, col: string) {
    const p = s.p; let g = this.ghosts.find((q) => q.life <= 0);
    if (!g) { if (this.ghosts.length > 10) return; const [cv, cx] = mk(s.cv.width, s.cv.height); g = { cv, cx, x: 0, y: 0, face: 1, life: 0, max: 0.3, ax: p.r.ax, ay: p.r.ay }; this.ghosts.push(g); }
    if (g.cv.width !== s.cv.width || g.cv.height !== s.cv.height) { g.cv.width = s.cv.width; g.cv.height = s.cv.height; }
    s.paint(); s.tint(col, g.cx);
    g.x = p.x; g.y = p.y; g.face = p.face; g.life = g.max = 0.3; g.ax = p.r.ax; g.ay = p.r.ay;
  }
  private fx(dt: number) {
    this.parts.forEach((q) => {
      q.life -= dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.k === "feather") { q.x += Math.sin(this.t * 3 + q.max * 10 + q.y * 0.05) * 0.4; if (q.y > FLOOR - 1) { q.y = FLOOR - 1; q.vy = 0; q.vx = 0; } }
    });
    this.parts = this.parts.filter((q) => q.life > 0);
    this.ghosts.forEach((g) => { g.life -= dt; });
    this.nums.forEach((n) => { n.life -= dt; n.y -= 22 * dt; }); this.nums = this.nums.filter((n) => n.life > 0);
    const B = this.boss.p, P = this.hero.s.p;
    this.shots.forEach((s) => {
      s.t += dt; s.life -= dt; s.x += s.vx * dt;
      if (Math.random() < 0.8) this.parts.push({ x: s.x - Math.sign(s.vx) * 4, y: s.y + (Math.random() - 0.5) * 6, vx: -s.vx * 0.1, vy: -20 - Math.random() * 30, life: 0.3, max: 0.3, col: Math.random() < 0.5 ? "#ff8a2a" : "#ffd75a", s: 2, g: -40 });
      if (!s.hit && this.bossShown && this.bst !== "dead" && this.boss.alpha > 0.5 && Math.abs(s.x - B.x) < 12 && s.y > B.y - 66 && s.y < B.y) {
        s.hit = true; s.life = 0; this.damageBoss(14, Math.sign(s.vx), false, s.x, s.y);
        for (let i = 0; i < 16; i++) this.parts.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.8) * 140, life: 0.4, max: 0.4, col: i % 2 ? "#ff5a1f" : "#ffd75a", s: 2, g: 200 });
      }
    });
    this.shots = this.shots.filter((s) => s.life > 0 && s.x > this.cam - 40 && s.x < this.cam + this.W + 40);
    this.pillars.forEach((pl) => {
      pl.t += dt;
      if (pl.t > 0.75 && pl.t < 0.95 && !pl.hit && Math.abs(P.x - pl.x) < 14) { pl.hit = true; this.damageHero(12, P.x > pl.x ? 1 : -1, 80, -220); }
      if (Math.abs(pl.t - 0.75) < dt * 0.6) { this.shake = Math.max(this.shake, 3); this.sfx.boom(); }
    });
    this.pillars = this.pillars.filter((pl) => pl.t < 1.15);
  }

  // ---------- disegno ----------
  private render() {
    const x = this.x, W = this.W;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    if (this.scene === "gallery") return this.renderGallery();
    const sx = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0, sy = this.shake ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const cam = Math.round(this.cam) + sx;
    x.save(); x.translate(0, sy);
    this.stage.draw(x, cam, W, this.t, this.gate, this.locked);
    // ombre a terra
    const shadow = (px: number, py: number, w: number) => { const h = Math.max(0, 1 - (FLOOR - py) / 120); if (h <= 0) return; x.fillStyle = `rgba(0,0,0,${0.35 * h})`; x.fillRect(Math.round(px - cam - w * h), FLOOR, Math.round(w * 2 * h), 2); };
    // pilastri d'ombra di Sephiroth: prima il segnale a terra, poi l'eruzione
    this.pillars.forEach((pl) => {
      const px = Math.round(pl.x - cam);
      if (pl.t < 0) return;
      if (pl.t < 0.75) { const w = 8 + Math.sin(pl.t * 30) * 2; x.fillStyle = "rgba(140,90,255,.55)"; x.fillRect(px - w, FLOOR - 1, w * 2, 2); x.fillStyle = "#e0d4ff"; x.fillRect(px - 1, FLOOR - 2, 2, 1); }
      else { const k = 1 - (pl.t - 0.75) / 0.4, w = Math.round(10 * k + 2);
        x.fillStyle = "#1a0b2e"; x.fillRect(px - w - 2, 0, w * 2 + 4, FLOOR); x.fillStyle = "#7a52ff"; x.fillRect(px - w, 0, w * 2, FLOOR); x.fillStyle = "#e9e2ff"; x.fillRect(px - Math.max(1, w / 3), 0, Math.max(2, w / 1.5), FLOOR); }
    });
    const actors: Sprite[] = [];
    if (this.scene === "title") { actors.push(this.heroes.clive.s, this.heroes.cloud.s); }
    else { if (this.bst !== "wait") actors.push(this.boss); actors.push(this.hero.s); }
    actors.forEach((s) => { if (s.alpha > 0.05) shadow(s.p.x, s.p.y, s === this.boss ? 14 : 11); });
    this.ghosts.forEach((g) => {
      if (g.life <= 0) return;
      x.save(); x.globalAlpha = (g.life / g.max) * 0.55; x.translate(Math.round(g.x - cam), Math.round(g.y)); x.scale(g.face, 1); x.drawImage(g.cv, -g.ax, -g.ay); x.restore();
    });
    actors.forEach((s) => {
      if (s.alpha <= 0.02) return;
      s.paint();
      // lampeggio di invulnerabilità
      if (s === this.hero.s && this.inv > 0 && this.st !== "dead" && Math.floor(this.t * 20) % 2) { x.globalAlpha = 0.45; }
      s.draw(x, cam, 0); x.globalAlpha = 1;
    });
    this.shots.forEach((s) => {
      const px = Math.round(s.x - cam), py = Math.round(s.y), f = Math.floor(s.t * 20) % 2, d = Math.sign(s.vx);
      x.globalCompositeOperation = "lighter"; x.globalAlpha = 0.35; this.disc(px, py, 9 + f, "#ff6a1f"); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
      this.disc(px - d * 3, py, 4, "#c2340f"); this.disc(px, py, 5 + f * 0.5, "#ff5a1f"); this.disc(px + d, py - f, 3.5, "#ffb13b"); this.disc(px + d * 2, py, 2, "#fff3b0");
    });
    this.parts.forEach((q) => {
      const a = Math.min(1, q.life / q.max * 1.5); x.globalAlpha = q.k === "feather" ? Math.min(1, q.life) : a; x.fillStyle = q.col;
      const px = Math.round(q.x - cam), py = Math.round(q.y);
      if (q.k === "feather") { x.fillRect(px, py, 3, 1); x.fillRect(px + 1, py + 1, 2, 1); x.fillStyle = "#2a2838"; x.fillRect(px, py, 1, 1); }
      else if (q.k === "spark") { x.fillRect(px, py, q.s, q.s); x.fillRect(px - Math.sign(q.vx), py, 1, 1); }
      else x.fillRect(px, py, q.s, q.s);
    });
    x.globalAlpha = 1;
    this.nums.forEach((n) => this.digits(String(n.v), Math.round(n.x - cam), Math.round(n.y), n.col, Math.min(1, n.life * 3)));
    this.stage.fore(x, cam, W, this.t);
    x.restore();
    // vignettatura
    const v = x.createRadialGradient(W / 2, VH / 2, VH * 0.3, W / 2, VH / 2, W * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,.55)"); x.fillStyle = v; x.fillRect(0, 0, W, VH);
  }
  // cerchio pieno a pixel netti
  private disc(cx: number, cy: number, r: number, col: string) {
    const x = this.x; x.fillStyle = col;
    for (let dy = -Math.floor(r); dy <= Math.floor(r); dy++) { const w = Math.floor(Math.sqrt(r * r - dy * dy)); x.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
  }
  private digits(s: string, px: number, py: number, col: string, a: number) {
    const x = this.x; x.globalAlpha = a;
    const w = s.length * 4 - 1; let ox = px - Math.floor(w / 2);
    for (let ci = 0; ci < s.length; ci++) {
      const m = DIG[+s.charAt(ci)] || 0;
      for (let i = 0; i < 15; i++) if (m & (1 << (14 - i))) { const cx = ox + (i % 3), cy = py + Math.floor(i / 3); x.fillStyle = "#000"; x.fillRect(cx + 1, cy + 1, 1, 1); x.fillStyle = col; x.fillRect(cx, cy, 1, 1); }
      ox += 4;
    }
    x.globalAlpha = 1;
  }
  private renderGallery() {
    const x = this.x, W = this.W, s = this.galSprites[this.gal.id]; if (!s) return;
    x.fillStyle = "#14121f"; x.fillRect(0, 0, W, VH);
    const Z = this.gal.id === "seph" ? 2 : 3, gy = VH - 76;
    // griglia di riferimento: un quadretto = 8px di gioco
    x.fillStyle = "#1b1929";
    for (let i = 0; i < W; i += 8 * Z) x.fillRect(i - (Math.round(this.gal.dist * Z) % (8 * Z) + 8 * Z) % (8 * Z), 0, 1, gy);
    for (let j = gy; j > 0; j -= 8 * Z) x.fillRect(0, j, W, 1);
    x.fillStyle = "#3a3452"; x.fillRect(0, gy, W, 1); x.fillStyle = "#211e30"; x.fillRect(0, gy + 1, W, VH - gy);
    s.paint();
    const p = s.p, r = p.r, cx = Math.round(W / 2 - (this.gal.id === "seph" ? -40 * p.face : 0));
    x.save(); x.translate(cx, gy); x.scale(Z * p.face, Z);
    x.drawImage(s.cv, -r.ax, -r.ay);
    x.restore();
    // anteprima 1:1 come in gioco
    x.save(); x.translate(Math.round(W * 0.12), gy); x.scale(p.face, 1); x.drawImage(s.cv, -r.ax, -r.ay); x.restore();
  }
}
