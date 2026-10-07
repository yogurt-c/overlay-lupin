/**
 * Ink for 뱀서. Everything is drawn top-down in world units; the camera
 * transform is applied by the scene before any of these run.
 *
 * The figures stay line-art for the same reason the rest of the app does —
 * a glance from across the desk should read as a diagram, not a game.
 */

import { jitter, roughSegment } from '../../lib/sketch.js';
import { ENEMY_RADIUS, PLAYER_MAX_HP, PLAYER_RADIUS } from './arena.js';
import { baseKind, isElite, kindScale } from './types.js';
import type { ChestView, EnemyView, GemView, ItemView, PlayerView, PoolView, ProjectileView, StrikeView } from './types.js';

const INK = '#14181a';
const PAPER = '#fbfaf7';
const RED = '#ff4a2b';
const GEM_INK = ['#4a7cff', '#2fae6a', '#ff4a2b'];

const gemTone = (worth: number): string => (worth >= 25 ? GEM_INK[2] : worth >= 5 ? GEM_INK[1] : GEM_INK[0]);

/**
 * Enemies by kind. A bat is the baseline; the rest change silhouette rather
 * than colour, because colour is what gives an overlay away from a distance.
 */
export function drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyView, phase: number): void {
  const base = baseKind(e.kind);
  const elite = isElite(e.kind);
  const scale = kindScale(e.kind);
  const bob = Math.sin(phase * 0.25 + e.id * 1.7);

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = e.flash > 0 ? RED : INK;
  ctx.fillStyle = e.flash > 0 ? RED : INK;
  // A big silhouette drawn with the same stroke reads as blobby; thin it down.
  ctx.lineWidth = elite ? 1.2 : 2;
  ctx.lineCap = 'round';

  switch (base) {
    case 3: drawReaper(ctx, phase); break;
    case 4: drawZombie(ctx, bob); break;
    case 5: drawGhost(ctx, bob); break;
    case 6: drawSplitter(ctx, bob); break;
    default: drawBat(ctx, bob, base); break;
  }

  // The elite ring: one mark that says "this one drops a chest", whatever it is.
  if (elite) {
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(0, 0, ENEMY_RADIUS * 1.25, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** The baseline: a body dot with two wing strokes, flapping on its own phase. */
function drawBat(ctx: CanvasRenderingContext2D, bob: number, kind: EnemyView['kind']): void {
  ctx.beginPath();
  ctx.arc(0, 0, ENEMY_RADIUS * 0.42, 0, Math.PI * 2);
  ctx.fill();

  const lift = ENEMY_RADIUS * (0.55 + bob * 0.2);
  ctx.beginPath();
  ctx.moveTo(-ENEMY_RADIUS, -lift);
  ctx.quadraticCurveTo(-ENEMY_RADIUS * 0.45, lift * 0.3, 0, 0);
  ctx.quadraticCurveTo(ENEMY_RADIUS * 0.45, lift * 0.3, ENEMY_RADIUS, -lift);
  ctx.stroke();

  // A charger wears a spike so the thing about to run you down is readable.
  if (kind === 1) {
    ctx.beginPath();
    ctx.moveTo(0, -ENEMY_RADIUS * 0.5);
    ctx.lineTo(0, -ENEMY_RADIUS * 1.15);
    ctx.stroke();
  }
}

/** Zombie: a blocky shambler. Wide and slow — the silhouette says "wall". */
function drawZombie(ctx: CanvasRenderingContext2D, bob: number): void {
  const lean = bob * 0.12;
  ctx.save();
  ctx.rotate(lean);
  ctx.beginPath();
  ctx.rect(-ENEMY_RADIUS * 0.6, -ENEMY_RADIUS * 0.8, ENEMY_RADIUS * 1.2, ENEMY_RADIUS * 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-ENEMY_RADIUS * 0.6, -ENEMY_RADIUS * 0.2);
  ctx.lineTo(-ENEMY_RADIUS * 1.1, ENEMY_RADIUS * 0.1);
  ctx.moveTo(ENEMY_RADIUS * 0.6, -ENEMY_RADIUS * 0.2);
  ctx.lineTo(ENEMY_RADIUS * 1.1, ENEMY_RADIUS * 0.1);
  ctx.stroke();
  ctx.restore();
}

/** Ghost: an open-bottomed sheet that wavers. Fast and frail. */
function drawGhost(ctx: CanvasRenderingContext2D, bob: number): void {
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(-ENEMY_RADIUS * 0.7, ENEMY_RADIUS * 0.6);
  ctx.quadraticCurveTo(-ENEMY_RADIUS * 0.8, -ENEMY_RADIUS, 0, -ENEMY_RADIUS);
  ctx.quadraticCurveTo(ENEMY_RADIUS * 0.8, -ENEMY_RADIUS, ENEMY_RADIUS * 0.7, ENEMY_RADIUS * 0.6);
  // The frilled hem is the tell: it keeps moving even when the ghost doesn't.
  for (let i = 0; i < 3; i++) {
    const x = ENEMY_RADIUS * (0.7 - i * 0.47);
    ctx.quadraticCurveTo(x - ENEMY_RADIUS * 0.12, ENEMY_RADIUS * (0.95 + bob * 0.12), x - ENEMY_RADIUS * 0.24, ENEMY_RADIUS * 0.6);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Splitter: a blob with a seam, so "this will come apart" reads before it does. */
function drawSplitter(ctx: CanvasRenderingContext2D, bob: number): void {
  const squash = 1 + bob * 0.08;
  ctx.save();
  ctx.scale(1 / squash, squash);
  ctx.beginPath();
  ctx.arc(0, 0, ENEMY_RADIUS * 0.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.setLineDash([3, 4]);
  ctx.moveTo(0, -ENEMY_RADIUS * 0.85);
  ctx.lineTo(0, ENEMY_RADIUS * 0.85);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** The reaper: a hooded shape and a scythe. Nothing hurts it, so it only has to look final. */
function drawReaper(ctx: CanvasRenderingContext2D, phase: number): void {
  const sway = Math.sin(phase * 0.08) * 0.8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-ENEMY_RADIUS * 0.7, ENEMY_RADIUS);
  ctx.quadraticCurveTo(-ENEMY_RADIUS * 0.6, -ENEMY_RADIUS * 0.9, 0, -ENEMY_RADIUS * 1.1);
  ctx.quadraticCurveTo(ENEMY_RADIUS * 0.6, -ENEMY_RADIUS * 0.9, ENEMY_RADIUS * 0.7, ENEMY_RADIUS);
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(ENEMY_RADIUS * 0.8 + sway, -ENEMY_RADIUS * 1.4);
  ctx.lineTo(ENEMY_RADIUS * 0.55 + sway, ENEMY_RADIUS * 1.1);
  ctx.moveTo(ENEMY_RADIUS * 0.8 + sway, -ENEMY_RADIUS * 1.4);
  ctx.quadraticCurveTo(ENEMY_RADIUS * 0.1 + sway, -ENEMY_RADIUS * 1.5, -ENEMY_RADIUS * 0.3 + sway, -ENEMY_RADIUS * 1.0);
  ctx.stroke();
}

/** A thrown or orbiting body. Shape tells the weapon apart; spin sells the throw. */
export function drawShot(ctx: CanvasRenderingContext2D, s: ProjectileView): void {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.spin);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  if (s.kind === 'shot') {
    ctx.beginPath();
    ctx.moveTo(-s.radius, 0); ctx.lineTo(s.radius, 0);
    ctx.moveTo(s.radius * 0.35, -s.radius * 0.45); ctx.lineTo(s.radius, 0);
    ctx.lineTo(s.radius * 0.35, s.radius * 0.45);
    ctx.stroke();
  } else if (s.kind === 'lob') {
    ctx.beginPath();
    ctx.moveTo(0, s.radius); ctx.lineTo(0, -s.radius * 0.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s.radius * 0.1, -s.radius * 0.4);
    ctx.quadraticCurveTo(s.radius * 0.9, -s.radius, s.radius * 0.2, -s.radius * 1.1);
    ctx.closePath();
    ctx.fill();
  } else if (s.kind === 'orbit') {
    ctx.strokeRect(-s.radius * 0.8, -s.radius * 0.6, s.radius * 1.6, s.radius * 1.2);
    ctx.beginPath();
    ctx.moveTo(0, -s.radius * 0.6); ctx.lineTo(0, s.radius * 0.6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, s.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Holy water: a hatched puddle that thins out as it dries. */
export function drawPool(ctx: CanvasRenderingContext2D, pool: PoolView): void {
  const left = 1 - pool.age / Math.max(1, pool.life);
  ctx.save();
  ctx.translate(pool.x, pool.y);
  ctx.globalAlpha = 0.18 + 0.3 * left;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, pool.radius, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = -pool.radius; i < pool.radius; i += 9) {
    const half = Math.sqrt(Math.max(0, pool.radius ** 2 - i ** 2));
    ctx.beginPath();
    ctx.moveTo(i, -half * 0.7);
    ctx.lineTo(i, half * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** Treasure chest. Pulses so it reads as "walk here" from the edge of the screen. */
export function drawChest(ctx: CanvasRenderingContext2D, chest: ChestView, phase: number): void {
  const pulse = 1 + Math.sin(phase * 0.12) * 0.08;
  ctx.save();
  ctx.translate(chest.x, chest.y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-11, -8, 22, 16, 3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-11, -2); ctx.lineTo(11, -2);
  ctx.stroke();
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(0, -2, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The chicken: the one pickup that heals. Drawn plump so it reads from a distance. */
export function drawItem(ctx: CanvasRenderingContext2D, item: ItemView, phase: number): void {
  const hop = Math.abs(Math.sin(phase * 0.1)) * 2;
  ctx.save();
  ctx.translate(item.x, item.y - hop);
  ctx.strokeStyle = INK;
  ctx.fillStyle = PAPER;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(5, -4.5, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, 5); ctx.lineTo(-3, 8);
  ctx.moveTo(2, 5); ctx.lineTo(2, 8);
  ctx.stroke();
  // The comb, in the one colour the field otherwise saves for damage.
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.arc(5.5, -7.6, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Experience gem: a small diamond, coloured by worth so value reads at a glance. */
export function drawGem(ctx: CanvasRenderingContext2D, gem: GemView): void {
  const r = gem.worth >= 25 ? 6 : gem.worth >= 5 ? 5 : 4;
  ctx.save();
  ctx.translate(gem.x, gem.y);
  ctx.fillStyle = gemTone(gem.worth);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Instant hits. Each fades as it ages so a swing reads as motion, not a wall. */
export function drawStrike(ctx: CanvasRenderingContext2D, s: StrikeView): void {
  const t = Math.min(1, s.age / Math.max(1, s.life));
  ctx.save();
  ctx.globalAlpha = 0.75 * (1 - t);
  ctx.translate(s.x, s.y);
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';

  if (s.kind === 'bolt') {
    // A jagged drop, then the ring it lands in.
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-4, -s.radius * 2.2);
    ctx.lineTo(3, -s.radius * 0.9);
    ctx.lineTo(-3, -s.radius * 0.5);
    ctx.lineTo(2, 0);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius * (0.5 + t * 0.7), 0, Math.PI * 2);
    ctx.stroke();
  } else if (s.kind === 'aura') {
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.lineWidth = 3.4;
    const spread = Math.PI * 0.62;
    const facing = s.facing >= 0 ? 0 : Math.PI;
    ctx.beginPath();
    ctx.arc(0, 0, s.radius * (0.65 + t * 0.35), facing - spread / 2, facing + spread / 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Top-down figure: big head, shoulders, two legs. Blinks while invulnerable. */
export function drawPlayer(ctx: CanvasRenderingContext2D, p: PlayerView, phase: number, isMe: boolean): void {
  if (!p.alive) { drawDowned(ctx, p); return; }
  if (p.invuln > 0 && Math.floor(phase / 4) % 2 === 0) return;

  const step = Math.sin(phase * 0.3) * 2;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.ellipse(0, PLAYER_RADIUS * 0.9, PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,24,26,0.14)';
  ctx.fill();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  roughSegment(ctx, 0, -2, -4, PLAYER_RADIUS * 0.8 + step, 2.6, INK, 1);
  roughSegment(ctx, 0, -2, 4, PLAYER_RADIUS * 0.8 - step, 2.6, INK, 1);
  roughSegment(ctx, -6, 0, 6, 0, 2.4, INK, 1);

  ctx.beginPath();
  ctx.arc(jitter(0.6), -PLAYER_RADIUS * 0.75, PLAYER_RADIUS * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.stroke();

  // Facing dot — the whip swings this way, so it has to be legible at a glance.
  ctx.beginPath();
  ctx.arc(p.facing * PLAYER_RADIUS * 0.3, -PLAYER_RADIUS * 0.8, 1.6, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();

  if (isMe) {
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS * 1.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,74,43,0.55)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawHealthBar(ctx, p, isMe);
  ctx.restore();
}

/**
 * Your own bar is always drawn, even at full health — a bar that only appears
 * once you are hurt is a bar you never learn to look for.
 */
function drawHealthBar(ctx: CanvasRenderingContext2D, p: PlayerView, isMe: boolean): void {
  const max = p.maxHp || PLAYER_MAX_HP;
  if (!isMe && p.hp >= max) return;
  const w = 34;
  const h = 4;
  const y = -PLAYER_RADIUS * 2.3;
  const ratio = Math.max(0, Math.min(1, p.hp / max));

  ctx.fillStyle = 'rgba(251,250,247,0.9)';
  ctx.fillRect(-w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(20,24,26,0.18)';
  ctx.fillRect(-w / 2, y, w, h);
  ctx.fillStyle = ratio > 0.35 ? INK : RED;
  ctx.fillRect(-w / 2, y, w * ratio, h);
  ctx.strokeStyle = 'rgba(20,24,26,0.55)';
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-w / 2, y, w, h);
}

/** A downed player stays on the field as a marker so the room can see who fell where. */
function drawDowned(ctx: CanvasRenderingContext2D, p: PlayerView): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const r = PLAYER_RADIUS * 0.7;
  ctx.beginPath();
  ctx.moveTo(-r, -r); ctx.lineTo(r, r);
  ctx.moveTo(r, -r); ctx.lineTo(-r, r);
  ctx.stroke();
  ctx.restore();
}
