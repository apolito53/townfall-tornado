import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.TOWNFALL_URL
  ?? process.argv[2]
  ?? 'http://127.0.0.1:5175/';
const artifactDir = resolve('artifacts', 'rebuild', 'milestone-2');
const EXPECTED_RUNTIME = 'v2-diorama';
const EXPECTED_SCHEMA_VERSION = 3;
const EXPECTED_BUILDING_COUNT = 20;
const EXPECTED_PROP_COUNT = 374;
const EXPECTED_INSTANCE_BATCHES = 46;
const EXPECTED_CAT5_DIAMETER = 1609.344;
const MINIMUM_CAMERA_CLEARANCE = 12;
const MINIMUM_CAMERA_CLEARANCE_SAMPLES = 12;
const GAMEPLAY_SETTLE_MS = 750;

const desktopHighBudget = {
  drawCalls: 90,
  triangles: 350000,
  sceneObjects: 180,
  geometries: 40,
  textures: 6,
  p95FrameMs: 16.7,
};
const mobileLowBudget = {
  drawCalls: 60,
  triangles: 220000,
  sceneObjects: 140,
  geometries: 40,
  textures: 6,
  p95FrameMs: 33.3,
};

const viewports = [
  {
    name: 'desktop',
    width: 1440,
    height: 900,
    mobile: false,
    quality: 'high',
    budget: desktopHighBudget,
  },
  {
    name: 'mobile',
    width: 390,
    height: 844,
    mobile: true,
    quality: 'low',
    budget: mobileLowBudget,
  },
];

const visualMatrix = [
  {
    name: 'desktop-cat1-storm-high',
    viewport: viewports[0],
    category: 1,
    weather: 'storm',
  },
  {
    name: 'desktop-cat3-storm-high',
    viewport: viewports[0],
    category: 3,
    weather: 'storm',
  },
  {
    name: 'desktop-cat5-storm-high',
    viewport: viewports[0],
    category: 5,
    weather: 'storm',
  },
  {
    name: 'desktop-cat3-clear-high',
    viewport: viewports[0],
    category: 3,
    weather: 'clear',
  },
  {
    name: 'desktop-cat1-perspective-low-high',
    viewport: viewports[0],
    category: 1,
    weather: 'storm',
    perspective: 0,
  },
  {
    name: 'desktop-cat1-perspective-default-high',
    viewport: viewports[0],
    category: 1,
    weather: 'storm',
    perspective: 0.52,
  },
  {
    name: 'desktop-cat1-perspective-high-high',
    viewport: viewports[0],
    category: 1,
    weather: 'storm',
    perspective: 1,
  },
  {
    name: 'mobile-cat1-storm-low',
    viewport: viewports[1],
    category: 1,
    weather: 'storm',
  },
  {
    name: 'mobile-cat5-storm-low',
    viewport: viewports[1],
    category: 5,
    weather: 'storm',
  },
];

function withSearchParams(inputUrl, parameters) {
  const nextUrl = new URL(inputUrl);
  for (const [key, value] of Object.entries(parameters)) {
    nextUrl.searchParams.set(key, value);
  }
  return nextUrl.toString();
}

