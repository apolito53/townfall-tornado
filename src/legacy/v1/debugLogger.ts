type DebugLogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEBUG_LOG_HEALTH_URL = 'http://127.0.0.1:5176/health';
const DEBUG_LOG_WRITE_URL = 'http://127.0.0.1:5176/log';
const MAX_PENDING_LOGS = 40;
const MAX_SERIALIZED_TEXT = 1800;

let serverAvailable = false;
let probeFinished = false;
let pendingLogs: Record<string, unknown>[] = [];

function isLocalPrototypePage() {
  return ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname);
}

function isLogCaptureRequested() {
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

function truncateText(text: string) {
  if (text.length <= MAX_SERIALIZED_TEXT) {
    return text;
  }

  return `${text.slice(0, MAX_SERIALIZED_TEXT)}... [truncated]`;
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
    const serialized = JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) {
          return '[circular]';
        }
        seen.add(nestedValue);
      }
      if (typeof nestedValue === 'string') {
        return truncateText(nestedValue);
      }
      return nestedValue;
    });
    if (!serialized) {
      return null;
    }

    if (serialized.length > MAX_SERIALIZED_TEXT) {
      return truncateText(serialized);
    }

    return JSON.parse(serialized);
  } catch {
    return String(value);
  }
}

function createPayload(level: DebugLogLevel, message: string, data?: unknown) {
  return {
    source: 'townfall-browser',
    level,
    message,
    timestamp: performance.now(),
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    data: data === undefined ? null : serializeValue(data),
  };
}

function sendPayload(payload: Record<string, unknown>) {
  if (!serverAvailable) {
    if (!probeFinished && pendingLogs.length < MAX_PENDING_LOGS) {
      pendingLogs.push(payload);
    }
    return;
  }

  const body = JSON.stringify(payload);
  fetch(DEBUG_LOG_WRITE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    const beaconSent = typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon(DEBUG_LOG_WRITE_URL, new Blob([body], { type: 'application/json' }));
    serverAvailable = beaconSent;
  });
}

function flushPendingLogs() {
  const logs = pendingLogs;
  pendingLogs = [];
  for (const payload of logs) {
    sendPayload(payload);
  }
}

function installConsoleCapture() {
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    window.__townfallLog?.('warn', 'console.warn', args.map(serializeValue));
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    window.__townfallLog?.('error', 'console.error', args.map(serializeValue));
  };
}

export function initDebugLogger() {
  if (!isLocalPrototypePage() || !isLogCaptureRequested()) {
    return;
  }

  window.__townfallLog = (level, message, data) => {
    sendPayload(createPayload(level, message, data));
  };

  installConsoleCapture();

  window.addEventListener('error', (event) => {
    window.__townfallLog?.('error', 'window.error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: serializeValue(event.error),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    window.__townfallLog?.('error', 'unhandledrejection', serializeValue(event.reason));
  });

  fetch(DEBUG_LOG_HEALTH_URL)
    .then((response) => {
      probeFinished = true;
      serverAvailable = response.ok;
      if (serverAvailable) {
        window.__townfallLog?.('info', 'debug-log-client-connected', { href: window.location.href });
        flushPendingLogs();
      } else {
        pendingLogs = [];
      }
    })
    .catch(() => {
      probeFinished = true;
      serverAvailable = false;
      pendingLogs = [];
    });
}
