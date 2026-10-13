// Il mixer con un finto Web Audio: livelli, sblocco, effetti spenti, ducking e tick al passaggio.
class Param { constructor(v = 0) { this.value = v; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
class Node { constructor() { this.out = []; } connect(n) { this.out.push(n); return n; } disconnect() {} }
class Ctx {
  constructor() { this.state = "suspended"; this.currentTime = 2; this.sources = []; this.destination = new Node(); Ctx.last = this; }
  createGain() { const n = new Node(); n.gain = new Param(1); return n; }
  createDynamicsCompressor() { const n = new Node(); ["threshold", "knee", "ratio", "attack", "release"].forEach((k) => { n[k] = new Param(); }); return n; }
  createBuffer() { return { duration: 0 }; }
  createBufferSource() { const s = new Node(); s.playbackRate = new Param(1); s.start = jest.fn(); s.stop = jest.fn(); this.sources.push(s); return s; }
  resume() { this.state = "running"; return Promise.resolve(); }
  suspend() { this.state = "suspended"; return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve({ duration: 14.7735 }); }
}
let sound;
const flush = () => new Promise((r) => setTimeout(r, 0));
beforeEach(() => {
  jest.resetModules();
  window.AudioContext = Ctx;
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
  sound = require("./sound");
});
afterEach(() => { delete window.AudioContext; delete global.fetch; });
// la sorgente suonata e la catena che attraversa: sorgente → livello del suono → bus
const lastVoice = () => { const s = Ctx.last.sources[Ctx.last.sources.length - 1]; const g = s.out[0]; return { s, g, bus: g.out[0] }; };

test("nothing plays before a gesture; afterwards each cue plays at its own mix level", async () => {
  sound.preload("enter");
  expect(sound.play("enter")).toBeNull();
  sound.unlock(); await flush();
  await sound.load("enter");
  const v = sound.play("enter", { when: 3 });
  expect(v).not.toBeNull();
  const { s, g } = lastVoice();
  expect(g.gain.value).toBeCloseTo(Math.pow(10, sound.MIX.enter / 20), 5);
  expect(s.start).toHaveBeenCalledWith(3, 0);
  // il tick al passaggio è il suono più basso del mix
  expect(Math.min(...Object.values(sound.MIX))).toBe(sound.MIX.klick);
});

test("with effects off only an explicit request plays, bypassing the muted bus", async () => {
  sound.unlock(); await flush();
  await sound.load("intro"); await sound.load("klick");
  sound.configure(false, 1);
  expect(sound.play("klick")).toBeNull();
  const v = sound.play("intro", { force: true, offset: 4 });
  expect(v.off).toBe(4);
  expect(lastVoice().bus.ratio).toBeDefined(); // collegato direttamente al limitatore
  sound.configure(true, 0.5);
  sound.play("klick");
  expect(lastVoice().bus.gain.value).toBeCloseTo(0.25, 5); // volume al quadrato
});

test("background music ducks to the lowest level requested and comes back", () => {
  const seen = [];
  const off = sound.onDuck((k) => seen.push(k));
  sound.duck("intro", sound.DUCK.intro); sound.duck("egg", sound.DUCK.egg);
  expect(sound.duckLevel()).toBe(sound.DUCK.intro);
  sound.duck("intro", null);
  expect(sound.duckLevel()).toBe(sound.DUCK.egg);
  sound.duck("egg", null);
  expect(seen[seen.length - 1]).toBe(1);
  off();
});

test("hover ticks once per element, never in a burst, and skip the press on menu items", async () => {
  sound.unlock(); await flush(); await sound.load("klick");
  const unbind = sound.bindUiSounds();
  document.body.innerHTML = `<button id="a"><span id="in">A</span></button><button id="b" data-snd="nav">B</button><p id="p">testo</p>`;
  let now = 1000; jest.spyOn(performance, "now").mockImplementation(() => now);
  const fire = (type, id, pointerType = "mouse") => { const e = new MouseEvent(type, { bubbles: true }); Object.defineProperty(e, "pointerType", { value: pointerType }); document.getElementById(id).dispatchEvent(e); };
  const count = () => Ctx.last.sources.length;
  const base = count();
  fire("pointerover", "a"); fire("pointerover", "in"); // dentro lo stesso pulsante: un solo tick
  expect(count()).toBe(base + 1);
  now += 10; fire("pointerover", "b"); // troppo presto dopo il precedente
  expect(count()).toBe(base + 1);
  fire("pointerover", "p"); now += 100; fire("pointerover", "b");
  expect(count()).toBe(base + 2);
  fire("pointerdown", "b"); // voce di menu: parla il cambio di sezione, non il tick
  expect(count()).toBe(base + 2);
  now += 100; fire("pointerdown", "a", "touch"); // col dito il tick è il riscontro
  expect(count()).toBe(base + 3);
  unbind(); performance.now.mockRestore();
});
