/**
 * Ink-and-paper insect art, one drawer per body plan. Every drawer works in a ~60-unit box centred on the origin:
 * top-down plans face up (-y), side-view plans face left (-x), like the fish art. Each drawer runs twice: a halo pass
 * that paints a white silhouette (so insects stay readable over dark desktops), then the ink pass.
 */
import type { Plan, Species } from '../../../shared/insect.js';
export const INK = '#14181a', PAPER = '#fffefa', HALO = 'rgba(255,255,255,.94)', TAU = Math.PI * 2;
export type Pose = 'idle' | 'alert' | 'move' | 'fly';
export interface Look { golden?: boolean; detail?: boolean; frame?: number; pose?: Pose; ink?: string }
/** Side-view plans face left in their own box; callers mirror them to face the way the insect moves. */
export const SIDE_VIEW = new Set<Plan>(['grasshopper', 'conehead', 'longhead', 'katydid', 'cricket', 'molecricket', 'mantis']);
interface Pen { halo: boolean; ink: string; golden: boolean; detail: boolean; frame: number; pose: Pose; v: number }
type Ctx = CanvasRenderingContext2D;
/** 금색 keeps every pattern and only swaps colours onto a gold ramp by lightness, so every species gilds the same way. */
const GOLD_RAMP: [number, string][] = [[.22, '#6e470c'], [.42, '#a8731a'], [.62, '#d4a23a'], [.82, '#efcd70'], [2, '#fbecbc']];
function lightness(hex: string): number {
  const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
  return (.299 * r + .587 * g + .114 * b) / 255;
}
function col(pen: Pen, hex: string): string { return pen.golden && hex.startsWith('#') ? GOLD_RAMP.find(([l]) => lightness(hex) < l)![1] : hex; }
function shape(c: Ctx, pen: Pen, p: Path2D, fill: string, w = 1.3): void {
  if (pen.halo) { c.strokeStyle = HALO; c.lineWidth = w + 3.6; c.stroke(p); c.fillStyle = HALO; c.fill(p); return; }
  c.fillStyle = col(pen, fill); c.fill(p); c.strokeStyle = pen.ink; c.lineWidth = w; c.stroke(p);
}
function stroke(c: Ctx, pen: Pen, w: number, draw: () => void, color?: string): void {
  c.beginPath(); draw();
  if (pen.halo) { c.strokeStyle = HALO; c.lineWidth = w + 3.2; } else { c.strokeStyle = color ? col(pen, color) : pen.ink; c.lineWidth = w; }
  c.stroke();
}
/** Interior marks: skipped in the halo pass, and in the field unless `always`. */
function mark(c: Ctx, pen: Pen, w: number, draw: () => void, color?: string, always = false): void {
  if (pen.halo || (!pen.detail && !always)) return;
  c.beginPath(); draw(); c.strokeStyle = color ? col(pen, color) : pen.ink; c.lineWidth = w; c.stroke();
}
function spot(c: Ctx, pen: Pen, x: number, y: number, rx: number, ry: number, fill: string, always = true, rot = 0): void {
  if (pen.halo || (!pen.detail && !always)) return;
  c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fillStyle = col(pen, fill); c.fill();
}
function oval(x: number, y: number, rx: number, ry: number, rot = 0): Path2D { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, TAU); return p; }
function poly(pts: [number, number][]): Path2D { const p = new Path2D(); pts.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); return p; }
function clipTo(c: Ctx, pen: Pen, p: Path2D, draw: () => void): void { if (pen.halo) return; c.save(); c.clip(p); draw(); c.restore(); }
const beat = (pen: Pen, every = 6) => Math.floor(pen.frame / every) % 2;
/** Three jointed legs a side from the thorax; walking alternates tripods every few frames. */
function legs6(c: Ctx, pen: Pen, cy: number, spread: number, len: number, w = 1.2, gap = 6): void {
  const walk = pen.pose === 'move' ? (beat(pen, 5) ? 1 : -1) : 0;
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const y = cy + (i - 1) * gap, swing = (i % 2 ? walk : -walk) * 2.5 * side, ang = [-.9, 0, .8][i];
    const kx = side * (spread + len * .55), ky = y + ang * len * .5 + swing, fx = side * (spread + len * .8), fy = y + ang * len * 1.15 + swing * 1.5;
    stroke(c, pen, w, () => { c.moveTo(side * spread * .6, y); c.lineTo(kx, ky); c.lineTo(fx, fy); });
  }
}
function antennae(c: Ctx, pen: Pen, x: number, y: number, len: number, spread: number, club = false, w = .9): void {
  const up = pen.pose === 'alert' ? 1.3 : 1;
  for (const side of [-1, 1]) {
    const tx = x + side * spread, ty = y - len * up;
    stroke(c, pen, w, () => { c.moveTo(x + side * 1.2, y); c.quadraticCurveTo(x + side * spread * .3, y - len * .6 * up, tx, ty); });
    if (club) { if (pen.halo) stroke(c, pen, 2.4, () => c.arc(tx, ty, .2, 0, TAU)); else spot(c, pen, tx, ty, 1.4, 1.4, pen.ink); }
  }
}
function eyes(c: Ctx, pen: Pen, x: number, y: number, dx: number, r: number, fill = '#2a2a2a'): void { for (const s of [-1, 1]) shape(c, pen, oval(x + s * dx, y, r, r), fill, .9); }
// ─── Top-down plans ─────────────────────────────────────────────────────────────────────────────────────────────
interface Wings { fore: string; hind: string; edge: string }
const BUTTERFLY: Wings[] = [
  { fore: '#f0c94a', hind: '#f3d36a', edge: '#c99a2a' }, // 노랑나비
  { fore: '#f6f3e8', hind: '#f6f3e8', edge: '#2b2b2b' }, // 배추흰나비
  { fore: '#f2d35b', hind: '#f2d35b', edge: '#1f1d1b' }, // 호랑나비
  { fore: '#2a2d33', hind: '#2a2d33', edge: '#141518' }, // 제비나비
  { fore: '#f3ead2', hind: '#f3ead2', edge: '#1f1d1b' }, // 꼬리명주나비
  { fore: '#f4f2ec', hind: '#f4f2ec', edge: '#7d7a72' }, // 붉은점모시나비
  { fore: '#e08a2e', hind: '#dd8434', edge: '#5a3418' }, // 네발나비
  { fore: '#93a9dc', hind: '#93a9dc', edge: '#3e4f78' }, // 남방부전나비
  { fore: '#1f2226', hind: '#22252a', edge: '#0f1012' }, // 긴꼬리제비나비
  { fore: '#7a5a3c', hind: '#74563a', edge: '#3e2c1c' } // 산굴뚝나비
];
const BUTTERFLY_TAILS: Record<number, number> = { 2: 7, 3: 7, 4: 16, 8: 13 };
/** A dark eyespot with a pale pupil. */
function eyespot(c: Ctx, pen: Pen, x: number, y: number, r: number): void { spot(c, pen, x, y, r + .8, r + .8, '#e9d9b0'); spot(c, pen, x, y, r, r, '#1f1d1b'); spot(c, pen, x + r * .2, y - r * .2, r * .35, r * .35, PAPER); }
function butterfly(c: Ctx, pen: Pen): void {
  const w = BUTTERFLY[pen.v], flying = pen.pose === 'fly' || pen.pose === 'move', open = pen.pose === 'alert' ? .25 : flying ? [1, .7, .35, .7][Math.floor(pen.frame / 4) % 4] : 1;
  const tailLen = BUTTERFLY_TAILS[pen.v] ?? 0, tails = tailLen > 0;
  for (const side of [-1, 1]) {
    c.save(); c.scale(side * open, 1);
    const hind = new Path2D(); hind.moveTo(1, 1); hind.bezierCurveTo(14, -2, 24, 6, 20, 15);
    if (tails) { hind.lineTo(16, 18); hind.quadraticCurveTo(14, 18 + tailLen * .6, 13, 18 + tailLen); hind.quadraticCurveTo(11, 18 + tailLen * .5, 11, 19); } else hind.bezierCurveTo(18, 22, 8, 25, 3, 18);
    hind.quadraticCurveTo(1, 12, 1, 1); hind.closePath();
    shape(c, pen, hind, w.hind, 1.2);
    const fore = new Path2D(); fore.moveTo(1, -5); fore.bezierCurveTo(8, -19, 22, -26, 28, -20); fore.bezierCurveTo(30, -12, 24, -1, 17, 3); fore.quadraticCurveTo(8, 4, 1, 2); fore.closePath();
    shape(c, pen, fore, w.fore, 1.2);
    clipTo(c, pen, fore, () => {
      if (pen.v === 1) { spot(c, pen, 26, -21, 7, 5, '#2b2b2b'); spot(c, pen, 15, -8, 2, 2, '#2b2b2b'); }
      if (pen.v === 2) for (const x of [6, 12, 18]) spot(c, pen, x, -12, 1.6, 12, '#1f1d1b', true, -.5);
      if (pen.v === 2 || pen.v === 4) stroke(c, pen, 3, () => { c.moveTo(4, -14); c.bezierCurveTo(14, -24, 26, -24, 29, -18); c.bezierCurveTo(28, -8, 22, 0, 17, 3); }, '#1f1d1b');
      if (pen.v === 3) spot(c, pen, 14, -10, 9, 6, '#3c4f63', true, -.5);
      if (pen.v === 4) for (const x of [9, 16]) spot(c, pen, x, -9, 1.4, 9, '#1f1d1b', true, -.4);
      if (pen.v === 5) { spot(c, pen, 12, -12, 2.2, 2.2, '#2b2b2b'); spot(c, pen, 20, -14, 1.8, 1.8, '#2b2b2b'); }
      if (pen.v === 6) { stroke(c, pen, 2.6, () => { c.moveTo(29, -19); c.bezierCurveTo(28, -8, 22, 0, 17, 3); }, '#5a3418'); for (const [x, y, r] of [[10, -10, 2], [16, -14, 2.2], [14, -6, 1.6], [22, -16, 1.6]]) spot(c, pen, x, y, r, r, '#2a1c10'); spot(c, pen, 25, -20, 1.2, 1.2, PAPER); }
      if (pen.v === 7) { stroke(c, pen, 1.8, () => { c.moveTo(6, -16); c.bezierCurveTo(16, -24, 26, -24, 29, -18); c.bezierCurveTo(28, -8, 22, 0, 17, 3); }, '#3e4f78'); spot(c, pen, 14, -9, 1.2, 1.2, '#3e4f78', false); }
      if (pen.v === 8) spot(c, pen, 12, -9, 9, 5, '#2e3542', true, -.5);
      if (pen.v === 9) { spot(c, pen, 18, -11, 7, 4.5, '#c9b38a', true, -.6); eyespot(c, pen, 21, -15, 2.2); eyespot(c, pen, 15, -7, 1.6); }
    });
    clipTo(c, pen, hind, () => {
      if (pen.v === 0) { spot(c, pen, 12, 9, 3.4, 3.4, '#6b4a1e'); spot(c, pen, 12, 9, 1.6, 1.6, '#f3d36a'); }
      if (pen.v === 2) { spot(c, pen, 15, 14, 2.4, 2.4, '#3d74a8'); spot(c, pen, 9, 17, 2, 2, '#d0702e'); stroke(c, pen, 2.4, () => { c.moveTo(20, 6); c.quadraticCurveTo(22, 14, 15, 19); }, '#1f1d1b'); }
      if (pen.v === 3) { spot(c, pen, 12, 10, 8, 5, '#2f8f86', true, .4); spot(c, pen, 16, 16, 2, 1.4, '#c4473a'); }
      if (pen.v === 4) { spot(c, pen, 12, 11, 7, 2, '#1f1d1b', true, .6); spot(c, pen, 14, 18, 2, 1.6, '#c4473a'); }
      if (pen.v === 5) for (const [x, y] of [[9, 8], [15, 12]]) { spot(c, pen, x, y, 3.2, 3.2, '#2b2b2b'); spot(c, pen, x, y, 2.2, 2.2, '#c4473a'); }
      if (pen.v === 6) { stroke(c, pen, 2.4, () => { c.moveTo(20, 6); c.bezierCurveTo(22, 14, 12, 22, 4, 18); }, '#5a3418'); spot(c, pen, 10, 8, 2, 2, '#2a1c10'); }
      if (pen.v === 7) { stroke(c, pen, 1.6, () => { c.moveTo(20, 6); c.bezierCurveTo(18, 22, 8, 25, 3, 18); }, '#3e4f78'); for (const [x, y] of [[16, 14], [11, 18]]) spot(c, pen, x, y, 1.2, 1.2, '#3e4f78'); }
      if (pen.v === 8) for (const [x, y] of [[17, 12], [13, 16], [9, 18]]) { spot(c, pen, x, y, 2.4, 1.8, '#c4473a'); spot(c, pen, x, y, 1, .8, '#1f2226'); }
      if (pen.v === 9) { eyespot(c, pen, 13, 13, 1.6); spot(c, pen, 10, 6, 5, 2, '#9c7d58', false, .5); }
    });
    if (pen.v === 0) { spot(c, pen, 16, -12, 3, 3, '#6b4a1e'); spot(c, pen, 16, -12, 1.4, 1.4, '#f3d36a'); }
    // Wing veins and the pale margin dots only in the catalog plate.
    mark(c, pen, .5, () => { for (const [x, y] of [[24, -17], [20, -8], [14, -2]]) { c.moveTo(3, -2); c.quadraticCurveTo(x * .5, y * .7, x, y); } for (const [x, y] of [[16, 8], [12, 16], [6, 18]]) { c.moveTo(3, 3); c.lineTo(x, y); } }, w.edge);
    if (pen.detail && pen.v === 0) for (const [x, y] of [[27, -16], [25, -9], [21, -3], [19, 11], [15, 19]]) spot(c, pen, x, y, .9, .9, PAPER);
    c.restore();
  }
  shape(c, pen, oval(0, 1, 2.2, 13), pen.v === 3 || pen.v === 8 ? '#1c1d20' : '#4a3a2a', 1.1);
  shape(c, pen, oval(0, -13, 2.6, 2.4), '#3a2e22', 1);
  antennae(c, pen, 0, -14, 9, 6, true, .8);
}
const DRAGON = [{ thorax: '#b5552e', belly: '#d1452f', eye: '#8a2b20', band: '#2a2a2a' }, { thorax: '#5d6b74', belly: '#8fa6b8', eye: '#33505f', band: '#2a2a2a' },
  { thorax: '#6aa84f', belly: '#3b4a6b', eye: '#3f7a3a', band: '#2a2a2a' }, { thorax: '#c39a42', belly: '#dda640', eye: '#9a5a2a', band: '#7a5222' },
  { thorax: '#26261f', belly: '#2b2b24', eye: '#4f9a5b', band: '#e3c03a' }]; // 고추·밀·왕·된장·장수잠자리
