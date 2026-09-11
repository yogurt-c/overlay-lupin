import { beginSketchFrame, roughSegment } from '../../lib/sketch.js';
import { ARCHETYPES, ARCHETYPE_MAIN_STAT, ARCHETYPE_NAME, GRADES, MAIN_STATS, MONSTER_KIND_NAME, SLOT_COUNT, computeMemberDamage } from './data.js';
import { HALF_TRACK, ZONE_SIGN, ZOOM_VIEW_SIZE, clampCamera, memberOffset, perimeterPoint, slotPosition, squareLoopPoints } from './field.js';
import type { Point } from './field.js';
import type { Viewport } from '../types.js';
import type { Archetype, MerandiWorld, Selection, Zone, ZoneLabel } from './types.js';

/** How big a shot's dot/tracer look relative to the grade that fired it — kept subtle since the game is otherwise monochrome. */
function shotEmphasis(grade: number): { r: number; alpha: number } {
  return grade >= 4 ? { r: 1.9, alpha: 0.85 } : { r: 1.3, alpha: 0.55 };
}

const PATH_PTS = squareLoopPoints(HALF_TRACK, 24);

/** Base unit icon radius (before the grade's sizeMult) — shared by the renderer and pickAt's hit-test so a click always matches what's drawn. */
const UNIT_BASE_RADIUS = 7.2;

const INK = '#14181a';
const FAINT = 'rgba(20,24,26,0.35)';
const HALO = 'rgba(255,255,255,0.85)';
const MONSTER_COLOR = 'rgba(160,50,40,0.85)';

