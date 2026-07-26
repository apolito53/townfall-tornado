import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const DEFAULT_URL = 'http://127.0.0.1:5175/';
const targetUrl = process.env.TOWNFALL_URL ?? DEFAULT_URL;
const projectRoot = resolve('.');
const label = readArgument('--label') ?? 'current';
const outputDirectory = resolve('docs', 'rebuild', 'baseline', label);
const metricsPath = resolve(outputDirectory, 'metrics.json');
const stressMass = 12000;
const categoryCases = [
  { category: 1, mass: 0 },
  { category: 3, mass: 250 },
  { category: 5, mass: 3404 },
];
const viewportCases = [
  {
    name: 'desktop',
    width: 1440,
    height: 900,
    quality: 'high',
    mobileControls: false,
  },
  {
    name: 'mobile',
    width: 390,
    height: 844,
    quality: 'low',
    mobileControls: true,
  },
];
const metricFields = [
  'performancePhase',
  'warmupComplete',
  'startupFrameCount',
  'startupHitchCount',
  'startupLongestFrameMs',
  'startupMaxWorkMs',
  'fps',
  'averageFrameMs',
  'averageWorkMs',
  'maxFrameMs',
  'maxWorkMs',
  'hitchCount',
  'longestHitchMs',
  'drawCalls',
  'triangles',
  'sceneObjects',
  'sceneMeshes',
  'sceneGroups',
  'sceneMaterials',
  'geometries',
  'textures',
  'pixelRatio',
  'generatedChunks',
  'totalItems',
  'visibleItems',
  'detailedTownItems',
  'instancedTownProxies',
  'instancedTownInstances',
  'visibleInstancedTownInstances',
  'simulatedItems',
  'candidateItems',
  'throttledCandidates',
  'effectPieces',
  'activeParticles',
  'particleCapacity',
  'activeInstancedChunks',
  'instancedDebrisCapacity',
  'groundScars',
  'stormCategory',
  'stormMass',
  'stormRadius',
  'stormPullRadius',
  'cameraZoomScale',
  'cameraFov',
  'fogDensity',
  'quality',
  'qualityMode',
  'mobileControlsEnabled',
];

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function assertSafeLabel(value) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) {
    throw new Error(`Invalid baseline label "${value}". Use letters, numbers, dots, underscores, or dashes.`);
  }
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim();
}

function withViewportParams(inputUrl, viewport) {
  const nextUrl = new URL(inputUrl);
  nextUrl.searchParams.delete('debug');
  nextUrl.searchParams.set('noDebugLogs', '1');
  nextUrl.searchParams.set(viewport.mobileControls ? 'mobileControls' : 'noMobileControls', '1');
  return nextUrl.toString();
}

