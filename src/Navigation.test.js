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

test('the admin can reach every secondary section from a five-button mobile dock', () => {
  act(() => root.render(<Preview />));
  const dock = host.querySelector('.shell-dock');
  expect(dock.querySelectorAll('button')).toHaveLength(5);
  expect(host.querySelectorAll('.shell-rail button')).toHaveLength(7);
  for (const label of ['Diario', 'Podio del mese', 'Autori']) {
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

test('regular members retain direct access to all five sections', () => {
  act(() => root.render(<Preview admin={false} />));
  const dock = host.querySelector('.shell-dock');
  expect(dock.querySelectorAll('button')).toHaveLength(5);
  expect(dock.querySelector('[aria-label="Altre sezioni"]')).toBeNull();
  act(() => dock.querySelector('[aria-label="Diario"]').click());
  expect(dock.querySelector('[aria-current="page"]').getAttribute('aria-label')).toBe('Diario');
});
