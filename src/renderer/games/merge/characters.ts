/**
 * The eleven round animals, drawn in a unit circle (radius 1) so one routine
 * serves every size. The body is always that circle — the physics shape — and
 * ears, tails and spikes are decoration that may poke slightly past it.
 *
 * Fills are authored as colours and flattened to a warm ink-on-paper grey ramp
 * at load, so the art reads as the same sketchbook as 동물탑.
 */

type Ctx = CanvasRenderingContext2D;

export const INK = '#2a2622';
export const PAPER = '#fffdf8';
const PAPER_RGB = [255, 253, 248], INK_RGB = [42, 38, 34];

/** Lightness kept (contrast nudged) and mapped onto the ink→paper ramp. */
function tone(hex: string): string {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const l = Math.min(1, Math.max(0, ((0.299 * r + 0.587 * g + 0.114 * b) / 255 - 0.5) * 1.35 + 0.6));
  return `rgb(${INK_RGB.map((v, i) => Math.round(v + (PAPER_RGB[i] - v) * l)).join(',')})`;
}

const C = {
  pillbug: tone('#b9c3cf'), pillbugShell: tone('#9aa7b6'),
  hedgehog: tone('#f1dcc0'), spikes: tone('#8a6a4f'),
  squirrel: tone('#f2a65e'), squirrelTail: tone('#d98a45'), cheeks: tone('#fbe2c4'), squirrelNose: tone('#5a3a2a'),
  rabbit: tone('#fde7ee'), innerEar: tone('#f4b3c2'), pinkNose: tone('#e98aa0'),
  cat: tone('#f7d774'), catStripe: tone('#d29a2e'),
  penguin: tone('#34404f'), beak: tone('#f2a33a'),
  dog: tone('#ead2ad'), dogPatch: tone('#b88457'), dogEar: tone('#a8754d'), muzzle: tone('#fbf1e1'), tongue: tone('#ec8a98'),
  wool: tone('#f7f3e6'), sheepFace: tone('#4a4440'), sheepNose: tone('#e9a7b2'), sheepMouth: tone('#e8ded2'),
  pandaBlack: tone('#2c2c2c'),
  bear: tone('#b07b52'), bearInner: tone('#e8c3a0'), bearMuzzle: tone('#ecd2b5'), bearNose: tone('#3a2a22'),
  elephant: tone('#a9c4dc'), elephantEar: tone('#95b1cc'), elephantInner: tone('#f3c1cc')
};

/** One ink pixel in unit-circle space; set per draw so lines stay crisp at every radius. */
let U = 0.05;

function pen(ctx: Ctx, w = 1, color = INK): void {
  ctx.strokeStyle = color; ctx.lineWidth = U * w; ctx.lineCap = ctx.lineJoin = 'round';
}
function shape(ctx: Ctx, build: () => void, fill: string | null, w = 1): void {
  ctx.beginPath(); build();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (w) { pen(ctx, w); ctx.stroke(); }
}
const circle = (ctx: Ctx, x: number, y: number, r: number) => () => ctx.arc(x, y, r, 0, Math.PI * 2);
const oval = (ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0) => () => ctx.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
const head = (ctx: Ctx, fill: string): void => shape(ctx, circle(ctx, 0, 0, 1), fill, 1.4);
function outlineHead(ctx: Ctx): void { ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); pen(ctx, 1.4); ctx.stroke(); }
function clipHead(ctx: Ctx, draw: () => void): void {
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.clip(); draw(); ctx.restore();
}
function eyes(ctx: Ctx, dx: number, y: number): void {
  for (const k of [-1, 1]) {
    shape(ctx, oval(ctx, k * dx, y, 0.085, 0.1), INK, 0);
    shape(ctx, circle(ctx, k * dx - 0.025, y - 0.035, 0.03), PAPER, 0);
  }
}
/** Manga-style cheek hatching stands in for a blush. */
function blush(ctx: Ctx, dx: number, y: number): void {
  pen(ctx, 0.8); ctx.beginPath();
  for (const k of [-1, 1]) for (const o of [-0.07, 0, 0.07]) {
    ctx.moveTo(k * dx + o + 0.025, y - 0.045); ctx.lineTo(k * dx + o - 0.025, y + 0.045);
  }
  ctx.stroke();
}
function smile(ctx: Ctx, y: number, w = 0.09, color = INK): void {
  pen(ctx, 1, color); ctx.beginPath();
  ctx.arc(-w / 2, y, w / 2, 0.15, Math.PI - 0.15); ctx.moveTo(w, y); ctx.arc(w / 2, y, w / 2, 0.15, Math.PI - 0.15); ctx.stroke();
}
function triangle(ctx: Ctx, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  return () => { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); };
}

