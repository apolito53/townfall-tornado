import type { Game } from './game';

declare global {
  interface Window {
    __townfallDiagnostics?: Record<string, unknown>;
    __townfallGame?: Game;
  }
}

export {};
