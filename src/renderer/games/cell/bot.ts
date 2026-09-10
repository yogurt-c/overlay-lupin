/** A lightweight rule-based pilot for filler cells — no pathfinding, just flee/chase/forage by distance. */
import { EAT_RATIO } from './arena.js';
import type { CellInput, FoodDot } from './types.js';

const THREAT_RADIUS = 90;
const CHASE_RADIUS = 70;
/** Ignore direction components this small so a bot doesn't jitter in place once it's basically on target. */
const DEAD_ZONE = 4;

interface BotBody {
  x: number;
  y: number;
  mass: number;
}

/** Random Korean nicknames, same flavor as a stranger's device name — no "Bot" label, no numbering. */
const BOT_NAME_POOL = [
  '조용한 너구리',
  '느긋한 하마',
  '수줍은 다람쥐',
  '엉뚱한 고슴도치',
  '차분한 올빼미',
  '재빠른 수달',
  '겁많은 펭귄',
  '든든한 오소리',
  '말없는 여우',
  '푸근한 판다',
  '시크한 고양이',
  '순한 알파카',
  '용감한 햄스터',
  '느린 거북이',
  '깜찍한 물개'
];

export function randomBotName(): string {
  return BOT_NAME_POOL[Math.floor(Math.random() * BOT_NAME_POOL.length)];
}

function directionInput(dx: number, dy: number): Pick<CellInput, 'up' | 'down' | 'left' | 'right'> {
  return {
    left: dx < -DEAD_ZONE,
    right: dx > DEAD_ZONE,
    up: dy < -DEAD_ZONE,
    down: dy > DEAD_ZONE
  };
}

function nearestFood(self: BotBody, food: FoodDot[]): FoodDot | null {
  let best: FoodDot | null = null;
  let bestScore = Infinity;
  for (const f of food) {
    // A big pellet is worth detouring for, so treat it as if it were closer than it really is.
    const score = Math.hypot(f.x - self.x, f.y - self.y) * (f.big ? 0.6 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/** Flees the nearest real threat, chases the nearest easy meal, otherwise beelines for food. */
export function computeBotInput(self: BotBody, neighbors: BotBody[], food: FoodDot[]): CellInput {
  let threat: BotBody | null = null;
  let threatDist = Infinity;
  let prey: BotBody | null = null;
  let preyDist = Infinity;

  for (const n of neighbors) {
    const d = Math.hypot(n.x - self.x, n.y - self.y);
    if (n.mass > self.mass * EAT_RATIO && d < THREAT_RADIUS && d < threatDist) {
      threat = n;
      threatDist = d;
    } else if (self.mass > n.mass * EAT_RATIO && d < CHASE_RADIUS && d < preyDist) {
      prey = n;
      preyDist = d;
    }
  }

  if (threat) {
    // No boost here: a chaser only closes the gap by spending mass on their own boost, and a
    // fleeing bot matching that burst 1:1 would cancel it out, making a boosting bot literally uncatchable.
    return { ...directionInput(self.x - threat.x, self.y - threat.y), boost: false };
  }

  const target = prey ?? nearestFood(self, food);
  if (!target) return { up: false, down: false, left: false, right: false, boost: false };
  return { ...directionInput(target.x - self.x, target.y - self.y), boost: false };
}
