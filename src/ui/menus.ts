import type {
  AppPhase,
  GameMode,
} from '../core/types';
import {
  isCustomQualityKey,
  isQualityMode,
  type QualityManager,
  type QualityState,
} from '../quality/QualityManager';
import { requireElement } from './dom';

export interface MenuActions {
  startMode(mode: GameMode): void;
  restartCurrentMode(): void;
  setPaused(paused: boolean): void;
  showStartScreen(): void;
  setPerspective(amount: number): void;
}

export class Menus {
  private readonly abortController = new AbortController();
  private readonly appElement = requireElement<HTMLElement>('#app');
  private readonly startScreen = requireElement<HTMLElement>('#start-screen');
  private readonly pauseMenu = requireElement<HTMLElement>('#pause-menu');
  private readonly pauseButton = requireElement<HTMLButtonElement>('#pause-button');
  private readonly retryButton = requireElement<HTMLButtonElement>('#retry-level-button');
  private readonly perspectiveSlider = requireElement<HTMLInputElement>('#perspective-slider');
  private readonly qualityButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-quality-option]'),
  );
  private readonly qualitySummaries = Array.from(
    document.querySelectorAll<HTMLElement>('[data-quality-summary]'),
  );
  private readonly qualitySliders = Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-quality-slider]'),
  );
  private readonly qualityToggles = Array.from(
    document.querySelectorAll<HTMLInputElement>('[data-quality-toggle]'),
  );
  private readonly unsubscribeQuality: () => void;

  constructor(
    actions: MenuActions,
    qualityManager: QualityManager,
  ) {
    const listenerOptions = { signal: this.abortController.signal };
    requireElement<HTMLButtonElement>('#levels-mode-button').addEventListener(
      'click',
      () => {
        actions.startMode('levels');
      },
      listenerOptions,
    );
    requireElement<HTMLButtonElement>('#endless-mode-button').addEventListener(
      'click',
      () => {
        actions.startMode('endless');
      },
      listenerOptions,
    );
    requireElement<HTMLButtonElement>('#restart-button').addEventListener(
      'click',
      () => {
        actions.restartCurrentMode();
      },
      listenerOptions,
    );
    this.retryButton.addEventListener(
      'click',
      () => {
        actions.restartCurrentMode();
      },
      listenerOptions,
    );
    this.pauseButton.addEventListener(
      'click',
      () => {
        actions.setPaused(true);
      },
      listenerOptions,
    );
    requireElement<HTMLButtonElement>('#resume-button').addEventListener(
      'click',
      () => {
        actions.setPaused(false);
      },
      listenerOptions,
    );
    requireElement<HTMLButtonElement>('#mode-select-button').addEventListener(
      'click',
      () => {
        actions.showStartScreen();
      },
      listenerOptions,
    );
    this.perspectiveSlider.addEventListener(
      'input',
      () => {
        actions.setPerspective(Number(this.perspectiveSlider.value) / 100);
      },
      listenerOptions,
    );

    for (const button of this.qualityButtons) {
      button.addEventListener(
        'click',
        () => {
          const requestedMode = button.dataset.qualityOption;
          if (isQualityMode(requestedMode)) {
            qualityManager.setMode(requestedMode);
          }
        },
        listenerOptions,
      );
    }

    for (const slider of this.qualitySliders) {
      slider.addEventListener(
        'input',
        () => {
          const key = slider.dataset.qualitySlider;
          if (
            isCustomQualityKey(key)
            && key !== 'shadows'
            && key !== 'bloom'
          ) {
            qualityManager.setCustomValue(key, Number(slider.value));
          }
        },
        listenerOptions,
      );
    }

    for (const toggle of this.qualityToggles) {
      toggle.addEventListener(
        'change',
        () => {
          const key = toggle.dataset.qualityToggle;
          if (key === 'shadows' || key === 'bloom') {
            qualityManager.setCustomValue(key, toggle.checked);
          }
        },
        listenerOptions,
      );
    }

    this.unsubscribeQuality = qualityManager.subscribe((state) => {
      this.syncQualityControls(state);
    });
  }

  dispose(): void {
    this.abortController.abort();
    this.unsubscribeQuality();
  }

  setPhase(phase: AppPhase, mode: GameMode | null): void {
    const menuVisible = phase === 'menu';
    const pauseVisible = phase === 'paused';
    this.appElement.classList.toggle('is-starting', menuVisible);
    this.startScreen.hidden = !menuVisible;
    this.startScreen.setAttribute('aria-hidden', String(!menuVisible));
    this.pauseMenu.hidden = !pauseVisible;
    this.pauseMenu.setAttribute('aria-hidden', String(!pauseVisible));
    this.pauseButton.hidden = menuVisible || pauseVisible;
    this.retryButton.hidden = mode !== 'levels';
  }

  setMobileControlsEnabled(enabled: boolean): void {
    this.appElement.classList.toggle('has-mobile-controls', enabled);
  }

  setPerspective(amount: number): void {
    this.perspectiveSlider.value = String(Math.round(amount * 100));
  }

  private syncQualityControls(state: QualityState): void {
    for (const button of this.qualityButtons) {
      const isCurrent = button.dataset.qualityOption === state.mode;
      button.setAttribute('aria-pressed', String(isCurrent));
    }
    for (const summary of this.qualitySummaries) {
      summary.textContent = state.summary;
    }
    for (const slider of this.qualitySliders) {
      const key = slider.dataset.qualitySlider;
      if (
        isCustomQualityKey(key)
        && key !== 'shadows'
        && key !== 'bloom'
      ) {
        const value = state.customSettings[key];
        slider.value = String(value);
        const valueElements = document.querySelectorAll<HTMLElement>(
          `[data-quality-value="${key}"]`,
        );
        for (const valueElement of valueElements) {
          valueElement.textContent = `${value}%`;
        }
      }
    }
    for (const toggle of this.qualityToggles) {
      const key = toggle.dataset.qualityToggle;
      if (key === 'shadows' || key === 'bloom') {
        toggle.checked = state.customSettings[key];
      }
    }
  }
}