function dragonfly(c: Ctx, pen: Pen): void {
  const d = DRAGON[pen.v], blur = pen.pose === 'fly' || pen.pose === 'move' ? beat(pen, 3) : 0;
  for (const side of [-1, 1]) for (const [y, len, tilt] of [[-6, 28, -.08], [-1, 25, .12]] as const) {
    shape(c, pen, oval(side * (len / 2 + 2), y + (blur ? 1.5 : 0), len / 2, 3.6, side * tilt), '#eef4f4', .9);
    mark(c, pen, .35, () => { c.moveTo(side * 3, y); c.lineTo(side * (len + 1), y + side * tilt * len); for (let i = 1; i < 6; i++) { const x = side * (3 + i * len / 6); c.moveTo(x, y - 2.5); c.lineTo(x, y + 2.5); } }, '#9aa7a6');
    spot(c, pen, side * (len - 1), y + side * tilt * len * .9, 1.5, .9, '#2a2a2a', false);
  }
  shape(c, pen, poly([[-1.7, 0], [-1.2, 27], [0, 29], [1.2, 27], [1.7, 0]]), d.belly, 1);
  if (pen.v === 1) spot(c, pen, 0, 26, 1.2, 3, '#2a2a2a');
  if (pen.v === 2) spot(c, pen, 0, 4, 1.7, 2.4, '#5b8fd1');
  mark(c, pen, pen.v === 4 ? 1.2 : .5, () => { for (let y = 5; y < 27; y += 3.4) { c.moveTo(-1.6, y); c.lineTo(1.6, y); } }, d.band, true);
  if (pen.v === 4) mark(c, pen, 1.1, () => { for (const s of [-1, 1]) { c.moveTo(s * 1.4, -8); c.lineTo(s * 1.8, 0); } }, d.band, true);
  shape(c, pen, oval(0, -4, 3.4, 5.5), d.thorax, 1.1);
  eyes(c, pen, 0, -11, 2.6, 3, d.eye);
}
const DAMSEL = [{ wing: '#eef4f4', body: '#5aa3c9', thorax: '#3d7fa6', eye: '#2a4a5f', wide: 2 }, { wing: '#2c2a2f', body: '#2f9a72', thorax: '#2a7f5f', eye: '#1f2a33', wide: 3.2 }]; // 실·물잠자리
function damselfly(c: Ctx, pen: Pen): void {
  const d = DAMSEL[pen.v], blur = pen.pose === 'fly' || pen.pose === 'move' ? beat(pen, 4) : 0;
  for (const side of [-1, 1]) for (const [y, tilt] of [[-5, -.25], [-3, .1]] as const) shape(c, pen, oval(side * 11, y + (blur ? 1 : 0), 10, d.wide, side * tilt), d.wing, .8);
  shape(c, pen, poly([[-1, -2], [-.7, 28], [.7, 28], [1, -2]]), d.body, .9);
  mark(c, pen, .6, () => { for (let y = 3; y < 28; y += 4) { c.moveTo(-1, y); c.lineTo(1, y); } }, '#1f2a33', true);
  shape(c, pen, oval(0, -4, 1.8, 3.4), d.thorax, 1);
  for (const s of [-1, 1]) shape(c, pen, oval(s * 3.6, -9, 1.8, 1.8), d.eye, .8);
}
interface Cicada { body: string; wing: string; vein: string; mottle?: string; tip?: string }
const CICADA: Cicada[] = [{ body: '#3f5d3a', wing: '#eef2ea', vein: '#56724e' }, { body: '#1f1d1b', wing: '#eeece6', vein: '#5b4c3a' },
  { body: '#5a4330', wing: '#8a6a45', vein: '#4a3624', mottle: '#c8b79a' }, { body: '#5f7f3e', wing: '#f0f2ea', vein: '#46523a', tip: '#3a3a30' },
  { body: '#6b6a5e', wing: '#cfc9b6', vein: '#4f4b40', mottle: '#7d776a' }]; // 참·말·유지·애·털매미
