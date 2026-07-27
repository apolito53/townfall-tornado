import type { GameMode } from '../core/types';

export interface GameModeDefinition {
  id: GameMode;
  eyebrow: string;
  title: string;
  objectiveDistance: number | null;
  durationSeconds: number | null;
}

export const GAME_MODE_DEFINITIONS: Record<GameMode, GameModeDefinition> = {
  levels: {
    id: 'levels',
    eyebrow: 'Level 1 / 1',
    title: 'Valley Approach',
    objectiveDistance: 250,
    durationSeconds: 180,
  },
  endless: {
    id: 'endless',
    eyebrow: 'Endless',
    title: 'Free Roam',
    objectiveDistance: null,
    durationSeconds: null,
  },
};

export function getGameModeDefinition(mode: GameMode): GameModeDefinition {
  return GAME_MODE_DEFINITIONS[mode];
}
