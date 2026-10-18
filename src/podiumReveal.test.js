import { nextReveal, revealCopy, revealLines } from "./podiumReveal";

const day = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

test("the podium is uncovered from the 3rd to the 5th, around the presentation on the 4th", () => {
  const before = nextReveal(new Date(2026, 9, 18, 15));
  expect([day(before.from), day(before.talk), day(before.to), before.open]).toEqual(["2026-11-3", "2026-11-4", "2026-11-5", false]);
  expect(revealCopy(before)).toEqual({
    title: "Il podio sarà visibile il 3 novembre",
    body: "Resterà scoperto fino al 5 novembre, in vista della presentazione mensile degli scritti al prof del 4 novembre.",
  });
  // the first two days of the month still wait for this month's window
  expect(day(nextReveal(new Date(2026, 10, 2)).from)).toBe("2026-11-3");
  for (const d of [3, 4, 5]) {
    const now = nextReveal(new Date(2026, 10, d, 9));
    expect(now.open).toBe(true); expect(day(now.from)).toBe("2026-11-3");
    expect(revealCopy(now).body).toContain("dal 3 novembre al 5 novembre");
  }
  // after the 5th the sign points to the next month, across the year too
  expect(day(nextReveal(new Date(2026, 10, 6)).from)).toBe("2026-12-3");
  expect(nextReveal(new Date(2026, 10, 6)).open).toBe(false);
  expect(day(nextReveal(new Date(2026, 11, 20)).talk)).toBe("2027-1-4");
});

test("the floating 3D lines say the same thing in short lines, with the full message for screen readers", () => {
  const closed = revealLines(nextReveal(new Date(2026, 9, 18, 15)));
  expect(closed.title).toEqual(["Il podio sarà visibile", "il 3 novembre"]);
  expect(closed.note).toEqual(["Resterà scoperto fino al 5 novembre,", "presentazione degli scritti il 4 novembre"]);
  expect(closed.label).toBe("Lavori in corso. Il podio sarà visibile il 3 novembre. Resterà scoperto fino al 5 novembre, in vista della presentazione mensile degli scritti al prof del 4 novembre.");
  const open = revealLines(nextReveal(new Date(2026, 10, 4, 9)));
  expect(open.title).toEqual(["Il podio si svela", "alla presentazione"]);
  expect(open.note[0]).toBe("Visibile dal 3 novembre al 5 novembre,");
  // every line stays short enough to read on a phone
  for (const l of [...closed.title, ...closed.note, ...open.title, ...open.note]) expect(l.length).toBeLessThanOrEqual(42);
});
