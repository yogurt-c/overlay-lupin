import { GROUND_Y } from '../../lib/ballsport/field.js';
import { jitter, roughSegment, roughStroke } from '../../lib/sketch.js';
import { arcFor } from './poses.js';
import { FX_LIFE, WALL_LEFT, WALL_RIGHT } from './field.js';
import type { FenceFx } from './engine.js';

const HALO = 'rgba(255,255,255,0.92)';
/** Where the distance marks sit, either side of centre — this is a game about reach. */
const RANGE_MARKS = [-80, -40, 40, 80];

/** The dojo: a floor only as wide as the fight, a centre line, and two walls. */
export function drawDojo(ctx: CanvasRenderingContext2D, centreX: number, color: string): void {
  const dash = 10;
  const stride = 18;
  for (let x = WALL_LEFT; x < WALL_RIGHT; x += stride) {
    roughSegment(ctx, x, GROUND_Y, Math.min(x + dash, WALL_RIGHT), GROUND_Y, 2, color, 1);
  }

  ctx.save();
  ctx.globalAlpha = 0.45;
  for (let y = GROUND_Y - 60; y < GROUND_Y; y += 12) {
    roughSegment(ctx, centreX, y, centreX, y + 6, 1.4, color, 1);
  }
  ctx.globalAlpha = 0.3;
  for (const d of RANGE_MARKS) {
    roughSegment(ctx, centreX + d, GROUND_Y + 3, centreX + d, GROUND_Y + 8, 1.4, color, 1);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.22;
  for (const wall of [WALL_LEFT, WALL_RIGHT]) {
    roughStroke(ctx, wall, GROUND_Y, wall, GROUND_Y - 150, 2, color, HALO);
  }
  ctx.restore();
}

/** The trail behind a live blade — the visual payoff for committing to a swing. */
export function drawSwingArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: 1 | -1,
  pose: string,
  color: string
): void {
  const arc = arcFor(pose);
  if (!arc) return;
  const [cx, cy, r, a0, a1] = arc;

  ctx.save();
  ctx.translate(x, GROUND_Y + y);
  ctx.scale(facing, 1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.globalAlpha = 0.1;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.9, a0, a1);
  ctx.stroke();
  ctx.restore();
}

/** Steel on steel: a white flash with a few hard radiating lines. */
function drawClash(ctx: CanvasRenderingContext2D, strength: number, color: string): void {
  ctx.globalAlpha = 0.9 * strength;
  ctx.beginPath();
  ctx.arc(0, 0, 7 * strength + 2, 0, Math.PI * 2);
  ctx.fillStyle = HALO;
  ctx.fill();
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r1 = 9 + (0.5 + jitter(1)) * 12 * strength;
    roughSegment(ctx, Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * r1, Math.sin(a) * r1, 1.8, color, 1);
  }
}

/** A cut landing: ink thrown off the contact point. */
function drawSplash(ctx: CanvasRenderingContext2D, strength: number, color: string): void {
  ctx.globalAlpha = 0.85 * strength;
  ctx.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.15 - (0.5 + jitter(1)) * Math.PI * 0.7;
    const d = 6 + (0.5 + jitter(1)) * 26 * strength;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d, 1 + (0.5 + jitter(1)) * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.5 * strength;
  roughSegment(ctx, -3, -2, 12, -16, 2, color, 1);
}

/** Draws every live mark. `life` runs down from FX_LIFE, so each one fades on its own. */
export function drawFx(ctx: CanvasRenderingContext2D, fx: FenceFx[], color: string): void {
  for (const f of fx) {
    const strength = Math.max(0.15, f.life / FX_LIFE);
    ctx.save();
    ctx.translate(f.x, GROUND_Y + f.y);
    if (f.kind === 'clash') drawClash(ctx, strength, color);
    else drawSplash(ctx, strength, color);
    ctx.restore();
  }
}
