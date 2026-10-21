/** Matches the cap games already apply to member names (e.g. the fishing engine's `name.slice(0, 24)`). */
export const NICKNAME_MAX_LENGTH = 24;

/**
 * Returns the cleaned nickname, or null when nothing usable is left. Control characters are dropped
 * and whitespace runs collapse to one space, so a name always renders on a single line. Length is
 * counted in code points so an emoji counts as one character.
 */
export function normalizeNickname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const length = Array.from(cleaned).length;
  if (length === 0 || length > NICKNAME_MAX_LENGTH) return null;
  return cleaned;
}
