import { Game } from './game';
import { initDebugLogger } from './debugLogger';
import { injectSpeedInsights } from '@vercel/speed-insights';
import './styles.css';

initDebugLogger();
injectSpeedInsights();

const game = new Game({
  canvas: document.querySelector('#game-canvas'),
  diagnosticsElement: document.querySelector('#diagnostics'),
});

// Local prototype hook for browser-side tuning and render smoke checks.
window.__townfallGame = game;

document.querySelector('#levels-mode-button').addEventListener('click', () => {
  game.startLevels();
});

document.querySelector('#endless-mode-button').addEventListener('click', () => {
  game.startEndless();
});

document.querySelector('#restart-button').addEventListener('click', () => {
  game.restartCurrentMode();
  game.setPaused(false);
});

document.querySelector('#retry-level-button').addEventListener('click', () => {
  game.restartLevel();
  game.setPaused(false);
});

document.querySelector('#pause-button').addEventListener('click', () => {
  game.setPaused(true);
});

document.querySelector('#resume-button').addEventListener('click', () => {
  game.setPaused(false);
});

document.querySelector('#mode-select-button').addEventListener('click', () => {
  game.showStartScreen();
});

document.querySelector('#perspective-slider').addEventListener('input', (event) => {
  game.setPerspective(Number((event.target as HTMLInputElement).value) / 100);
});

document.querySelectorAll('[data-quality-option]').forEach((button) => {
  button.addEventListener('click', () => {
    game.setQualityMode((button as HTMLElement).dataset.qualityOption);
  });
});

document.querySelectorAll('[data-quality-slider]').forEach((slider) => {
  slider.addEventListener('input', (event) => {
    game.applyManualQualityControls(event.target as HTMLElement);
  });
});

document.querySelectorAll('[data-quality-toggle]').forEach((toggle) => {
  toggle.addEventListener('change', (event) => {
    game.applyManualQualityControls(event.target as HTMLElement);
  });
});

game.start();
