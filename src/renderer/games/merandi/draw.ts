import { beginSketchFrame, roughSegment } from '../../lib/sketch.js';
import {
  ARCHETYPES,
  ARCHETYPE_NAME,
  CELEBRATION_MIN_GRADE,
  GRADES,
  MAGE_SPLASH_RADIUS,
  MAIN_STAT_NAME,
  MAIN_STATS,
  MONSTER_KIND_NAME,
  POTENTIAL_GRADE_NAMES,
  POTENTIAL_OPTION_NAME,
  SLOT_COUNT,
  STARFORCE_MAX,
  STARFORCE_RESET_CHANCE,
  STARFORCE_RESET_RISK_START,
  STARFORCE_SUCCESS_RATE,
  computeMemberDamage,
  specialEffectTier
} from './data.js';
import { HALF_TRACK, ZONE_SIGN, ZOOM_VIEW_SIZE, clampCamera, memberOffset, perimeterPoint, slotPosition, squareLoopPoints } from './field.js';
import type { Point } from './field.js';
import type { Viewport } from '../types.js';
import type { Archetype, Celebration, MainStat, MerandiWorld, Monster, PotentialLine, Selection, Zone, ZoneLabel } from './types.js';

/** Grade at which a shot starts getting its own colored glow, on top of the plain size/alpha bump every 에픽+ shot already gets. */
const SHOT_GLOW_MIN_GRADE = 4;

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

const STAGGER_COLOR = 'rgba(90,130,150,0.8)'; // 전사 — cool/icy, "frozen in place"
const VULNERABLE_COLOR = 'rgba(190,60,50,0.7)'; // 전사 — warm/red, "takes more damage"
const DOT_COLOR = 'rgba(110,150,60,0.85)'; // 도적 — sickly green, "bleeding/poisoned"