async function launchBrowser() {
  const launchAttempts = [
    { channel: 'msedge' },
    { channel: 'chrome' },
    {},
  ];

  let lastError;
  for (const options of launchAttempts) {
    try {
      return await chromium.launch({ ...options, headless: true });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function readCanvasSamples(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        visible: 0,
        total: 0,
        colorSpread: 0,
        lumaRange: 0,
        edgeAverage: 0,
        lowerBandVisible: 0,
        canvasWidth: 0,
        canvasHeight: 0,
      };
    }

    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      return {
        visible: 0,
        total: 0,
        colorSpread: 0,
        lumaRange: 0,
        edgeAverage: 0,
        lowerBandVisible: 0,
        canvasWidth: 0,
        canvasHeight: 0,
      };
    }

    const xRatios = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92];
    const yRatios = [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92];
    const pixel = new Uint8Array(4);
    const rows = [];
    let visible = 0;
    let lowerBandVisible = 0;
    let colorSpread = 0;
    let lumaMinimum = Number.POSITIVE_INFINITY;
    let lumaMaximum = Number.NEGATIVE_INFINITY;
    let edgeTotal = 0;
    let edgeCount = 0;

    for (const [rowIndex, yRatio] of yRatios.entries()) {
      const row = [];
      for (const xRatio of xRatios) {
        const x = Math.min(
          gl.drawingBufferWidth - 1,
          Math.floor(gl.drawingBufferWidth * xRatio),
        );
        const y = Math.min(
          gl.drawingBufferHeight - 1,
          Math.floor(gl.drawingBufferHeight * yRatio),
        );
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const sample = Array.from(pixel);
        const luma = sample[0] + sample[1] + sample[2];
        const spread = Math.max(sample[0], sample[1], sample[2])
          - Math.min(sample[0], sample[1], sample[2]);
        if (sample[3] > 0 && luma > 45) {
          visible += 1;
          if (rowIndex < 2) {
            lowerBandVisible += 1;
          }
        }
        colorSpread += spread;
        lumaMinimum = Math.min(lumaMinimum, luma);
        lumaMaximum = Math.max(lumaMaximum, luma);
        row.push(sample);
      }
      rows.push(row);
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      for (
        let columnIndex = 0;
        columnIndex < rows[rowIndex].length;
        columnIndex += 1
      ) {
        const sample = rows[rowIndex][columnIndex];
        const neighbors = [
          rows[rowIndex]?.[columnIndex - 1],
          rows[rowIndex - 1]?.[columnIndex],
        ];
        for (const neighbor of neighbors) {
          if (neighbor === undefined) {
            continue;
          }
          edgeTotal += Math.abs(sample[0] - neighbor[0])
            + Math.abs(sample[1] - neighbor[1])
            + Math.abs(sample[2] - neighbor[2]);
          edgeCount += 1;
        }
      }
    }

    return {
      visible,
      total: xRatios.length * yRatios.length,
      colorSpread,
      lumaRange: lumaMaximum - lumaMinimum,
      edgeAverage: edgeCount > 0 ? edgeTotal / edgeCount : 0,
      lowerBandVisible,
      canvasWidth: gl.drawingBufferWidth,
      canvasHeight: gl.drawingBufferHeight,
    };
  });
}

function addError(errors, viewportName, message, evidence) {
  const suffix = evidence === undefined ? '' : ` (${JSON.stringify(evidence)})`;
  errors.push(`${viewportName}: ${message}${suffix}`);
}

function trackPageErrors(page) {
  const browserErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    browserErrors.push(`page: ${error.message}`);
  });
  return browserErrors;
}

function assertNoPageErrors(errors, scope, browserErrors) {
  if (browserErrors.length > 0) {
    addError(errors, scope, 'browser console or page errors', browserErrors);
  }
}

function assertCanvasOutput(errors, scope, samples) {
  const minimumVisible = Math.floor(samples.total * 0.8);
  if (
    samples.total !== 64
    || samples.visible < minimumVisible
    || samples.lowerBandVisible < 12
    || samples.colorSpread < 128
    || samples.lumaRange < 20
    || samples.edgeAverage < 2
    || samples.canvasWidth <= 0
    || samples.canvasHeight <= 0
  ) {
    addError(
      errors,
      scope,
      'canvas was blank, crushed, or lacked practical terrain/edge variation',
      samples,
    );
  }
}

