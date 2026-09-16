import { ANIMALS } from './animals.js';
import { GEOMETRY } from './geometry.js';
import { beginSketchFrame, roughStroke } from '../../lib/sketch.js';
import { PLATFORM_WIDTH, PLATFORM_Y, SWAP_TOKENS } from './types.js';
import type { TowerWorld, Side } from './types.js';
import type { Viewport } from '../types.js';

const INK = '#14181a', OTHER = '#7a5433', PAPER = '#fffefa', HALO = 'rgba(255,255,255,0.94)', FADED = '#a8ada6';
const paths = new Map<string, Path2D>();
function path(d: string): Path2D {
  let p = paths.get(d);
  if (!p) { p = new Path2D(d); paths.set(d, p); }
  return p;
}

export function drawAnimal(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, angle: number, ink: string, scale = 1): void {
  const art = ANIMALS[kind], { centre, scale: animalScale } = GEOMETRY[kind];
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  ctx.translate(-centre.x, -centre.y); ctx.scale(animalScale, animalScale);
  ctx.lineCap = ctx.lineJoin = 'round';
  const outline = path(art.outline);
  ctx.strokeStyle = HALO; ctx.lineWidth = 4 / animalScale; ctx.stroke(outline);
  ctx.fillStyle = PAPER; ctx.fill(outline);
  ctx.strokeStyle = ink; ctx.lineWidth = 1.5 / animalScale; ctx.stroke(outline);
  for (const mark of art.marks) {
    ctx.save();
    const rotation = mark.transform?.match(/rotate\(([-\d.]+) ([-\d.]+) ([-\d.]+)\)/);
    if (rotation) {
      const [, a, cx, cy] = rotation.map(Number);
      ctx.translate(cx, cy); ctx.rotate(a * Math.PI / 180); ctx.translate(-cx, -cy);
    }
    let p: Path2D;
    if (mark.tag === 'path') p = path(mark.d);
    else {
      p = new Path2D();
      if (mark.tag === 'circle') p.arc(+mark.cx, +mark.cy, +mark.r, 0, Math.PI * 2);
      else if (mark.tag === 'ellipse') p.ellipse(+mark.cx, +mark.cy, +mark.rx, +mark.ry, 0, 0, Math.PI * 2);
    }
    ctx.lineWidth = (mark.class === 'ink' ? 1.5 : 0.9) / animalScale;
    ctx.strokeStyle = ink;
    if (mark.class === 'detail') ctx.stroke(p);
    else {
      ctx.fillStyle = mark.class === 'ink' ? PAPER : mark.fill && mark.fill !== 'currentColor' ? mark.fill : ink;
      ctx.fill(p);
      if (mark.class === 'ink') ctx.stroke(p);
    }
    ctx.restore();
  }
  ctx.restore();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 9, ink = INK): void {
  ctx.font = `${size}px Menlo, Consolas, monospace`;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = 3; ctx.strokeStyle = HALO; ctx.strokeText(value, x, y);
  ctx.fillStyle = ink; ctx.fillText(value, x, y);
}

/** World-space viewport offset: pan upward without shrinking animal artwork. */
export function cameraTargetY(world: TowerWorld): number {
  const top = Math.min(world.y - GEOMETRY[world.kind].radius - 5,
    ...world.bodies.map(([kind, , , y]) => y - GEOMETRY[kind].radius));
  return Math.min(0, top - 64);
}

export function renderTower(ctx: CanvasRenderingContext2D, world: TowerWorld | null, viewport: Viewport, side: Side,
  aim: { x: number; angle: number } | null, visual: { bodies: { x: number; y: number; angle: number }[]; cameraY: number }, vsBot: boolean): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  if (!world) return;
  const unit = Math.min(viewport.width / 320, viewport.height / 280);
  ctx.save(); ctx.translate((viewport.width - 320 * unit) / 2, (viewport.height - 280 * unit) / 2); ctx.scale(unit, unit);
  beginSketchFrame();
  // Keep animals at the same readable size. Follow the upper tower, as specified in the design README.
  const targetY = cameraTargetY(world);
  // Immediately reveal a new preview above the frame; ease back down after a collapse.
  visual.cameraY = targetY < visual.cameraY ? targetY : visual.cameraY + (targetY - visual.cameraY) * 0.1;
  ctx.save(); ctx.translate(0, -4 - visual.cameraY);
  roughStroke(ctx, 160 - PLATFORM_WIDTH / 2, PLATFORM_Y, 160 + PLATFORM_WIDTH / 2, PLATFORM_Y, 2.4, INK, HALO);
  roughStroke(ctx, 164 - PLATFORM_WIDTH / 2, PLATFORM_Y + 5, 156 + PLATFORM_WIDTH / 2, PLATFORM_Y + 5, 1.1, INK, HALO);
  world.bodies.forEach(([kind, owner, x, y, a], i) => {
    const v = visual.bodies[i] ?? { x, y, angle: a };
    v.x += (x - v.x) * 0.45; v.y += (y - v.y) * 0.45;
    v.angle += Math.atan2(Math.sin(a - v.angle), Math.cos(a - v.angle)) * 0.45;
    visual.bodies[i] = v;
    drawAnimal(ctx, kind, v.x, v.y, v.angle, owner === side ? INK : OTHER);
  });
  if (world.phase === 'aim') {
    const x = aim?.x ?? world.x, a = aim?.angle ?? world.angle;
    ctx.save(); ctx.globalAlpha = 0.4;
    ctx.setLineDash([3, 5]); ctx.strokeStyle = '#7a827c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, world.y + GEOMETRY[world.kind].radius + 4); ctx.lineTo(x, PLATFORM_Y - 2); ctx.stroke(); ctx.restore();
    drawAnimal(ctx, world.kind, x, world.y, a, side === world.side ? INK : OTHER);
  }
  ctx.restore();
  if (visual.cameraY < -20) text(ctx, `받침대 ↓ ${Math.round(-visual.cameraY)}`, 153, 248, 8);
  text(ctx, '다음', 282, 42, 8);
  drawAnimal(ctx, world.next, 282, 65, 0, INK, 24 / GEOMETRY[world.next].extent);
  // Tokens read as pips so the count stays legible next to the preview it trades against.
  const left = world.swaps[side];
  text(ctx, 'R 변경', 282, 92, 8, left > 0 ? INK : FADED);
  text(ctx, '●'.repeat(left) + '○'.repeat(SWAP_TOKENS - left), 282, 103, 8, left > 0 ? INK : FADED);
  if (world.phase !== 'over') text(ctx, world.phase === 'fall' ? '균형 잡는 중…' : world.side === side ? ANIMALS[world.kind].label : vsBot ? '봇이 놓는 중' : '상대가 놓는 중', 160, 45, 9);
  text(ctx, '← → 이동 · ↑ ↓ 회전 · Space 놓기 · R 변경', 153, 270, 8);
  ctx.restore();
}
