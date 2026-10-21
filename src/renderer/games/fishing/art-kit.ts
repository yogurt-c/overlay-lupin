/** Shared pen strokes for the bespoke 에픽/전설/신화 fish art: paper fill, white halo, ink outline. */
export type Art = (c: CanvasRenderingContext2D, ink: string) => void;
export type Pt = [number, number];
export const PAPER = '#fffefa', HALO = 'rgba(255,255,255,.94)', TAU = Math.PI * 2;
export const GOLD = '#c08416', RED = '#c4473a', BLUE = '#3d74a8';
export function shape(c: CanvasRenderingContext2D, p: Path2D, ink: string, fill = PAPER, w = 1.5): void { c.strokeStyle = HALO; c.lineWidth = w + 3.5; c.stroke(p); c.fillStyle = fill; c.fill(p); c.strokeStyle = ink; c.lineWidth = w; c.stroke(p); }
export function stroke(c: CanvasRenderingContext2D, ink: string, w: number, draw: () => void): void { c.strokeStyle = ink; c.lineWidth = w; c.beginPath(); draw(); c.stroke(); }
export function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }
export function eye(c: CanvasRenderingContext2D, x: number, y: number, ink: string, r = 1.4): void { dot(c, x, y, r + 1, PAPER); dot(c, x, y, r, ink); }
export function star(c: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void { c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * .5, y - s * .5); c.lineTo(x + s * 2, y); c.lineTo(x + s * .5, y + s * .5); c.lineTo(x, y + s * 2); c.lineTo(x - s * .5, y + s * .5); c.lineTo(x - s * 2, y); c.lineTo(x - s * .5, y - s * .5); c.closePath(); c.fillStyle = fill; c.fill(); }
/** Ribbon around a centreline: `at(t)` → [x,y], `width(t)` → half width. */
export function ribbon(at: (t: number) => Pt, width: (t: number) => number, n = 40): { path: Path2D; top: Pt[]; bottom: Pt[] } {
  const top: Pt[] = [], bottom: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, [x, y] = at(t), [x2, y2] = at(Math.min(1, t + .01)), [x1, y1] = at(Math.max(0, t - .01));
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = width(t);
    top.push([x + nx * w, y + ny * w]); bottom.push([x - nx * w, y - ny * w]);
  }
  const p = new Path2D(); top.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); bottom.reverse().forEach(([x, y]) => p.lineTo(x, y)); p.closePath();
  return { path: p, top, bottom: bottom.reverse() };
}
export function clipped(c: CanvasRenderingContext2D, p: Path2D, draw: () => void): void { c.save(); c.clip(p); draw(); c.restore(); }
/** The common body family: a lens from the snout at `x0` to the tail root at `root`, half height `h`. */
export function lens(h: number, root = 20, x0 = -27): Path2D { const p = new Path2D(); p.moveTo(x0,0); p.bezierCurveTo(x0+7,-h*1.25,root-12,-h*1.15,root,-h*.25); p.lineTo(root,h*.25); p.bezierCurveTo(root-12,h*1.15,x0+7,h*1.25,x0,0); p.closePath(); return p; }
export function forkTail(root: number, h: number, spread = 1): Path2D { const p = new Path2D(); p.moveTo(root-2,-h*.2); p.lineTo(root+12,-h*.95*spread); p.quadraticCurveTo(root+7,0,root+12,h*.95*spread); p.lineTo(root-2,h*.2); p.closePath(); return p; }
export function gill(c: CanvasRenderingContext2D, ink: string, x: number, h: number): void { stroke(c, ink, 1.1, () => { c.moveTo(x,-h*.55); c.quadraticCurveTo(x+4,0,x,h*.55); }); }
export function finTri(c: CanvasRenderingContext2D, ink: string, pts: Pt[], fill = PAPER): void { const p = new Path2D(); pts.forEach(([x,y],i) => i ? p.lineTo(x,y) : p.moveTo(x,y)); p.closePath(); shape(c, p, ink, fill, 1.2); }