async function readHudLayout(page) {
  return page.evaluate(() => {
    const selectors = {
      levelTracker: '.level-tracker',
      hud: '.hud',
      stormMeter: '.storm-meter',
      mobileJoystick: '#mobile-joystick',
      pauseButton: '#pause-button',
    };
    const boxes = [];
    const missing = [];

    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector(selector);
      if (!(element instanceof HTMLElement)) {
        missing.push(name);
        continue;
      }
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const visible = !element.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0.01
        && rect.width > 0
        && rect.height > 0;
      if (!visible) {
        continue;
      }
      boxes.push({
        name,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    }

    const overlaps = [];
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < boxes.length;
        rightIndex += 1
      ) {
        const left = boxes[leftIndex];
        const right = boxes[rightIndex];
        const overlapWidth = Math.min(left.right, right.right)
          - Math.max(left.left, right.left);
        const overlapHeight = Math.min(left.bottom, right.bottom)
          - Math.max(left.top, right.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          overlaps.push({
            elements: [left.name, right.name],
            overlapWidth,
            overlapHeight,
          });
        }
      }
    }

    const outOfBounds = boxes.filter((box) =>
      box.left < -1
      || box.top < -1
      || box.right > window.innerWidth + 1
      || box.bottom > window.innerHeight + 1
    );

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      boxes,
      missing,
      overlaps,
      outOfBounds,
    };
  });
}

function assertHudLayout(errors, scope, layout, viewport) {
  const expectedVisible = [
    'levelTracker',
    'hud',
    'stormMeter',
    'pauseButton',
    ...(viewport.mobile ? ['mobileJoystick'] : []),
  ];
  const visibleNames = new Set(layout.boxes.map((box) => box.name));
  const absentVisibleElements = expectedVisible.filter(
    (name) => !visibleNames.has(name),
  );
  if (
    layout.viewport.width !== viewport.width
    || layout.viewport.height !== viewport.height
    || layout.missing.length > 0
    || absentVisibleElements.length > 0
    || layout.overlaps.length > 0
    || layout.outOfBounds.length > 0
  ) {
    addError(errors, scope, 'HUD elements overlapped or escaped the viewport', {
      expectedViewport: {
        width: viewport.width,
        height: viewport.height,
      },
      absentVisibleElements,
      ...layout,
    });
  }
}

function assertScenarioDiagnostics(errors, scope, diagnostics, expected) {
  if (diagnostics === undefined) {
    addError(errors, scope, 'runtime diagnostics were unavailable');
    return;
  }

  const mismatches = {};
  const expectEqual = (key, actual, wanted) => {
    if (actual !== wanted) {
      mismatches[key] = { expected: wanted, actual };
    }
  };

  expectEqual('schemaVersion', diagnostics.schemaVersion, EXPECTED_SCHEMA_VERSION);
  expectEqual('runtime', diagnostics.runtime, EXPECTED_RUNTIME);
  expectEqual('renderOk', diagnostics.renderOk, true);
  expectEqual('stormCategory', diagnostics.stormCategory, expected.category);
  expectEqual('weather', diagnostics.weather, expected.weather);
  expectEqual('qualityMode', diagnostics.qualityMode, expected.quality);
  expectEqual('effectiveQuality', diagnostics.effectiveQuality, expected.quality);
  expectEqual('buildingCount', diagnostics.buildingCount, EXPECTED_BUILDING_COUNT);
  expectEqual('propCount', diagnostics.propCount, EXPECTED_PROP_COUNT);
  expectEqual(
    'instanceBatches',
    diagnostics.instanceBatches,
    EXPECTED_INSTANCE_BATCHES,
  );

  if (
    expected.category === 5
    && diagnostics.stormPhysicalDiameter !== EXPECTED_CAT5_DIAMETER
  ) {
    mismatches.stormPhysicalDiameter = {
      expected: EXPECTED_CAT5_DIAMETER,
      actual: diagnostics.stormPhysicalDiameter,
    };
  }
  if (
    typeof diagnostics.cameraClearance !== 'number'
    || diagnostics.cameraClearance < MINIMUM_CAMERA_CLEARANCE
  ) {
    mismatches.cameraClearance = {
      expected: `>= ${MINIMUM_CAMERA_CLEARANCE}`,
      actual: diagnostics.cameraClearance,
    };
  }
  if (
    typeof diagnostics.cameraClearanceSamples !== 'number'
    || diagnostics.cameraClearanceSamples < MINIMUM_CAMERA_CLEARANCE_SAMPLES
  ) {
    mismatches.cameraClearanceSamples = {
      expected: `>= ${MINIMUM_CAMERA_CLEARANCE_SAMPLES}`,
      actual: diagnostics.cameraClearanceSamples,
    };
  }
  if (
    expected.perspective !== undefined
    && Math.abs(diagnostics.perspectiveAmount - expected.perspective) > 0.001
  ) {
    mismatches.perspectiveAmount = {
      expected: expected.perspective,
      actual: diagnostics.perspectiveAmount,
    };
  }

  if (Object.keys(mismatches).length > 0) {
    addError(errors, scope, 'diorama diagnostics contract mismatch', mismatches);
  }
}

