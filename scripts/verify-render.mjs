import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.TOWNFALL_URL
  ?? process.argv[2]
  ?? 'http://127.0.0.1:5175/';
const artifactDir = resolve('artifacts');
const viewports = [
  { name: 'desktop', width: 1280, height: 800, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
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
        variance: 0,
        canvasWidth: 0,
        canvasHeight: 0,
      };
    }

    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
      return {
        visible: 0,
        total: 0,
        variance: 0,
        canvasWidth: 0,
        canvasHeight: 0,
      };
    }

    const points = [
      [0.5, 0.5],
      [0.24, 0.34],
      [0.76, 0.34],
      [0.3, 0.72],
      [0.7, 0.72],
    ];
    const pixel = new Uint8Array(4);
    let visible = 0;
    let variance = 0;

    for (const [xRatio, yRatio] of points) {
      const x = Math.floor(gl.drawingBufferWidth * xRatio);
      const y = Math.floor(gl.drawingBufferHeight * yRatio);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const luma = pixel[0] + pixel[1] + pixel[2];
      const spread = Math.max(pixel[0], pixel[1], pixel[2])
        - Math.min(pixel[0], pixel[1], pixel[2]);
      if (pixel[3] > 0 && luma > 45) {
        visible += 1;
      }
      variance += spread;
    }

    return {
      visible,
      total: points.length,
      variance,
      canvasWidth: gl.drawingBufferWidth,
      canvasHeight: gl.drawingBufferHeight,
    };
  });
}

function addError(errors, viewportName, message, evidence) {
  const suffix = evidence === undefined ? '' : ` (${JSON.stringify(evidence)})`;
  errors.push(`${viewportName}: ${message}${suffix}`);
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
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });
    await page.addInitScript(() => {
      localStorage.setItem('townfall.v2.qualityMode', 'high');
      localStorage.removeItem('townfall.v2.customQuality');
    });

    const pageUrl = withSearchParams(url, {
      quality: 'high',
      noDebugLogs: '1',
      [viewport.mobile ? 'mobileControls' : 'noMobileControls']: '1',
    });
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.runtime === 'v2-foundation'
        && window.__townfallDiagnostics.renderOk === true,
      undefined,
      { timeout: 10000 },
    );

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
    if (initialState.diagnostics?.schemaVersion !== 2) {
      addError(errors, viewport.name, 'runtime diagnostics schema was not v2', initialState);
    }
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
    if (menuSamples.visible < 4 || menuSamples.total !== 5) {
      addError(errors, viewport.name, 'menu background canvas was blank', menuSamples);
    }
    await page.screenshot({
      path: resolve(artifactDir, `milestone1-${viewport.name}-menu.png`),
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

    await page.waitForFunction(
      () => window.__townfallDiagnostics?.warmupComplete === true
        && window.__townfallDiagnostics.performancePhase === 'gameplay'
        && window.__townfallDiagnostics.fps > 0,
      undefined,
      { timeout: 7000 },
    );
    const runningState = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    const canvasSamples = await readCanvasSamples(page);
    if (canvasSamples.visible < 4 || canvasSamples.variance < 15) {
      addError(errors, viewport.name, 'playfield canvas was blank or crushed', canvasSamples);
    }
    if (
      runningState === undefined
      || runningState.drawCalls > 20
      || runningState.sceneObjects > 80
      || runningState.geometries > 20
      || runningState.textures > 4
    ) {
      addError(errors, viewport.name, 'foundation render budgets were exceeded', runningState);
    }
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
      path: resolve(artifactDir, `milestone1-${viewport.name}-play.png`),
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
        && Math.abs(window.__townfallDiagnostics.stormZ) < 0.05,
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
      return {
        clientHeight: panel.clientHeight,
        scrollHeight: panel.scrollHeight,
        overflowY: getComputedStyle(panel).overflowY,
        text: panel.textContent,
      };
    });
    if (
      overlayState === null
      || !overlayState.text?.includes('Startup Hitches')
      || (
        overlayState.scrollHeight > overlayState.clientHeight
        && !['auto', 'scroll'].includes(overlayState.overflowY)
      )
    ) {
      addError(errors, viewport.name, 'diagnostics overlay clipped without scrolling', overlayState);
    }
    await page.screenshot({
      path: resolve(artifactDir, `milestone1-${viewport.name}-diagnostics.png`),
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
      || endlessUi.timeLabel !== '∞'
      || endlessUi.diagnostics?.gameMode !== 'endless'
    ) {
      addError(errors, viewport.name, 'endless shell did not activate cleanly', endlessUi);
    }

    if (consoleErrors.length > 0) {
      addError(errors, viewport.name, 'browser console errors', consoleErrors);
    }

    const finalDiagnostics = await page.evaluate(
      () => window.__townfallDiagnostics,
    );
    console.log(
      `${viewport.name}: v2 foundation ok, `
      + `${canvasSamples.visible}/${canvasSamples.total} canvas samples, `
      + `${finalDiagnostics?.drawCalls ?? 0} draws, `
      + `${finalDiagnostics?.sceneObjects ?? 0} objects, `
      + `${finalDiagnostics?.geometries ?? 0} geometries, `
      + `${(finalDiagnostics?.fps ?? 0).toFixed(1)} FPS, `
      + `${(runningState?.distanceTraveled ?? 0).toFixed(1)} m input travel, `
      + `${finalDiagnostics?.mobileControlsEnabled ? 'mobile' : 'desktop'} controls`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}

if (errors.length > 0) {
  throw new Error(`Render verification failed:\n${errors.join('\n')}`);
}
