import { RARITIES, SPECIES_BY_ID } from '../../../shared/insect.js';
import type { InsectCatch, Species } from '../../../shared/insect.js';
import { beginSketchFrame, jitter, roughLimb, roughStroke } from '../../lib/sketch.js';
import type { Viewport } from '../types.js';
import { drawEmoteIcon } from '../fishing/draw.js';
import { drawInsect, star, SIDE_VIEW, INK, PAPER, HALO } from './art.js';
import type { Pose } from './art.js';
import { EMOTE_TICKS, ENTER_TICKS, FLEE_TICKS, GROUND_Y, RING_TICKS, SHOW_TICKS, SWING_TICKS, TREES, WINDOW_TICKS, envOf, glinting, inReach, netX, ringPhase } from './engine.js';
import type { Bug, Collector, InsectWorld } from './engine.js';
const BROWN = '#7a5433', RED = '#c4473a', GOLD = '#c08416', MUTED = '#a8ada6', BLUSH = 'rgba(232,120,110,.5)', HAT = '#ecdcbf';
/** P1 먹 · P2 갈색 · P3 자주 · P4 청회색 — body ink and hat band, so four walkers never blur together over grass. */
export const SEAT_INK = ['#14181a', '#7a5433', '#7a4a8c', '#5d7186'];
/** 일반·고급·희귀·전설 stamp inks, borrowed from the fishing tiers of the same names. */
export const RARITY_INK = ['#7d857b', '#4f8a5b', '#3d74a8', '#c08416'];
const FX0 = 12, FW = 296, POLE = 24, HOOP = 6.5;
export const fx = (x: number) => FX0 + x * FW;
/** Field sprites come in three sizes instead of true scale, so a 0.5cm ladybug and an 11cm longhorn are both visible. */
export function fieldSize(s: Species, sizeMm: number): number {
  const t = (sizeMm - s.minMm) / Math.max(1, s.maxMm - s.minMm);
  return [14, 19, 25][s.size] * (.85 + t * .3);
}
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 9, color = INK, weight = ''): void {
  c.font = `${weight}${size}px Menlo, sans-serif`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = HALO; c.strokeText(text, x, y); c.fillStyle = color; c.fillText(text, x, y);
}
function line(c: CanvasRenderingContext2D, x: number, y: number, a: number, b: number, color = INK, w = 1.2): void { roughStroke(c, x, y, a, b, w, color, HALO); }
function shapeFill(c: CanvasRenderingContext2D, p: Path2D, fill: string, ink: string, w: number): void {
  c.lineWidth = w + 4; c.strokeStyle = HALO; c.stroke(p); c.fillStyle = fill; c.fill(p); c.lineWidth = w; c.strokeStyle = ink; c.stroke(p);
}
// ─── Scenery ───────────────────────────────────────────────────────────────────────────────────────────────────
const TREE_INK = '#6b5a48', LEAF = '#e9eee1';
function tree(c: CanvasRenderingContext2D, x: number): void {
  const trunk = new Path2D(); trunk.moveTo(x - 9, GROUND_Y + 1); trunk.quadraticCurveTo(x - 6, GROUND_Y - 30, x - 6, 108); trunk.lineTo(x + 6, 108); trunk.quadraticCurveTo(x + 6, GROUND_Y - 30, x + 9, GROUND_Y + 1); trunk.closePath();
  shapeFill(c, trunk, '#f3e9da', TREE_INK, 1.6);
  for (const [dx, y0, y1] of [[-2, 132, 150], [3, 150, 168]]) line(c, x + dx, y0, x + dx, y1, TREE_INK, .8);
  const lobes: [number, number, number][] = [[-22, 82, 15], [-26, 62, 16], [-10, 44, 18], [12, 46, 18], [27, 62, 16], [22, 84, 15], [0, 90, 16]];
  const crown = new Path2D(); for (const [dx, y, r] of lobes) { crown.moveTo(x + dx + r, y); crown.arc(x + dx, y, r, 0, Math.PI * 2); }
  c.save(); c.lineWidth = 5.5; c.strokeStyle = HALO; c.stroke(crown); c.fillStyle = LEAF; c.fill(crown);
  // Only the outer rim gets ink: stroke every lobe, then repaint each interior so the inner overlaps vanish.
  c.lineWidth = 1.7; c.strokeStyle = TREE_INK; c.stroke(crown);
  for (const [dx, y, r] of lobes) { c.beginPath(); c.arc(x + dx, y, r - .9, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = '#b9c4a8'; c.lineWidth = 1.2; c.lineCap = 'round';
  for (const [dx, y, a0, a1] of [[-12, 60, 3.6, 4.6], [14, 54, 4.2, 5.2], [4, 80, 3.4, 4.2]]) { c.beginPath(); c.arc(x + dx, y, 9, a0, a1); c.stroke(); }
  c.restore();
}
function tuft(c: CanvasRenderingContext2D, x: number, h = 7): void {
  c.strokeStyle = '#8a9a86'; c.lineWidth = .9;
  for (const [dx, lean, k] of [[-3, -3, .8], [0, 0, 1], [3, 3, .85]]) { c.beginPath(); c.moveTo(x + dx, GROUND_Y); c.quadraticCurveTo(x + dx + lean * .3, GROUND_Y - h * k * .6, x + dx + lean, GROUND_Y - h * k); c.stroke(); }
}
function flower(c: CanvasRenderingContext2D, x: number, h: number): void {
  c.beginPath(); c.moveTo(x, GROUND_Y); c.lineTo(x + .5, GROUND_Y - h); c.strokeStyle = '#8a9a86'; c.lineWidth = .8; c.stroke();
  c.beginPath(); c.arc(x + .5, GROUND_Y - h - 2.2, 2.4, 0, Math.PI * 2); c.fillStyle = '#f1d9a0'; c.fill(); c.strokeStyle = '#a88a52'; c.lineWidth = .8; c.stroke();
}
const TUFTS = [.04, .2, .45, .53, .82, .95], FLOWERS: [number, number][] = [[.1, 13], [.62, 9], [.9, 12]];
function scenery(c: CanvasRenderingContext2D): void {
  for (const t of TREES) tree(c, fx(t));
  for (const x of TUFTS) tuft(c, fx(x));
  for (const [x, h] of FLOWERS) flower(c, fx(x), h);
  line(c, 8, GROUND_Y + 1, 312, GROUND_Y + 1); line(c, 8, GROUND_Y + 4, 312, GROUND_Y + 4, INK, .5);
}
// ─── Insects ───────────────────────────────────────────────────────────────────────────────────────────────────
function bugPose(b: Bug, s: Species): Pose {
  if (b.state === 'flee') return ['up', 'dart', 'zigzag', 'buzz', 'fly'].includes(s.flee) ? 'fly' : 'move';
  if (b.state === 'enter') return s.env === 'air' ? 'fly' : 'move';
  if (b.alert >= 50) return 'alert';
  if (s.env === 'air') return (s.move === 'perch' && b.timer > 50) || (s.move === 'skim' && b.timer <= 40) ? 'idle' : 'fly';
  if (['crawl', 'walk', 'roll'].includes(s.move) || (s.move === 'hop' && b.timer < 14) || (s.move === 'dash' && b.timer < 10)) return 'move';
  return 'idle';
}
/** Top-down bodies turn toward travel; side views just mirror. */
function bugOrientation(b: Bug, s: Species): { flip: boolean; rot: number } {
  if (SIDE_VIEW.has(s.plan)) return { flip: b.dir === 1, rot: 0 };
  if (s.env === 'ground') return { flip: false, rot: b.dir * Math.PI / 2 };
  if (s.env === 'tree') return { flip: false, rot: b.state === 'live' && s.move === 'crawl' && b.dir === 1 ? Math.PI : 0 };
  return { flip: false, rot: b.state === 'flee' ? 0 : b.dir * .25 };
}
const bugY = (b: Bug, s: Species, size: number) => b.y - (s.env === 'ground' ? size * .32 : 0);
function drawBug(c: CanvasRenderingContext2D, b: Bug, tick: number): void {
  const s = SPECIES_BY_ID.get(b.speciesId); if (!s) return;
  const size = fieldSize(s, b.sizeMm), { flip, rot } = bugOrientation(b, s);
  let x = fx(b.x), y = bugY(b, s, size), alpha = 1;
  if (b.state === 'enter') {
    const f = Math.min(1, b.t / ENTER_TICKS); alpha = f;
    if (s.env === 'air') y -= (1 - f) * 30; else if (s.env === 'tree') y -= (1 - f) * 18; else x -= b.dir * (1 - f) * 10;
  }
  const digging = b.state === 'flee' && s.flee === 'dig';
  if (b.state === 'flee') { const f = b.t / FLEE_TICKS; alpha = digging ? 1 - f : f < .5 ? 1 : 1 - (f - .5) * 2; if (digging) y += f * size * .7; }
  c.save(); c.globalAlpha = alpha;
  if (digging) { c.beginPath(); c.rect(0, 0, 320, GROUND_Y + 1); c.clip(); }
  drawInsect(c, s, x, y, size, { pose: bugPose(b, s), frame: tick + b.seed * 7 }, flip, rot);
  c.restore();
  if (b.state !== 'live') return;
  const top = y - size * .6;
  // Singers show their song as rising notes; it stops the moment they notice someone.
  if (s.sings && b.alert < 50 && Math.floor((tick + b.seed * 5) / 30) % 3 !== 2) {
    const age = (tick + b.seed * 5) % 30, big = s.name === '말매미';
    label(c, big ? '♪♪' : '♪', x + 7 + age * .15, top - age * .3, big ? 9 : 7, BROWN);
  }
  if (b.alert >= 80 && Math.floor(tick / 9) % 2) label(c, '!', x, top - 3, 10, RED, 'bold ');
  if (glinting(b, tick)) {
    const k = (tick - b.glintAt) / 12, r = 1.3 + Math.sin(k * Math.PI) * 1.4, gx = x + size * .2, gy = y - size * .15;
    star(c, gx, gy, r + .8, HALO); star(c, gx, gy, r, GOLD);
  }
}
/** The local player's timing ring: dashed, shrinking onto the insect; it turns brown inside the catch window. */
function ring(c: CanvasRenderingContext2D, b: Bug, tick: number): void {
  const s = SPECIES_BY_ID.get(b.speciesId)!, size = fieldSize(s, b.sizeMm), phase = ringPhase(b, tick);
  const t = Math.abs(phase - RING_TICKS / 2) / (RING_TICKS / 2), r = size * .55 + 2 + t * 13;
  const hit = Math.abs(phase - RING_TICKS / 2) <= WINDOW_TICKS[s.rarity] / 2;
  c.save(); c.setLineDash([3, 2.5]); c.lineDashOffset = -tick * .3;
  c.beginPath(); c.arc(fx(b.x), bugY(b, s, size), r, 0, Math.PI * 2); c.strokeStyle = HALO; c.lineWidth = hit ? 4.5 : 3.5; c.stroke();
  c.strokeStyle = hit ? BROWN : INK; c.lineWidth = hit ? 2 : 1; c.stroke();
  c.restore();
}
// ─── Collectors ────────────────────────────────────────────────────────────────────────────────────────────────
type Face = 'calm' | 'focus' | 'wow' | 'joy' | 'sad';
/** Hand position and pole angle (0 = straight ahead, negative = up), in facing-right space with feet at the origin. */
interface NetPose { hand: [number, number]; ang: number; crouch: number; lean: number; face: Face; arc?: boolean }
const IDLE: NetPose = { hand: [6, -19], ang: -1.05, crouch: 0, lean: 0, face: 'calm' };
/** Wind-up → snap (with a swing trail) → hold, per habitat: over the shoulder, across the trunk, down onto the ground. */
const SWINGS: Record<string, NetPose[]> = {
  air: [{ hand: [0, -25], ang: -2.3, crouch: 0, lean: -2, face: 'focus' }, { hand: [8, -22], ang: -.9, crouch: 0, lean: 2, face: 'wow', arc: true }, { hand: [9, -20], ang: -.6, crouch: 0, lean: 2, face: 'focus' }],
  tree: [{ hand: [2, -21], ang: -1.7, crouch: 1, lean: -1, face: 'focus' }, { hand: [10, -18], ang: -.3, crouch: 1, lean: 3, face: 'wow', arc: true }, { hand: [10, -18], ang: -.18, crouch: 1, lean: 3, face: 'focus' }],
  ground: [{ hand: [3, -23], ang: -1.8, crouch: 2, lean: -1, face: 'focus' }, { hand: [9, -12], ang: .55, crouch: 6, lean: 4, face: 'wow', arc: true }, { hand: [9, -11], ang: .72, crouch: 6, lean: 4, face: 'focus' }]
};
function poseOf(p: Collector, tick: number): NetPose {
  const elapsed = tick - p.since, key = SWINGS[p.env][elapsed < 4 ? 0 : elapsed < 8 ? 1 : 2];
  if (p.phase === 'stun') return elapsed >= SWING_TICKS ? { ...key, face: 'sad' } : key;
  if (p.phase === 'catch') return elapsed >= 8 ? { ...key, face: p.t < 12 ? 'joy' : 'wow' } : key;
  if (p.phase === 'result') return { hand: [4, -27], ang: -1.45, crouch: 0, lean: -1, face: 'joy' };
  if (p.sneak) return { hand: [7, -14], ang: -.42, crouch: 4, lean: 3, face: 'focus' };
  return p.walking ? { ...IDLE, crouch: Math.floor(tick / 8) % 2 ? .8 : 0 } : IDLE;
}
function face(c: CanvasRenderingContext2D, hx: number, hy: number, r: number, f: Face, ink: string, blink: boolean): void {
  const ex = [hx + r * .1, hx + r * .55], ey = hy + r * .05;
  c.fillStyle = BLUSH; for (const bx of [hx - r * .2, hx + r * .8]) { c.beginPath(); c.ellipse(bx, hy + r * .42, 1.9, 1.1, 0, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 1.1;
  for (const x of ex) {
    c.beginPath();
    if (f === 'joy') { c.arc(x, ey + .8, 1.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    else if (f === 'sad') { c.moveTo(x - 1.3, ey - .2); c.lineTo(x + 1.3, ey + .6); c.stroke(); }
    else if (blink && f === 'calm') { c.moveTo(x - 1.2, ey); c.lineTo(x + 1.2, ey); c.stroke(); }
    else { c.arc(x, ey, f === 'wow' ? 1.5 : f === 'focus' ? .9 : 1.15, 0, Math.PI * 2); c.fill(); }
  }
  const mx = hx + r * .35, my = hy + r * .5;
  c.beginPath();
  if (f === 'wow') c.arc(mx, my + .5, 1.2, 0, Math.PI * 2);
  else if (f === 'joy') { c.arc(mx, my - .6, 2, .15 * Math.PI, .85 * Math.PI); c.closePath(); c.fill(); }
  else if (f === 'sad') c.arc(mx, my + 1.2, 1.5, 1.2 * Math.PI, 1.8 * Math.PI);
  else if (f === 'focus') { c.moveTo(mx - 1.3, my); c.lineTo(mx + 1.3, my); }
  else c.arc(mx, my - 1.3, 1.5, .2 * Math.PI, .8 * Math.PI);
  c.stroke();
}
function head(c: CanvasRenderingContext2D, hx: number, hy: number, f: Face, ink: string, blink: boolean): void {
  const r = 8.5;
  c.beginPath(); c.arc(hx, hy, r + 2, 0, Math.PI * 2); c.fillStyle = HALO; c.fill();
  c.beginPath(); c.arc(hx, hy, r, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
  for (let i = 0; i < 2; i++) { c.beginPath(); c.arc(hx + jitter(1), hy + jitter(1), r, 0, Math.PI * 2); c.strokeStyle = ink; c.lineWidth = 1.9; c.stroke(); }
  face(c, hx, hy, r, f, ink, blink);
  // Explorer's bucket hat with the seat's coloured band.
  c.save(); c.translate(hx, hy - r * .6); c.rotate(.06);
  const crown = new Path2D(); crown.moveTo(-r * .78, .5); crown.bezierCurveTo(-r * .8, -r * 1.15, r * .8, -r * 1.15, r * .78, .5); crown.closePath();
  c.lineWidth = 4.5; c.strokeStyle = HALO; c.stroke(crown); c.fillStyle = HAT; c.fill(crown);
  c.beginPath(); c.rect(-r * .78, -r * .5, r * 1.56, r * .3); c.fillStyle = ink; c.fill();
  c.lineWidth = 1.7; c.strokeStyle = ink; c.stroke(crown);
  roughStroke(c, -r * 1.15, .6, r * 1.3, .1, 1.9, ink, HALO);
  c.restore();
}
/** The sparse-mesh net: a hoop on a pole, cross-hatched inside. Returns the hoop centre in local space. */
function net(c: CanvasRenderingContext2D, pose: NetPose, ink: string): [number, number] {
  const [gx, gy] = pose.hand, dx = Math.cos(pose.ang), dy = Math.sin(pose.ang);
  const hx = gx + dx * (POLE + HOOP), hy = gy + dy * (POLE + HOOP);
  if (pose.arc) { c.save(); c.globalAlpha = .2; c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.arc(gx, gy, POLE + HOOP, pose.ang - 1.3, pose.ang - .1); c.stroke(); c.restore(); }
  roughStroke(c, gx - dx * 5, gy - dy * 5, gx + dx * POLE, gy + dy * POLE, 1.8, BROWN, HALO);
  const hoop = new Path2D(); hoop.ellipse(hx, hy, HOOP, HOOP * .9, pose.ang, 0, Math.PI * 2);
  c.lineWidth = 4.5; c.strokeStyle = HALO; c.stroke(hoop);
  c.save(); c.clip(hoop); c.fillStyle = 'rgba(255,254,250,.35)'; c.fillRect(hx - 8, hy - 8, 16, 16);
  c.strokeStyle = MUTED; c.lineWidth = .55; c.beginPath();
  for (let k = -8; k <= 8; k += 3) { c.moveTo(hx + k - 8, hy - 8); c.lineTo(hx + k + 8, hy + 8); c.moveTo(hx + k + 8, hy - 8); c.lineTo(hx + k - 8, hy + 8); }
  c.stroke(); c.restore();
  c.lineWidth = 1.5; c.strokeStyle = ink; c.stroke(hoop);
  return [hx, hy];
}
const EMOTE_FACES: Face[] = ['joy', 'joy', 'joy', 'wow', 'joy', 'sad', 'sad', 'joy'];
function person(c: CanvasRenderingContext2D, p: Collector, x: number, tick: number, local: boolean, hideEmotes: boolean): void {
  const ink = SEAT_INK[p.seat] ?? INK, pose = poseOf(p, tick), y = GROUND_Y;
  const emoting = !hideEmotes && p.emojiUntil > tick, showing = !!p.shown && p.showUntil > tick, calm = p.phase === 'free';
  const look: Face = emoting && calm ? EMOTE_FACES[p.emoji] ?? pose.face : showing && calm ? 'joy' : pose.face;
  c.save(); c.translate(x, y); c.scale(p.facing, 1); c.lineCap = c.lineJoin = 'round';
  const hip = -12 + pose.crouch, step = p.walking ? (Math.floor((tick + p.seat * 5) / (p.sneak ? 12 : 7)) % 2 ? 1 : -1) : 0;
  roughLimb(c, -1.5, hip, -2 - step * 2.5 + pose.crouch * .3, hip / 2 + 1, -3 - step * 4, 0, 2.3, ink, HALO);
  roughLimb(c, 1.5, hip, 2 + step * 2.5 + pose.crouch * .6, hip / 2 + 1, 3 + step * 4, 0, 2.3, ink, HALO);
  const body = new Path2D(); body.ellipse(pose.lean * .4, hip - 5.5, 5.4, 7, pose.lean * .06, 0, Math.PI * 2);
  c.lineWidth = 5; c.strokeStyle = HALO; c.stroke(body); c.fillStyle = PAPER; c.fill(body); c.lineWidth = 2.1; c.strokeStyle = ink; c.stroke(body);
  const sx = pose.lean * .5 + 2, sy = hip - 9;
  const [hx, hy] = net(c, pose, ink);
  roughLimb(c, sx, sy, (sx + pose.hand[0]) / 2 + 1, (sy + pose.hand[1]) / 2 + 3, pose.hand[0], pose.hand[1], 2.1, ink, HALO);
  head(c, pose.lean * 1.1 + 1, hip - 20, look, ink, tick % 190 < 6);
  // The catch wriggles inside the hoop; a 금색 one leaks light through the mesh just before the reveal.
  const bug = (p.phase === 'catch' || p.phase === 'result') && p.bug ? SPECIES_BY_ID.get(p.bug.speciesId) : undefined;
  if (bug && p.bug) {
    if (p.bug.golden && p.phase === 'catch' && p.t < 18) {
      c.save(); c.strokeStyle = GOLD; c.lineWidth = 1.2; c.globalAlpha = .9;
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + tick * .05; c.beginPath(); c.moveTo(hx + Math.cos(a) * 7, hy + Math.sin(a) * 7); c.lineTo(hx + Math.cos(a) * 12, hy + Math.sin(a) * 12); c.stroke(); }
      c.restore();
    }
    drawInsect(c, bug, hx, hy, 9, { pose: 'move', frame: tick, golden: p.phase === 'result' && p.bug.golden }, false, p.phase === 'catch' ? (Math.floor(tick / 4) % 2 ? .3 : -.3) : 0);
  }
  c.restore();
  if (p.phase === 'result') for (const [dx, dy, r] of [[-13, -46, 2.6], [-19, -32, 1.6], [16, -40, 2]] as const) star(c, x + dx, y + dy, r, p.bug?.golden ? GOLD : BROWN);
  if (local) line(c, x - 7, y + 7, x + 7, y + 7, ink, 1.6);
  label(c, local ? `나 · P${p.seat + 1}` : `${p.name.slice(0, 5)} · P${p.seat + 1}`, x, y + 16, 7, ink, local ? 'bold ' : '');
  const caught = p.caught && p.caughtUntil > tick && p.phase !== 'result' ? p.caught : undefined;
  if (showing) bragCard(c, p.shown!, x, y - 50, SHOW_TICKS - (p.showUntil - tick), ink);
  else if (caught) caughtBubble(c, caught, x, y - 52, p.caughtUntil - tick, ink);
  if (emoting) emoteBubble(c, p.emoji, showing ? x + 28 : x + 11, showing ? y - 103 : y - 58, EMOTE_TICKS - (p.emojiUntil - tick), ink);
}
function bubbleBox(c: CanvasRenderingContext2D, w: number, h: number, ink: string, border = ink): void {
  const r = 6, box = new Path2D();
  box.moveTo(0, -h); box.arcTo(w / 2, -h, w / 2, 0, r); box.arcTo(w / 2, 0, -w / 2, 0, r); box.lineTo(3, 0); box.lineTo(0, 5); box.lineTo(-3, 0); box.arcTo(-w / 2, 0, -w / 2, -h, r); box.arcTo(-w / 2, -h, w / 2, -h, r); box.closePath();
  c.lineWidth = 4.5; c.strokeStyle = HALO; c.stroke(box); c.fillStyle = PAPER; c.fill(box); c.lineWidth = border === ink ? 1.3 : 2; c.strokeStyle = border; c.stroke(box);
}
/** Small bubble with the insect someone just caught, so the whole field sees it. */
function caughtBubble(c: CanvasRenderingContext2D, bug: InsectCatch, x: number, y: number, left: number, ink: string): void {
  const s = SPECIES_BY_ID.get(bug.speciesId); if (!s) return;
  c.save(); c.translate(x, y); c.globalAlpha = Math.min(1, left / 20);
  bubbleBox(c, 26, 22, ink, bug.golden ? GOLD : ink);
  drawInsect(c, s, 0, -11, 17, { golden: bug.golden }, SIDE_VIEW.has(s.plan));
  c.restore();
}
function emoteBubble(c: CanvasRenderingContext2D, kind: number, x: number, y: number, age: number, ink: string): void {
  const left = EMOTE_TICKS - age, s = age < 9 ? [.3, .7, 1.05, 1.2, 1.15, 1.08, 1.02, .99, 1][age] : 1, fade = left < 18 ? left / 18 : 1;
  c.save(); c.translate(x, y - (1 - fade) * 6); c.scale(s, s); c.globalAlpha = fade;
  bubbleBox(c, 22, 20, ink); c.translate(0, -10); c.scale(.92, .92); drawEmoteIcon(c, kind, age, ink);
  c.restore();
}
/** Trophy card held over the head when someone brags: rarity ribbon, the insect, its name; gold-trimmed for 금색. */
function bragCard(c: CanvasRenderingContext2D, bug: InsectCatch, x: number, y: number, age: number, ink: string): void {
  const s = SPECIES_BY_ID.get(bug.speciesId); if (!s) return;
  const rc = RARITY_INK[s.rarity], left = SHOW_TICKS - age, fade = left < 24 ? left / 24 : 1, pop = [.2, .5, .85, 1.12, 1.2, 1.14, 1.06, 1, .97, 1][age] ?? 1;
  c.save(); c.translate(x, y - (1 - fade) * 10); c.scale(pop, pop); c.globalAlpha = fade;
  const card = new Path2D(); card.roundRect(-22, -52, 44, 46, 6);
  c.lineWidth = 4.5; c.strokeStyle = HALO; c.stroke(card); c.fillStyle = PAPER; c.fill(card);
  c.save(); c.clip(card); c.fillStyle = rc; c.fillRect(-22, -52, 44, 9); c.restore();
  c.lineWidth = bug.golden ? 2.2 : 1.4; c.strokeStyle = bug.golden ? GOLD : ink; c.stroke(card);
  drawInsect(c, s, 0, -27, 22, { golden: bug.golden, frame: age }, SIDE_VIEW.has(s.plan));
  c.font = 'bold 6px Menlo, sans-serif'; c.textAlign = 'center'; c.fillStyle = PAPER; c.fillText(bug.golden ? `금색 · ${RARITIES[s.rarity]}` : RARITIES[s.rarity], 0, -45.5);
  c.fillStyle = ink; c.fillText(`${s.name} ${(bug.sizeMm / 10).toFixed(1)}cm`, 0, -10);
  if (bug.golden) for (const [sx, sy] of [[-17, -38], [17, -20], [-15, -16]]) star(c, sx, sy, 1.6, GOLD);
  c.restore();
}
export interface FieldView { previewX?: number; hideEmotes: boolean; solo: boolean }
export function drawInsectField(c: CanvasRenderingContext2D, view: Viewport, w: InsectWorld, myId: string, opts: FieldView): void {
  c.setTransform(view.pixelRatio, 0, 0, view.pixelRatio, 0, 0); c.clearRect(0, 0, view.width, view.height);
  const scale = Math.min(view.width / 320, view.height / 280); c.save(); c.translate((view.width - 320 * scale) / 2, (view.height - 280 * scale) / 2); c.scale(scale, scale); beginSketchFrame();
  scenery(c);
  const me = w.players.find(p => p.id === myId), mine = me && opts.previewX !== undefined ? { ...me, x: opts.previewX } : me;
  // Back to front: other walkers, then insects (ground ones last so tufts can overlap them), then me, my net and my ring.
  for (const p of w.players) if (p.id !== myId) person(c, p, fx(p.x), w.tick, false, opts.hideEmotes);
  for (const b of [...w.bugs].sort((a, b) => Number(envOf(a) === 'ground') - Number(envOf(b) === 'ground'))) drawBug(c, b, w.tick);
  if (mine) person(c, mine, fx(mine.x), w.tick, true, false);
  const target = mine && mine.phase === 'free' ? w.bugs.filter(b => inReach(mine, b)).sort((a, b) => Math.abs(a.x - netX(mine)) - Math.abs(b.x - netX(mine)))[0] : undefined;
  if (target) ring(c, target, w.tick);
  const noticing = !!me && me.noticeUntil > w.tick && !!me.notice;
  const status = !me ? '자리를 기다리는 중…' : noticing ? me.notice : me.phase === 'catch' ? '잡았다!' : me.phase === 'result' ? '수집함에 저장 중…' : target ? '고리가 작아질 때 Space!' : w.bugs.length ? '곤충에게 살금살금 다가가 보세요' : '곤충을 기다리는 중…';
  label(c, status, 160, 214, 9, noticing ? RED : INK);
  label(c, '←→ 걷기 · Shift 살금살금 · Space 덮기', 160, 250, 8);
  label(c, opts.solo ? 'C 수집함' : 'E 감정표현 · C 수집함 · B 자랑', 160, 265, 8);
  c.restore();
}
