const CATEGORY_MASS_TARGETS = [0, 28, 80, 160, 285, 440];

function formatNumber(value) {
  return Math.round(value).toLocaleString('en-US');
}

function formatTime(seconds) {
  const clampedSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(clampedSeconds / 60);
  const remainingSeconds = clampedSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    this.categoryLabel = document.querySelector('#category-label');
    this.massLabel = document.querySelector('#mass-label');
    this.scoreLabel = document.querySelector('#score-label');
    this.damageLabel = document.querySelector('#damage-label');
    this.timeLabel = document.querySelector('#time-label');
    this.growthBar = document.querySelector('#growth-bar');
    this.message = document.querySelector('#storm-message');
    this.messageTimeout = 0;
  }

  flashMessage(text, duration = 1.9) {
    this.message.textContent = text;
    this.messageTimeout = duration;
  }

  update(state, dt) {
    this.categoryLabel.textContent = `CAT ${state.category}`;
    this.massLabel.textContent = formatNumber(state.mass);
    this.scoreLabel.textContent = formatNumber(state.score);
    this.damageLabel.textContent = `${Math.round(state.destroyedRatio * 100)}%`;
    this.timeLabel.textContent = formatTime(state.remainingTime);

    const currentTarget = CATEGORY_MASS_TARGETS[state.category - 1] ?? 0;
    const nextTarget = CATEGORY_MASS_TARGETS[state.category] ?? CATEGORY_MASS_TARGETS.at(-1);
    const growthProgress = state.category >= 5
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
