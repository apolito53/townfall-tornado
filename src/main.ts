import { GameApp } from './app/GameApp';
import { initDebugLogger } from './diagnostics/debugLogger';
import { requireElement } from './ui/dom';
import './styles.css';

const logger = initDebugLogger();
const app = new GameApp({
  canvas: requireElement<HTMLCanvasElement>('#game-canvas'),
  diagnosticsElement: requireElement<HTMLElement>('#diagnostics'),
  logger,
});

window.__townfallApp = app;
window.__townfallGame = app;
app.start();

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    app.dispose();
  });
}
