// Quando il podio del mese si scopre per chi non amministra: ogni mese dal 3 al 5, attorno alla presentazione degli
// scritti al prof del 4. Prima di allora la pagina mostra il podio coperto dal telo, con le date della prossima volta.
export const REVEAL_DAYS = { from: 3, talk: 4, to: 5 };

export type Reveal = { from: Date; talk: Date; to: Date; open: boolean };
// la prossima finestra (quella di questo mese finché non è passato il 5, poi quella del mese dopo)
export function nextReveal(now = new Date()): Reveal {
  const month = now.getDate() > REVEAL_DAYS.to ? now.getMonth() + 1 : now.getMonth();
  const day = (d: number) => new Date(now.getFullYear(), month, d);
  return { from: day(REVEAL_DAYS.from), talk: day(REVEAL_DAYS.talk), to: day(REVEAL_DAYS.to), open: now.getDate() >= REVEAL_DAYS.from && now.getDate() <= REVEAL_DAYS.to && month === now.getMonth() };
}

const dayMonth = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
// il testo del cartello: titolo e frase, con le date scritte per esteso
export function revealCopy(r: Reveal) {
  const from = dayMonth.format(r.from), to = dayMonth.format(r.to), talk = dayMonth.format(r.talk);
  return r.open
    ? { title: "Il podio si svela alla presentazione", body: `Visibile dal ${from} al ${to}, per la presentazione mensile degli scritti al prof del ${talk}.` }
    : { title: `Il podio sarà visibile il ${from}`, body: `Resterà scoperto fino al ${to}, in vista della presentazione mensile degli scritti al prof del ${talk}.` };
}
