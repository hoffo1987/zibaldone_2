import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import PodiumStage from "./PodiumStage";

let host, root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); delete navigator.gpu; });

test("without WebGPU, or with reduced motion, the classic podium is shown", () => {
  act(() => root.render(<PodiumStage enabled dark={false} plates={[]} fallback={<div id="classic" />} />));
  expect(host.querySelector("#classic")).not.toBeNull();
  Object.defineProperty(navigator, "gpu", { configurable: true, value: {} });
  act(() => root.render(<PodiumStage enabled={false} dark={false} plates={[]} fallback={<div id="classic" />} />));
  expect(host.querySelector("#classic")).not.toBeNull();
  expect(host.querySelector(".podium3d")).toBeNull();
});
