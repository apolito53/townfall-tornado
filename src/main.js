import { Game } from './game.js';
import './styles.css';

const game = new Game({
  canvas: document.querySelector('#game-canvas'),
  diagnosticsElement: document.querySelector('#diagnostics'),
});

// Local prototype hook for browser-side tuning and render smoke checks.
window.__townfallGame = game;

document.querySelector('#restart-button').addEventListener('click', () => {
  game.restart();
  game.setPaused(false);
});

document.querySelector('#pause-button').addEventListener('click', () => {
  game.setPaused(true);
});

document.querySelector('#resume-button').addEventListener('click', () => {
  game.setPaused(false);
});

document.querySelector('#perspective-slider').addEventListener('input', (event) => {
  game.setPerspective(Number(event.target.value) / 100);
});

game.start();