function assertPerformanceBudget(errors, scope, diagnostics, budget) {
  if (diagnostics === undefined) {
    addError(errors, scope, 'performance diagnostics were unavailable');
    return;
  }

  const exceeded = {};
  for (const key of [
    'drawCalls',
    'triangles',
    'sceneObjects',
    'geometries',
    'textures',
    'p95FrameMs',
  ]) {
    const actual = diagnostics[key];
    const maximum = budget[key];
    if (typeof actual !== 'number' || actual > maximum) {
      exceeded[key] = { maximum, actual };
    }
  }
  if (
    diagnostics.warmupComplete !== true
    || diagnostics.performancePhase !== 'gameplay'
    || !(diagnostics.p95FrameMs > 0)
  ) {
    exceeded.performancePhase = {
      expected: 'gameplay after warmup with p95 samples',
      warmupComplete: diagnostics.warmupComplete,
      performancePhase: diagnostics.performancePhase,
      p95FrameMs: diagnostics.p95FrameMs,
    };
  }

  if (Object.keys(exceeded).length > 0) {
    addError(errors, scope, 'steady-state render budget was exceeded', exceeded);
  }
}

async function waitForRuntime(page) {
  await page.waitForFunction(
    ({ runtime, schemaVersion }) => {
      const diagnostics = window.__townfallDiagnostics;
      return diagnostics?.runtime === runtime
        && diagnostics.schemaVersion === schemaVersion
        && diagnostics.renderOk === true;
    },
    {
      runtime: EXPECTED_RUNTIME,
      schemaVersion: EXPECTED_SCHEMA_VERSION,
    },
    { timeout: 10000 },
  );
}

async function waitForGameplay(page, expected) {
  await page.waitForFunction(
    ({
      runtime,
      schemaVersion,
      category,
      weather,
      quality,
      perspective,
    }) => {
      const diagnostics = window.__townfallDiagnostics;
      return diagnostics?.runtime === runtime
        && diagnostics.schemaVersion === schemaVersion
        && diagnostics.appPhase === 'running'
        && diagnostics.gameMode === 'levels'
        && diagnostics.warmupComplete === true
        && diagnostics.performancePhase === 'gameplay'
        && diagnostics.fps > 0
        && diagnostics.p95FrameMs > 0
        && diagnostics.stormCategory === category
        && diagnostics.weather === weather
        && diagnostics.qualityMode === quality
        && diagnostics.effectiveQuality === quality
        && (
          perspective === null
          || Math.abs(diagnostics.perspectiveAmount - perspective) <= 0.001
        );
    },
    {
      runtime: EXPECTED_RUNTIME,
      schemaVersion: EXPECTED_SCHEMA_VERSION,
      category: expected.category,
      weather: expected.weather,
      quality: expected.quality,
      perspective: expected.perspective ?? null,
    },
    { timeout: 12000 },
  );
  await page.waitForTimeout(GAMEPLAY_SETTLE_MS);
}

