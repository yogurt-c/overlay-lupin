import { JumpmapEngine } from './engine.js';
import { GOAL_Y, START_X, START_Y, movingPlatformX, WORLD_WIDTH } from './field.js';
import type { PlatformSpec } from './field.js';
import type { RunnerState } from './types.js';

const IDLE = { left: false, right: false, jump: false, down: false, attack: false };
const SECTIONS = 14;
export type Pattern = 'zigzag' | 'precision' | 'moving' | 'pair' | 'fork' | 'spring' | 'traverse' | 'switchback' | 'gauntlet';
const PATTERNS: Pattern[] = ['zigzag', 'precision', 'moving', 'pair', 'fork', 'spring', 'traverse', 'switchback', 'gauntlet'];
export interface Course { seed: number; platforms: PlatformSpec[]; route: string[]; patterns: Pattern[] }
export interface Trace { state: RunnerState; tick: number }
export interface GenerationProgress { percent: number; course?: Course }

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = Math.imul(value ^ value >>> 15, value | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
function at(id: string, x: number, y: number, w: number, kind: PlatformSpec['kind'] = 'static'): PlatformSpec {
  return { id, x: Math.round(x - w / 2), y: Math.round(y), w, kind };
}
export function startTrace(): Trace {
  const engine = new JumpmapEngine(true);
  engine.ensurePlayer('bot', 'bot');
  return { state: engine.snapshot(true).players[0].state!, tick: 0 };
}

/** Search inputs using the same collision and movement code as the game. Each
 * hop starts at the previous hop's actual landing state, including spring velocity.
 * Yield after each attempted hop so generation cannot monopolize the UI thread. */
export function* traceRoute(platforms: PlatformSpec[], route: string[], initial = startTrace()): Generator<void, Trace | null> {
  const engine = new JumpmapEngine(true, platforms);
  let trace = initial;
  for (const id of route) {
    const target = platforms.find(p => p.id === id)!;
    let landed: Trace | null = null;
    const source = platforms.find(p => p.id === trace.state.standingOn);
    const airborne = trace.state.airborne;
    const moving = source?.kind === 'moving' || target.kind === 'moving';
    const waits = airborne ? [0] : moving ? [0, 12, 24, 40, 60, 85, 115, 150, 195, 240] : [0];
    for (const wait of waits) {
      for (const fraction of airborne ? [0.5] : [0.5, 0.2, 0.8]) {
        engine.restore('bot', trace.state, trace.tick, 'race');
        const player = engine.players.get('bot')!;
        let elapsed = 0;
        if (source) {
          // Reposition on the platform without teleporting the bot to a takeoff point.
          for (; elapsed < 80; elapsed++) {
            const x = movingPlatformX(source, trace.tick + elapsed + 1) + source.w * fraction;
            if (Math.abs(player.x - x) <= 3) break;
            engine.setInput('bot', { ...IDLE, left: player.x > x, right: player.x < x });
            engine.step();
            if (player.airborne) break;
          }
          for (let t = 0; t < wait && !player.airborne; t++, elapsed++) {
            engine.setInput('bot', IDLE); engine.step();
          }
        }
        if (!airborne && !player.airborne) {
          engine.setInput('bot', IDLE); engine.step(); elapsed++;
        }
        if (airborne || !player.airborne) {
          for (let t = 0; t < 110; t++) {
            const x = movingPlatformX(target, trace.tick + elapsed + t + 1) + target.w / 2;
            engine.setInput('bot', { ...IDLE, left: player.x > x + 2, right: player.x < x - 2,
              jump: t === 0 && !airborne });
            engine.step();
            if (player.impact?.platformId === id) {
              const snapshot = engine.snapshot(true);
              landed = { state: snapshot.players[0].state!, tick: snapshot.tick };
              break;
            }
            if (t > 1 && !player.airborne) break;
          }
        }
        yield;
        if (landed) break;
      }
      if (landed) break;
    }
    if (!landed) return null;
    trace = landed;
  }
  return trace;
}

/** Seeded challenge patterns with bounded retries and a final static repair.
 * Fixed start/goal elevations keep camera bounds and progress comparable each round. */
export function* generateCourse(seed: number): Generator<GenerationProgress, Course> {
  const rng = random(seed);
  const platforms = [at('start', START_X, START_Y, 190, 'start')];
  const route: string[] = [];
  const patterns: Pattern[] = [];
  let witnesses = [0, 60, 137, 279].map(tick => ({ ...startTrace(), tick }));
  // A shuffled bag guarantees different challenges, instead of letting rejection
  // sampling quietly replace the interesting sections with easy stairs.
  const bag = [...PATTERNS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  const plan = [...bag];
  while (plan.length < SECTIONS) {
    const choices: Pattern[] = ['precision', 'pair', 'traverse', 'switchback', 'gauntlet'];
    const next = choices[Math.floor(rng() * choices.length)];
    if (next !== plan[plan.length - 1]) plan.push(next);
  }
  const tops = Array.from({ length: SECTIONS }, (_, i) => i === SECTIONS - 1 ? GOAL_Y :
    Math.round(START_Y - (START_Y - GOAL_Y) * (i + 1) / SECTIONS + (rng() - 0.5) * 70));
  yield { percent: 0 };
  for (let section = 0; section < SECTIONS; section++) {
    const entry = platforms[platforms.length - 1];
    const top = tops[section];
    const height = entry.y - Math.round(top);
    const difficulty = section / (SECTIONS - 1);
    let accepted = false;
    for (let attempt = 0; attempt < 17 && !accepted; attempt++) {
      const repair = attempt === 16;
      const pattern = repair ? 'zigzag' as Pattern : plan[section];
      // Only the final few attempts soften spacing. Keep platform kinds, narrow
      // landings and the section's direction changes when repairing a challenge.
      const relief = Math.max(0, attempt - 11) * 4;
      const count = pattern === 'fork' ? 6 : pattern === 'spring' ? (height < 355 ? 3 : 4) :
        Math.ceil(height / (pattern === 'traverse' ? 67 : 88));
      const rises: number[] = [];
      let remaining = height;
      for (let i = 0; i < count; i++) {
        const left = count - i - 1;
        const nominal = remaining / (left + 1);
        const rise = left === 0 ? remaining : Math.round(Math.max(remaining - left * 97,
          Math.min(remaining - left * 55, nominal + (rng() - 0.5) * 30)));
        rises.push(rise); remaining -= rise;
      }
      if (pattern === 'fork') rises.splice(0, rises.length, 60, 60, 60,
        Math.floor((height - 180) / 3), Math.floor((height - 180) / 3), height - 180 - 2 * Math.floor((height - 180) / 3));
      if (pattern === 'spring') rises.splice(0, rises.length, ...(count === 3 ?
        [70, height - 140, 70] : [70, 70, height - 215, 75]));
      const candidate: PlatformSpec[] = [];
      const entryX = entry.x + entry.w / 2;
      let cx = entryX;
      let direction = rng() < 0.5 ? -1 : 1;
      let y = entry.y;
      for (let i = 0; i < count; i++) {
        const last = i === count - 1;
        const rise = rises[i];
        y -= rise;
        if ((pattern === 'zigzag' && i % 2 === 1) || (pattern === 'switchback' && i > 0) ||
          (pattern === 'gauntlet' && i === 2)) direction *= -1;
        // Long low jumps, tall precision jumps and spring flights have different
        // geometry. Ordinary jumps now demand using the takeoff edge.
        const springFlight = pattern === 'spring' && i === count - 2;
        let distance = repair ? 60 : springFlight ? 145 + rng() * 45 :
          pattern === 'traverse' ? 120 + rng() * 25 :
          pattern === 'fork' ? 70 + rng() * 16 :
          (rise > 88 ? 86 : 100) + rng() * (18 + difficulty * 14);
        distance -= repair ? 0 : relief;
        // The detour bends around the shortcut, rather than making both routes
        // the same diagonal staircase with a different number of steps.
        if (pattern === 'fork' && i === 1) direction *= -1;
        if (cx + direction * distance < 130 || cx + direction * distance > WORLD_WIDTH - 130) direction *= -1;
        cx += direction * distance;
        const rest = section % 4 === 3;
        const width = last ? (rest ? 112 : 74) : repair ? 70 : Math.max(22,
          Math.round(52 - difficulty * 28 - (pattern === 'precision' || pattern === 'switchback' ? 10 : 0) + rng() * 7));
        const p = at(last && section === SECTIONS - 1 ? 'goal' : `s${section}p${i}`, cx, last ? top : y, width,
          last && section === SECTIONS - 1 ? 'goal' : 'static');
        const moving = !repair && !last && ((pattern === 'moving' && i % 2 === 0) ||
          (pattern === 'pair' && (i === 1 || i === 2)) || (pattern === 'gauntlet' && i % 2 === 1));
        if (moving) {
          Object.assign(p, { kind: 'moving', amplitude: Math.round(48 + difficulty * 30 + rng() * 14),
            speed: Number((0.027 + difficulty * 0.011 + rng() * 0.006).toFixed(4)),
            phase: Number(((i % 2 ? Math.PI : 0) + rng() * 0.6).toFixed(3)) });
        }
        if (pattern === 'spring' && i === count - 3) Object.assign(p,
          { kind: 'trampoline', x: Math.round(cx - 35), w: 70, launchTargetId: `s${section}p${i + 1}` });
        candidate.push(p);
      }
      const main = candidate.map(p => p.id);
      let shortcut: string[] | undefined;
      if (pattern === 'fork') {
        const merge = candidate[2];
        const x = (entryX + merge.x + merge.w / 2) / 2;
        const short = at(`s${section}short`, x, entry.y - 90, Math.round(29 - difficulty * 7));
        short.label = '↑ 지름길';
        candidate[0].label = '돌아가기';
        candidate.push(short);
        shortcut = [short.id, ...main.slice(2)];
      }
      const combined = [...platforms, ...candidate].sort((a, b) => b.y - a.y);
      const progress = Math.floor(90 * section / SECTIONS);
      const verified: Trace[] = [];
      for (const witness of witnesses) {
        const check = traceRoute(combined, main, witness);
        let result = check.next();
        while (!result.done) { yield { percent: progress }; result = check.next(); }
        if (!result.value) break;
        if (shortcut) {
          const branch = traceRoute(combined, shortcut, witness);
          let checked = branch.next();
          while (!checked.done) { yield { percent: progress }; checked = branch.next(); }
          if (!checked.value) break;
        }
        verified.push(result.value);
      }
      if (verified.length === witnesses.length) {
        platforms.splice(0, platforms.length, ...combined);
        route.push(...main); patterns.push(pattern);
        witnesses = verified; accepted = true;
      }
      yield { percent: Math.floor(90 * (section + Number(accepted)) / SECTIONS) };
    }
    if (!accepted) throw new Error(`Could not repair section ${section}`);
  }
  const course = { seed: seed >>> 0, platforms, route, patterns };
  yield { percent: 90, course };
  return course;
}