/** Shape glyph per archetype — the only visual differentiator between jobs (no color, per the design doc). */
function drawArcheGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, arche: string): void {
  ctx.beginPath();
  switch (arche) {
    case 'warrior':
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case 'archer':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      break;
    case 'thief':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'mage':
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    default: // pirate
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** Reserved screen-space band at the top of the canvas, left empty so the shell's #hud status line never sits over busy map content. */
const TOP_MARGIN_PX = 30;

export function fieldTransform(viewport: Viewport): { scale: number; offsetX: number; offsetY: number } {
  const availableHeight = Math.max(1, viewport.height - TOP_MARGIN_PX);
  const scale = Math.min(viewport.width / ZOOM_VIEW_SIZE, availableHeight / ZOOM_VIEW_SIZE);
  return {
    scale,
    offsetX: viewport.width / 2,
    offsetY: TOP_MARGIN_PX + availableHeight / 2
  };
}

/** Inverse of the render transform — converts a canvas-space click (CSS px) into world coordinates, accounting for camera pan/zoom. */
export function screenToWorld(viewport: Viewport, camera: Point, screenX: number, screenY: number): Point {
  const { scale, offsetX, offsetY } = fieldTransform(viewport);
  const [camX, camY] = clampCamera(camera[0], camera[1]);
  return [(screenX - offsetX) / scale + camX, (screenY - offsetY) / scale + camY];
}

function zoneOwnerLabel(world: MerandiWorld, myId: string): ZoneLabel | null {
  const mine = world.zones.find((z) => z.id === myId);
  return mine ? mine.label : null;
}

/**
 * Click-to-inspect hit test — converts a canvas-space click into world space (accounting for camera
 * pan/zoom) and checks it against every rendered unit/monster using the exact same positions the
 * renderer just drew them at, so "click the thing you're looking at" always works. Units are checked
 * before monsters since they're the foreground layer. Returns null on empty space (caller clears selection).
 */
export function pickAt(world: MerandiWorld, viewport: Viewport, camera: Point, screenX: number, screenY: number): Selection | null {
  const [wx, wy] = screenToWorld(viewport, camera, screenX, screenY);

  for (const zone of world.zones) {
    if (zone.id === '') continue;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slot = zone.slots[i];
      if (!slot || !slot.members.length) continue;
      const [sx, sy] = slotPosition(zone.label, i);
      const n = slot.members.length;
      for (let mi = 0; mi < n; mi++) {
        const member = slot.members[mi];
        const [ox, oy] = memberOffset(mi, n);
        const r = UNIT_BASE_RADIUS * GRADES[member.grade].sizeMult;
        if (Math.hypot(wx - (sx + ox), wy - (sy + oy)) <= r + 3) {
          return { kind: 'unit', zoneLabel: zone.label, memberId: member.id };
        }
      }
    }
  }

  for (const m of world.monsters) {
    const [mx, my] = perimeterPoint(PATH_PTS, m.t);
    const r = m.kind === 'boss' ? 7 : m.kind === 'tank' ? 5 : m.kind === 'speed' ? 3 : 4;
    if (Math.hypot(wx - mx, wy - my) <= r + 3) {
      return { kind: 'monster', monsterId: m.id };
    }
  }

  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Shared bottom-of-screen panel chrome — a rounded white box with a bold title row and lighter body rows below it. */
function drawBottomPanel(ctx: CanvasRenderingContext2D, viewport: Viewport, title: string, rows: string[]): void {
  ctx.save();
  ctx.font = '600 10px sans-serif';
  const titleWidth = ctx.measureText(title).width;
  ctx.font = '500 9.5px sans-serif';
  const rowWidth = Math.max(...rows.map((r) => ctx.measureText(r).width), 0);
  const width = Math.min(viewport.width - 16, Math.max(titleWidth, rowWidth) + 20);

  const pad = 8;
  const lineH = 14;
  const height = pad * 2 + lineH * (rows.length + 1);
  const x = (viewport.width - width) / 2;
  const y = viewport.height - height - 10;

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(20,24,26,0.3)';
  ctx.lineWidth = 1;
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = '600 10px sans-serif';
  ctx.fillText(title, x + width / 2, y + pad + 9);
  ctx.font = '500 9.5px sans-serif';
  rows.forEach((row, i) => {
    ctx.fillText(row, x + width / 2, y + pad + lineH * (i + 2));
  });
  ctx.textAlign = 'left';
  ctx.restore();
}

type GlyphOption = { key: number } & ({ kind: 'arche'; arche: Archetype } | { kind: 'grade'; grade: number });

/**
 * Same rounded-panel chrome as drawBottomPanel, but draws each option as the actual field glyph/grade
 * swatch instead of its job/stat name in text — the digit key is the only label, since the shape alone
 * already carries the meaning everywhere else in the game (units on the field use the same glyphs).
 */
function drawGlyphOptionsPanel(ctx: CanvasRenderingContext2D, viewport: Viewport, title: string, options: GlyphOption[]): void {
  const perRow = 5;
  const rows = chunk(options, perRow);
  const spacing = 30;
  const glyphR = 6;

  ctx.save();
  ctx.font = '600 10px sans-serif';
  const titleWidth = ctx.measureText(title).width;
  const rowWidth = Math.min(perRow, options.length) * spacing;
  const width = Math.min(viewport.width - 16, Math.max(titleWidth, rowWidth) + 20);

  const pad = 8;
  const titleH = 14;
  const rowH = 30;
  const height = pad * 2 + titleH + rows.length * rowH;
  const x = (viewport.width - width) / 2;
  const y = viewport.height - height - 10;

  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(20,24,26,0.3)';
  ctx.lineWidth = 1;
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.font = '600 10px sans-serif';
  ctx.fillText(title, x + width / 2, y + pad + 9);

  rows.forEach((row, ri) => {
    const rowWidthActual = row.length * spacing;
    const rowStartX = x + width / 2 - rowWidthActual / 2 + spacing / 2;
    const rowY = y + pad + titleH + ri * rowH + rowH / 2 - 3;
    row.forEach((opt, ci) => {
      const cx = rowStartX + ci * spacing;
      if (opt.kind === 'arche') {
        drawArcheGlyph(ctx, cx, rowY, glyphR, opt.arche);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = 'rgba(20,24,26,0.16)';
        ctx.fill();
      } else {
        const g = GRADES[opt.grade];
        const swatchR = 2.4 + g.sizeMult * 2.6;
        ctx.beginPath();
        ctx.arc(cx, rowY, swatchR, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.8, g.sizeMult * 1.1);
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = 'rgba(20,24,26,0.12)';
        ctx.fill();
      }
      ctx.font = '600 8.5px sans-serif';
      ctx.fillStyle = INK;
      ctx.fillText(String(opt.key), cx, rowY + 13);
    });
  });

  ctx.textAlign = 'left';
  ctx.restore();
}

/**
 * When the local player has armed 업그레이드/판매, the HUD status line alone ("업글1~4") isn't enough to
 * know what each number means — this draws a screen-space (not world-space, so camera zoom/pan doesn't
 * affect it) legend mapping each digit key to its option, as shapes rather than job/stat names.
 */
function drawActionLegend(ctx: CanvasRenderingContext2D, viewport: Viewport, mine: Zone | undefined): void {
  if (!mine || !mine.armed) return;

  if (mine.armed === 'upgrade') {
    const options: GlyphOption[] = MAIN_STATS.map((s, i) => ({
      key: i + 1,
      kind: 'arche',
      arche: ARCHETYPES.find((a) => ARCHETYPE_MAIN_STAT[a] === s) ?? ARCHETYPES[0]
    }));
    drawGlyphOptionsPanel(ctx, viewport, '업그레이드할 스탯 선택', options);
    return;
  }

  if (!mine.pendingArche) {
    const options: GlyphOption[] = ARCHETYPES.map((a, i) => ({ key: i + 1, kind: 'arche', arche: a }));
    drawGlyphOptionsPanel(ctx, viewport, '판매할 계열 선택', options);
    return;
  }

  const options: GlyphOption[] = GRADES.map((_, i) => ({ key: i + 1, kind: 'grade', grade: i }));
  drawGlyphOptionsPanel(ctx, viewport, '등급 선택 (이하 전체 판매)', options);
}

/**
 * Click-to-inspect info panel — "이름 / 공격력 / 레어도" for a unit, "이름 / 체력" for a monster. Cleared
 * by clicking empty space (see module.ts). Re-resolves the selection by id against the latest
 * snapshot every render (a snapshot clones every object each tick, so a stale reference would go
 * stale immediately) — if the id no longer exists (unit sold, monster despawned), draws nothing.
 */
function drawInspectPanel(ctx: CanvasRenderingContext2D, viewport: Viewport, world: MerandiWorld, selection: Selection): void {
  if (selection.kind === 'monster') {
    const live = world.monsters.find((m) => m.id === selection.monsterId);
    if (!live) return;
    drawBottomPanel(ctx, viewport, MONSTER_KIND_NAME[live.kind], [`체력 ${Math.max(0, Math.ceil(live.hp))} / ${live.maxHp}`]);
    return;
  }
  const zone = world.zones.find((z) => z.label === selection.zoneLabel);
  if (!zone) return;
  const member = zone.slots.flatMap((s) => s?.members ?? []).find((m) => m.id === selection.memberId);
  if (!member) return;
  const dmg = computeMemberDamage(zone.upLevels, member);
  drawBottomPanel(ctx, viewport, member.job, [
    `${ARCHETYPE_NAME[member.arche]} · 레어도 ${GRADES[member.grade].name}`,
    `공격력 ${dmg.toFixed(1)}`
  ]);
}

export function renderMerandiScene(
  ctx: CanvasRenderingContext2D,
  world: MerandiWorld,
  myId: string,
  viewport: Viewport,
  camera: Point = [0, 0],
  selection: Selection | null = null
): void {
  ctx.setTransform(viewport.pixelRatio, 0, 0, viewport.pixelRatio, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);

  const { scale, offsetX, offsetY } = fieldTransform(viewport);
  const [camX, camY] = clampCamera(camera[0], camera[1]);
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);

  beginSketchFrame();

  // loop track
  const closed = [...PATH_PTS, PATH_PTS[0]];
  for (let i = 0; i < closed.length - 1; i++) {
    roughSegment(ctx, closed[i][0], closed[i][1], closed[i + 1][0], closed[i + 1][1], 2.2, FAINT, 1);
  }

  // zone divider cross
  roughSegment(ctx, 0, -HALF_TRACK + 44, 0, HALF_TRACK - 44, 1.2, FAINT, 1);
  roughSegment(ctx, -HALF_TRACK + 44, 0, HALF_TRACK - 44, 0, 1.2, FAINT, 1);

  const myLabel = zoneOwnerLabel(world, myId);

  for (const zone of world.zones) {
    if (zone.id === '') continue;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const [x, y] = slotPosition(zone.label, i);
      const slot = zone.slots[i];
      if (!slot || !slot.members.length) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(20,24,26,0.12)';
        ctx.fill();
        continue;
      }
      // A slot is a shared tile, not a "must match" stack — draw each member in its own small spot
      // clustered around the slot's position, since they can be any mix of grade/archetype.
      const n = slot.members.length;
      slot.members.forEach((member, mi) => {
        const [ox, oy] = memberOffset(mi, n);
        const mx = x + ox;
        const my = y + oy;
        const g = GRADES[member.grade];
        const r = UNIT_BASE_RADIUS * g.sizeMult;
        drawArcheGlyph(ctx, mx, my, r, member.arche);
        ctx.lineWidth = Math.max(0.8, g.sizeMult * 1.1);
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.fillStyle = 'rgba(20,24,26,0.16)';
        ctx.fill();

        if (selection?.kind === 'unit' && selection.zoneLabel === zone.label && selection.memberId === member.id) {
          ctx.beginPath();
          ctx.arc(mx, my, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = INK;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      });
    }

    // corner label + gold — sits in the empty band between the outermost slot ring (~194) and the
    // loop track line (260), well clear of both, instead of crowding the track/spawn corner.
    const label = zone.label;
    const { sx, sy } = ZONE_SIGN[label];
    const labelInset = 30;
    const cx = sx * (HALF_TRACK - labelInset);
    const cy = sy * (HALF_TRACK - labelInset);
    const text = `${label}${label === myLabel ? ' (나)' : ''} ${zone.gold}G`;
    ctx.font = (label === myLabel ? '700 11px' : '500 10px') + ' sans-serif';
    ctx.textAlign = sx === 1 ? 'right' : 'left';
    ctx.textBaseline = sy === 1 ? 'bottom' : 'top';
    // White halo behind the text so it stays legible over the track line / monsters / slots underneath.
    ctx.lineWidth = 3;
    ctx.strokeStyle = HALO;
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = INK;
    ctx.fillText(text, cx, cy);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  // monsters
  for (const m of world.monsters) {
    const [x, y] = perimeterPoint(PATH_PTS, m.t);
    const r = m.kind === 'boss' ? 7 : m.kind === 'tank' ? 5 : m.kind === 'speed' ? 3 : 4;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = MONSTER_COLOR;
    ctx.globalAlpha = m.hp < m.maxHp ? 0.55 : 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = HALO;
    ctx.stroke();

    if (selection?.kind === 'monster' && selection.monsterId === m.id) {
      ctx.beginPath();
      ctx.arc(x, y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // shots — a dot flying from shooter to where the target was at the instant it fired
  for (const shot of world.shots) {
    const progress = 1 - Math.max(0, shot.life) / shot.maxLife;
    const x = shot.x + (shot.tx - shot.x) * progress;
    const y = shot.y + (shot.ty - shot.y) * progress;
    const dx = shot.tx - shot.x;
    const dy = shot.ty - shot.y;
    const dist = Math.hypot(dx, dy) || 1;
    const { r, alpha } = shotEmphasis(shot.grade);
    const tailLen = r * 4;
    const tx = x - (dx / dist) * tailLen;
    const ty = y - (dy / dist) * tailLen;

    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(x, y);
    ctx.strokeStyle = INK;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = r * 0.9;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // Screen-space overlays (drawn after restore, so camera zoom/pan doesn't affect them).
  const mine = world.zones.find((z) => z.id === myId);
  if (mine?.armed) drawActionLegend(ctx, viewport, mine);
  else if (selection) drawInspectPanel(ctx, viewport, world, selection);
}