function cicada(c: Ctx, pen: Pen): void {
  const k = CICADA[pen.v], open = pen.pose === 'fly' ? (beat(pen, 3) ? 9 : 4) : 0;
  for (const side of [-1, 1]) {
    const wing = new Path2D(); wing.moveTo(side * 2, -6); wing.bezierCurveTo(side * (16 + open), -4, side * (15 + open), 18, side * (4 + open * .5), 27); wing.quadraticCurveTo(side * 1, 18, side * 2, -6); wing.closePath();
    shape(c, pen, wing, k.wing, 1.1);
    mark(c, pen, .5, () => { c.moveTo(side * 3, -3); c.quadraticCurveTo(side * 12, 6, side * 6, 24); c.moveTo(side * 8, 2); c.lineTo(side * 12, 12); c.moveTo(side * 6, 10); c.lineTo(side * 10, 18); }, k.vein, !!k.mottle);
    if (k.mottle && pen.detail) for (const [x, y] of [[8, 4], [10, 12], [7, 18], [5, 0]]) spot(c, pen, side * x, y, 1.3, 1.3, k.mottle);
    if (k.tip) for (const [x, y] of [[7, 21], [9, 16]]) spot(c, pen, side * x, y, 1, 1, k.tip);
  }
  shape(c, pen, oval(0, -8, 8, 5), k.body, 1.2);
  if (pen.v === 0) { spot(c, pen, -3, -8, 2, 1.3, '#7fa86a'); spot(c, pen, 3, -8, 2, 1.3, '#7fa86a'); }
  if (pen.v === 3) { spot(c, pen, 0, -8, 4, 1.4, '#1f2418'); spot(c, pen, -4, -10, 1.2, 1.2, '#1f2418'); spot(c, pen, 4, -10, 1.2, 1.2, '#1f2418'); }
  shape(c, pen, oval(0, -14, 7.5, 3), k.body, 1.1);
  eyes(c, pen, 0, -14, 7.5, 2.2, '#5b4c3a');
}
/** Domed beetle body: pronotum shield and paired wing cases. */
function shell(c: Ctx, pen: Pen, len: number, wide: number, fill: string, pron: string, pronY = -9): Path2D {
  const body = oval(0, 4, wide, len); shape(c, pen, body, fill, 1.3);
  mark(c, pen, .9, () => { c.moveTo(0, 4 - len + 1); c.lineTo(0, 4 + len - 1); }, undefined, true);
  shape(c, pen, oval(0, pronY, wide * .78, 5.2), pron, 1.2);
  return body;
}
function shine(c: Ctx, pen: Pen, x: number, y: number, r: number): void { if (!pen.halo) stroke(c, pen, 1.1, () => c.arc(x, y, r, -2.4, -1.5), '#ffffff'); }
function flyWings(c: Ctx, pen: Pen, y: number, span: number): void {
  if (pen.pose !== 'fly') return;
  const lift = beat(pen, 3) ? 1 : .6;
  for (const s of [-1, 1]) shape(c, pen, oval(s * span * .6, y, span * .55 * lift, 4, s * -.4), '#eef0ea', .8);
}
const BEETLE = [{ fill: '#5f9e4f', pron: '#4f8a43', head: '#3f7536', fleck: '' }, { fill: '#6b5530', pron: '#5e4a2b', head: '#4d3c22', fleck: '#f2ede0' },
  { fill: '#7a4f2a', pron: '#6a4325', head: '#55361e', fleck: '#f4efe4' }]; // 풍뎅이·흰점박이꽃무지·수염풍뎅이
