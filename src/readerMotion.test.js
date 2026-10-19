import { M, openSheet, closeSheet } from './motion';

let panel, text, originalAnimate, originalMatchMedia;
const animation = () => ({ cancel: jest.fn(), finished: Promise.resolve() });
beforeEach(() => {
  originalAnimate = Element.prototype.animate;
  originalMatchMedia = window.matchMedia;
  Element.prototype.animate = jest.fn(animation);
  window.matchMedia = jest.fn(query => ({ matches: query === '(max-width:767px)' }));
  M.off = false; M.spd = 1;
  panel = document.createElement('div');
  panel.innerHTML = '<div data-sheet-paper><div class="rt">Scritto</div></div>';
  text = panel.querySelector('.rt');
  panel.getAnimations = jest.fn(() => []);
  panel.getBoundingClientRect = () => ({left:0,top:0,width:390,height:844});
});
afterEach(() => { Element.prototype.animate = originalAnimate; window.matchMedia = originalMatchMedia; });

test('aprire e chiudere su mobile mantiene opaco e immobile il pannello', async () => {
  openSheet(panel, { left:20,top:300,width:300,height:160 }, true);
  await closeSheet(panel, 'test');
  expect(Element.prototype.animate).toHaveBeenCalledTimes(2);
  expect(Element.prototype.animate.mock.instances).toEqual([text, text]);
  for (const [frames] of Element.prototype.animate.mock.calls) {
    for (const frame of frames) { expect(frame.opacity).toBeUndefined(); expect(frame.clipPath).toBeUndefined(); }
  }
});
test('sul desktop resta l’animazione che apre il foglio dalla scheda', () => {
  window.matchMedia = jest.fn(() => ({ matches: false }));
  openSheet(panel, { left:20,top:300,width:300,height:160 });
  expect(Element.prototype.animate.mock.instances).toEqual([panel, panel]);
  expect(Element.prototype.animate.mock.calls[0][0][0].clipPath).toContain('inset(');
});
test('senza animazioni o senza testo il lettore mobile non sfuma il pannello', async () => {
  M.off = true; openSheet(panel, null); await closeSheet(panel, 'test');
  M.off = false; panel.innerHTML = '<div>Solo estratto</div>';
  openSheet(panel, null); await closeSheet(panel, 'test');
  expect(Element.prototype.animate).not.toHaveBeenCalled();
});
