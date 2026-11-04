import type { Species } from '../../../shared/insect.js';
export const WIDTH = 1920, HEIGHT = 1440;
export const HABITATS = [
  { name: '바람꽃 초지', x: 700, y: 890, color: '#dce4b6', hint: '꽃에 앉는 순간을 기다려 보세요' },
  { name: '수액나무 숲', x: 470, y: 410, color: '#abc29a', hint: '줄기 옆으로 조용히 다가가 보세요' },
  { name: '물가 갈대밭', x: 1430, y: 430, color: '#c1dbca', hint: '잠자리가 멈추는 길목을 찾아보세요' },
  { name: '낙엽 정원', x: 1360, y: 1080, color: '#e7d4ad', hint: '뛰기 전 몸을 낮추는 순간을 살펴보세요' }
];
export const TREES = [
  { x: 260, y: 300 }, { x: 440, y: 320 }, { x: 660, y: 420 }, { x: 350, y: 570 }, { x: 560, y: 580 },
  { x: 220, y: 840 }, { x: 990, y: 240 }, { x: 1180, y: 630 }, { x: 1510, y: 900 }, { x: 1060, y: 1210 },
  { x: 760, y: 1260 }, { x: 1700, y: 1200 }, { x: 90, y: 1170 }, { x: 1450, y: 180 }
];
export const CAMP = { x: 440, y: 1100 };
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export function habitatOf(s: Species): number { return s.env === 'tree' ? 1 : s.env === 'ground' ? 3 : ['dragonfly', 'damselfly'].includes(s.plan) ? 2 : 0; }
export function behaviorOf(s: Species): 'flower' | 'trunk' | 'hop' | 'patrol' { return s.env === 'tree' ? 'trunk' : s.env === 'ground' ? 'hop' : habitatOf(s) === 2 ? 'patrol' : 'flower'; }
export function location(x: number, y: number): number { let best = 0, distance = Infinity; HABITATS.forEach((h, i) => { const d = Math.hypot(x - h.x, y - h.y); if (d < distance) { best = i; distance = d; } }); return best; }
export function blocked(x: number, y: number): boolean {
  return x < 35 || y < 60 || x > WIDTH - 35 || y > HEIGHT - 35 || Math.hypot((x - 1720) / 160, (y - 450) / 330) < 1
    || TREES.some(t => Math.hypot(x - t.x, y - t.y) < 22);
}
export function movePoint(x: number, y: number, dx: number, dy: number): { x: number; y: number } {
  if (!blocked(x + dx, y)) x += dx;
  if (!blocked(x, y + dy)) y += dy;
  return { x, y };
}
