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
  act(()=>tabs()[2].click());
  expect(host.querySelector('.nt-card.upd')).not.toBeNull();
});
test('la campanella fa sparire il numero con la spunta quando arriva a zero', () => {
  act(()=>root.render(<button><BellMark count={2} /></button>));
  expect(host.querySelector('.bm-badge').textContent).toBe('2');
  act(()=>root.render(<button><BellMark count={0} /></button>));
  expect(host.querySelector('.bm-badge.gone')).not.toBeNull();
  act(()=>jest.advanceTimersByTime(900));
  expect(host.querySelector('.bm-badge')).toBeNull();
});
