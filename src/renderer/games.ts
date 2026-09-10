export interface GameDef {
  id: string;
  label: string;
}

/** Add new entries here to expose another game in the matching panel. */
export const GAMES: GameDef[] = [
  { id: 'soccer', label: '축구' },
];