/** Lamellate antenna club: a fan of leaves the 수염풍뎅이 spreads when it senses something. */
function fan(c: Ctx, pen: Pen, x: number, y: number): void {
  const open = pen.pose === 'alert' ? 1.25 : 1;
  for (const side of [-1, 1]) {
    stroke(c, pen, .9, () => { c.moveTo(x + side * 1.5, y); c.lineTo(x + side * 4, y - 4); });
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + side * (.15 + i * .2 * open); stroke(c, pen, 1.1, () => { c.moveTo(x + side * 4, y - 4); c.lineTo(x + side * 4 + Math.cos(a) * 8, y - 4 + Math.sin(a) * 8); }, '#6a4325'); }
  }
}
function beetle(c: Ctx, pen: Pen): void {
  const k = BEETLE[pen.v], big = pen.v === 2;
  flyWings(c, pen, 0, big ? 30 : 26); legs6(c, pen, -2, big ? 8 : 7, big ? 12 : 11);
  if (big) fan(c, pen, 0, -16); else antennae(c, pen, 0, -15, 6, 5, true);
  const body = shell(c, pen, big ? 15 : 13, big ? 11.5 : 10, k.fill, k.pron);
  clipTo(c, pen, body, () => mark(c, pen, .5, () => { for (const x of [-6, -3, 3, 6]) { c.moveTo(x, -6); c.lineTo(x * 1.1, 14); } }, k.head));
  if (k.fleck) clipTo(c, pen, body, () => { for (const [x, y, r] of [[-5, -2, 1.2], [4, 0, 1.4], [-7, 7, 1], [6, 8, 1.2], [-3, 12, 1.4], [3, 15, 1], [-6, 15, .9], [7, 2, .8], [-2, 4, .9], [2, 10, .8]]) spot(c, pen, x, y, r * (big ? 1.5 : 1), r * (big ? 1.1 : 1), k.fleck, true, .4); });
  if (k.fleck) for (const s of [-1, 1]) spot(c, pen, s * 4, -9, 1.2, 1, k.fleck);
  shape(c, pen, oval(0, -15, 4, 2.6), k.head, 1); shine(c, pen, -3, 2, 6);
}
function ladybug(c: Ctx, pen: Pen): void {
  if (pen.pose === 'alert') { // playing dead: belly up, legs folded in the air
    legs6(c, pen, 2, 4, 7, 1, 4);
    shape(c, pen, oval(0, 3, 11, 12), '#2a2420', 1.3); shape(c, pen, oval(0, -9, 6, 3.2), '#2a2420', 1);
    return;
  }
  const tortoise = pen.v === 1;
  flyWings(c, pen, 4, 24); legs6(c, pen, 2, 5, 8, 1, 5);
  const body = oval(0, 3, 12, 12.5); shape(c, pen, body, tortoise ? '#d8562c' : '#d23b2f', 1.3);
  // 남생이무당벌레: a thick black rim and a jigsaw cross, like a turtle's shell.
  if (tortoise) clipTo(c, pen, body, () => { stroke(c, pen, 4, () => c.ellipse(0, 3, 12, 12.5, 0, 0, TAU), '#1d1a18'); stroke(c, pen, 3, () => { c.moveTo(-12, 3); c.lineTo(-4, 1); c.lineTo(-5, 9); c.lineTo(5, 9); c.lineTo(4, 1); c.lineTo(12, 3); c.moveTo(-6, -6); c.lineTo(-3, 1); c.moveTo(6, -6); c.lineTo(3, 1); }, '#1d1a18'); });
  mark(c, pen, .9, () => { c.moveTo(0, -8); c.lineTo(0, 15); }, undefined, true);
  if (!tortoise) for (const [x, y, r] of [[-6, 0, 2.6], [6, 0, 2.6], [-5, 8, 2.2], [5, 8, 2.2], [0, -5, 2.2], [-8, -5, 1.6], [8, -5, 1.6]] as const) spot(c, pen, x, y, r, r, '#1d1a18');
  shape(c, pen, oval(0, -9, 7, 3.6), '#1d1a18', 1.1);
  for (const s of [-1, 1]) spot(c, pen, s * 4, -9, 1.5, 1.2, PAPER);
  shine(c, pen, -4, 2, 7);
}
const STAG = [{ fill: '#2b2622', saw: false, wide: 11.5 }, { fill: '#7a3b22', saw: true, wide: 9.5 }, { fill: '#1a1817', saw: false, wide: 11 }, { fill: '#a8742e', saw: true, wide: 10 }]; // 넓적·톱·왕·두점박이사슴벌레
function stag(c: Ctx, pen: Pen): void {
  const { saw, fill, wide } = STAG[pen.v], open = pen.pose === 'alert' || (pen.pose === 'idle' && Math.floor(pen.frame / 40) % 3 === 0) ? 1 : 0;
  flyWings(c, pen, 2, 28); legs6(c, pen, -1, 8, 12, 1.3);
  for (const s of [-1, 1]) {
    const jaw = new Path2D(), sp = s * (open ? 7 : 4);
    if (saw) { jaw.moveTo(s * 2.5, -17); jaw.bezierCurveTo(sp + s * 6, -22, sp + s * 5, -32, s * 1.5 + sp * .3, -36); jaw.lineTo(s * 3 + sp * .3, -33); jaw.bezierCurveTo(sp + s * 2, -29, sp + s * 2, -22, s * 4.5, -17); }
    else if (pen.v === 2) { jaw.moveTo(s * 3, -17); jaw.bezierCurveTo(sp + s * 7, -21, sp + s * 6, -30, s * 1 + sp * .3, -31); jaw.lineTo(s * 3 + sp * .3, -28.5); jaw.quadraticCurveTo(sp + s * 7.5, -23, s * 6.5, -17); }
    else { jaw.moveTo(s * 3, -17); jaw.quadraticCurveTo(sp + s * 4, -24, s * 2 + sp * .4, -33); jaw.lineTo(s * 4.5 + sp * .4, -31); jaw.quadraticCurveTo(sp + s * 6, -23, s * 6, -17); }
    jaw.closePath(); shape(c, pen, jaw, fill, 1.1);
    mark(c, pen, .8, () => { for (let i = 0; i < (saw ? 4 : 1); i++) { const y = -21 - i * 3.2, x = s * (2.5 + Math.abs(sp) * .5 + (saw ? 2 : 1)); c.moveTo(x, y); c.lineTo(x - s * 2, y - .8); } }, undefined, true);
  }
  antennae(c, pen, 0, -16, 6, 9, true, .8);
  shell(c, pen, 14, wide, fill, fill, -8);
  if (pen.v === 3) for (const s of [-1, 1]) spot(c, pen, s * 4.5, -8, 1.8, 1.8, '#1a1512');
  shape(c, pen, poly([[-7, -18], [7, -18], [8, -13], [-8, -13]]), fill, 1.1);
  shine(c, pen, -4, 3, 7);
}
function rhino(c: Ctx, pen: Pen): void {
  const lift = pen.pose === 'alert' ? -4 : Math.floor(pen.frame / 30) % 2 ? -1.5 : 0;
  flyWings(c, pen, 2, 30); legs6(c, pen, -1, 9, 12, 1.4);
  shell(c, pen, 15, 12, '#5a3a24', '#4a2e1c', -8);
  const horn = new Path2D(); horn.moveTo(-2.4, -14); horn.quadraticCurveTo(-3, -24 + lift, -1, -32 + lift); horn.lineTo(-4.5, -36 + lift); horn.lineTo(0, -34 + lift); horn.lineTo(4.5, -36 + lift); horn.lineTo(1, -32 + lift); horn.quadraticCurveTo(3, -24 + lift, 2.4, -14); horn.closePath();
  shape(c, pen, horn, '#3b2618', 1.1);
  shape(c, pen, poly([[-3, -12], [0, -19], [3, -12]]), '#3b2618', 1);
  shine(c, pen, -5, 2, 8);
}
const LONGHORN = [{ body: '#5b4330', head: '#4a3524', spot: '#c9a76a', tuft: '' }, { body: '#8ec0de', head: '#8ec0de', spot: '#1d1f22', tuft: '#1d1f22' }]; // 장수·루리하늘소
function longhorn(c: Ctx, pen: Pen): void {
  const up = pen.pose === 'alert' ? -1 : 1, k = LONGHORN[pen.v];
  flyWings(c, pen, 2, 30); legs6(c, pen, -2, 7, 14, 1.3);
  // Segment joints sit on the antenna curve itself: the same cubic, sampled.
  const curve = (s: number, t: number): [number, number] => { const u = 1 - t, pts = [[s * 2, -15], [s * 14, -26], [s * 26, -18 * up], [s * 30, 2 * up + 4]];
    const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [k.reduce((n, w, i) => n + w * pts[i][0], 0), k.reduce((n, w, i) => n + w * pts[i][1], 0)]; };
  for (const s of [-1, 1]) stroke(c, pen, 1.1, () => { c.moveTo(s * 2, -15); c.bezierCurveTo(s * 14, -26, s * 26, -18 * up, s * 30, 2 * up + 4); });
  mark(c, pen, k.tuft ? 3.4 : 2.2, () => { for (const s of [-1, 1]) for (let i = 1; i < 8; i++) { const [x, y] = curve(s, i / 8); c.moveTo(x, y); c.lineTo(x + .01, y); } }, k.tuft || undefined, true);
  const body = oval(0, 6, 8, 17); shape(c, pen, body, k.body, 1.3);
  mark(c, pen, .9, () => { c.moveTo(0, -10); c.lineTo(0, 22); }, undefined, true);
  // 루리하늘소 wears its black spots openly; the 장수하늘소's golden hairs only show in the catalog plate.
  clipTo(c, pen, body, () => { for (const [x, y] of [[-4, -2], [4, 2], [-3, 10], [4, 14]]) spot(c, pen, x, y, 2.2, 1.6, k.spot, !!k.tuft); });
  shape(c, pen, oval(0, -11, 6.5, 4), k.head, 1.2); if (k.tuft) spot(c, pen, 0, -11, 2, 1.6, k.spot); shape(c, pen, oval(0, -16, 4.2, 2.8), k.head, 1);
}
function jewel(c: Ctx, pen: Pen): void {
  // A slow shimmer between green and teal instead of a sparkle, so it never reads as the 금색 glint.
  const green = Math.sin(pen.frame * .05) < 0 ? '#2f9e6e' : '#2a8fa3';
  flyWings(c, pen, 2, 26); legs6(c, pen, -1, 6, 10, 1.1);
  antennae(c, pen, 0, -15, 5, 4);
  const body = new Path2D(); body.moveTo(0, -10); body.bezierCurveTo(10, -10, 8, 14, 0, 22); body.bezierCurveTo(-8, 14, -10, -10, 0, -10); body.closePath();
  shape(c, pen, body, green, 1.3);
  clipTo(c, pen, body, () => { for (const s of [-1, 1]) spot(c, pen, s * 4, 6, 1.6, 13, '#b8456a', true, s * .12); });
  mark(c, pen, .9, () => { c.moveTo(0, -9); c.lineTo(0, 21); }, undefined, true);
  shape(c, pen, oval(0, -12, 6, 3.6), green, 1.1); spot(c, pen, 0, -12, 1.4, 2.6, '#b8456a');
  shine(c, pen, -3, 0, 6);
}
const TIGER = [{ body: '#c0453a', head: '#3c8f6a' }, { body: '#5c5a3a', head: '#4d4b30' }, { body: '#4f7a52', head: '#3f6744' }]; // 길앞잡이·꼬마·닻무늬
function tiger(c: Ctx, pen: Pen): void {
  legs6(c, pen, -2, 6, 15, 1.1, 7);
  antennae(c, pen, 0, -16, 9, 7, false, .7);
  for (const s of [-1, 1]) shape(c, pen, poly([[s * 2, -18], [s * 6, -23], [s * 1, -21]]), '#e9dcc0', .9);
  const k = TIGER[pen.v], body = oval(0, 5, 7, 13); shape(c, pen, body, k.body, 1.2);
  clipTo(c, pen, body, () => {
    if (pen.v === 0) { spot(c, pen, 0, 13, 8, 5, '#3d6fb0'); spot(c, pen, 0, -4, 8, 3, '#3c8f6a'); for (const [x, y] of [[-4, 4], [4, 4], [-3, 10], [3, 10]]) spot(c, pen, x, y, 1.2, 1.2, PAPER); }
    // 꼬마길앞잡이: wavy pale bands; 닻무늬길앞잡이: a white anchor on each wing case.
    if (pen.v === 1) for (const y of [0, 9]) stroke(c, pen, 1.4, () => { for (const s of [-1, 1]) { c.moveTo(s * 7, y - 2); c.quadraticCurveTo(s * 4, y + 2, s * 2, y - 1); } }, '#efe7d2');
    if (pen.v === 2) for (const s of [-1, 1]) { stroke(c, pen, 1.5, () => { c.moveTo(s * 3.5, -4); c.lineTo(s * 3.5, 12); c.moveTo(s * 7, 9); c.quadraticCurveTo(s * 3.5, 15, s * .5, 9); c.moveTo(s * 1.5, -1); c.lineTo(s * 5.5, -1); }, '#f4f1e6'); spot(c, pen, s * 5, 16, 1.2, 1.2, '#f4f1e6'); }
  });
  mark(c, pen, .8, () => { c.moveTo(0, -7); c.lineTo(0, 18); }, undefined, true);
  shape(c, pen, oval(0, -11, 4.5, 3.5), k.head, 1.1); shape(c, pen, oval(0, -17, 5.5, 3.2), k.head, 1);
  eyes(c, pen, 0, -17, 5, 1.8, '#2a2a2a');
}
function dung(c: Ctx, pen: Pen): void {
  const roll = pen.frame * (pen.pose === 'move' ? .12 : .03), sit = pen.pose === 'alert', by = sit ? 4 : 20;
  shape(c, pen, oval(0, by, 11, 11), '#8b6a43', 1.2);
  mark(c, pen, .7, () => { for (let i = 0; i < 3; i++) { const a = roll + i * 2.1; c.moveTo(Math.cos(a) * 3, by + Math.sin(a) * 3); c.lineTo(Math.cos(a) * 8, by + Math.sin(a) * 8); } }, '#5e4529', true);
  c.save(); if (sit) c.translate(0, -8);
  legs6(c, pen, -2, 5, 8, 1.1, 5);
  shell(c, pen, 7.5, 8, '#1c1c1c', '#262626', -8);
  shape(c, pen, poly([[-7, -12], [-4, -16], [0, -14], [4, -16], [7, -12]]), '#262626', 1);
  if (pen.v === 1) shape(c, pen, poly([[-1.6, -14], [0, -21 - (sit ? 1 : 0)], [1.6, -14]]), '#262626', 1);
  shine(c, pen, -3, 1, 4);
  c.restore();
}
// ─── Side-view plans (head at -x) ───────────────────────────────────────────────────────────────────────────────
/** Long, kinked hopping leg: big femur up from the hip, tibia back down to the ground. */
function hindLeg(c: Ctx, pen: Pen, hx: number, hy: number, femur: number, fill: string, crouch = 0): void {
  const kx = hx + femur * .8, ky = hy - femur * .55 - crouch, fx = kx - femur * .15, fy = 12;
  shape(c, pen, oval((hx + kx) / 2, (hy + ky) / 2, femur * .55, 3, Math.atan2(ky - hy, kx - hx)), fill, 1.1);
  stroke(c, pen, 1.1, () => { c.moveTo(kx, ky); c.lineTo(fx, fy); c.lineTo(fx + 4, fy); });
  mark(c, pen, .5, () => { for (let i = 1; i < 4; i++) { const t = i / 4; c.moveTo(hx + (kx - hx) * t, hy + (ky - hy) * t - 1.5); c.lineTo(hx + (kx - hx) * t + 1.5, hy + (ky - hy) * t + 1.5); } });
}
function sideLegs(c: Ctx, pen: Pen, xs: number[], y: number, len = 10): void {
  const walk = pen.pose === 'move' ? (beat(pen, 5) ? 2 : -2) : 0;
  xs.forEach((x, i) => stroke(c, pen, 1, () => { c.moveTo(x, y); c.lineTo(x - 2 + (i % 2 ? walk : -walk), y + len * .55); c.lineTo(x - 4 + (i % 2 ? walk : -walk), 12); }));
}
const HOPPER = [{ fill: '#a8c95a', leg: '#98b94e', wing: '#8fae45', mark: '#6f8a35' }, { fill: '#9c8a70', leg: '#8a785e', wing: '#85735a', mark: '#4f4232' },
  { fill: '#8db255', leg: '#7ea24a', wing: '#9a7a4e', mark: '#5e4a2e' }]; // 벼메뚜기·팥중이·풀무치
