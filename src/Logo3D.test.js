import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import LogoView from "./LogoView";
import Logo3D from "./Logo3D";

// contesto 2D finto: accetta ogni chiamata e conta i riempimenti
const fakeCtx = () => {
  const grad = { addColorStop() {} }, state = { fills: 0 };
  return new Proxy(state, {
    get: (t, k) => (k in t ? t[k] : k === "createLinearGradient" || k === "createRadialGradient" ? () => grad : k === "fill" ? () => { t.fills++; } : () => {}),
    set: (t, k, v) => { t[k] = v; return true; },
  });
};
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

let host, root, getContext;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete navigator.gpu; delete window.matchMedia; jest.restoreAllMocks(); });

test("without WebGPU the logo is drawn in Canvas 2D and the WebGPU module is never touched", async () => {
  const ctx = fakeCtx(); getContext.mockImplementation(() => ctx);
  jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
  jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(200);
  await act(async () => { root.render(<LogoView className="logo3d" fallback={<svg id="svg-logo" />} />); });
  await flush();
  expect(host.querySelector('[role="button"] canvas')).not.toBeNull();
  expect(host.querySelector("#svg-logo")).toBeNull();
  expect(ctx.fills).toBeGreaterThan(20); // targa, fianchi, perle: il primo fotogramma è già disegnato
});

test("without WebGPU and without Canvas 2D the animated SVG logo remains", async () => {
  await act(async () => { root.render(<LogoView className="logo3d" fallback={<svg id="svg-logo" />} />); });
  await flush();
  expect(host.querySelector("#svg-logo")).not.toBeNull();
  expect(host.querySelector("canvas")).toBeNull();
});

test("when WebGPU has no usable adapter the 3D logo reports the failure (alone it falls back to the SVG)", async () => {
  let answer;
  Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: jest.fn(() => new Promise((r) => { answer = r; })), getPreferredCanvasFormat: () => "bgra8unorm" } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  await act(async () => { root.render(<Logo3D className="logo3d" fallback={<svg id="svg-logo" />} />); });
  // mentre WebGPU si avvia c'è il caricamento animato al posto del logo
  expect(host.querySelector(".logo-loader")).not.toBeNull();
  expect(host.querySelector("#svg-logo")).toBeNull();
  await act(async () => { answer(null); });
  await flush();
  expect(navigator.gpu.requestAdapter).toHaveBeenCalled();
  expect(host.querySelector('[role="button"]')).toBeNull();
  expect(host.querySelector("#svg-logo")).not.toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("WebGPU"), expect.anything());
});

test("LogoView switches to the Canvas 2D logo when WebGPU does not start", async () => {
  Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: jest.fn(async () => null), getPreferredCanvasFormat: () => "bgra8unorm" } });
  jest.spyOn(console, "warn").mockImplementation(() => {});
  const ctx = fakeCtx(); getContext.mockImplementation(() => ctx);
  await act(async () => { root.render(<LogoView className="logo3d" fallback={<svg id="svg-logo" />} />); });
  await flush(); await flush();
  expect(navigator.gpu.requestAdapter).toHaveBeenCalled();
  expect(host.querySelector('[role="button"] canvas')).not.toBeNull();
  expect(host.querySelector("#svg-logo")).toBeNull();
});