const DRAW: ((ctx: Ctx) => void)[] = [
  // 콩벌레: rolled-up shell bands, face peeking below
  ctx => {
    pen(ctx); ctx.beginPath();
    ctx.moveTo(-0.22, -0.92); ctx.quadraticCurveTo(-0.32, -1.18, -0.5, -1.16);
    ctx.moveTo(0.22, -0.92); ctx.quadraticCurveTo(0.32, -1.18, 0.5, -1.16); ctx.stroke();
    head(ctx, C.pillbug);
    clipHead(ctx, () => {
      shape(ctx, () => { ctx.moveTo(-1, -0.05); ctx.quadraticCurveTo(0, -0.3, 1, -0.05); ctx.lineTo(1, -1); ctx.lineTo(-1, -1); ctx.closePath(); }, C.pillbugShell, 0);
      for (const y of [-0.62, -0.36, -0.05]) { pen(ctx); ctx.beginPath(); ctx.moveTo(-1, y); ctx.quadraticCurveTo(0, y - 0.25, 1, y); ctx.stroke(); }
    });
    outlineHead(ctx);
    eyes(ctx, 0.28, 0.3); blush(ctx, 0.5, 0.48); smile(ctx, 0.5);
  },
  // 고슴도치: spiky cap over a soft face
  ctx => {
    head(ctx, C.hedgehog);
    shape(ctx, () => {
      const a0 = Math.PI + 0.45, a1 = Math.PI * 2 - 0.45, n = 13;
      for (let i = 0; i <= n * 2; i++) {
        const a = a0 + (a1 - a0) * i / (n * 2), r = i % 2 ? 1.14 : 0.93;
        if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.quadraticCurveTo(0, -0.05, Math.cos(a0) * 0.93, Math.sin(a0) * 0.93); ctx.closePath();
    }, C.spikes, 1.2);
    eyes(ctx, 0.3, 0.22); blush(ctx, 0.52, 0.42);
    shape(ctx, oval(ctx, 0, 0.42, 0.09, 0.065), INK, 0); smile(ctx, 0.56, 0.08);
  },
  // 다람쥐: tufted ears, puffy cheeks, buck teeth, tail behind
  ctx => {
    shape(ctx, oval(ctx, 0.78, -0.25, 0.38, 0.62, 0.45), C.squirrelTail, 1.2);
    pen(ctx, 0.8); ctx.beginPath(); ctx.moveTo(0.85, -0.6); ctx.quadraticCurveTo(0.7, -0.3, 0.9, 0.05); ctx.stroke();
    for (const k of [-1, 1]) {
      shape(ctx, triangle(ctx, k * 0.35, -0.85, k * 0.62, -1.2, k * 0.78, -0.62), C.squirrel, 1.2);
      pen(ctx); ctx.beginPath();
      ctx.moveTo(k * 0.62, -1.2); ctx.lineTo(k * 0.58, -1.32); ctx.moveTo(k * 0.62, -1.2); ctx.lineTo(k * 0.7, -1.3); ctx.stroke();
    }
    head(ctx, C.squirrel);
    clipHead(ctx, () => { for (const k of [-1, 1]) shape(ctx, oval(ctx, k * 0.4, 0.42, 0.36, 0.3), C.cheeks, 1); });
    outlineHead(ctx);
    eyes(ctx, 0.32, -0.02);
    shape(ctx, oval(ctx, 0, 0.24, 0.08, 0.055), C.squirrelNose, 0);
    smile(ctx, 0.32, 0.08);
    shape(ctx, () => { ctx.rect(-0.085, 0.38, 0.08, 0.13); ctx.rect(0.005, 0.38, 0.08, 0.13); }, PAPER, 0.9);
  },
  // 토끼: long ears, pink nose
  ctx => {
    for (const k of [-1, 1]) {
      shape(ctx, oval(ctx, k * 0.32, -0.95, 0.2, 0.42, k * 0.15), C.rabbit, 1.2);
      shape(ctx, oval(ctx, k * 0.32, -0.92, 0.085, 0.3, k * 0.15), C.innerEar, 0);
    }
    head(ctx, C.rabbit);
    eyes(ctx, 0.33, 0.08); blush(ctx, 0.55, 0.3);
    shape(ctx, triangle(ctx, -0.08, 0.25, 0.08, 0.25, 0, 0.33), C.pinkNose, 0.8);
    pen(ctx); ctx.beginPath(); ctx.moveTo(0, 0.33); ctx.lineTo(0, 0.42); ctx.stroke(); smile(ctx, 0.42, 0.1);
  },
  // 고양이: pointed ears, forehead stripes, whiskers
  ctx => {
    for (const k of [-1, 1]) {
      shape(ctx, triangle(ctx, k * 0.88, -0.38, k * 0.78, -1.12, k * 0.25, -0.9), C.cat, 1.2);
      shape(ctx, triangle(ctx, k * 0.74, -0.5, k * 0.7, -0.95, k * 0.4, -0.84), C.innerEar, 0);
    }
    head(ctx, C.cat);
    pen(ctx, 2.2, C.catStripe); ctx.beginPath();
    for (const x of [-0.16, 0, 0.16]) { ctx.moveTo(x, -0.9); ctx.lineTo(x * 0.9, -0.66); }
    ctx.moveTo(-0.98, 0); ctx.lineTo(-0.78, 0.02); ctx.moveTo(0.98, 0); ctx.lineTo(0.78, 0.02); ctx.stroke();
    eyes(ctx, 0.34, 0.06); blush(ctx, 0.56, 0.3);
    shape(ctx, triangle(ctx, -0.07, 0.24, 0.07, 0.24, 0, 0.31), C.pinkNose, 0.8);
    smile(ctx, 0.33, 0.1);
    pen(ctx, 0.9); ctx.beginPath();
    for (const k of [-1, 1]) { ctx.moveTo(k * 0.42, 0.3); ctx.lineTo(k * 1.08, 0.2); ctx.moveTo(k * 0.42, 0.4); ctx.lineTo(k * 1.06, 0.46); }
    ctx.stroke();
  },
  // 펭귄: dark head, white face mask, beak
  ctx => {
    head(ctx, C.penguin);
    clipHead(ctx, () => {
      ctx.fillStyle = PAPER; ctx.beginPath();
      ctx.arc(-0.3, 0.05, 0.42, 0, Math.PI * 2); ctx.arc(0.3, 0.05, 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 0.45, 0.62, 0.5, 0, 0, Math.PI * 2); ctx.fill();
    });
    outlineHead(ctx);
    pen(ctx, 1.4); ctx.beginPath(); ctx.moveTo(0, -1); ctx.quadraticCurveTo(0.08, -1.2, 0.2, -1.12); ctx.stroke();
    eyes(ctx, 0.3, 0.02); blush(ctx, 0.52, 0.28);
    shape(ctx, triangle(ctx, -0.15, 0.2, 0.15, 0.2, 0, 0.4), C.beak, 1);
  },
  // 강아지: floppy ears, eye patch, muzzle, tongue
  ctx => {
    head(ctx, C.dog);
    clipHead(ctx, () => shape(ctx, oval(ctx, 0.32, -0.04, 0.27, 0.25), C.dogPatch, 0));
    outlineHead(ctx);
    for (const k of [-1, 1]) shape(ctx, oval(ctx, k * 0.86, -0.12, 0.26, 0.5, -k * 0.35), C.dogEar, 1.2);
    shape(ctx, oval(ctx, 0, 0.45, 0.42, 0.3), C.muzzle, 1);
    eyes(ctx, 0.32, -0.02);
    shape(ctx, oval(ctx, 0, 0.66, 0.1, 0.12), C.tongue, 0.9);
    shape(ctx, oval(ctx, 0, 0.32, 0.13, 0.09), INK, 0);
    pen(ctx); ctx.beginPath(); ctx.moveTo(0, 0.4); ctx.lineTo(0, 0.5); ctx.stroke(); smile(ctx, 0.5, 0.12);
  },
  // 양: scalloped wool, dark face
  ctx => {
    shape(ctx, circle(ctx, 0, 0, 0.9), C.wool, 0);
    shape(ctx, () => {
      const n = 14;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; ctx.arc(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0.2, a - 1.25, a + 1.25); }
      ctx.closePath();
    }, C.wool, 1.3);
    for (const k of [-1, 1]) shape(ctx, oval(ctx, k * 0.5, 0.08, 0.2, 0.09, k * 0.35), C.sheepFace, 1);
    shape(ctx, oval(ctx, 0, 0.2, 0.36, 0.44), C.sheepFace, 1.2);
    for (const [x, y] of [[-0.2, -0.24], [0, -0.3], [0.2, -0.24]]) shape(ctx, circle(ctx, x, y, 0.15), C.wool, 1);
    for (const k of [-1, 1]) {
      shape(ctx, circle(ctx, k * 0.16, 0.12, 0.075), PAPER, 0);
      shape(ctx, circle(ctx, k * 0.16, 0.13, 0.04), INK, 0);
    }
    shape(ctx, oval(ctx, 0, 0.36, 0.07, 0.05), C.sheepNose, 0);
    smile(ctx, 0.43, 0.09, C.sheepMouth);
  },
  // 판다: black ears, tilted eye patches
  ctx => {
    for (const k of [-1, 1]) shape(ctx, circle(ctx, k * 0.66, -0.7, 0.28), C.pandaBlack, 1.2);
    head(ctx, PAPER);
    for (const k of [-1, 1]) {
      shape(ctx, oval(ctx, k * 0.34, 0.04, 0.21, 0.28, -k * 0.55), C.pandaBlack, 0);
      shape(ctx, circle(ctx, k * 0.3, 0, 0.085), PAPER, 0);
      shape(ctx, circle(ctx, k * 0.29, 0.01, 0.045), INK, 0);
    }
    blush(ctx, 0.6, 0.36);
    shape(ctx, oval(ctx, 0, 0.32, 0.1, 0.07), INK, 0); smile(ctx, 0.42, 0.1);
  },
  // 곰: round ears, light muzzle
  ctx => {
    for (const k of [-1, 1]) {
      shape(ctx, circle(ctx, k * 0.68, -0.68, 0.27), C.bear, 1.2);
      shape(ctx, circle(ctx, k * 0.68, -0.68, 0.14), C.bearInner, 0);
    }
    head(ctx, C.bear);
    shape(ctx, oval(ctx, 0, 0.36, 0.36, 0.28), C.bearMuzzle, 1);
    eyes(ctx, 0.34, -0.04); blush(ctx, 0.58, 0.2);
    shape(ctx, oval(ctx, 0, 0.25, 0.12, 0.08), C.bearNose, 0);
    pen(ctx); ctx.beginPath(); ctx.moveTo(0, 0.32); ctx.lineTo(0, 0.42); ctx.stroke(); smile(ctx, 0.42, 0.12);
  },
  // 코끼리: big ears, curling trunk
  ctx => {
    for (const k of [-1, 1]) {
      shape(ctx, oval(ctx, k * 0.82, 0.02, 0.4, 0.58, k * 0.15), C.elephantEar, 1.2);
      shape(ctx, oval(ctx, k * 0.86, 0.04, 0.24, 0.38, k * 0.15), C.elephantInner, 0);
    }
    head(ctx, C.elephant);
    pen(ctx); ctx.beginPath();
    for (const x of [-0.08, 0, 0.08]) { ctx.moveTo(x, -1); ctx.quadraticCurveTo(x * 2, -1.12, x * 2.4, -1.14); }
    ctx.stroke();
    eyes(ctx, 0.36, -0.08); blush(ctx, 0.56, 0.2);
    const trunk = () => { ctx.beginPath(); ctx.moveTo(0, 0.1); ctx.bezierCurveTo(0, 0.55, 0.02, 0.78, 0.3, 0.76); };
    trunk(); ctx.strokeStyle = INK; ctx.lineWidth = 0.27 + U * 2.4; ctx.lineCap = 'round'; ctx.stroke();
    trunk(); ctx.strokeStyle = C.elephant; ctx.lineWidth = 0.27; ctx.stroke();
    pen(ctx, 0.9); ctx.beginPath();
    ctx.moveTo(-0.08, 0.45); ctx.quadraticCurveTo(0, 0.48, 0.1, 0.45);
    ctx.moveTo(-0.06, 0.58); ctx.quadraticCurveTo(0.03, 0.62, 0.13, 0.6); ctx.stroke();
  }
];

/** Draws animal `kind` with its body circle of radius `r` centred on (x, y). */
export function drawAnimal(ctx: Ctx, kind: number, x: number, y: number, r: number, angle = 0): void {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(r, r);
  U = Math.max(0.6, Math.min(1.6, r / 22)) / r;
  DRAW[kind](ctx);
  ctx.restore();
}
