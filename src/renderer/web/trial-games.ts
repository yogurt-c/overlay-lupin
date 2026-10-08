import { soccerModule } from '../games/soccer/module.js';
import { fenceModule } from '../games/fence/module.js';
import { towerModule } from '../games/tower/module.js';
import type { GameModule } from '../games/types.js';

/**
 * Games offered on the GitHub Pages "브라우저로 한 판" trial. Each must support
 * `createSoloMatch`, since the browser has no LAN peer to play against.
 */
export const TRIAL_GAMES: readonly GameModule[] = [soccerModule, fenceModule, towerModule];

/** Unknown or missing ids fall back to the first trial game rather than a blank page. */
export function resolveTrialGame(id: string | null): GameModule {
  return TRIAL_GAMES.find((mod) => mod.id === id) ?? TRIAL_GAMES[0];
}

/** Splits a module hint into control lines on top-level ' · ' only — a hint may nest ' · ' inside parentheses. */
export function splitHint(hint: string): string[] {
  return hint.split(/ · (?![^(]*\))/);
}