async function isServerReachable(inputUrl) {
  try {
    const response = await fetch(inputUrl, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerReachable(targetUrl)) {
    return null;
  }

  if (new URL(targetUrl).origin !== new URL(DEFAULT_URL).origin) {
    throw new Error(`TOWNFALL_URL is unavailable and cannot be auto-started: ${targetUrl}`);
  }

  const server = await createServer({
    root: projectRoot,
    logLevel: 'warn',
  });
  await server.listen();
  return server;
}

async function launchBrowser() {
  const launchAttempts = [
    { name: 'msedge', options: { channel: 'msedge' } },
    { name: 'chrome', options: { channel: 'chrome' } },
    { name: 'bundled-chromium', options: {} },
  ];

  let lastError;
  for (const attempt of launchAttempts) {
    try {
      return {
        browser: await chromium.launch({ ...attempt.options, headless: true }),
        channel: attempt.name,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function selectMetrics(diagnostics) {
  return Object.fromEntries(metricFields.map((field) => [field, diagnostics?.[field] ?? null]));
}

async function readCanvasSignal(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    if (!gl) {
      return { visible: 0, total: 0, variance: 0 };
    }

    const points = [
      [0.5, 0.5],
      [0.25, 0.34],
      [0.75, 0.34],
      [0.34, 0.7],
      [0.66, 0.7],
    ];
    const pixel = new Uint8Array(4);
    let visible = 0;
    let variance = 0;

    for (const [xRatio, yRatio] of points) {
      const x = Math.floor(gl.drawingBufferWidth * xRatio);
      const y = Math.floor(gl.drawingBufferHeight * yRatio);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const luma = pixel[0] + pixel[1] + pixel[2];
      const spread = Math.max(pixel[0], pixel[1], pixel[2]) - Math.min(pixel[0], pixel[1], pixel[2]);
      if (pixel[3] > 0 && luma > 45) {
        visible += 1;
      }
      variance += spread;
    }

    return {
      visible,
      total: points.length,
      variance,
    };
  });
}

async function refreshDiagnostics(page) {
  await page.evaluate(() => {
    const game = window.__townfallGame;
    game.collectSceneStats();
    game.lastDiagnosticsAt = 0;
    game.collectDiagnostics();
  });
  await page.waitForTimeout(80);
  return page.evaluate(() => window.__townfallDiagnostics);
}

async function createScenarioPage(browser, viewport, consoleErrors) {
  const page = await browser.newPage({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('townfall.debugOverlay', 'false');
    localStorage.removeItem('townfall.quality');
    localStorage.removeItem('townfall.qualityCustom');
  });
  await page.goto(withViewportParams(targetUrl, viewport), {
    waitUntil: 'networkidle',
  });
  await page.waitForFunction(
    () => window.__townfallDiagnostics?.renderOk === true
      && window.__townfallDiagnostics?.warmupComplete === true,
    undefined,
    { timeout: 15000 },
  );
  await page.getByRole('button', { name: /Endless/i }).click();
  await page.waitForFunction(
    () => window.__townfallDiagnostics?.gameMode === 'endless'
      && window.__townfallDiagnostics?.awaitingStart === false,
    undefined,
    { timeout: 5000 },
  );
  await page.evaluate((quality) => {
    const game = window.__townfallGame;
    game.setQualityMode(quality, { persist: false });
    // Freeze gameplay without opening the pause menu. Rendering and camera
    // settling continue, while the town remains pristine between category shots.
    game.isPaused = true;
    game.setPerspective(0.35);
  }, viewport.quality);

  return page;
}

async function setCategory(page, mass) {
  await page.evaluate((nextMass) => {
    const game = window.__townfallGame;
    game.tornado.mass = nextMass;
    game.tornado.position.set(0, 0, 0);
    game.tornado.group.position.copy(game.tornado.position);
    game.currentStormProfile = game.tornado.getProfile();
    game.update(0);
    game.town.updateRenderBudget(game.tornado.position, game.currentStormProfile.category);
  }, mass);
  await page.waitForTimeout(1100);
  return refreshDiagnostics(page);
}

async function runStressScenario(page) {
  await page.evaluate((nextMass) => {
    const game = window.__townfallGame;
    game.tornado.mass = nextMass;
    game.tornado.position.set(0, 0, 0);
    game.tornado.group.position.copy(game.tornado.position);
    game.currentStormProfile = game.tornado.getProfile();
    game.isPaused = false;
  }, stressMass);
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    window.__townfallGame.isPaused = true;
  });
  await page.waitForTimeout(180);
  return refreshDiagnostics(page);
}

assertSafeLabel(label);
await mkdir(outputDirectory, { recursive: true });

const source = {
  branch: git('branch', '--show-current'),
  headCommit: git('rev-parse', 'HEAD'),
  prototypeTag: 'v0.1.0.0',
  prototypeTagCommit: git('rev-list', '-n', '1', 'v0.1.0.0'),
  workingTreeDirtyBeforeCapture: git('status', '--porcelain').length > 0,
};
const results = {};
const errors = [];
let viteServer;
let browser;
let browserChannel = 'unknown';
let browserVersion = 'unknown';

try {
  viteServer = await ensureServer();
  const browserLaunch = await launchBrowser();
  browser = browserLaunch.browser;
  browserChannel = browserLaunch.channel;
  browserVersion = browser.version();

  for (const viewport of viewportCases) {
    const consoleErrors = [];
    const page = await createScenarioPage(browser, viewport, consoleErrors);
    const viewportResults = {
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
      quality: viewport.quality,
      categories: {},
      stress: null,
    };

    for (const categoryCase of categoryCases) {
      const diagnostics = await setCategory(page, categoryCase.mass);
      const canvas = await readCanvasSignal(page);
      const fileName = `${viewport.name}-cat${categoryCase.category}.png`;

      await page.screenshot({
        path: resolve(outputDirectory, fileName),
        fullPage: false,
      });

      viewportResults.categories[`cat${categoryCase.category}`] = {
        requestedMass: categoryCase.mass,
        screenshot: fileName,
        canvas,
        metrics: selectMetrics(diagnostics),
      };

      if (
        diagnostics?.stormCategory !== categoryCase.category
        || canvas.visible < 3
        || canvas.variance <= 0
      ) {
        errors.push(
          `${viewport.name} Cat ${categoryCase.category}: invalid category or canvas signal `
          + JSON.stringify({ stormCategory: diagnostics?.stormCategory, canvas }),
        );
      }
    }

    const stressDiagnostics = await runStressScenario(page);
    viewportResults.stress = {
      requestedMass: stressMass,
      metrics: selectMetrics(stressDiagnostics),
    };
    results[viewport.name] = viewportResults;

    if (
      stressDiagnostics?.activeParticles <= 0
      || stressDiagnostics?.activeParticles > stressDiagnostics?.particleCapacity
      || stressDiagnostics?.activeInstancedChunks > stressDiagnostics?.instancedDebrisCapacity
    ) {
      errors.push(`${viewport.name} stress: debris diagnostics were invalid ${JSON.stringify(stressDiagnostics)}`);
    }

    if (
      stressDiagnostics?.performancePhase !== 'gameplay'
      || stressDiagnostics?.warmupComplete !== true
      || typeof stressDiagnostics?.startupHitchCount !== 'number'
    ) {
      errors.push(`${viewport.name}: startup/gameplay performance phases were not separated`);
    }

    if (consoleErrors.length > 0) {
      errors.push(`${viewport.name}: console errors: ${consoleErrors.join(' | ')}`);
    }

    await page.close();
  }
} finally {
  await browser?.close();
  await viteServer?.close();
}

const report = {
  schemaVersion: 1,
  label,
  capturedAt: new Date().toISOString(),
  targetUrl,
  source,
  browser: {
    channel: browserChannel,
    version: browserVersion,
  },
  categoryCases,
  stressMass,
  results,
  errors,
};

await writeFile(metricsPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const [viewportName, viewportResult] of Object.entries(results)) {
  for (const [categoryName, categoryResult] of Object.entries(viewportResult.categories)) {
    const metrics = categoryResult.metrics;
    console.log(
      `${viewportName} ${categoryName}: ${metrics.fps} FPS, ${metrics.drawCalls} draws, `
      + `${metrics.sceneObjects} objects, ${metrics.geometries} geometries, ${metrics.generatedChunks} chunks`,
    );
  }

  const stress = viewportResult.stress.metrics;
  console.log(
    `${viewportName} stress: ${stress.fps} FPS, ${stress.drawCalls} draws, `
    + `${stress.activeParticles}/${stress.particleCapacity} particles, `
    + `${stress.activeInstancedChunks}/${stress.instancedDebrisCapacity} chunks`,
  );
}

console.log(`Baseline artifacts written to ${outputDirectory}`);

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}
