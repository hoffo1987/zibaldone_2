import { normalizza, ancoraDi, motivoNo, ritrova, fondi, intensita, indiceDi, rangeDi, selezioneDi, offsetDi, notificheScintille, notificheEchi, chiaveScintille, chiaveEco, giornoDi, msDelGiorno } from './scintille';
import { plain } from './sanitize';

const html = '<div>Il treno delle sette è pieno di gente</div><div>che dorme con la testa sul vetro.<br>Sembriamo tutti in attesa</div><p>di un <b>sogno</b> che parta in orario.</p>';
const mount = (h = html) => { const el = document.createElement('div'); el.className = 'rt'; el.innerHTML = h; document.body.appendChild(el); return el; };

test('il testo del lettore è quello di plain(), con gli spazi ridotti', () => {
  const ix = indiceDi(mount());
  expect(ix.piano.text).toBe(normalizza(plain(html)).text);
  expect(ix.piano.text).toBe('Il treno delle sette è pieno di gente che dorme con la testa sul vetro. Sembriamo tutti in attesa di un sogno che parta in orario.');
});
test('normalizza ricorda da dove viene ogni carattere', () => {
  const p = normalizza('  a  \n b  ');
  expect(p.text).toBe('a b');
  expect(p.map).toEqual([2, 3, 7]);
});
test('una selezione diventa frase e contesto, tra 3 parole e 280 caratteri', () => {
  const text = 'Il treno delle sette è pieno di gente che dorme.';
  const a = text.indexOf('pieno'), b = text.indexOf(' che');
  expect(ancoraDi(text, a, b)).toEqual({ cit: 'pieno di gente', pre: 'Il treno delle sette è ', post: ' che dorme.' });
  // gli spazi ai bordi della selezione non contano
  expect(ancoraDi(text, a - 1, b + 1).cit).toBe('pieno di gente');
  expect(ancoraDi(text, a, a + 'pieno di'.length)).toBeNull();
  expect(motivoNo('pieno di')).toBe('corta');
  const long = 'parola '.repeat(60);
  expect(ancoraDi(long, 0, long.length)).toBeNull();
  expect(motivoNo('x '.repeat(141))).toBe('lunga');
  // il contesto è al massimo di 40 caratteri per parte
  const big = `${'a'.repeat(100)} tre parole qui ${'b'.repeat(100)}`;
  const s = ancoraDi(big, 101, 116);
  expect(s.pre.length).toBe(40); expect(s.post.length).toBe(40);
});
test('la frase si ritrova anche dopo una modifica, scegliendo il punto col contesto giusto', () => {
  const text = 'Ho detto ciao a tutti. Poi, più tardi, ho detto ciao a tutti di nuovo.';
  const second = text.lastIndexOf('ho detto ciao');
  const a = ancoraDi(text, second, second + 'ho detto ciao a tutti'.length);
  expect(ritrova(text, a)).toEqual({ a: second, b: second + a.cit.length });
  // l'autore aggiunge una frase in testa: la scintilla segue la sua frase
  const edited = `Una riga nuova. ${text}`;
  expect(ritrova(edited, a).a).toBe(edited.lastIndexOf('ho detto ciao'));
  // spazi diversi non la perdono (il testo del foglio arriva sempre normalizzato)
  expect(ritrova(normalizza('Poi, più tardi,   ho  detto ciao\n a tutti di nuovo.').text, { ...a, cit: 'ho  detto ciao a tutti' })).not.toBeNull();
  // parole cambiate: la frase non c'è più
  expect(ritrova(text.replace(/ciao/g, 'buongiorno'), a)).toBeNull();
});
test('gli intervalli sovrapposti si fondono, e ogni tratto sa quante persone lo coprono', () => {
  const t = fondi([{ a: 0, b: 10, id: 'x' }, { a: 5, b: 15, id: 'y' }, { a: 20, b: 25, id: 'z' }, { a: 20, b: 25, id: 'w' }]);
  expect(t).toEqual([
    { a: 0, b: 5, n: 1, ids: ['x'] },
    { a: 5, b: 10, n: 2, ids: ['x', 'y'] },
    { a: 10, b: 15, n: 1, ids: ['y'] },
    { a: 20, b: 25, n: 2, ids: ['z', 'w'] },
  ]);
  // stessa frase accesa due volte: un tratto solo
  expect(fondi([{ a: 2, b: 8, id: 'a' }, { a: 2, b: 8, id: 'b' }])).toEqual([{ a: 2, b: 8, n: 2, ids: ['a', 'b'] }]);
  expect(fondi([])).toEqual([]);
});
test('l’intensità sale presto e poi piano', () => {
  expect([0, 1, 2, 3, 4, 5, 9, 30].map(intensita)).toEqual([0, 1, 2, 3, 3, 4, 4, 4]);
});
test('dalla selezione del DOM alla frase, e dalla frase di nuovo al DOM', () => {
  const root = mount(), ix = indiceDi(root);
  const r = document.createRange();
  const second = root.childNodes[1].firstChild; // «che dorme con la testa sul vetro.»
  r.setStart(second, 4); r.setEnd(root.childNodes[2].childNodes[1].firstChild, 5); // fino a «sogno»
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  const span = selezioneDi(ix, root, sel);
  expect(ix.piano.text.slice(span.a, span.b)).toBe('dorme con la testa sul vetro. Sembriamo tutti in attesa di un sogno');
  const back = rangeDi(ix, span.a, span.b);
  expect(back.startContainer).toBe(second); expect(back.startOffset).toBe(4);
  expect(back.toString()).toBe('dorme con la testa sul vetro.Sembriamo tutti in attesadi un sogno');
  // una selezione fuori dal foglio non conta
  const out = document.createElement('p'); out.textContent = 'fuori dal foglio'; document.body.appendChild(out);
  const r2 = document.createRange(); r2.selectNodeContents(out); sel.removeAllRanges(); sel.addRange(r2);
  expect(selezioneDi(ix, root, sel)).toBeNull();
});
test('una selezione che parte da un elemento (triplo clic) si legge lo stesso', () => {
  const root = mount(), ix = indiceDi(root);
  expect(offsetDi(ix, root, 1, root)).toBe(ix.piano.text.indexOf('che dorme'));
  expect(offsetDi(ix, root, 3, root)).toBe(ix.piano.text.length);
});
test('notifiche delle scintille: una per pensiero e per giorno, col conteggio e la data del solo giorno', () => {
  const g = giornoDi(Date.UTC(2026, 9, 20, 15, 42));
  const per = { p1: [{ id: 'a', tipo: 'bellissima', giorno: g }, { id: 'b', tipo: 'ridere', giorno: g }, { id: 'c', tipo: 'bellissima', giorno: g + 1 }], p2: [] };
  const list = notificheScintille(per, { p1: 'Sul treno' }, { [chiaveScintille('p1', g)]: { giorno: g, n: 2 } });
  expect(list).toHaveLength(2);
  const first = list.find((n) => n.giorno === g);
  expect(first).toMatchObject({ tipo: 'scintilla', pensieroId: 'p1', titolo: 'Sul treno', conteggio: 2, tipi: ['bellissima', 'ridere'], letta: true });
  expect(first.timestamp).toBe(msDelGiorno(g));
  expect(new Date(first.timestamp).getUTCHours()).toBe(0);
  expect(list.find((n) => n.giorno === g + 1).letta).toBe(false);
  // una scintilla in più sullo stesso giorno: la notifica torna da leggere
  per.p1.push({ id: 'd', tipo: 'commosso', giorno: g });
  expect(notificheScintille(per, {}, { [chiaveScintille('p1', g)]: { giorno: g, n: 2 } }).find((n) => n.giorno === g)).toMatchObject({ conteggio: 3, letta: false });
});
test('notifiche degli echi: la data è il giorno della prima vista', () => {
  const eco = { id: 'e1', da: 'p1', cit: 'una frase', title: 'Risposta' };
  const fresh = notificheEchi([eco], { p1: 'Sul treno' }, {}, 20400);
  expect(fresh[0]).toMatchObject({ tipo: 'eco', key: chiaveEco('e1'), giorno: 20400, letta: false, titolo: 'Sul treno', cit: 'una frase' });
  const seen = notificheEchi([eco], {}, { [chiaveEco('e1')]: { giorno: 20390, n: 1 } }, 20400);
  expect(seen[0]).toMatchObject({ giorno: 20390, letta: true });
});
