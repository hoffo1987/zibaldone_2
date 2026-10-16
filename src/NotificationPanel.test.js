import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import Panel from './NotificationPanel';
let host, root;
beforeEach(() => { jest.useFakeTimers(); global.IS_REACT_ACT_ENVIRONMENT=true; host=document.createElement('div');document.body.appendChild(host);root=createRoot(host); });
afterEach(() => { act(()=>root.unmount());host.remove();jest.useRealTimers(); });
const update = id => ({ id, tipo:'aggiornamento', titolo:'Nuovo aggiornamento', messaggio:'Le novità sono disponibili per tutti.', versione:'1.0.5', timestamp:1, letta:false });
test('legge gli annunci e i voti senza trasformare gli annunci in voti', () => {
  const onRead=jest.fn(), onOpen=jest.fn();
  act(()=>root.render(<Panel list={[update('update:a'),{id:'vote',titolo:'Titolo',timestamp:1,voto:4}]} onRead={onRead} onOpen={onOpen} stars={v=><span>Stelle {v}</span>} />));
  expect(host.textContent).toContain('Le novità sono disponibili per tutti.');
  expect(host.textContent.match(/Hai ricevuto un voto/g)).toHaveLength(1);
  expect(host.querySelectorAll('button')).toHaveLength(1);
  act(()=>jest.advanceTimersByTime(1400));
  expect(onRead).toHaveBeenCalledWith(['update:a','vote']);
  act(()=>host.querySelector('button').click());expect(onOpen).toHaveBeenCalled();
});
test('segna come letto anche un annuncio arrivato a pannello già aperto', () => {
  const onRead=jest.fn(), render=list=>act(()=>root.render(<Panel list={list} onRead={onRead} onOpen={()=>{}} stars={()=>null} />));
  render([update('update:a')]);act(()=>jest.advanceTimersByTime(1400));
  render([{...update('update:a'),letta:true},update('update:b')]);act(()=>jest.advanceTimersByTime(1400));
  expect(onRead.mock.calls).toEqual([[['update:a']],[['update:b']]]);
});
