import { clamp01 } from '../core/math';
import { createWorldSeed } from '../core/random';
import type {
  AppPhase,
  GameMode,
  SessionSnapshot,
  WorldSeed,
} from '../core/types';
import { getGameModeDefinition } from './gameModes';

export class GameSession {
  private nextSessionId = 1;
  private sessionId = 0;
  private mode: GameMode | null = null;
  private phase: AppPhase = 'menu';
  private elapsedSeconds = 0;
  private distanceTraveled = 0;
  private restartCount = 0;
  private seed: WorldSeed = createWorldSeed('townfall:v2:menu');

  start(mode: GameMode): SessionSnapshot {
    this.mode = mode;
    this.phase = 'running';
    this.elapsedSeconds = 0;
    this.distanceTraveled = 0;
    this.restartCount = 0;
    this.sessionId = this.nextSessionId;
    this.nextSessionId += 1;
    this.seed = createWorldSeed(`townfall:v2:${mode}:diorama`);
    return this.snapshot();
  }

  restart(): SessionSnapshot {
    if (this.mode === null) {
      return this.start('levels');
    }

    this.phase = 'running';
    this.elapsedSeconds = 0;
    this.distanceTraveled = 0;
    this.restartCount += 1;
    return this.snapshot();
  }

  showMenu(): SessionSnapshot {
    this.phase = 'menu';
    return this.snapshot();
  }

  setPaused(paused: boolean): SessionSnapshot {
    if (this.mode === null || this.phase === 'menu') {
      return this.snapshot();
    }

    this.phase = paused ? 'paused' : 'running';
    return this.snapshot();
  }

  update(deltaSeconds: number, distanceDelta: number): void {
    if (this.phase !== 'running') {
      return;
    }

    this.elapsedSeconds += Math.max(0, deltaSeconds);
    this.distanceTraveled += Math.max(0, distanceDelta);
  }

  snapshot(): SessionSnapshot {
    return {
      id: this.sessionId,
      mode: this.mode,
      phase: this.phase,
      paused: this.phase === 'paused',
      elapsedSeconds: this.elapsedSeconds,
      distanceTraveled: this.distanceTraveled,
      objectiveProgress: this.getObjectiveProgress(),
      restartCount: this.restartCount,
      seed: this.seed,
    };
  }

  private getObjectiveProgress(): number {
    if (this.mode === null) {
      return 0;
    }

    const target = getGameModeDefinition(this.mode).objectiveDistance;
    return target === null ? 0 : clamp01(this.distanceTraveled / target);
  }
}
