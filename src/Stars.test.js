import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import Stars from './Stars';

let host, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
function mount(v = 0, parentClick = jest.fn()) {
  const save = jest.fn();
  function Rating() { const [value, setValue] = useState(v); return <div onClick={parentClick}><Stars v={value} onSet={n => { save(n); setValue(n); }} /></div>; }
  act(() => root.render(<Rating />));
  return save;
}
function clickStar(index, right = false) {
  const star = host.querySelectorAll('.rating-star-target')[index];
  star.getBoundingClientRect = () => ({ left: 100, width: 28 });
  act(() => Simulate.click(star, { clientX: right ? 121 : 107 }));
}
test('mouse e tocco scelgono tutte le mezze stelle e le stelle intere, senza aprire la scheda', () => {
  const parentClick = jest.fn(), save = mount(0, parentClick);
  for (let i = 0; i < 5; i++) {
    clickStar(i); expect(save).toHaveBeenLastCalledWith(i + 0.5);
    expect(host.querySelector('[role=slider]').getAttribute('aria-valuenow')).toBe(String(i + 0.5));
    clickStar(i, true); expect(save).toHaveBeenLastCalledWith(i + 1);
  }
  expect(parentClick).not.toHaveBeenCalled();
  clickStar(4, true); expect(save).toHaveBeenLastCalledWith(0);
});
test('la tastiera avanza di mezza stella, rispetta i limiti e può togliere il voto', () => {
  const save = mount(4);
  const slider = host.querySelector('[role=slider]');
  const key = key => act(() => Simulate.keyDown(slider, { key }));
  key('ArrowRight'); expect(save).toHaveBeenLastCalledWith(4.5);
  key('End'); key('ArrowUp'); expect(save).toHaveBeenLastCalledWith(5);
  key('ArrowDown'); expect(save).toHaveBeenLastCalledWith(4.5);
  key('Home'); key('ArrowLeft'); expect(save).toHaveBeenLastCalledWith(0);
  key('End'); key('Delete'); expect(save).toHaveBeenLastCalledWith(0);
});
test('4,5 stelle mostrano quattro stelle piene e una metà, anche in sola lettura', () => {
  act(() => root.render(<Stars v={4.5} />));
  expect(host.querySelector('[role=img]').getAttribute('aria-label')).toBe('4,5 su 5 stelle');
  const fills = [...host.querySelectorAll('.rating-star-fill')];
  expect(fills.map(n => n.style.width)).toEqual(['100%', '100%', '100%', '100%', '50%']);
  expect(host.querySelectorAll('.st-on')).toHaveLength(5);
  expect(host.querySelector('[tabindex]')).toBeNull();
});
