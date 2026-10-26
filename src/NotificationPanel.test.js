import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import Panel, { BellMark } from './NotificationPanel';
let host, root;
beforeEach(() => { jest.useFakeTimers(); global.IS_REACT_ACT_ENVIRONMENT=true; host=document.createElement('div');document.body.appendChild(host);root=createRoot(host); });
afterEach(() => { act(()=>root.unmount());host.remove();jest.useRealTimers(); });
const update = id => ({ id, tipo:'aggiornamento', titolo:'Nuovo aggiornamento', messaggio:'Le novità sono disponibili per tutti.', versione:'1.0.5', timestamp:1, letta:false });
const vote = { id:'vote', titolo:'Titolo', timestamp:1, voto:4, pensieroId:'p1' };
const tabs = () => Array.from(host.querySelectorAll('[role="tab"]'));
test('legge gli annunci e i voti senza trasformare gli annunci in voti', () => {
  const onRead=jest.fn(), onOpen=jest.fn();
  act(()=>root.render(<Panel list={[update('update:a'),vote]} onRead={onRead} onOpen={onOpen} stars={v=><span>Stelle {v}</span>} />));
  expect(host.textContent).toContain('Le novità sono disponibili per tutti.');
  expect(host.textContent.match(/Hai ricevuto un voto/g)).toHaveLength(1);
  expect(host.querySelectorAll('.nt-card.vote')).toHaveLength(1);
  expect(host.querySelectorAll('.nt-card.upd')).toHaveLength(1);
  act(()=>jest.advanceTimersByTime(1400));
  expect(onRead).toHaveBeenCalledWith(['update:a','vote']);
  act(()=>host.querySelector('.nt-card.vote').click());
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ pensieroId:'p1' }));
});
test('segna come letto anche un annuncio arrivato a pannello già aperto', () => {
  const onRead=jest.fn(), render=list=>act(()=>root.render(<Panel list={list} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
  render([update('update:a')]);act(()=>jest.advanceTimersByTime(1400));
  render([{...update('update:a'),letta:true},update('update:b')]);act(()=>jest.advanceTimersByTime(1400));
  expect(onRead.mock.calls).toEqual([[['update:a']],[['update:b']]]);
});
test('«Segna tutte come lette» legge subito e mostra la spunta', () => {
  const onRead=jest.fn();
  act(()=>root.render(<Panel list={[update('update:a'),vote]} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
  expect(host.textContent).toContain('2 da leggere');
  act(()=>host.querySelector('.nt-all').click());
  expect(onRead).toHaveBeenCalledWith(['update:a','vote']);
  expect(host.textContent).toContain('Tutto letto');
  expect(host.querySelectorAll('.nt-card.just-read')).toHaveLength(2);
  act(()=>jest.advanceTimersByTime(1400));
  expect(onRead).toHaveBeenCalledTimes(1);
});
test('i filtri separano voti e novità, e leggono solo quello che si vede', () => {
  const onRead=jest.fn();
  act(()=>root.render(<Panel list={[update('update:a'),vote]} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
  act(()=>tabs()[1].click());
  expect(host.querySelectorAll('.nt-card')).toHaveLength(1);
  expect(host.querySelector('.nt-card.vote')).not.toBeNull();
  act(()=>jest.advanceTimersByTime(1400));
  expect(onRead).toHaveBeenCalledWith(['vote']);
  act(()=>tabs()[3].click());
  expect(host.querySelector('.nt-card.upd')).not.toBeNull();
});
test('scintille ed echi hanno il loro filtro, la data del solo giorno, e aprono il pensiero', () => {
  const onOpen=jest.fn();
  const spark={ id:'scintilla:s_p1_20400', key:'s_p1_20400', tipo:'scintilla', pensieroId:'p1', titolo:'Sul treno', conteggio:3, tipi:['bellissima','ridere'], giorno:20400, timestamp:20400*864e5, letta:false };
  const eco={ id:'eco:e_x', key:'e_x', tipo:'eco', pensieroId:'p1', ecoId:'x', titolo:'Sul treno', cit:'una frase', giorno:20400, timestamp:20400*864e5, letta:false };
  act(()=>root.render(<Panel list={[spark,eco,vote]} onRead={()=>{}} onOpen={onOpen} stars={()=>null} />));
  act(()=>tabs()[1].click());
  expect(host.querySelectorAll('.nt-card')).toHaveLength(1);
  act(()=>tabs()[2].click());
  expect(host.querySelectorAll('.nt-card')).toHaveLength(2);
  const card=host.querySelector('.nt-card.spark');
  expect(card.textContent).toContain('3 frasi accese');
  expect(card.textContent).toContain('Bellissima · Mi ha fatto ridere');
  // niente ora: solo il giorno
  expect(card.querySelector('.nt-when').textContent).not.toMatch(/\d{1,2}:\d{2}/);
  act(()=>host.querySelector('.nt-card.eco').click());
  expect(onOpen).toHaveBeenCalledWith(eco);
});
test('le da leggere stanno tutte in cima e ci restano anche dopo averle lette', () => {
  const onRead=jest.fn(), old={...vote,id:'old',timestamp:0};
  const list=[{...update('update:a'),timestamp:5,letta:true},{...vote,timestamp:4,letta:true},{...update('update:b'),timestamp:3},old];
  act(()=>root.render(<Panel list={list} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
  const order=()=>Array.from(host.querySelectorAll('.nt-card')).map(c=>c.dataset.nid);
  expect(order()).toEqual(['update:b','old','update:a','vote']);
  expect(host.querySelector('.nt-fresh').textContent).toBe('Da leggere2');
  act(()=>jest.advanceTimersByTime(1400));
  expect(onRead).toHaveBeenCalledWith(['update:b','old']);
  act(()=>root.render(<Panel list={list.map(n=>({...n,letta:true}))} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
  expect(order()).toEqual(['update:b','old','update:a','vote']);
  expect(host.querySelector('.nt-fresh').textContent).toBe('Appena lette2');
  expect(host.querySelectorAll('.nt-card.just-read')).toHaveLength(2);
});
test('una notifica già letta tiene la spunta anche riaprendo il pannello, e toccarla non la riscrive', () => {
  const onRead=jest.fn(), onOpen=jest.fn();
  act(()=>root.render(<Panel list={[{...update('update:a'),letta:true},{...vote,letta:true}]} onRead={onRead} onOpen={onOpen} stars={()=>null} />));
  expect(host.textContent).toContain('Tutto letto');
  act(()=>host.querySelector('.nt-card.upd').click());
  act(()=>host.querySelector('.nt-card.vote').click());
  act(()=>jest.advanceTimersByTime(1400));
  expect(onRead).not.toHaveBeenCalled();
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(host.querySelectorAll('.nt-card.read')).toHaveLength(2);
});
test('quando una viene letta, il timer delle altre in vista non riparte da zero', () => {
  const ios=[]; global.IntersectionObserver=class { constructor(cb){ this.cb=cb; this.els=new Set(); ios.push(this); } observe(el){ this.els.add(el); } disconnect(){ this.els.clear(); } };
  const see=id=>{ const io=ios[ios.length-1], el=Array.from(io.els).find(e=>e.dataset.nid===id); io.cb([{ target:el, isIntersecting:true, intersectionRatio:1 }]); };
  try {
    const onRead=jest.fn(), render=list=>act(()=>root.render(<Panel list={list} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
    const a=update('update:a'), b={...update('update:b'),timestamp:0};
    render([a,b]);
    act(()=>see('update:a')); act(()=>jest.advanceTimersByTime(700)); act(()=>see('update:b'));
    act(()=>jest.advanceTimersByTime(700));
    expect(onRead.mock.calls).toEqual([[['update:a']]]);
    render([{...a,letta:true},b]);
    act(()=>jest.advanceTimersByTime(700));
    expect(onRead.mock.calls).toEqual([[['update:a']],[['update:b']]]);
  } finally { delete global.IntersectionObserver; }
});
test('la campanella fa sparire il numero con la spunta quando arriva a zero', () => {
  act(()=>root.render(<button><BellMark count={2} /></button>));
  expect(host.querySelector('.bm-badge').textContent).toBe('2');
  act(()=>root.render(<button><BellMark count={0} /></button>));
  expect(host.querySelector('.bm-badge.gone')).not.toBeNull();
  act(()=>jest.advanceTimersByTime(900));
  expect(host.querySelector('.bm-badge')).toBeNull();
});