/** 레전더리+ status-effect cues (전사 stagger/vulnerable, 도적 dot) — purely visual, driven by whatever the snapshot says is currently active on this monster. */
function drawStatusEffects(ctx: CanvasRenderingContext2D, m: Monster, x: number, y: number, r: number): void {
  if ((m.staggerMsLeft ?? 0) > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = STAGGER_COLOR;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([1.5, 1.5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if ((m.vulnerableMsLeft ?? 0) > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = VULNERABLE_COLOR;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if ((m.dotMsLeft ?? 0) > 0) {
    // A small pulsing mote riding above the monster — phase driven by real time so it visibly throbs.
    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 140);
    ctx.beginPath();
    ctx.arc(x, y - r - 4, 1.6 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = DOT_COLOR;
    ctx.fill();
  }
}

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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface FoilSpec {
  intensity: number;
  periodMs: number;
  colorRgb: string;
}

/** 레전더리(5)+ only — halo opacity and foil-sweep strength/speed both ramp up with grade, on top of the grade's own (already desaturated) color. Below CELEBRATION_MIN_GRADE, neither applies at all. */
const HALO_ALPHA_BY_GRADE: Partial<Record<number, number>> = { 5: 0.14, 6: 0.2, 7: 0.26 };
const FOIL_BY_GRADE: Partial<Record<number, FoilSpec>> = {
  5: { intensity: 0.28, periodMs: 3000, colorRgb: '255,255,255' },
  6: { intensity: 0.4, periodMs: 2400, colorRgb: '255,255,255' },
  7: { intensity: 0.5, periodMs: 2000, colorRgb: '255,247,214' }
};

/**
 * Foil-card light sweep for 레전더리+ units — a thin light band clipped to the unit's own silhouette,
 * traveling across it on a loop. `seed` (the unit's stable member id) offsets the phase so a field full
 * of rare units doesn't glint in lockstep — same idea as sketch.ts's jitter avoiding a uniform 60Hz
 * vibration. Purely decorative and driven by this client's own clock: every viewer's copy runs on its
 * own timer, which is fine since it carries no gameplay information (unlike the map celebration below,
 * which has to be server-synced because it IS the shared information).
 */
function drawFoilSweep(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, arche: Archetype, seed: number, foil: FoilSpec): void {
  ctx.save();
  drawArcheGlyph(ctx, x, y, r, arche);
  ctx.clip();
  const offset = (seed * 137) % foil.periodMs;
  const phase = ((performance.now() + offset) % foil.periodMs) / foil.periodMs;
  const travel = r * 3.2;
  const cx = x - travel / 2 + phase * travel;
  const cy = y - r + phase * r * 2;
  const grad = ctx.createLinearGradient(cx - r * 0.9, cy - r * 0.9, cx + r * 0.9, cy + r * 0.9);
  grad.addColorStop(0, `rgba(${foil.colorRgb},0)`);
  grad.addColorStop(0.5, `rgba(${foil.colorRgb},${foil.intensity})`);
  grad.addColorStop(1, `rgba(${foil.colorRgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
  ctx.restore();
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

type GlyphOption = { key: number } & ({ kind: 'arche'; arche: Archetype } | { kind: 'grade'; grade: number } | { kind: 'stat'; stat: MainStat });

/**
 * Same rounded-panel chrome as drawBottomPanel. Archetype/grade options draw the actual field glyph or
 * grade swatch — the digit key is the only extra label, since the shape alone already carries the
 * meaning everywhere else in the game. Stat options draw the stat name itself (STR/INT/DEX/LUK): unlike
 * archetypes and grades, a stat has no shape of its own on the field, so showing an arbitrary
 * archetype's glyph to stand in for "this stat" (the old approach) just reads as "pick this job".
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
      } else if (opt.kind === 'grade') {
        const g = GRADES[opt.grade];
        const swatchR = 2.4 + g.sizeMult * 2.6;
        ctx.beginPath();
        ctx.arc(cx, rowY, swatchR, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.8, g.sizeMult * 1.1);
        ctx.strokeStyle = g.color;
        ctx.stroke();
        ctx.fillStyle = 'rgba(20,24,26,0.12)';
        ctx.fill();
      } else {
        ctx.font = '700 12px sans-serif';
        ctx.fillStyle = INK;
        ctx.fillText(MAIN_STAT_NAME[opt.stat], cx, rowY + 3);
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
 * affect it) legend mapping each digit key to its option: archetypes/grades as the same shapes/swatches
 * used on the field, stats as their name (STR/INT/DEX/LUK) since a stat has no shape of its own.
 */
function drawActionLegend(ctx: CanvasRenderingContext2D, viewport: Viewport, mine: Zone | undefined): void {
  if (!mine || !mine.armed) return;

  if (mine.armed === 'upgrade') {
    const options: GlyphOption[] = MAIN_STATS.map((s, i) => ({ key: i + 1, kind: 'stat', stat: s }));
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
function formatPotentialLine(line: PotentialLine): string {
  if (line.type === 'statConvert' && line.fromStat && line.toStat) {
    return `${MAIN_STAT_NAME[line.fromStat]}→${MAIN_STAT_NAME[line.toStat]} (${line.value}:1)`;
  }
  return `${POTENTIAL_OPTION_NAME[line.type]} +${line.value}${line.type === 'crit' ? '%p' : '%'}`;
}

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
  // The heavy stream (units/monsters) can lag well behind a just-applied reroll/강화 — the
  // lastReroll*/lastStarforce* quick-stream overrides (see wire.ts/engine.ts) win here whenever they're
  // for this exact unit, so the panel shows the real result immediately rather than the stale one.
  const potential = zone.lastRerollMemberId === member.id && zone.lastRerollPotential ? zone.lastRerollPotential : member.potential;
  const starforce = zone.lastStarforceMemberId === member.id && zone.lastStarforceLevel != null ? zone.lastStarforceLevel : member.starforce;
  const dmg = computeMemberDamage(zone.upLevels, { ...member, potential, starforce });
  const starforceLine =
    starforce >= STARFORCE_MAX
      ? `★${starforce}/${STARFORCE_MAX} (최대 강화)`
      : starforce >= STARFORCE_RESET_RISK_START
        ? `F 강화 (성공 ${STARFORCE_SUCCESS_RATE[starforce]}%, 초기화 ${STARFORCE_RESET_CHANCE[starforce - STARFORCE_RESET_RISK_START]}%)`
        : `F 강화 (성공 ${STARFORCE_SUCCESS_RATE[starforce]}%)`;
  drawBottomPanel(ctx, viewport, member.job, [
    `${ARCHETYPE_NAME[member.arche]} · ${GRADES[member.grade].name} · ★${starforce}/${STARFORCE_MAX}`,
    `공격력 ${dmg.toFixed(1)}`,
    `잠재: ${POTENTIAL_GRADE_NAMES[potential.grade]} (R 재설정)`,
    potential.lines.map(formatPotentialLine).join(' · '),
    starforceLine
  ]);
}

/** Idle-state scoreboard — shown at the bottom whenever no action menu or inspect panel is occupying that space. */
function drawKillBoard(ctx: CanvasRenderingContext2D, viewport: Viewport, world: MerandiWorld): void {
  const active = world.zones.filter((z) => z.id !== '');
  if (!active.length) return;
  drawBottomPanel(
    ctx,
    viewport,
    '처치 수',
    active.map((z) => `${z.label} ${z.kills}마리`)
  );
}

/** V-held overlay — a quick reference for how rare each grade is, rounded to a friendly precision. */
function drawGradeTable(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
  const rows = GRADES.map((g) => {
    const pct = g.prob * 100;
    const text = pct >= 1 ? pct.toFixed(1) : pct >= 0.1 ? pct.toFixed(2) : pct.toFixed(3);
    return `${g.name}  ${text}%`;
  });
  drawBottomPanel(ctx, viewport, '등급별 확률', rows);
}

/** Spark colors stay inside the same warm family the foil sweep already uses per grade, so a burst reads as belonging to this palette rather than a generic rainbow firework dropped on top of it. */
const BURST_COLORS_BY_GRADE: Partial<Record<number, string[]>> = {
  5: ['#f4ede0', '#d8cdb8', '#c7bda4'],
  6: ['#e2795f', '#c8503a', '#9c3a28'],
  7: ['#f7d98a', '#f2c94c', '#e0a83a']
};
const CELEBRATION_FLASH_MS = 380;
const CELEBRATION_BURST_ORIGINS = 5;
const CELEBRATION_BURST_DELAY_MS = 130;
const CELEBRATION_PARTICLE_BASE = 22;
const CELEBRATION_PARTICLE_LIFE_MS = 900;
const CELEBRATION_PARTICLE_LIFE_JITTER_MS = 400;
const CELEBRATION_SPEED_MIN = 40; // px/sec
const CELEBRATION_SPEED_SPREAD = 90; // px/sec, added to the min
const CELEBRATION_UPWARD_BIAS = 70; // px/sec, initial upward pop before gravity takes over
const CELEBRATION_GRAVITY = 260; // px/sec^2

/** Deterministic pseudo-random in [0,1) from an integer seed — a classic shader-style sine hash. Used
 * instead of Math.random() so every viewer computes the exact same particle for the exact same
 * (celebration id, burst, particle) triple purely from the server-authoritative `elapsed` below, with
 * no per-frame state to keep in sync. */
function seededUnit(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Map-wide celebration for a 레전더리+ draw (see data.ts's CELEBRATION_MIN_GRADE) — a brief full-viewport
 * flash plus a handful of firework bursts staggered across the screen, so the whole room notices even if
 * nobody's camera happens to be looking at the zone that drew it. Screen-space (drawn after ctx.restore(),
 * same as the HUD panels below) rather than world-space, since each player's camera is independently
 * panned/zoomed into their own ~300-unit window — a burst placed in world coordinates would often land
 * off-screen for everyone but the player who drew it. Every value here is a pure function of `c.life` vs
 * `c.maxLife` (both server-authoritative and identical across every client), so there is nothing to
 * animate locally: the exact same frame renders for everyone at the same elapsed time.
 */
function drawCelebrations(ctx: CanvasRenderingContext2D, viewport: Viewport, celebrations: Celebration[]): void {
  for (const c of celebrations) {
    const elapsed = c.maxLife - c.life;
    if (elapsed < 0) continue;
    const colors = BURST_COLORS_BY_GRADE[c.grade] ?? BURST_COLORS_BY_GRADE[CELEBRATION_MIN_GRADE]!;

    if (elapsed < CELEBRATION_FLASH_MS) {
      const k = 1 - elapsed / CELEBRATION_FLASH_MS;
      ctx.fillStyle = `rgba(247,231,190,${(k * 0.32).toFixed(3)})`;
      ctx.fillRect(0, 0, viewport.width, viewport.height);
    }

    for (let oi = 0; oi < CELEBRATION_BURST_ORIGINS; oi++) {
      const ox = (0.14 + 0.72 * (oi / (CELEBRATION_BURST_ORIGINS - 1)) + (seededUnit(c.id * 13 + oi) - 0.5) * 0.08) * viewport.width;
      const oy = TOP_MARGIN_PX + (0.22 + seededUnit(c.id * 29 + oi) * 0.4) * (viewport.height - TOP_MARGIN_PX);
      const delay = oi * CELEBRATION_BURST_DELAY_MS + seededUnit(c.id * 41 + oi) * 60;
      const localElapsedMs = elapsed - delay;
      if (localElapsedMs < 0) continue;
      const t = localElapsedMs / 1000; // seconds, for the ballistic formulas below

      const count = CELEBRATION_PARTICLE_BASE + c.grade * 5;
      for (let pi = 0; pi < count; pi++) {
        const seed = c.id * 977 + oi * 61 + pi;
        const particleLifeMs = CELEBRATION_PARTICLE_LIFE_MS + seededUnit(seed * 7.7) * CELEBRATION_PARTICLE_LIFE_JITTER_MS;
        const life = 1 - localElapsedMs / particleLifeMs;
        if (life <= 0) continue;

        const angle = seededUnit(seed) * Math.PI * 2;
        const speed = CELEBRATION_SPEED_MIN + seededUnit(seed * 3.1) * CELEBRATION_SPEED_SPREAD;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - CELEBRATION_UPWARD_BIAS;
        const px = ox + vx * t;
        const py = oy + vy * t + 0.5 * CELEBRATION_GRAVITY * t * t;
        const size = 1.1 + seededUnit(seed * 9.3) * 1.5;

        ctx.globalAlpha = life;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = colors[pi % colors.length];
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (elapsed < c.maxLife) {
      const text = `${c.zoneLabel} · ${GRADES[c.grade].name} ${ARCHETYPE_NAME[c.arche]} 등장!`;
      ctx.font = '700 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = HALO;
      ctx.strokeText(text, viewport.width / 2, TOP_MARGIN_PX + 26);
      ctx.fillStyle = INK;
      ctx.fillText(text, viewport.width / 2, TOP_MARGIN_PX + 26);
      ctx.textAlign = 'left';
    }
  }
}

/** Screen-space band for the boss HP bar — pinned just under the HUD margin, unaffected by camera pan/zoom. */
const BOSS_BAR_WIDTH = 220;
const BOSS_BAR_HEIGHT = 8;
const BOSS_BAR_Y = TOP_MARGIN_PX + 10;

/**
 * Unlike every other monster (HP only visible via click-to-inspect, see drawInspectPanel), a boss is the
 * whole wave's DPS check — engine.ts now ends the run if it's still alive when BOSS_WAVE_MS runs out — so
 * its HP stays pinned on screen at all times instead of requiring a click. Screen-space (drawn after the
 * camera transform is restored) so it doesn't drift with pan/zoom like the world-space HP-by-alpha cue
 * every other monster gets.
 */
function drawBossHpBar(ctx: CanvasRenderingContext2D, viewport: Viewport, world: MerandiWorld): void {
  const boss = world.monsters.find((m) => m.kind === 'boss');
  if (!boss) return;

  const width = Math.min(viewport.width - 32, BOSS_BAR_WIDTH);
  const x = (viewport.width - width) / 2;
  const y = BOSS_BAR_Y;
  const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));

  ctx.save();
  const label = `${MONSTER_KIND_NAME.boss} ${Math.max(0, Math.ceil(boss.hp))} / ${boss.maxHp}`;
  ctx.font = '700 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = HALO;
  ctx.strokeText(label, viewport.width / 2, y - 4);
  ctx.fillStyle = INK;
  ctx.fillText(label, viewport.width / 2, y - 4);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(20,24,26,0.12)';
  ctx.fillRect(x, y, width, BOSS_BAR_HEIGHT);
  ctx.fillStyle = MONSTER_COLOR;
  ctx.fillRect(x, y, width * pct, BOSS_BAR_HEIGHT);
  ctx.strokeStyle = 'rgba(20,24,26,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, BOSS_BAR_HEIGHT - 1);
  ctx.restore();
}

export function renderMerandiScene(
  ctx: CanvasRenderingContext2D,
  world: MerandiWorld,
  myId: string,
  viewport: Viewport,
  camera: Point = [0, 0],
  selection: Selection | null = null,
  showGradeTable = false
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

        const haloAlpha = HALO_ALPHA_BY_GRADE[member.grade];
        if (haloAlpha) {
          const halo = ctx.createRadialGradient(mx, my, r * 0.4, mx, my, r * 2.1);
          halo.addColorStop(0, hexToRgba(g.color, haloAlpha));
          halo.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.beginPath();
          ctx.arc(mx, my, r * 2.1, 0, Math.PI * 2);
          ctx.fillStyle = halo;
          ctx.fill();
        }

        drawArcheGlyph(ctx, mx, my, r, member.arche);
        ctx.lineWidth = Math.max(0.8, g.sizeMult * 1.1);
        ctx.strokeStyle = g.color;
        ctx.stroke();
        ctx.fillStyle = 'rgba(20,24,26,0.16)';
        ctx.fill();

        const foil = FOIL_BY_GRADE[member.grade];
        if (foil) drawFoilSweep(ctx, mx, my, r, member.arche, member.id, foil);

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
    // Shared kill gold (see engine.ts's awardKillGold) accumulates in fractional amounts to avoid
    // rounding leakage — floored here purely for display, the real balance stays exact underneath.
    const text = `${label}${label === myLabel ? ' (나)' : ''} ${Math.floor(zone.gold)}G`;
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

    drawStatusEffects(ctx, m, x, y, r);
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

    if (shot.grade >= SHOT_GLOW_MIN_GRADE) {
      const glowColor = GRADES[shot.grade].color;
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = shot.grade >= CELEBRATION_MIN_GRADE ? 12 : 7;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = glowColor;
      ctx.fill();
      ctx.restore();
    }

    // 마법사 splash — a ring expanding out to the true splash radius as the shot nears impact, so the
    // area that's about to take splash damage is visible right when it matters.
    if (shot.splash && progress > 0.6) {
      const splashRadius = MAGE_SPLASH_RADIUS[specialEffectTier(shot.grade)];
      const ringT = (progress - 0.6) / 0.4; // 0 at 60% flight, 1 at impact
      ctx.beginPath();
      ctx.arc(x, y, splashRadius * ringT, 0, Math.PI * 2);
      ctx.strokeStyle = GRADES[shot.grade].color;
      ctx.globalAlpha = 0.5 * ringT;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

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
  drawBossHpBar(ctx, viewport, world);
  const mine = world.zones.find((z) => z.id === myId);
  if (showGradeTable) drawGradeTable(ctx, viewport);
  else if (mine?.armed) drawActionLegend(ctx, viewport, mine);
  else if (selection) drawInspectPanel(ctx, viewport, world, selection);
  else drawKillBoard(ctx, viewport, world);

  // Drawn last, unconditionally — a 레전더리+ draw shouldn't stay hidden just because someone's holding
  // V or has a menu open.
  if (world.celebrations.length) drawCelebrations(ctx, viewport, world.celebrations);
}
