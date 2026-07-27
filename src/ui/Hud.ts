import type { SessionSnapshot } from '../core/types';
import { getGameModeDefinition } from '../app/gameModes';
import { requireElement } from './dom';

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export class Hud {
  private readonly levelLabel = requireElement<HTMLElement>('#level-label');
  private readonly levelName = requireElement<HTMLElement>('#level-name');
  private readonly objectiveLabel = requireElement<HTMLElement>('#objective-label');
  private readonly progressBar = requireElement<HTMLElement>('#level-progress-bar');
  private readonly categoryLabel = requireElement<HTMLElement>('#category-label');
  private readonly modeLabel = requireElement<HTMLElement>('#mode-label');
  private readonly travelLabel = requireElement<HTMLElement>('#travel-label');
  private readonly stateLabel = requireElement<HTMLElement>('#state-label');
  private readonly timeLabel = requireElement<HTMLElement>('#time-label');
  private readonly growthBar = requireElement<HTMLElement>('#growth-bar');
  private readonly stormMessage = requireElement<HTMLElement>('#storm-message');

  update(snapshot: SessionSnapshot): void {
    if (snapshot.mode === null) {
      this.levelLabel.textContent = 'Townfall';
      this.levelName.textContent = 'Tornado';
      this.objectiveLabel.textContent = '';
      this.categoryLabel.textContent = 'CORE';
      this.modeLabel.textContent = '-';
      this.travelLabel.textContent = '0 m';
      this.stateLabel.textContent = 'IDLE';
      this.timeLabel.textContent = '0:00';
      this.progressBar.style.width = '0%';
      this.growthBar.style.width = '0%';
      this.stormMessage.textContent = '';
      return;
    }

    const definition = getGameModeDefinition(snapshot.mode);
    const distance = Math.floor(snapshot.distanceTraveled);
    this.levelLabel.textContent = definition.eyebrow;
    this.levelName.textContent = definition.title;
    this.categoryLabel.textContent = 'CORE';
    this.modeLabel.textContent = snapshot.mode === 'levels' ? 'LEVEL' : 'ROAM';
    this.travelLabel.textContent = `${distance.toLocaleString()} m`;
    this.stateLabel.textContent = snapshot.paused ? 'PAUSED' : 'ACTIVE';
    this.timeLabel.textContent = definition.durationSeconds === null
      ? '∞'
      : formatTime(definition.durationSeconds - snapshot.elapsedSeconds);

    const progressPercent = Math.round(snapshot.objectiveProgress * 100);
    this.progressBar.style.width = `${progressPercent}%`;
    this.growthBar.style.width = `${progressPercent}%`;
    this.objectiveLabel.textContent = definition.objectiveDistance === null
      ? `Travel ${distance.toLocaleString()} m`
      : `Travel ${distance.toLocaleString()} / ${definition.objectiveDistance.toLocaleString()} m`;
    this.stormMessage.textContent = '';
  }
}
