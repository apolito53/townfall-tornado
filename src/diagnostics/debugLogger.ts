import type { RuntimeDiagnostics } from '../core/types';

type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEBUG_LOG_HEALTH_URL = 'http://127.0.0.1:5176/health';
const DEBUG_LOG_WRITE_URL = 'http://127.0.0.1:5176/log';
const MAX_PENDING_LOGS = 40;
const MAX_SERIALIZED_TEXT = 1800;

export interface DebugLogger {
  readonly enabled: boolean;
  log(level: DebugLogLevel, message: string, data?: unknown): void;
  dispose(): void;
}

function isLocalPage(): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname);
}

function isLogCaptureRequested(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('noDebugLogs')) {
    window.localStorage.setItem('townfall.debugLogs', 'false');
    return false;
  }
  if (params.has('debugLogs')) {
    window.localStorage.setItem('townfall.debugLogs', 'true');
    return true;
  }
  return window.localStorage.getItem('townfall.debugLogs') === 'true';
}

function truncateText(text: string): string {
  return text.length <= MAX_SERIALIZED_TEXT
    ? text
    : `${text.slice(0, MAX_SERIALIZED_TEXT)}... [truncated]`;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === 'string') {
    return truncateText(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) {
          return '[circular]';
        }
        seen.add(nestedValue);
      }
      return typeof nestedValue === 'string'
        ? truncateText(nestedValue)
        : nestedValue;
    });
    if (serialized === undefined) {
      return null;
    }
    if (serialized.length > MAX_SERIALIZED_TEXT) {
      return truncateText(serialized);
    }
    return JSON.parse(serialized) as unknown;
  } catch {
    return String(value);
  }
}

class BrowserDebugLogger implements DebugLogger {
  readonly enabled: boolean;
  private serverAvailable = false;
  private probeFinished = false;
  private pendingLogs: Record<string, unknown>[] = [];
  private readonly originalWarn = console.warn.bind(console);
  private readonly originalError = console.error.bind(console);

  constructor() {
    this.enabled = isLocalPage() && isLogCaptureRequested();
    if (!this.enabled) {
      return;
    }

    window.__townfallLog = (
      level: DebugLogLevel,
      message: string,
      data?: unknown,
    ) => {
      this.log(level, message, data);
    };
    this.installConsoleCapture();
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    void this.probeServer();
  }

  log(level: DebugLogLevel, message: string, data?: unknown): void {
    if (!this.enabled) {
      return;
    }

    this.sendPayload({
      source: 'townfall-v2-browser',
      level,
      message,
      timestamp: performance.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      data: data === undefined ? null : serializeValue(data),
    });
  }

  dispose(): void {
    if (!this.enabled) {
      return;
    }

    console.warn = this.originalWarn;
    console.error = this.originalError;
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection,
    );
    delete window.__townfallLog;
  }

  private installConsoleCapture(): void {
    console.warn = (...args: unknown[]) => {
      this.originalWarn(...args);
      this.log('warn', 'console.warn', args.map(serializeValue));
    };
    console.error = (...args: unknown[]) => {
      this.originalError(...args);
      this.log('error', 'console.error', args.map(serializeValue));
    };
  }

  private readonly handleWindowError = (event: ErrorEvent): void => {
    this.log('error', 'window.error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: serializeValue(event.error),
    });
  };

  private readonly handleUnhandledRejection = (
    event: PromiseRejectionEvent,
  ): void => {
    this.log('error', 'unhandledrejection', serializeValue(event.reason));
  };

  private async probeServer(): Promise<void> {
    try {
      const response = await fetch(DEBUG_LOG_HEALTH_URL);
      this.probeFinished = true;
      this.serverAvailable = response.ok;
      if (this.serverAvailable) {
        this.log('info', 'debug-log-client-connected');
        this.flushPendingLogs();
      } else {
        this.pendingLogs = [];
      }
    } catch {
      this.probeFinished = true;
      this.serverAvailable = false;
      this.pendingLogs = [];
    }
  }

  private sendPayload(payload: Record<string, unknown>): void {
    if (!this.serverAvailable) {
      if (!this.probeFinished && this.pendingLogs.length < MAX_PENDING_LOGS) {
        this.pendingLogs.push(payload);
      }
      return;
    }

    const body = JSON.stringify(payload);
    void fetch(DEBUG_LOG_WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      const beaconSent = typeof navigator.sendBeacon === 'function'
        && navigator.sendBeacon(
          DEBUG_LOG_WRITE_URL,
          new Blob([body], { type: 'application/json' }),
        );
      this.serverAvailable = beaconSent;
    });
  }

  private flushPendingLogs(): void {
    const logs = this.pendingLogs;
    this.pendingLogs = [];
    for (const payload of logs) {
      this.sendPayload(payload);
    }
  }
}

export function initDebugLogger(): DebugLogger {
  return new BrowserDebugLogger();
}

export function logRuntimeReady(
  logger: DebugLogger,
  diagnostics: RuntimeDiagnostics,
): void {
  logger.log('info', 'v2-foundation-ready', {
    quality: diagnostics.effectiveQuality,
    mobileControls: diagnostics.mobileControlsEnabled,
    rendererObjects: diagnostics.sceneObjects,
  });
}
