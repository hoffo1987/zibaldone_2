import { fadeGlass } from "./motion";

// la pagina entra: le lastre devono PARTIRE trasparenti e arrivare al loro valore, agganciate al contenitore
test("panes fade in from transparent, synced to the container's entrance", () => {
  const box = document.createElement("div");
  box.innerHTML = '<p>titolo</p><div class="pn"><div class="pn"></div></div><section><div class="pn"></div></section>';
  const parent = { animationName: "pgInT", playbackRate: 1.5, startTime: 1234, effect: { getTiming: () => ({ duration: 520, delay: 40, easing: "ease" }) } };
  box.getAnimations = () => [parent];
  box.animate = () => {};
  const calls = [];
  const made = [];
  Element.prototype.animate = function (k, o) { const a = { playbackRate: 1, startTime: null }; calls.push({ el: this, k, o }); made.push(a); return a; };
  fadeGlass(box, true);
  // tre lastre più il figlio diretto senza vetro (il <p>)
  expect(calls).toHaveLength(4);
  for (const c of calls) {
    expect(c.k).toEqual([{ opacity: 0, offset: 0 }]);
    expect(c.o).toMatchObject({ duration: 520, delay: 40, easing: "ease", fill: "backwards" });
  }
  for (const a of made) { expect(a.startTime).toBe(1234); expect(a.playbackRate).toBe(1.5); }
  delete Element.prototype.animate;
});

test("nothing happens when the container does not animate (animations off)", () => {
  const box = document.createElement("div");
  box.innerHTML = '<div class="pn"></div>';
  box.getAnimations = () => [];
  box.animate = () => {};
  const spy = jest.fn();
  Element.prototype.animate = spy;
  fadeGlass(box, true);
  expect(spy).not.toHaveBeenCalled();
  delete Element.prototype.animate;
});

test("a pane mounted while the page is entering joins the fade at the page's progress", async () => {
  const box = document.createElement("div");
  box.innerHTML = '<div class="pn"></div>';
  let finish;
  const parent = { animationName: "pgInT", playbackRate: 1, startTime: 500, finished: new Promise((r) => { finish = r; }), effect: { getTiming: () => ({ duration: 520, delay: 0, easing: "linear" }) } };
  box.getAnimations = () => [parent];
  box.animate = () => {};
  const made = [];
  Element.prototype.animate = function () { const a = { el: this, playbackRate: 1, startTime: null }; made.push(a); return a; };
  fadeGlass(box, false);
  expect(made).toHaveLength(1);
  const late = document.createElement("div"); late.className = "pn"; box.appendChild(late);
  await new Promise((r) => setTimeout(r, 0));
  expect(made).toHaveLength(2);
  expect(made[1].el).toBe(late); expect(made[1].startTime).toBe(500);
  finish(); await new Promise((r) => setTimeout(r, 0));
  const after = document.createElement("div"); after.className = "pn"; box.appendChild(after);
  await new Promise((r) => setTimeout(r, 0));
  expect(made).toHaveLength(2);
  delete Element.prototype.animate;
});
