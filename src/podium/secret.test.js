import { camera, project, ROOM, WINDOW } from './stage';
import { pickSecretPane, WindowSecret } from './secret';

test.each([[390,540,0,0], [1440,1000,240,210], [1024,1366,240,210]])('six panes track the live camera at %s x %s', (w,h,left,top) => {
  for (const yaw of [-0.4,0,0.4]) {
    const c = camera(w,h,left,top,{x:0.3,y:0.1,z:-0.2,yaw});
    [8.35,6,3.8].forEach((y,row) => [-0.8,0.8].forEach((x,col) => {
      const p = project(c,[x,y,ROOM.back-WINDOW.depth/2]);
      expect(pickSecretPane(c,p.x,p.y)).toBe(row*2+col);
    }));
    for (const [x,y] of [[0,6],[1.85,6],[2.8,6],[-0.8,4.65],[-0.8,7.6],[0.8,10.5]]) {
      const p = project(c,[x,y,ROOM.back-WINDOW.depth/2]);
      expect(pickSecretPane(c,p.x,p.y)).toBe(-1);
    }
  }
});

test('only six ordered dark-mode taps reveal it, and a new first pane restarts the sequence', () => {
  const s = new WindowSecret();
  for (let i=0;i<6;i++) expect(s.tap(i,false)).toBe(false);
  expect(s.progress).toBe(0);
  for (const i of [0,0,0,0,0,0]) expect(s.tap(i,true)).toBe(false);
  expect(s.progress).toBe(1);
  s.tap(3,true); expect(s.progress).toBe(0);
  s.tap(0,true); s.tap(1,true); s.tap(-1,true); expect(s.progress).toBe(0);
  for (let i=0;i<5;i++) expect(s.tap(i,true)).toBe(false);
  expect(s.tap(5,true)).toBe(true);
  expect(s.tap(5,true)).toBe(false);
  s.tap(0,false); expect(s.revealed).toBe(false); expect(s.progress).toBe(0);
});
