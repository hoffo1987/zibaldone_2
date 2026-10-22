// Gli spunti del diario: tanti, diversi, mai lo stesso due volte di fila, adatti al momento e scritti bene sul foglio.
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { ALL, SETS, MOMENTI, draw, dailyOf, momentiOf, fits, tipoOf, paperText, onSheet, remember, loadMemo, saveMemo, SEEN_MAX } from "./spunti";
import { DiaryPrompts, inkInto } from "./DiaryPrompts";

// giovedì 22 ottobre 2026, ore 10 (mattina, autunno) e alle 21 (sera)
const MORNING = new Date(2026, 9, 22, 10), EVENING = new Date(2026, 9, 22, 21);
const seq = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test("ogni set ha abbastanza spunti, tutti diversi e ben formati", () => {
  expect(SETS).toHaveLength(10);
  SETS.forEach((s) => expect(ALL.filter((x) => x.set === s.id).length).toBeGreaterThanOrEqual(16));
  expect(new Set(ALL.map((s) => s.id)).size).toBe(ALL.length);
  expect(new Set(ALL.map((s) => s.text.toLowerCase())).size).toBe(ALL.length);
  ALL.forEach((s) => {
    expect(s.text).toMatch(/^[A-ZÈÉ«]/);
    expect(s.text).toMatch(/[?.…]$/);
    expect(s.text).not.toMatch(/ {2}|'|\.\.\.| [,.?:]/); // apostrofo tipografico, puntini veri, niente spazi prima della punteggiatura
    expect(s.text.length).toBeLessThanOrEqual(110);
    s.when.forEach((w) => expect(MOMENTI).toContain(w));
  });
  // le forme si alternano: ci sono domande, tracce e frasi da finire, e nessuna domina
  const tipi = ALL.map((s) => s.tipo);
  ["domanda", "incipit", "traccia"].forEach((t) => expect(tipi).toContain(t));
  expect(tipi.filter((t) => t === "domanda").length / tipi.length).toBeLessThan(0.75);
  expect(ALL.filter((s) => s.set === "incipit").every((s) => s.tipo === "incipit")).toBe(true);
});

test("le domande non danno per scontato il genere di chi scrive", () => {
  // participi e aggettivi riferiti a «tu» o a «io» che cambierebbero al femminile
  const gendered = /\b(sei|eri|sono|ero|sentirti|sentirmi) (stato|stata|felice|stanco|stanca|solo|sola|fiero|fiera|contento|contenta|sicuro|sicura)\b|\bte stess[oa]\b|\bda (piccolo|piccola|bambino|bambina)\b/i;
  ALL.forEach((s) => expect(s.text).not.toMatch(gendered));
});

test("il tipo si riconosce dalla punteggiatura", () => {
  expect(tipoOf("Com’è andata?")).toBe("domanda");
  expect(tipoOf("Oggi ho capito che…")).toBe("incipit");
  expect(tipoOf("Descrivi la tua stanza.")).toBe("traccia");
});

test("il momento: fascia del giorno, giorni speciali e stagione", () => {
  expect(momentiOf(MORNING)).toEqual(["mattina", "autunno"]);
  expect(momentiOf(new Date(2026, 9, 24, 23, 30))).toEqual(["notte", "weekend", "autunno"]);
  expect(momentiOf(new Date(2026, 9, 26, 15))).toEqual(["pomeriggio", "lunedi", "autunno"]);
  expect(momentiOf(new Date(2027, 0, 1, 19))).toEqual(["sera", "venerdi", "inverno"]);
  expect(momentiOf(new Date(2027, 6, 1, 4))).toContain("estate");
});

test("di mattina non esce mai una domanda della sera, e viceversa", () => {
  const rnd = seq(7);
  for (let i = 0; i < 300; i++) {
    expect(fits(draw({ set: "tutti", now: MORNING, seen: [], rnd }), momentiOf(MORNING))).toBe(true);
    expect(draw({ set: "tutti", now: EVENING, seen: [], rnd }).when).not.toContain("mattina");
  }
});

test("si pescano spunti sempre nuovi finché il set non è finito, poi tornano i più vecchi", () => {
  const rnd = seq(42);
  ["tutti", ...SETS.map((s) => s.id)].forEach((set) => {
    const pool = ALL.filter((s) => (set === "tutti" || s.set === set) && fits(s, momentiOf(MORNING)));
    let seen = [], prev = null;
    for (let i = 0; i < pool.length; i++) {
      const s = draw({ set, now: MORNING, seen, prev, rnd });
      expect(seen).not.toContain(s.id);
      if (set !== "tutti") expect(s.set).toBe(set);
      seen = remember(seen, s.id); prev = s;
    }
    // finito il giro di un tema: mai quello appena visto, e solo dalla metà vista da più tempo
    if (set === "tutti") return;
    for (let i = 0; i < 20; i++) {
      const s = draw({ set, now: MORNING, seen, prev, rnd });
      expect(s.id).not.toBe(prev.id);
      expect(seen.indexOf(s.id)).toBeLessThan(Math.ceil(seen.length / 2));
      seen = remember(seen, s.id); prev = s;
    }
  });
});

test("nel mix i temi cambiano quasi sempre da uno spunto all'altro", () => {
  const rnd = seq(3);
  let prev = null, seen = [], same = 0;
  for (let i = 0; i < 120; i++) { const s = draw({ set: "tutti", now: MORNING, seen, prev, rnd }); if (prev && s.set === prev.set) same++; seen = remember(seen, s.id); prev = s; }
  expect(same).toBeLessThan(20);
});

test("lo spunto di oggi è lo stesso per tutti per tutto il giorno, cambia ogni giorno e vale a ogni ora", () => {
  expect(dailyOf(new Date(2026, 9, 22, 0, 5)).id).toBe(dailyOf(new Date(2026, 9, 22, 23, 55)).id);
  const days = Array.from({ length: 60 }, (_, i) => dailyOf(new Date(2026, 9, 22 + i, 12)));
  expect(new Set(days.map((s) => s.id)).size).toBe(60);
  days.forEach((s) => expect(s.when).toEqual([]));
});

test("la memoria degli spunti visti resta corta e non si rompe", () => {
  let seen = [];
  for (let i = 0; i < SEEN_MAX + 40; i++) seen = remember(seen, `x${i}`);
  expect(seen).toHaveLength(SEEN_MAX);
  expect(remember(["a", "b"], "a")).toEqual(["b", "a"]);
  localStorage.setItem("circuito:spunti:u1", "{rotto");
  expect(loadMemo("u1")).toEqual({ seen: [], open: true });
  saveMemo("u1", { seen: ["a"], open: false, daily: "2026-10-22" });
  expect(loadMemo("u1")).toEqual({ seen: ["a"], open: false, daily: "2026-10-22" });
});

describe("sul foglio", () => {
  const domanda = ALL.find((s) => s.tipo === "domanda"), incipit = ALL.find((s) => s.text === "Oggi ho capito che…");
  const editor = (html) => { const ed = document.createElement("div"); ed.contentEditable = "true"; ed.innerHTML = html; document.body.appendChild(ed); return ed; };

  test("la mezza frase perde i puntini e lascia il cursore subito dopo, pronta da continuare", () => {
    expect(paperText(incipit)).toBe("Oggi ho capito che ");
    const ed = editor("<div><br></div>"), ink = inkInto(ed, incipit);
    expect(ed.innerHTML).toBe("<div>Oggi ho capito che&nbsp;</div>");
    const c = ink.caret();
    expect(c.startContainer).toBe(ink.text);
    expect(c.startOffset).toBe(ink.text.length);
  });

  test("la domanda va in corsivo con una riga libera sotto, staccata da quello che c'è già", () => {
    const ed = editor("Ciao<div>seconda riga</div>"), ink = inkInto(ed, domanda);
    expect(ed.innerHTML).toBe(`Ciao<div>seconda riga</div><div><br></div><div><i>${domanda.text}</i></div><div><br></div>`);
    expect(ink.line.textContent).toBe(domanda.text);
    expect(ink.caret().startContainer).toBe(ed.lastChild);
  });

  test("una riga vuota in fondo viene riusata, senza accumulare spazi", () => {
    const ed = editor("<div>prima</div><div><br></div>");
    inkInto(ed, incipit);
    expect(ed.innerHTML).toBe("<div>prima</div><div>Oggi ho capito che&nbsp;</div>");
    const ed2 = editor("<div>prima</div><div><br></div>");
    inkInto(ed2, domanda);
    expect(ed2.innerHTML).toBe(`<div>prima</div><div><br></div><div><i>${domanda.text}</i></div><div><br></div>`);
  });

  test("lo spunto conta come sul foglio solo finché il suo testo c'è: cancellato, si può rimettere", () => {
    expect(onSheet("Oggi ho capito che  tutto cambia", incipit)).toBe(true);
    expect(onSheet(`${domanda.text}\nla mia risposta`, domanda)).toBe(true);
    expect(onSheet("la mia risposta", domanda)).toBe(false);
    expect(onSheet(domanda.text.slice(0, -4), domanda)).toBe(false);
    expect(onSheet("", incipit)).toBe(false);
  });

  test("le immagini restano: un foglio con solo una foto non è un foglio vuoto", () => {
    const ed = editor('<img src="data:image/png;base64,AAAA">');
    inkInto(ed, incipit);
    expect(ed.querySelector("img")).not.toBeNull();
  });
});

describe("il pannello", () => {
  let host, root;
  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  const render = (props) => act(() => root.render(<DiaryPrompts show uid="u1" onPaper={null} onUse={() => {}} onRemove={() => {}} {...props} />));
  const card = () => host.querySelector(".sp-card:not(.out) .sp-text").textContent;
  const button = (label) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent.includes(label));

  test("parte dallo spunto di oggi e a ogni «Un altro» ne pesca uno diverso", () => {
    render();
    expect(host.textContent).toContain("Spunto di oggi");
    expect(card()).toBe(dailyOf(new Date()).text);
    const shown = [card()];
    for (let i = 0; i < 12; i++) { act(() => button("Un altro").click()); shown.push(card()); }
    expect(new Set(shown).size).toBe(shown.length);
  });

  test("scegliere un tema pesca da quel tema e lo descrive", () => {
    render();
    act(() => host.querySelector('[data-set="persone"]').click());
    expect(host.querySelector('[data-set="persone"]').getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Senza fare nomi");
    expect(ALL.filter((s) => s.set === "persone").map((s) => s.text)).toContain(card());
  });

  test("«Scrivi da qui» passa lo spunto in vista; sul foglio si può togliere finché non lo si tocca", () => {
    const onUse = jest.fn(), onRemove = jest.fn();
    render({ onUse, onRemove });
    act(() => button("Scrivi da qui").click());
    expect(onUse).toHaveBeenCalledTimes(1);
    const [s, from] = onUse.mock.calls[0];
    expect(s.text).toBe(card());
    expect(from).toBe(host.querySelector(".sp-card:not(.out) .sp-text"));
    // oggi lo spunto del giorno è già stato usato: tornando, il primo foglietto è un altro
    expect(loadMemo("u1").daily).toBeTruthy();
    render({ onUse, onRemove, onPaper: { id: s.id, untouched: true } });
    expect(host.textContent).toContain("Sul foglio");
    act(() => button("Togli dal foglio").click());
    expect(onRemove).toHaveBeenCalledTimes(1);
    render({ onUse, onRemove, onPaper: { id: s.id, untouched: false } });
    expect(button("Togli dal foglio")).toBeUndefined();
    expect(button("Sul foglio").disabled).toBe(true);
  });

  test("Nascondi chiude il mazzo e lo ricorda", () => {
    render();
    act(() => host.querySelector('[aria-label="Nascondi gli spunti"]').click());
    expect(host.querySelector(".sp-body").className).toContain("shut");
    expect(button("Pesca uno spunto")).toBeTruthy();
    expect(loadMemo("u1").open).toBe(false);
  });
});
