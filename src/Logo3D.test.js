import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import LogoView from "./LogoView";
import Logo3D from "./Logo3D";

let host, root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); delete navigator.gpu; delete window.matchMedia; jest.restoreAllMocks(); });

test("without WebGPU the animated SVG logo is shown and the 3D module is never mounted", () => {
  act(() => root.render(<LogoView className="logo3d" fallback={<svg id="svg-logo" />} />));
  expect(host.querySelector("#svg-logo")).not.toBeNull();
  expect(host.querySelector('[role="button"]')).toBeNull();
  expect(host.querySelector("canvas")).toBeNull();
});

test("when the browser has WebGPU but no usable adapter, the 3D logo falls back to the SVG", async () => {
  Object.defineProperty(navigator, "gpu", { configurable: true, value: { requestAdapter: jest.fn(async () => null), getPreferredCanvasFormat: () => "bgra8unorm" } });
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  await act(async () => { root.render(<Logo3D className="logo3d" fallback={<svg id="svg-logo" />} />); });
  // mentre WebGPU si avvia il logo SVG resta visibile al suo posto
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(navigator.gpu.requestAdapter).toHaveBeenCalled();
  expect(host.querySelector('[role="button"]')).toBeNull();
  expect(host.querySelector("#svg-logo")).not.toBeNull();
  expect(host.querySelector("canvas")).toBeNull();
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("WebGPU"), expect.anything());
});
