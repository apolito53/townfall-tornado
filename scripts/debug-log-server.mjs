import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.TOWNFALL_DEBUG_PORT ?? 5176);
const LOG_DIR = path.resolve(process.cwd(), 'logs');
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RECENT_LINES = 200;

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function logPath() {
  return path.join(LOG_DIR, `townfall-debug-${todayStamp()}.jsonl`);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function normalizeEntry(entry) {
  return {
    serverReceivedAt: new Date().toISOString(),
    source: String(entry.source ?? 'browser'),
    level: String(entry.level ?? 'info'),
    message: String(entry.message ?? ''),
    timestamp: typeof entry.timestamp === 'number' ? entry.timestamp : null,
    url: typeof entry.url === 'string' ? entry.url : null,
    userAgent: typeof entry.userAgent === 'string' ? entry.userAgent : null,
    data: entry.data ?? null,
  };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let receivedBytes = 0;
    let body = '';

    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      receivedBytes += Buffer.byteLength(chunk);
      if (receivedBytes > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }

      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function writeLogEntry(entry) {
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(logPath(), `${JSON.stringify(entry)}\n`, 'utf8');

  const level = entry.level.padEnd(5).slice(0, 5);
  const dataHint = entry.data ? ` ${JSON.stringify(entry.data).slice(0, 180)}` : '';
  console.log(`[${entry.serverReceivedAt}] ${level} ${entry.message}${dataHint}`);
}

async function readRecentLogs(limit) {
  const file = logPath();
  if (!existsSync(file)) {
    return [];
  }

  const contents = await readFile(file, 'utf8');
  return contents
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { malformed: true, line };
      }
    });
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);

  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        ok: true,
        service: 'townfall-debug-log-server',
        logPath: logPath(),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/recent') {
      const limit = Math.min(MAX_RECENT_LINES, Math.max(1, Number(url.searchParams.get('limit') ?? 60)));
      sendJson(response, 200, {
        ok: true,
        entries: await readRecentLogs(limit),
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/log') {
      const body = await readBody(request);
      const parsed = body ? JSON.parse(body) : {};
      const entry = normalizeEntry(parsed);
      await writeLogEntry(entry);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { ok: false, error: 'not found' });
  } catch (error) {
    sendJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Townfall debug log server listening at http://${HOST}:${PORT}`);
  console.log(`Writing JSONL logs to ${LOG_DIR}`);
});
