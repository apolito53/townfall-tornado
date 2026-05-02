import { Game } from './game.js';
import './styles.css';

const game = new Game({
  canvas: document.querySelector('#game-canvas'),
  diagnosticsElement: document.querySelector('#diagnostics'),
});

document.querySelector('#restart-button').addEventListener('click', () => {
  game.restart();
});

game.start();
