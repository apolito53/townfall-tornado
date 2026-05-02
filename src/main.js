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
});

game.start();