async function captureVisualScenario(browser, scenario, errors) {
  const scope = `matrix ${scenario.name}`;
  const { viewport } = scenario;
  const page = await browser.newPage({
    viewport: {
      width: viewport.width,
      height: viewport.height,
    },
  });
  const browserErrors = trackPageErrors(page);

  try {
    await page.addInitScript((quality) => {
      localStorage.setItem('townfall.v2.qualityMode', quality);
      localStorage.removeItem('townfall.v2.customQuality');
    }, viewport.quality);
    const pageUrl = withSearchParams(url, {
      category: String(scenario.category),
      weather: scenario.weather,
      quality: viewport.quality,
      noDebugLogs: '1',
      [viewport.mobile ? 'mobileControls' : 'noMobileControls']: '1',
    });
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await waitForRuntime(page);
    await page.locator('#levels-mode-button').click();

    if (scenario.perspective !== undefined) {
      await page.evaluate((perspective) => {
        window.__townfallApp?.setPerspective(perspective);
      }, scenario.perspective);
    }

    const expected = {
      category: scenario.category,
      weather: scenario.weather,
      quality: viewport.quality,
      perspective: scenario.perspective,
    };
    await waitForGameplay(page, expected);

    const diagnostics = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    const canvasSamples = await readCanvasSamples(page);
    const hudLayout = await readHudLayout(page);
    assertScenarioDiagnostics(errors, scope, diagnostics, expected);
    assertPerformanceBudget(errors, scope, diagnostics, viewport.budget);
    assertCanvasOutput(errors, scope, canvasSamples);
    assertHudLayout(errors, scope, hudLayout, viewport);
    assertNoPageErrors(errors, scope, browserErrors);

    await page.screenshot({
      path: resolve(artifactDir, `${scenario.name}.png`),
      animations: 'disabled',
      caret: 'hide',
    });
    console.log(
      `${scope}: ${diagnostics?.drawCalls ?? 0} draws, `
      + `${diagnostics?.triangles ?? 0} triangles, `
      + `${(diagnostics?.p95FrameMs ?? 0).toFixed(2)} ms p95`,
    );
  } catch (error) {
    addError(errors, scope, 'capture failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await page.close();
  }
}

await mkdir(artifactDir, { recursive: true });

const browser = await launchBrowser();
const errors = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
    });
    const consoleErrors = trackPageErrors(page);
    await page.addInitScript((quality) => {
      localStorage.setItem('townfall.v2.qualityMode', quality);
      localStorage.removeItem('townfall.v2.customQuality');
    }, viewport.quality);

    const pageUrl = withSearchParams(url, {
      category: '1',
      weather: 'storm',
      quality: viewport.quality,
      noDebugLogs: '1',
      [viewport.mobile ? 'mobileControls' : 'noMobileControls']: '1',
    });
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await waitForRuntime(page);

    const initialState = await page.evaluate(() => ({
      diagnostics: window.__townfallDiagnostics,
      startVisible: !document.querySelector('#start-screen')?.hidden,
      joystickHidden: document.querySelector('#mobile-joystick')?.hidden,
      mobileClass: document.querySelector('#app')
        ?.classList.contains('has-mobile-controls'),
    }));
    if (!initialState.startVisible) {
      addError(errors, viewport.name, 'mode select was not visible at boot');
    }
    if (initialState.diagnostics?.appPhase !== 'menu') {
      addError(errors, viewport.name, 'runtime did not boot into the menu phase', initialState);
    }
    assertScenarioDiagnostics(errors, viewport.name, initialState.diagnostics, {
      category: 1,
      weather: 'storm',
      quality: viewport.quality,
    });
    if (viewport.mobile) {
      if (
        !initialState.diagnostics?.mobileControlsEnabled
        || initialState.joystickHidden !== true
        || !initialState.mobileClass
      ) {
        addError(errors, viewport.name, 'mobile controls were not armed and hidden at boot', initialState);
      }
    } else if (
      initialState.diagnostics?.mobileControlsEnabled
      || initialState.joystickHidden !== true
      || initialState.mobileClass
    ) {
      addError(errors, viewport.name, 'desktop unexpectedly enabled mobile controls', initialState);
    }

    const menuSamples = await readCanvasSamples(page);
    assertCanvasOutput(errors, `${viewport.name} menu`, menuSamples);
    await page.screenshot({
      path: resolve(artifactDir, `lifecycle-${viewport.name}-menu.png`),
      animations: 'disabled',
      caret: 'hide',
    });

    await page.locator('#levels-mode-button').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.gameMode === 'levels'
        && window.__townfallDiagnostics.appPhase === 'running',
      undefined,
      { timeout: 5000 },
    );
    const beforeKeyboardMove = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    await page.keyboard.down('d');
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.inputSource === 'keyboard'
        && window.__townfallDiagnostics.commandMagnitude > 0.9,
      undefined,
      { timeout: 3000 },
    );
    const keyboardCommand = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    await page.waitForTimeout(450);
    await page.keyboard.up('d');
    await page.waitForFunction(
      (beforeX) => (window.__townfallDiagnostics?.stormX ?? 0) > beforeX + 0.5,
      beforeKeyboardMove?.stormX ?? 0,
      { timeout: 5000 },
    );
    if (
      keyboardCommand === undefined
      || keyboardCommand.commandMagnitude > 1.001
      || Math.hypot(keyboardCommand.commandX, keyboardCommand.commandY) > 1.001
    ) {
      addError(errors, viewport.name, 'keyboard command was not normalized', keyboardCommand);
    }

    if (viewport.mobile) {
      const joystick = page.locator('#mobile-joystick');
      const joystickBounds = await joystick.boundingBox();
      if (joystickBounds === null) {
        addError(errors, viewport.name, 'mobile joystick had no visible bounds');
      } else {
        const beforeJoystickMove = await page.evaluate(
          () => window.__townfallDiagnostics?.stormX ?? 0,
        );
        await page.mouse.move(
          joystickBounds.x + joystickBounds.width * 0.5,
          joystickBounds.y + joystickBounds.height * 0.5,
        );
        await page.mouse.down();
        await page.mouse.move(
          joystickBounds.x + joystickBounds.width * 0.88,
          joystickBounds.y + joystickBounds.height * 0.5,
        );
        await page.waitForFunction(
          () => window.__townfallDiagnostics?.inputSource === 'mobile-joystick'
            && window.__townfallDiagnostics.mobileJoystickActive === true,
          undefined,
          { timeout: 3000 },
        );
        const joystickCommand = await page.evaluate(
          () => window.__townfallDiagnostics,
        );
        await page.waitForTimeout(400);
        await page.mouse.up();
        await page.waitForFunction(
          (beforeX) => (window.__townfallDiagnostics?.stormX ?? 0) > beforeX + 0.5,
          beforeJoystickMove,
          { timeout: 5000 },
        );
        if (
          joystickCommand === undefined
          || joystickCommand.commandMagnitude > 1.001
          || Math.hypot(joystickCommand.commandX, joystickCommand.commandY) > 1.001
        ) {
          addError(errors, viewport.name, 'joystick command was not normalized', joystickCommand);
        }
      }
    } else {
      const canvasBounds = await page.locator('#game-canvas').boundingBox();
      if (canvasBounds === null) {
        addError(errors, viewport.name, 'canvas had no pointer bounds');
      } else {
        const beforePointerMove = await page.evaluate(
          () => window.__townfallDiagnostics?.stormX ?? 0,
        );
        await page.mouse.move(
          canvasBounds.x + canvasBounds.width * 0.5,
          canvasBounds.y + canvasBounds.height * 0.5,
        );
        await page.mouse.down();
        await page.mouse.move(
          canvasBounds.x + canvasBounds.width * 0.72,
          canvasBounds.y + canvasBounds.height * 0.5,
        );
        await page.waitForFunction(
          () => window.__townfallDiagnostics?.inputSource === 'pointer',
          undefined,
          { timeout: 3000 },
        );
        const pointerCommand = await page.evaluate(
          () => window.__townfallDiagnostics,
        );
        await page.waitForTimeout(400);
        await page.mouse.up();
        await page.waitForFunction(
          (beforeX) => (window.__townfallDiagnostics?.stormX ?? 0) > beforeX + 0.5,
          beforePointerMove,
          { timeout: 5000 },
        );
        if (
          pointerCommand === undefined
          || pointerCommand.commandMagnitude > 1.001
          || Math.hypot(pointerCommand.commandX, pointerCommand.commandY) > 1.001
        ) {
          addError(errors, viewport.name, 'pointer command was not normalized', pointerCommand);
        }
      }
    }

    const lifecycleScenario = {
      category: 1,
      weather: 'storm',
      quality: viewport.quality,
    };
    await waitForGameplay(page, lifecycleScenario);
    const runningState = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    const canvasSamples = await readCanvasSamples(page);
    const hudLayout = await readHudLayout(page);
    assertScenarioDiagnostics(
      errors,
      viewport.name,
      runningState,
      lifecycleScenario,
    );
    assertPerformanceBudget(
      errors,
      viewport.name,
      runningState,
      viewport.budget,
    );
    assertCanvasOutput(errors, viewport.name, canvasSamples);
    assertHudLayout(errors, viewport.name, hudLayout, viewport);
    if (
      runningState?.simulationHz !== 60
      || runningState.fps <= 0
      || typeof runningState.p95FrameMs !== 'number'
      || typeof runningState.p95WorkMs !== 'number'
      || typeof runningState.startupHitchCount !== 'number'
    ) {
      addError(errors, viewport.name, 'fixed-step or performance diagnostics were missing', runningState);
    }
    await page.screenshot({
      path: resolve(artifactDir, `lifecycle-${viewport.name}-play.png`),
      animations: 'disabled',
      caret: 'hide',
    });

    await page.locator('#pause-button').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.appPhase === 'paused'
        && window.__townfallDiagnostics.paused === true,
      undefined,
      { timeout: 3000 },
    );
    const beforePausedInput = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    await page.keyboard.down('d');
    await page.waitForTimeout(300);
    await page.keyboard.up('d');
    const afterPausedInput = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    if (
      beforePausedInput === undefined
      || afterPausedInput === undefined
      || Math.abs(afterPausedInput.stormX - beforePausedInput.stormX) > 0.05
      || afterPausedInput.inputSource !== 'idle'
    ) {
      addError(errors, viewport.name, 'paused runtime accepted movement', {
        beforePausedInput,
        afterPausedInput,
      });
    }

    await page.locator('#perspective-slider').fill('100');
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.perspectiveAmount === 1,
      undefined,
      { timeout: 3000 },
    );
    await page.locator('#pause-menu [data-quality-option="low"]').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.qualityMode === 'low'
        && window.__townfallDiagnostics.effectiveQuality === 'low'
        && window.__townfallDiagnostics.pixelRatio <= 0.71,
      undefined,
      { timeout: 3000 },
    );
    await page.locator('#pause-render-scale').fill('85');
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.qualityMode === 'custom'
        && window.__townfallDiagnostics.pixelRatio <= 0.86,
      undefined,
      { timeout: 3000 },
    );
    await page.locator('#pause-menu [data-quality-option="high"]').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.qualityMode === 'high'
        && window.__townfallDiagnostics.effectiveQuality === 'high',
      undefined,
      { timeout: 3000 },
    );

    await page.locator('#resume-button').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.appPhase === 'running',
      undefined,
      { timeout: 3000 },
    );
    await page.locator('#pause-button').click();
    await page.locator('#restart-button').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.appPhase === 'running'
        && window.__townfallDiagnostics.restartCount === 1
        && Math.abs(window.__townfallDiagnostics.stormX) < 0.05
        && Math.abs(window.__townfallDiagnostics.stormZ - 520) < 0.05,
      undefined,
      { timeout: 3000 },
    );

    await page.keyboard.press('F3');
    await page.waitForFunction(
      () => document.querySelector('#diagnostics')?.hidden === false
        && document.querySelector('#diagnostics')?.textContent?.includes('Runtime'),
      undefined,
      { timeout: 3000 },
    );
    const overlayState = await page.evaluate(() => {
      const panel = document.querySelector('#diagnostics');
      if (!(panel instanceof HTMLElement)) {
        return null;
      }
      const rect = panel.getBoundingClientRect();
      return {
        clientHeight: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
        overflowY: getComputedStyle(panel).overflowY,
        text: panel.textContent,
        bounds: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      };
    });
    if (
      overlayState === null
      || !overlayState.text?.includes('Startup Hitches')
      || !overlayState.text?.includes('Category / Diameter')
      || !overlayState.text?.includes('Instance Batches')
      || !overlayState.text?.includes('Camera Clearance')
      || overlayState.bounds.left < -1
      || overlayState.bounds.top < -1
      || overlayState.bounds.right > overlayState.viewport.width + 1
      || overlayState.bounds.bottom > overlayState.viewport.height + 1
      || (
        overlayState.scrollHeight > overlayState.clientHeight
        && !['auto', 'scroll'].includes(overlayState.overflowY)
      )
    ) {
      addError(
        errors,
        viewport.name,
        'diagnostics overlay was unbounded or clipped without scrolling',
        overlayState,
      );
    }
    await page.screenshot({
      path: resolve(artifactDir, `lifecycle-${viewport.name}-diagnostics.png`),
      animations: 'disabled',
      caret: 'hide',
    });
    const overlayScrollState = await page.evaluate(() => {
      const panel = document.querySelector('#diagnostics');
      if (!(panel instanceof HTMLElement)) {
        return null;
      }
      panel.scrollTop = panel.scrollHeight;
      const state = {
        scrollTop: panel.scrollTop,
        clientHeight: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
      };
      panel.scrollTop = 0;
      return state;
    });
    if (
      overlayScrollState !== null
      && overlayScrollState.scrollHeight > overlayScrollState.clientHeight
      && overlayScrollState.scrollTop <= 0
    ) {
      addError(errors, viewport.name, 'diagnostics overflow could not be scrolled', overlayScrollState);
    }
    await page.keyboard.press('F3');

    await page.locator('#pause-button').click();
    await page.locator('#mode-select-button').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.appPhase === 'menu',
      undefined,
      { timeout: 3000 },
    );
    await page.locator('#endless-mode-button').click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.gameMode === 'endless'
        && window.__townfallDiagnostics.appPhase === 'running',
      undefined,
      { timeout: 3000 },
    );
    const endlessUi = await page.evaluate(() => ({
      levelLabel: document.querySelector('#level-label')?.textContent,
      levelName: document.querySelector('#level-name')?.textContent,
      timeLabel: document.querySelector('#time-label')?.textContent,
      diagnostics: window.__townfallDiagnostics,
    }));
    if (
      endlessUi.levelLabel !== 'Endless'
      || endlessUi.levelName !== 'Free Roam'
      || endlessUi.timeLabel !== 'INF'
      || endlessUi.diagnostics?.gameMode !== 'endless'
    ) {
      addError(errors, viewport.name, 'endless shell did not activate cleanly', endlessUi);
    }

    assertNoPageErrors(errors, viewport.name, consoleErrors);

    const finalDiagnostics = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    console.log(
      `${viewport.name}: v2 diorama lifecycle ok, `
      + `${canvasSamples.visible}/${canvasSamples.total} canvas samples, `
      + `${runningState?.drawCalls ?? 0} draws, `
      + `${runningState?.triangles ?? 0} triangles, `
      + `${(runningState?.p95FrameMs ?? 0).toFixed(2)} ms p95, `
      + `${(runningState?.distanceTraveled ?? 0).toFixed(1)} m input travel, `
      + `${finalDiagnostics?.mobileControlsEnabled ? 'mobile' : 'desktop'} controls`,
    );
    await page.close();
  }

  for (const scenario of visualMatrix) {
    await captureVisualScenario(browser, scenario, errors);
  }
} finally {
  await browser.close();
}

if (errors.length > 0) {
  throw new Error(`Render verification failed:\n${errors.join('\n')}`);
}
