import { helpSteps } from "./help";

const TABS = ["home", "write", "diario", "altri", "read", "my_pages", "podio", "authors", "profile"];

test("ogni sezione ha la sua guida, che parte dal titolo e resta nella sezione", () => {
  [false, true].forEach((admin) => TABS.forEach((tab) => {
    const steps = helpSteps(tab, admin);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].target).toBe("page-head");
    steps.forEach((s) => { expect(s.tab).toBe(tab); expect(s.title).toBeTruthy(); expect(s.body.length).toBeGreaterThan(20); });
  }));
});

test("chi amministra e chi scrive hanno guide diverse dove la sezione cambia", () => {
  expect(helpSteps("home", true)[0].body).not.toBe(helpSteps("home", false)[0].body);
  expect(helpSteps("podio", true).length).toBeGreaterThan(helpSteps("podio", false).length);
  expect(helpSteps("sconosciuta", false)).toEqual([]);
});
