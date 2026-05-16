import type { Game } from './game';

declare global {
  interface Window {
    __townfallDiagnostics?: Record<string, unknown>;
    __townfallGame?: Game;
    __townfallLog?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;
  }
}

export {};