function grasshopper(c: Ctx, pen: Pen): void {
  const { fill, leg, wing, mark: ink } = HOPPER[pen.v];
  sideLegs(c, pen, [-12, -6], 4);
  hindLeg(c, pen, 2, 3, 20, leg, pen.pose === 'alert' ? 3 : 0);
  const body = new Path2D(); body.moveTo(-18, -2); body.quadraticCurveTo(-6, -9, 18, -4); body.quadraticCurveTo(24, 0, 18, 4); body.quadraticCurveTo(-4, 7, -18, 4); body.closePath();
  shape(c, pen, body, fill, 1.2);
  shape(c, pen, poly([[-8, -6], [pen.v === 2 ? 27 : 22, -5], [pen.v === 2 ? 28 : 24, -2], [-6, -2]]), wing, 1);
  mark(c, pen, .5, () => { for (let x = 0; x < 16; x += 3.5) { c.moveTo(x, 0); c.lineTo(x + 1, 5); } }, ink);
  if (pen.v === 1) for (const x of [2, 12]) spot(c, pen, x, -4, 2, 1.2, ink);
  shape(c, pen, oval(-20, -1, 6.5, 6.5), fill, 1.2);
  spot(c, pen, -22, -3, 1.6, 1.8, '#2a2a2a');
  stroke(c, pen, .9, () => { c.moveTo(-23, -6); c.quadraticCurveTo(-28, -16, -24, -22); });
}
function conehead(c: Ctx, pen: Pen): void {
  sideLegs(c, pen, [-10, -4], 4, 9);
  hindLeg(c, pen, 4, 2, 17, '#73a242', pen.pose === 'alert' ? 2 : 0);
  const body = new Path2D(); body.moveTo(-28, -1); body.lineTo(-14, -6); body.quadraticCurveTo(4, -8, 22, -3); body.quadraticCurveTo(26, 0, 22, 3); body.quadraticCurveTo(0, 6, -14, 4); body.closePath();
  shape(c, pen, body, '#7fb24a', 1.2);
  spot(c, pen, -19, -3, 1.4, 1.6, '#2a2a2a');
  mark(c, pen, .6, () => { c.moveTo(-14, -4); c.lineTo(22, -2); }, '#5f8d35');
  stroke(c, pen, .9, () => { c.moveTo(-26, -2); c.lineTo(-33, -6); });
}
function longhead(c: Ctx, pen: Pen): void {
  const nod = pen.pose === 'idle' && beat(pen, 18) ? 2 : 0;
  sideLegs(c, pen, [-12, -5], 3, 8);
  hindLeg(c, pen, 6, 1, 26, '#7eb04c', pen.pose === 'alert' ? 2 : 0);
  c.save(); c.translate(0, nod * .4); c.rotate(nod * .02);
  const body = new Path2D(); body.moveTo(-30, -1 + nod); body.lineTo(-16, -4); body.quadraticCurveTo(8, -6, 30, -2); body.lineTo(30, 2); body.quadraticCurveTo(6, 4, -16, 3); body.closePath();
  shape(c, pen, body, '#8cc157', 1.2);
  shape(c, pen, poly([[-12, -4], [28, -3], [29, -1], [-10, -1]]), '#7aa84a', .9);
  spot(c, pen, -24, -1 + nod * .6, 1.2, 1.5, '#2a2a2a');
  for (const s of [-1, 1]) shape(c, pen, poly([[-29, -1 + nod], [-35, -5 + s * 1.5 + nod], [-34, -3 + s * 1.5 + nod]]), '#7aa84a', .8);
  c.restore();
}
function katydid(c: Ctx, pen: Pen): void {
  const slim = pen.v === 1, fill = slim ? '#82b24c' : '#6fa040', up = pen.pose === 'alert' ? -1 : 1;
  sideLegs(c, pen, [-11, -4], 4);
  hindLeg(c, pen, 3, 3, 19, slim ? '#74a043' : '#64923a');
  stroke(c, pen, .6, () => { c.moveTo(-20, -6); c.bezierCurveTo(-26, -24, 8, -26 * up, 30, -14 * up); c.moveTo(-19, -6); c.bezierCurveTo(-22, -20, 4, -20 * up, 26, -10 * up); });
  const body = new Path2D(); body.moveTo(-18, -2); body.quadraticCurveTo(-4, -11, 16, -5); body.quadraticCurveTo(22, 1, 15, 6); body.quadraticCurveTo(-4, 9, -18, 4); body.closePath();
  shape(c, pen, body, fill, 1.2);
  // 중베짱이 folds long wings past its tail with a brown stripe down the back.
  if (slim) shape(c, pen, poly([[-6, -6], [26, -6], [30, -3], [26, 0], [-4, -2]]), '#93bf5c', .9);
  shape(c, pen, poly([[-6, -7], [slim ? 24 : 10, -7], [slim ? 26 : 12, -4.5], [-4, -3]]), '#8c6a3f', .9);
  mark(c, pen, 1.1, () => { c.moveTo(15, 3); c.quadraticCurveTo(24, 4, 28, 9); }, '#4f7a2e');
  shape(c, pen, oval(-19, 0, 6, 6.5), fill, 1.2); spot(c, pen, -21, -2, 1.5, 1.7, '#2a2a2a');
}
const CRICKET = [{ fill: '#3d2a1e', leg: '#4a3424', vein: '#7a5b40', eye: '#c9a76a' }, { fill: '#b9cf86', leg: '#a8bf78', vein: '#e8f0d2', eye: '#5a6a3a' },
  { fill: '#1f1b17', leg: '#cdbf9e', vein: '#5b4e40', eye: '#e2d6b8' }]; // 왕귀뚜라미·긴꼬리·방울벌레
