import { CATEGORY_MASS_REQUIREMENTS, MAX_TORNADO_CATEGORY } from './categoryProgression';

function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) {
    return '∞';
  }

  const clampedSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const remainingSeconds = clampedSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export class Hud {
  levelLabel: HTMLElement;
  levelName: HTMLElement;
  objectiveLabel: HTMLElement;
  levelProgressBar: HTMLElement;
  categoryLabel: HTMLElement;
  massLabel: HTMLElement;
  scoreLabel: HTMLElement;
  damageLabel: HTMLElement;
  timeLabel: HTMLElement;
  growthBar: HTMLElement;
  message: HTMLElement;
  messageTimeout: number;

  constructor() {
    this.levelLabel = document.querySelector('#level-label') as HTMLElement;
    this.levelName = document.querySelector('#level-name') as HTMLElement;
    this.objectiveLabel = document.querySelector('#objective-label') as HTMLElement;
    this.levelProgressBar = document.querySelector('#level-progress-bar') as HTMLElement;
    this.categoryLabel = document.querySelector('#category-label') as HTMLElement;
    this.massLabel = document.querySelector('#mass-label') as HTMLElement;
    this.scoreLabel = document.querySelector('#score-label') as HTMLElement;
    this.damageLabel = document.querySelector('#damage-label') as HTMLElement;
    this.timeLabel = document.querySelector('#time-label') as HTMLElement;
    this.growthBar = document.querySelector('#growth-bar') as HTMLElement;
    this.message = document.querySelector('#storm-message') as HTMLElement;
    this.messageTimeout = 0;
  }

  flashMessage(text, duration = 1.9) {
    this.message.textContent = text;
    this.messageTimeout = duration;
  }

  update(state, dt) {
    const levelScore = Math.max(0, state.levelScore ?? 0);
    const scoreTarget = Math.max(1, state.scoreTarget ?? 1);
    const damageTarget = Math.max(0.01, state.damageTarget ?? 0.01);
    const damagePercent = Math.round(state.destroyedRatio * 100);
    const targetPercent = Math.round(damageTarget * 100);
    const scoreProgress = levelScore / scoreTarget;
    const damageProgress = state.destroyedRatio / damageTarget;
    const objectiveProgress = Math.min(1, Math.min(scoreProgress, damageProgress));

    if (state.mode === 'endless') {
      this.levelLabel.textContent = 'Endless';
      this.levelName.textContent = 'Free Roam';
      this.objectiveLabel.textContent = `Score ${formatNumber(state.score)} + Town ${damagePercent}%`;
      this.levelProgressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, state.destroyedRatio))})`;
    } else {
      this.levelLabel.textContent = `Level ${state.levelNumber} / ${state.levelCount}`;
      this.levelName.textContent = state.levelName;
      this.objectiveLabel.textContent = `Goal ${formatNumber(levelScore)} / ${formatNumber(scoreTarget)} + ${damagePercent}% / ${targetPercent}%`;
      this.levelProgressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, objectiveProgress))})`;
    }

    this.categoryLabel.textContent = `CAT ${state.category}`;
    this.massLabel.textContent = formatNumber(state.mass);
    this.scoreLabel.textContent = formatNumber(state.score);
    this.damageLabel.textContent = `${Math.round(state.destroyedRatio * 100)}%`;
    this.timeLabel.textContent = formatTime(state.remainingTime);

    const currentTarget = CATEGORY_MASS_REQUIREMENTS[state.category - 1] ?? 0;
    const nextTarget = CATEGORY_MASS_REQUIREMENTS[state.category] ?? CATEGORY_MASS_REQUIREMENTS.at(-1);
    const growthProgress = state.category >= MAX_TORNADO_CATEGORY
      ? 1
      : (state.mass - currentTarget) / Math.max(1, nextTarget - currentTarget);
    this.growthBar.style.transform = `scaleX(${Math.min(1, Math.max(0, growthProgress))})`;

    if (this.messageTimeout > 0) {
      this.messageTimeout -= dt;
      this.message.classList.toggle('storm-message--visible', this.messageTimeout > 0);
    } else {
      this.message.textContent = '';
      this.message.classList.remove('storm-message--visible');
    }
  }
}
