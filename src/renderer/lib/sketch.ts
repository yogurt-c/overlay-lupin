/**
 * Hand-drawn "ink on paper" rendering primitives, shared by any game that
 * wants the same sketchy look (currently the soccer pitch/figures; intended
 * to be reused by future games rather than redrawn per genre).
 *
 * The sketch look comes from jittering every stroke. Doing that with
 * Math.random() on every frame makes the whole scene vibrate at 60Hz, which
 * both looks broken and gives away that something is animating. Instead the
 * jitter is driven by a seeded generator that is reset to the same value for
 * every frame within a "boil" interval, so the drawing holds still and only
 * redraws itself a few times a second, like ink on paper.
 */
let rngState = 1;
let frameSeed = 1;

/** Advances the sketch's jitter pattern. Call this only a handful of times per second. */
export function advanceSketchSeed(): void {
  frameSeed = (frameSeed * 1664525 + 1013904223) >>> 0 || 1;
}

/** Resets the jitter generator so this frame reproduces the previous one exactly. */
export function beginSketchFrame(): void {
  rngState = frameSeed || 1;
}

function rnd(): number {
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  rngState >>>= 0;
  return rngState / 4294967296;
}

export function jitter(amount: number): number {
  return (rnd() - 0.5) * amount;
}

export function roughSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  passes: number
): void {
  for (let p = 0; p < passes; p++) {
    const j = 1.3;
    ctx.beginPath();
    ctx.moveTo(x1 + jitter(j), y1 + jitter(j));
    ctx.quadraticCurveTo(
      (x1 + x2) / 2 + jitter(j * 1.3),
      (y1 + y2) / 2 + jitter(j * 1.3),
      x2 + jitter(j),
      y2 + jitter(j)
    );
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** A hand-drawn line with a white halo behind it, so it stays legible over any desktop. */
export function roughStroke(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  color: string,
  halo: string
): void {
  roughSegment(ctx, x1, y1, x2, y2, width + 4.5, halo, 1);
  roughSegment(ctx, x1, y1, x2, y2, width, color, 2);
}

export function roughLimb(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  width: number,
  color: string,
  halo: string
): void {
  roughSegment(ctx, ax, ay, bx, by, width + 4.5, halo, 1);
  roughSegment(ctx, bx, by, cx, cy, width + 4.5, halo, 1);
  roughSegment(ctx, ax, ay, bx, by, width, color, 2);
  roughSegment(ctx, bx, by, cx, cy, width, color, 2);
}
