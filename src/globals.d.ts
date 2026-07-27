import type { GameApp } from './app/GameApp';
import type { RuntimeDiagnostics } from './core/types';

declare global {
  interface Window {
    __townfallApp?: GameApp;
    __townfallGame?: GameApp;
    __townfallDiagnostics?: RuntimeDiagnostics;
    __townfallLog?: (
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string,
      data?: unknown,
    ) => void;
  }
}

export {};
