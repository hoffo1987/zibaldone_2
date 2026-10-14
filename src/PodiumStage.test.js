import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { PodiumSlot, hasWebGPU } from "./PodiumStage";

test("the 3D podium is only offered where WebGPU exists, and leaves a free slot in the page", () => {
  expect(hasWebGPU()).toBe(false);
  Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
  expect(hasWebGPU()).toBe(true);
  delete navigator.gpu;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"), root = createRoot(host);
  act(() => root.render(<PodiumSlot />));
  expect(host.querySelector("#podium-slot")).not.toBeNull();
  act(() => root.unmount());
});
