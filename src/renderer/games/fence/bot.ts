/**
 * A lightweight rule-based pilot for solo mode. It runs its own `FenceEngine`
 * instance (see module.ts) and just needs an input each tick, exactly like a
 * real player — no pathfinding, just footsie spacing plus a reaction roll
 * against whatever the opponent's pose is currently telegraphing.
 */
import type { FenceInput, FencerState, Pose } from './types.js';

/** Below this range the bot backs off instead of trading blows in a clinch. */
const ENGAGE_MIN = 28;
/** Beyond this range nothing can reach, so the bot closes the distance. */
const ENGAGE_MAX = 46;
/** How far out the bot starts caring about the opponent's blade at all. */
const DANGER_RANGE = 55;
/** Chance per tick the bot actually notices a live threat in time to answer it — leaves room to get cut. */
const REACT_CHANCE = 0.8;
/** Chance per tick, once in range and free to act, that the bot commits to a swing. */
const ATTACK_CHANCE = 0.035;

/** Any pose whose blade is telegraphing or already live. */
const THREAT_POSES: ReadonlySet<Pose> = new Set(['windup', 'windupLow', 'slash', 'slashLow', 'plunge']);
/** Poses that need a low guard rather than a high one. */
const LOW_POSES: ReadonlySet<Pose> = new Set(['windupLow', 'slashLow', 'afterLow']);

const NEUTRAL: FenceInput = { left: false, right: false, jump: false, down: false, action: false, guard: false };

function opposite(dir: -1 | 1): -1 | 1 {
  return dir === 1 ? -1 : 1;
}

function moveDir(dir: -1 | 0 | 1): Pick<FenceInput, 'left' | 'right'> {
  return { left: dir === -1, right: dir === 1 };
}

export interface BotSelf {
  x: number;
}

/** `self`/`opponent` are the bot's own engine's `local`/`remote` — the same shape a human player sees. */
export function computeBotInput(self: BotSelf, opponent: FencerState): FenceInput {
  const dx = opponent.x - self.x;
  const dist = Math.abs(dx);
  const towardOpponent: -1 | 1 = dx >= 0 ? 1 : -1;

  if (THREAT_POSES.has(opponent.pose) && dist < DANGER_RANGE && Math.random() < REACT_CHANCE) {
    // A falling blade isn't in LOW_POSES, so this naturally raises a high guard for it.
    return { ...NEUTRAL, guard: true, down: LOW_POSES.has(opponent.pose) };
  }

  if (dist > ENGAGE_MAX) return { ...NEUTRAL, ...moveDir(towardOpponent) };
  if (dist < ENGAGE_MIN) return { ...NEUTRAL, ...moveDir(opposite(towardOpponent)) };

  if (Math.random() < ATTACK_CHANCE) {
    const roll = Math.random();
    if (roll < 0.2) return { ...NEUTRAL, down: true, action: true };
    if (roll < 0.55) return { ...NEUTRAL, ...moveDir(towardOpponent), action: true };
    return { ...NEUTRAL, action: true };
  }

  return NEUTRAL;
}
