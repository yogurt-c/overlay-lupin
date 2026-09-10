import { soccerRules } from './ruleset.js';
import type { GameRules } from './rules.js';

/**
 * Ball-sport rulesets sharing this one engine (`engine.ts`). A future
 * variant of the same "two figures + one ball" genre would register here
 * too; a genuinely different genre gets its own sibling under `games/`.
 */
export const RULES: Record<string, GameRules> = {
  soccer: soccerRules
};
