import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useKeyboardOpen } from './useKeyboardOpen';

let host, root, viewport, seen;
function Probe({ focused }) { seen = useKeyboardOpen(focused); return null; }
const resize = height => act(() => {
  viewport.height = height;
  viewport.listeners.forEach(fn => fn());
  jest.runOnlyPendingTimers();
});

beforeEach(() => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  global.requestAnimationFrame = fn => setTimeout(fn, 0);
  global.cancelAnimationFrame = id => clearTimeout(id);
  viewport = { height: 800, listeners: [], addEventListener: (_, fn) => viewport.listeners.push(fn), removeEventListener: () => {} };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); jest.useRealTimers(); delete window.visualViewport; });

test('the dock retreats only while the keyboard actually covers the page', () => {
  act(() => root.render(<Probe focused />));
  expect(seen).toBe(false); // a focused field alone does not hide the dock
  resize(460);
  expect(seen).toBe(true);
  resize(800); // keyboard dismissed with Back: the cursor stays in the field, the dock returns
  expect(seen).toBe(false);
});

test('an unfocused page never hides the dock', () => {
  act(() => root.render(<Probe focused={false} />));
  resize(460);
  expect(seen).toBe(false);
});
