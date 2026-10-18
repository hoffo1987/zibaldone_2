import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { PodiumCover, PodiumSign, PodiumSlot, hasWebGPU } from "./PodiumStage";

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

test("the covered podium sign says when it opens, and the drawing without WebGPU keeps it", () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"), root = createRoot(host);
  act(() => root.render(<PodiumCover sign={<PodiumSign title="Il podio sarà visibile il 3 novembre" body="Resterà scoperto fino al 5 novembre." />} />));
  expect(host.querySelector("h2").textContent).toBe("Il podio sarà visibile il 3 novembre");
  expect(host.textContent).toContain("Lavori in corso");
  expect(host.textContent).toContain("fino al 5 novembre");
  expect(host.querySelector(".podium-cover-art").getAttribute("aria-hidden")).toBe("true");
  act(() => root.unmount());
});
