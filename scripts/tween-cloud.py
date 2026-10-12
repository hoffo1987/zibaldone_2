# Fotogrammi intermedi per Cloud, generati dalle pose disegnate con il flusso ottico (OpenCV DIS).
# Strumento di lavorazione, non serve alla build: produce src/egg/assets/source/cloud-tween-<riduzione>.png e
# tweens.json, che `npm run sprites:cloud` aggiunge all'atlante come le altre pose.
#   pip install numpy pillow opencv-python-headless
#   python3 scripts/tween-cloud.py && npm run sprites:cloud
#
# Per ogni coppia di pose: flusso nei due sensi a piena risoluzione, deformazione di entrambe verso l'istante t
# (approssimazione di Super SloMo). Dove le due pose deformate coincidono si fondono; altrove vale solo la più
# vicina nel tempo, così non compaiono arti doppi o semitrasparenti; i buchi interni alla sua sagoma si riempiono
# con l'altra. Funziona con movimenti moderati (respiro, corsa, recuperi); per i fendenti ampi, dove la spada
# ruota di mezzo giro fra due pose, il risultato sarebbe quasi identico alla prima posa e quindi non si usa.
import json, os, re
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'src', 'egg', 'assets', 'source')
COMPILER = os.path.join(os.path.dirname(__file__), 'build-cloud-atlas.cjs')
CELL, PIVOT = (160, 128), (80, 110)

# nome del fotogramma nuovo, posa di partenza, posa di arrivo, istante (0..1)
TWEENS = [
    ('idleA', 'idle0', 'idle1', 1 / 3), ('idleB', 'idle0', 'idle1', 2 / 3),
    # corsa: due pose intermedie fra ogni coppia di passi (6 disegnati -> 18 fotogrammi)
    *[(f'run{i}{s}', f'run{i}', f'run{(i + 1) % 6}', t) for i in range(6) for s, t in (('a', 1 / 3), ('b', 2 / 3))],
    ('jumpFall', 'jump', 'fall', 0.5),
    ('followRecover', 'follow', 'heavyRecover', 0.5),
    ('heavySlashRecover', 'heavySlash', 'heavyRecover', 0.5),
    ('recoverFollow', 'heavyRecover', 'follow', 0.5),
]

# le pose (foglio, semi, ancora, riduzione) si leggono dal compilatore: una sola fonte di verità
FRAMES = {n: (sh, json.loads(seeds), (int(ax), int(ay)), int(red)) for n, sh, seeds, ax, ay, red in re.findall(
    r"\['(\w+)', '(\w+)', (\[\[.*?\]\]), \[(\d+), (\d+)\], (\d+)\]", open(COMPILER).read())}

_sheets = {}
def sheet(name):
    if name not in _sheets:
        im = np.array(Image.open(os.path.join(ROOT, f'cloud-{name}.png')).convert('RGBA'))
        _, lab = cv2.connectedComponents((im[..., 3] >= 128).astype(np.uint8), connectivity=8)
        _sheets[name] = (im, lab)
    return _sheets[name]

def pose(name):
    """La figura scelta (componenti connesse dei semi), ritagliata come fa il compilatore: alpha netta."""
    sh, seeds, (ax, ay), red = FRAMES[name]
    im, lab = sheet(sh)
    ids = set()
    for sx, sy in seeds:
        for r in range(17):
            w = lab[sy - r:sy + r + 1, sx - r:sx + r + 1]
            if (w > 0).any(): ids.add(int(w[w > 0][0])); break
    W, H = CELL[0] * red, CELL[1] * red
    x0, y0 = ax - PIVOT[0] * red, ay - PIVOT[1] * red
    out = np.zeros((H, W, 4), np.uint8)
    ys0, xs0, ys1, xs1 = max(0, y0), max(0, x0), min(im.shape[0], y0 + H), min(im.shape[1], x0 + W)
    sub = im[ys0:ys1, xs0:xs1].copy()
    m = np.isin(lab[ys0:ys1, xs0:xs1], list(ids))
    sub[~m] = 0; sub[m, 3] = 255
    out[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0] = sub
    return out, red

def gray(a):
    al = a[..., 3:4] / 255.0
    return cv2.cvtColor((a[..., :3] * al + 90 * (1 - al)).astype(np.uint8), cv2.COLOR_RGB2GRAY)

def warp(img, flow):
    h, w = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(w), np.arange(h))
    pm = img.astype(np.float32); pm[..., :3] *= pm[..., 3:4] / 255.0
    return cv2.remap(pm, (gx + flow[..., 0]).astype(np.float32), (gy + flow[..., 1]).astype(np.float32),
                     cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)

def tween(A, B, t):
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    ga, gb = gray(A), gray(B)
    f01, f10 = dis.calc(ga, gb, None), dis.calc(gb, ga, None)
    ft0 = -(1 - t) * t * f01 + t * t * f10
    ft1 = (1 - t) * (1 - t) * f01 - t * (1 - t) * f10
    wa, wb = warp(A, ft0), warp(B, ft1)
    aa, ab = wa[..., 3] / 255.0, wb[..., 3] / 255.0
    ca = wa[..., :3] / np.maximum(aa, 1e-3)[..., None]
    cb = wb[..., :3] / np.maximum(ab, 1e-3)[..., None]
    agree = (aa > 0.5) & (ab > 0.5) & (np.abs(ca - cb).sum(-1) < 90)
    first, second = (wa, wb) if t <= 0.5 else (wb, wa)
    fa = (first[..., 3] > 127).astype(np.uint8)
    closed = cv2.morphologyEx(fa, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    holes = (closed > 0) & (fa == 0) & (second[..., 3] > 127)
    pick = np.where(holes[..., None], second, first * (fa[..., None] > 0))
    m = np.where((agree & (fa > 0))[..., None], (1 - t) * wa + t * wb, pick)
    a = m[..., 3:4]
    rgb = np.where(a > 1e-3, m[..., :3] / np.maximum(a, 1e-3) * 255.0, 0)
    out = np.dstack([np.clip(rgb, 0, 255), np.where(a > 127, 255, 0)]).astype(np.uint8)
    out[out[..., 3] == 0] = 0
    return out

def main():
    groups, manifest = {}, []
    for name, a, b, t in TWEENS:
        A, red = pose(a); B, red_b = pose(b)
        if red != red_b: raise SystemExit(f'{name}: pose a scale diverse ({a}={red}, {b}={red_b})')
        groups.setdefault(red, []).append((name, tween(A, B, t)))
    for red, frames in sorted(groups.items()):
        cw, ch, cols = CELL[0] * red, CELL[1] * red, 4
        rows = (len(frames) + cols - 1) // cols
        out = np.zeros((ch * rows, cw * cols, 4), np.uint8)
        for i, (name, img) in enumerate(frames):
            x, y = (i % cols) * cw, (i // cols) * ch
            out[y:y + ch, x:x + cw] = img
            manifest.append({'name': name, 'sheet': f'tween-{red}', 'anchor': [x + PIVOT[0] * red, y + PIVOT[1] * red], 'reduce': red})
        Image.fromarray(out, 'RGBA').save(os.path.join(ROOT, f'cloud-tween-{red}.png'), optimize=True)
    with open(os.path.join(ROOT, 'tweens.json'), 'w') as f:
        json.dump(manifest, f, indent=2); f.write('\n')
    print(f'{len(manifest)} fotogrammi intermedi:', ', '.join(m['name'] for m in manifest))

if __name__ == '__main__':
    main()