function cricket(c: Ctx, pen: Pen): void {
  const { fill, leg, vein, eye } = CRICKET[pen.v];
  sideLegs(c, pen, [-10, -4], 4);
  hindLeg(c, pen, 4, 3, 17, leg, pen.pose === 'alert' ? 2 : 0);
  stroke(c, pen, .6, () => { c.moveTo(-20, -5); c.bezierCurveTo(-24, -20, 0, -24, 18, -18); });
  const body = new Path2D(); body.moveTo(-16, -3); body.quadraticCurveTo(-2, -9, 16, -4); body.quadraticCurveTo(20, 1, 15, 5); body.quadraticCurveTo(-2, 8, -16, 4); body.closePath();
  shape(c, pen, body, fill, 1.2);
  // 긴꼬리 raises clear wings to sing; 방울벌레's broad wing cases flare out over its back.
  if (pen.v === 1) shape(c, pen, poly([[-6, -5], [6, -14], [18, -10], [16, -4]]), '#eef4e2', .8);
  if (pen.v === 2) shape(c, pen, poly([[-8, -6], [16, -8], [20, -2], [-6, -1]]), '#2c2620', .9);
  mark(c, pen, .6, () => { for (let x = -4; x < 14; x += 4) { c.moveTo(x, -6); c.quadraticCurveTo(x + 2, -1, x, 3); } }, vein);
  for (const dy of [-2, 2]) stroke(c, pen, .8, () => { c.moveTo(15, dy); c.lineTo(24, dy * 2.5); });
  shape(c, pen, oval(-18, 0, 6.5, 6.5), fill, 1.2); spot(c, pen, -20, -2, 1.2, 1.2, eye);
}
function molecricket(c: Ctx, pen: Pen): void {
  const dig = pen.pose === 'idle' && beat(pen, 8) ? 2 : 0;
  sideLegs(c, pen, [-2, 6], 4, 8);
  const body = new Path2D(); body.moveTo(-18, -3); body.quadraticCurveTo(0, -9, 20, -3); body.quadraticCurveTo(23, 2, 18, 6); body.quadraticCurveTo(0, 9, -18, 5); body.closePath();
  shape(c, pen, body, '#7a5a3a', 1.2);
  mark(c, pen, .4, () => { for (let x = -16; x < 18; x += 2.2) { c.moveTo(x, -5); c.lineTo(x + .8, -7); } }, '#4e3824', true);
  shape(c, pen, oval(-14, -1, 7, 6), '#6a4c30', 1.2);
  const shovel = poly([[-18, 4], [-25 - dig, 6 + dig], [-27 - dig, 10 + dig], [-24 - dig, 12 + dig], [-17, 8]]);
  shape(c, pen, shovel, '#5e4329', 1);
  mark(c, pen, .7, () => { for (const y of [8, 10]) { c.moveTo(-26 - dig, y + dig); c.lineTo(-29 - dig, y + dig + 1); } }, undefined, true);
  stroke(c, pen, .7, () => { c.moveTo(-20, -4); c.lineTo(-27, -9); });
  if (dig) for (const [x, y] of [[-30, 10], [-32, 7], [-28, 6]]) spot(c, pen, x - dig, y, .9, .9, '#8b6a43');
}
const MANTIS = [{ fill: '#7db455', dark: '#6a9c45' }, { fill: '#9b7651', dark: '#7e5d3d' }, { fill: '#8cbf50', dark: '#6f9e3c' }]; // 왕·좀·넓적배사마귀
function mantis(c: Ctx, pen: Pen): void {
  const { fill, dark } = MANTIS[pen.v], broad = pen.v === 2, alert = pen.pose === 'alert', sway = pen.pose === 'move' ? (beat(pen, 8) ? 1 : -1) : 0;
  sideLegs(c, pen, [2, 10], 2, 10);
  c.save(); c.rotate(sway * .03);
  const belly = new Path2D(); belly.moveTo(-2, -2); belly.quadraticCurveTo(14, broad ? -10 : -6, 30, -1); belly.quadraticCurveTo(14, broad ? 9 : 6, -2, 3); belly.closePath();
  shape(c, pen, belly, fill, 1.2);
  shape(c, pen, poly([[2, -4], [28, -2], [26, 0], [2, -1]]), dark, .9);
  if (broad) spot(c, pen, 11, -4.5, 1.6, 1.2, PAPER);
  shape(c, pen, poly([[-1, -1], [-14, -18], [-12, -20], [2, -3]]), fill, 1.1);
  shape(c, pen, poly([[-18, -24], [-10, -23], [-13, -17]]), fill, 1.1);
  for (const x of [-17, -11]) spot(c, pen, x, -23, 1.3, 1.3, '#2a2a2a');
  stroke(c, pen, .6, () => { c.moveTo(-15, -24); c.quadraticCurveTo(-22, -32, -28, -30); });
  // Raptorial forelegs: folded in prayer, thrown open when startled.
  const fx = alert ? -24 : -16, fy = alert ? -22 : -10;
  stroke(c, pen, 1.6, () => { c.moveTo(-10, -14); c.lineTo(fx, fy); c.lineTo(alert ? -20 : -12, alert ? -30 : -5); });
  mark(c, pen, .6, () => { c.moveTo(-12, -13); c.lineTo(fx + 1, fy + 1); }, dark, true);
  c.restore();
}
/** 애반딧불이: soft black wing cases, an orange shield, and a lantern that breathes yellow-green light. */
function firefly(c: Ctx, pen: Pen): void {
  const glow = .55 + .45 * Math.sin(pen.frame * .09), lamp = pen.golden ? '#fff1b0' : '#e4f78a';
  if (!pen.halo) {
    const g = c.createRadialGradient(0, 15, 1, 0, 15, 22); g.addColorStop(0, `rgba(226,247,120,${.75 * glow})`); g.addColorStop(1, 'rgba(226,247,120,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 15, 22, 0, TAU); c.fill();
  }
  flyWings(c, pen, 2, 24); legs6(c, pen, -1, 5, 9, 1, 5);
  antennae(c, pen, 0, -15, 9, 6, false, .8);
  shape(c, pen, oval(0, 13, 5.5, 6), lamp, 1.1);
  if (!pen.halo) { c.save(); c.globalAlpha = glow; spot(c, pen, 0, 14, 4, 4.5, '#fbffd8'); c.restore(); }
  const body = new Path2D(); body.moveTo(-7, -6); body.lineTo(7, -6); body.quadraticCurveTo(9, 6, 5, 11); body.lineTo(-5, 11); body.quadraticCurveTo(-9, 6, -7, -6); body.closePath();
  shape(c, pen, body, '#2b2a2c', 1.2);
  mark(c, pen, .8, () => { c.moveTo(0, -5); c.lineTo(0, 10); }, '#55524e', true);
  shape(c, pen, oval(0, -10, 6.5, 4.4), '#e0773a', 1.1); spot(c, pen, 0, -10, 1.6, 2.4, '#2b2a2c');
  shape(c, pen, oval(0, -15.5, 3, 2), '#2b2a2c', 1);
}
const PLANS: Record<Plan, (c: Ctx, pen: Pen) => void> = { butterfly, dragonfly, damselfly, cicada, beetle, ladybug, stag, rhino, longhorn, jewel, tiger, dung, grasshopper, conehead, longhead, katydid, cricket, molecricket, mantis, firefly };
export const DRAWN_PLANS = new Set(Object.keys(PLANS));
/** Gold leaf catches the light: two bright streaks on top of the gilded colours. */
function gilt(c: Ctx, side: boolean): void {
  c.save(); c.globalAlpha = .85; c.strokeStyle = '#fff8dc'; c.lineWidth = 1.4; c.lineCap = 'round';
  c.beginPath(); if (side) { c.moveTo(-10, -4); c.quadraticCurveTo(0, -8, 10, -5); } else { c.moveTo(-4, -6); c.quadraticCurveTo(-6, 2, -4, 10); } c.stroke();
  c.lineWidth = .8; c.beginPath(); if (side) { c.moveTo(-4, 2); c.lineTo(6, 1); } else { c.moveTo(4, -2); c.lineTo(5, 6); } c.stroke();
  c.restore();
}
/** Draws `s` centred at (x, y), `size` px across its ~60-unit box. `flip` mirrors it horizontally. */
export function drawInsect(c: Ctx, s: Species, x: number, y: number, size: number, look: Look = {}, flip = false, rotate = 0): void {
  const draw = PLANS[s.plan], base = { ink: look.ink ?? INK, golden: !!look.golden, detail: !!look.detail, frame: look.frame ?? 0, pose: look.pose ?? 'idle', v: s.variant };
  c.save(); c.translate(x, y); c.rotate(rotate); c.scale((flip ? -1 : 1) * size / 60, size / 60); c.lineJoin = c.lineCap = 'round';
  for (const halo of [true, false]) { c.save(); draw(c, { ...base, halo }); c.restore(); }
  if (base.golden) gilt(c, SIDE_VIEW.has(s.plan));
  c.restore();
}
/** Four-point ink star, used for sparkles and the 금색 glint. */
export function star(c: Ctx, x: number, y: number, s: number, fill: string): void {
  c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * .5, y - s * .5); c.lineTo(x + s * 2, y); c.lineTo(x + s * .5, y + s * .5); c.lineTo(x, y + s * 2); c.lineTo(x - s * .5, y + s * .5); c.lineTo(x - s * 2, y); c.lineTo(x - s * .5, y - s * .5); c.closePath();
  c.fillStyle = fill; c.fill();
}
