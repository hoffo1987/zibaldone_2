import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { Navigation } from './Navigation';

let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Preview({ admin = true }) {
  const [tab, setTab] = useState('home');
  return <Navigation tab={tab} admin={admin} editing={false} hidden={false} railKey={tab} onNavigate={setTab}
    brand={null} footer={null} mobileHeader={null} />;
}

test('the admin can reach every section from a four-button mobile dock', () => {
  act(() => root.render(<Preview />));
  const dock = host.querySelector('.shell-dock');
  expect(Array.from(dock.querySelectorAll('button')).map(button => button.getAttribute('aria-label')))
    .toEqual(['Panoramica', 'Nuovo scritto', 'Scritti', 'Altre sezioni']);
  // desktop: six sections plus the two rooms of Scritti
  expect(Array.from(host.querySelectorAll('.shell-rail .shell-room')).map(b => b.getAttribute('aria-label'))).toEqual(['Diario', 'Scritti completi']);
  for (const label of ['I miei scritti', 'Podio del mese', 'Autori']) {
    const more = dock.querySelector('[aria-label="Altre sezioni"]');
    act(() => more.click());
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const dialog = host.querySelector('dialog[open]');
    expect(dialog).not.toBeNull();
    act(() => dialog.querySelector(`[aria-label="${label}"]`).click());
    expect(host.querySelector('dialog')).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('data-act')).toBe('1');
    expect(host.querySelector('.shell-rail [aria-current="page"]').getAttribute('aria-label')).toBe(label);
  }
});

test('cancel closes the secondary menu and restores keyboard focus to its trigger', () => {
  act(() => root.render(<Preview />));
  const more = host.querySelector('.shell-dock [aria-label="Altre sezioni"]');
  more.focus(); act(() => more.click());
  const dialog = host.querySelector('dialog');
  act(() => dialog.dispatchEvent(new Event('cancel', { bubbles: false, cancelable: true })));
  expect(host.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(more);
});

test('Scritti is one section: it opens a room and remembers the last one visited', () => {
  localStorage.clear();
  act(() => root.render(<Preview admin={false} />));
  const dock = host.querySelector('.shell-dock'), scritti = dock.querySelector('[aria-label="Scritti"]');
  act(() => scritti.click());
  expect(host.querySelector('.shell-room[aria-current="page"]').getAttribute('aria-label')).toBe('Diario');
  expect(scritti.getAttribute('aria-current')).toBe('page');
  act(() => host.querySelector('.shell-room[aria-label="Scritti completi"]').click());
  expect(scritti.getAttribute('data-act')).toBe('1');
  act(() => dock.querySelector('[aria-label="Panoramica"]').click());
  expect(scritti.getAttribute('data-act')).toBeNull();
  act(() => scritti.click());
  expect(host.querySelector('.shell-room[aria-current="page"]').getAttribute('aria-label')).toBe('Scritti completi');
});

test('members find their collection under More', () => {
  act(() => root.render(<Preview admin={false} />));
  const dock = host.querySelector('.shell-dock');
  expect(Array.from(dock.querySelectorAll('button')).map(button => button.getAttribute('aria-label')))
    .toEqual(['Panoramica', 'Nuovo scritto', 'Scritti', 'Altre sezioni']);
  act(() => dock.querySelector('[aria-label="Altre sezioni"]').click());
  act(() => host.querySelector('dialog [aria-label="I miei scritti"]').click());
  expect(host.querySelector('dialog')).toBeNull();
  expect(dock.querySelector('[aria-label="Altre sezioni"] .shell-link-title').textContent).toBe('Altro');
  expect(host.querySelector('.shell-rail [aria-current="page"]').getAttribute('aria-label')).toBe('I miei scritti');
});

test('members find the covered podium under More, but not the authors', () => {
  act(() => root.render(<Preview admin={false} />));
  const dock = host.querySelector('.shell-dock');
  act(() => dock.querySelector('[aria-label="Altre sezioni"]').click());
  expect(Array.from(host.querySelectorAll('dialog nav button')).map(b => b.getAttribute('aria-label'))).toEqual(['I miei scritti', 'Podio del mese']);
  act(() => host.querySelector('dialog [aria-label="Podio del mese"]').click());
  expect(host.querySelector('.shell-rail [aria-current="page"]').getAttribute('aria-label')).toBe('Podio del mese');
  expect(host.querySelector('.shell-rail [aria-label="Autori"]')).toBeNull();
});
