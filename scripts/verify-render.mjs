import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = process.env.TOWNFALL_URL ?? process.argv[2] ?? 'http://127.0.0.1:5173/';
const artifactDir = resolve('artifacts');
const viewports = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
];

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
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const points = [
      [0.5, 0.5],
      [0.26, 0.37],
      [0.74, 0.37],
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
      diagnostics: window.__townfallDiagnostics,
      canvasWidth: gl.drawingBufferWidth,
      canvasHeight: gl.drawingBufferHeight,
    };
  });
}

await mkdir(artifactDir, { recursive: true });

const browser = await launchBrowser();
const errors = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__townfallDiagnostics?.renderOk === true, undefined, {
      timeout: 10000,
    });

    const startScreenVisible = await page.locator('#start-screen').isVisible();
    if (!startScreenVisible) {
      errors.push(`${viewport.name}: start screen was not visible before choosing a mode`);
    }

    await page.getByRole('button', { name: /Levels/i }).click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.gameMode === 'levels'
        && window.__townfallDiagnostics?.awaitingStart === false,
      undefined,
      { timeout: 5000 },
    );

    const beforeMove = await page.evaluate(() => window.__townfallDiagnostics);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');
    await page.waitForFunction(
      (beforeX) => window.__townfallDiagnostics?.tornadoX > beforeX + 0.5,
      beforeMove.tornadoX,
      { timeout: 5000 },
    );

    const scaleProbe = await page.evaluate(() => {
      const game = window.__townfallGame;
      const initialRadius = game.tornado.getProfile().radius;
      let probeMass = Math.max(50, game.tornado.mass);
      let upgradedProfile = game.tornado.getProfile();

      while (upgradedProfile.category < 5 && probeMass < 5000) {
        probeMass += 50;
        game.tornado.mass = probeMass;
        upgradedProfile = game.tornado.getProfile();
      }

      return {
        initialRadius,
        upgradedRadius: upgradedProfile.radius,
        upgradedCategory: upgradedProfile.category,
        probeMass,
      };
    });
    await page.waitForFunction(
      () => Number(document.querySelector('#diagnostics')?.dataset.cameraZoomScale ?? 1) > 1.15,
      undefined,
      { timeout: 5000 },
    );

    const samples = await readCanvasSamples(page);
    const upgradedDiagnostics = await page.evaluate(() => window.__townfallDiagnostics);
    const levelUi = await page.evaluate(() => ({
      levelLabel: document.querySelector('#level-label')?.textContent ?? '',
      levelName: document.querySelector('#level-name')?.textContent ?? '',
      objectiveLabel: document.querySelector('#objective-label')?.textContent ?? '',
      levelProgressTransform: document.querySelector('#level-progress-bar')?.style.transform ?? '',
    }));
    await page.screenshot({
      path: resolve(artifactDir, `render-${viewport.name}.png`),
      fullPage: false,
    });

    if (samples.visible < 3 || samples.variance <= 0) {
      errors.push(`${viewport.name}: weak canvas sample ${samples.visible}/${samples.total} variance ${samples.variance}`);
    }

    if (scaleProbe.upgradedRadius <= scaleProbe.initialRadius * 2) {
      errors.push(`${viewport.name}: category radius barely changed ${scaleProbe.initialRadius} -> ${scaleProbe.upgradedRadius}`);
    }

    if (scaleProbe.upgradedCategory < 5) {
      errors.push(`${viewport.name}: category probe did not reach Cat 5 by mass ${scaleProbe.probeMass}`);
    }

    if (upgradedDiagnostics.cameraZoomScale <= 1.15) {
      errors.push(`${viewport.name}: camera did not zoom out enough at high category (${upgradedDiagnostics.cameraZoomScale})`);
    }

    if (upgradedDiagnostics.generatedChunks < 25) {
      errors.push(`${viewport.name}: expected wider starting town footprint, got ${upgradedDiagnostics.generatedChunks} chunks`);
    }

    const corridorProbe = await page.evaluate(() => {
      const game = window.__townfallGame;
      game.town.ensureGeneratedAround({ x: 170, z: 0 });
      const generatedDogleg = game.town.ensureGeneratedAround({ x: 170, z: 200 });
      return {
        generatedDogleg,
        hasDoglegCenter: game.town.generatedChunks.has('2,3'),
        generatedChunks: game.town.generatedChunks.size,
      };
    });

    if (!corridorProbe.generatedDogleg || !corridorProbe.hasDoglegCenter) {
      errors.push(`${viewport.name}: town chunks did not fill a dogleg path through expanded bounds (${JSON.stringify(corridorProbe)})`);
    }

    if (upgradedDiagnostics.totalItems <= 0) {
      errors.push(`${viewport.name}: town item diagnostics did not report generated destructibles`);
    }

    if (upgradedDiagnostics.simulatedItems <= 0 || upgradedDiagnostics.simulatedItems >= upgradedDiagnostics.totalItems) {
      errors.push(`${viewport.name}: spatial simulation culling was not active (${upgradedDiagnostics.simulatedItems}/${upgradedDiagnostics.totalItems})`);
    }

    if (upgradedDiagnostics.debrisCount > 96) {
      errors.push(`${viewport.name}: scene debris cap was exceeded (${upgradedDiagnostics.debrisCount})`);
    }

    if (upgradedDiagnostics.effectPieces > 108) {
      errors.push(`${viewport.name}: town effect budget was exceeded (${upgradedDiagnostics.effectPieces})`);
    }

    if (upgradedDiagnostics.minimumLevelDuration <= 0) {
      errors.push(`${viewport.name}: minimum level duration diagnostics were not active`);
    }

    if (upgradedDiagnostics.levelNumber !== 1 || upgradedDiagnostics.levelTransitioning === true) {
      errors.push(`${viewport.name}: level advanced before the minimum duration gate (${JSON.stringify(upgradedDiagnostics)})`);
    }

    if (upgradedDiagnostics.gameMode !== 'levels' || upgradedDiagnostics.awaitingStart === true) {
      errors.push(`${viewport.name}: levels mode diagnostics were not active (${JSON.stringify(upgradedDiagnostics)})`);
    }

    if (upgradedDiagnostics.visibleParts <= 0 || upgradedDiagnostics.visibleParts >= upgradedDiagnostics.totalParts) {
      errors.push(`${viewport.name}: render LOD budget was not active (${upgradedDiagnostics.visibleParts}/${upgradedDiagnostics.totalParts})`);
    }

    if (upgradedDiagnostics.pixelRatio > 1.35) {
      errors.push(`${viewport.name}: renderer pixel ratio was not capped (${upgradedDiagnostics.pixelRatio})`);
    }

    if (upgradedDiagnostics.postProcessing !== true) {
      errors.push(`${viewport.name}: post-processing diagnostics were not enabled`);
    }

    if (upgradedDiagnostics.stormShaderIntensity <= 0 || upgradedDiagnostics.bloomStrength <= 0) {
      errors.push(`${viewport.name}: shader stack did not report active intensity/bloom (${JSON.stringify(upgradedDiagnostics)})`);
    }

    await page.evaluate(() => {
      const game = window.__townfallGame;
      game.tornado.mass = 12000;
      game.tornado.position.set(0, 0, 0);
      game.tornado.group.position.copy(game.tornado.position);
      game.currentStormProfile = game.tornado.getProfile();
    });
    await page.waitForTimeout(900);
    const stressDiagnostics = await page.evaluate(() => window.__townfallDiagnostics);
    if (stressDiagnostics.simulatedItems > 560) {
      errors.push(`${viewport.name}: huge storm simulation budget was exceeded (${stressDiagnostics.simulatedItems})`);
    }

    if (stressDiagnostics.effectPieces > 108 || stressDiagnostics.debrisCount > 96) {
      errors.push(`${viewport.name}: huge storm effect/debris caps were exceeded (${JSON.stringify(stressDiagnostics)})`);
    }

    if (stressDiagnostics.levelNumber !== 1 || stressDiagnostics.levelTransitioning === true) {
      errors.push(`${viewport.name}: huge storm advanced the level too early (${JSON.stringify(stressDiagnostics)})`);
    }

    if (!levelUi.levelLabel.includes('Level') || levelUi.levelName.length === 0 || !levelUi.objectiveLabel.includes('Goal')) {
      errors.push(`${viewport.name}: level UI did not render expected labels (${JSON.stringify(levelUi)})`);
    }

    if (!levelUi.levelProgressTransform.includes('scaleX')) {
      errors.push(`${viewport.name}: level progress bar did not receive a scale transform`);
    }

    const levelBeforeAdvance = Number(upgradedDiagnostics.levelNumber ?? 1);
    const forcedLevelAdvance = await page.evaluate(() => {
      const game = window.__townfallGame;
      if (!game || game.levelIndex >= 4) {
        return false;
      }

      const targets = game.getLevelTargets();
      game.score = game.levelStartScore + targets.scoreTarget;
      game.levelElapsed = Math.max(game.levelElapsed, game.getMinimumLevelDuration());
      const destroyCount = Math.ceil(game.town.items.length * targets.damageTarget);
      for (const item of game.town.items.slice(0, destroyCount)) {
        item.destroyed = true;
      }
      game.checkLevelProgress(game.town.getDestroyedRatio());
      return true;
    });

    if (forcedLevelAdvance) {
      await page.waitForFunction(
        (previousLevel) => Number(document.querySelector('#diagnostics')?.dataset.levelNumber ?? 1) > previousLevel,
        levelBeforeAdvance,
        { timeout: 5000 },
      );
    }

    await page.locator('#pause-button').click({ force: true });
    await page.waitForFunction(
      () => document.querySelector('#diagnostics')?.dataset.paused === 'true',
      undefined,
      { timeout: 3000 },
    );
    const paused = await page.locator('#diagnostics').getAttribute('data-paused');
    if (paused !== 'true') {
      errors.push(`${viewport.name}: pause menu did not pause the game`);
    }

    const beforePerspective = await page.locator('#diagnostics').getAttribute('data-perspective-amount');
    await page.locator('#perspective-slider').fill('100');
    await page.waitForFunction(
      () => document.querySelector('#diagnostics')?.dataset.perspectiveAmount === '1',
      undefined,
      { timeout: 3000 },
    );
    const afterPerspective = await page.locator('#diagnostics').getAttribute('data-perspective-amount');
    if (beforePerspective === afterPerspective) {
      errors.push(`${viewport.name}: perspective slider did not update diagnostics`);
    }
    await page.getByRole('button', { name: 'Resume' }).click();

    await page.locator('#pause-button').click({ force: true });
    await page.getByRole('button', { name: 'Mode Select' }).click();
    await page.waitForFunction(() => document.querySelector('#start-screen')?.hidden === false, undefined, {
      timeout: 3000,
    });
    await page.getByRole('button', { name: /Endless/i }).click();
    await page.waitForFunction(
      () => window.__townfallDiagnostics?.gameMode === 'endless'
        && window.__townfallDiagnostics?.awaitingStart === false,
      undefined,
      { timeout: 5000 },
    );
    const endlessUi = await page.evaluate(() => ({
      levelLabel: document.querySelector('#level-label')?.textContent ?? '',
      levelName: document.querySelector('#level-name')?.textContent ?? '',
      objectiveLabel: document.querySelector('#objective-label')?.textContent ?? '',
      timeLabel: document.querySelector('#time-label')?.textContent ?? '',
      diagnostics: window.__townfallDiagnostics,
    }));

    if (endlessUi.levelLabel !== 'Endless' || endlessUi.levelName !== 'Free Roam' || endlessUi.timeLabel !== '∞') {
      errors.push(`${viewport.name}: endless UI did not render expected labels (${JSON.stringify(endlessUi)})`);
    }

    const endlessStillRunning = await page.evaluate(() => {
      const game = window.__townfallGame;
      game.score = 999999;
      game.levelElapsed = 999;
      for (const item of game.town.items.slice(0, Math.ceil(game.town.items.length * 0.9))) {
        item.destroyed = true;
      }
      game.checkLevelProgress(game.town.getDestroyedRatio());
      return {
        gameMode: game.gameMode,
        levelTransitioning: game.isLevelTransitioning,
        finished: game.isFinished,
      };
    });

    if (endlessStillRunning.gameMode !== 'endless' || endlessStillRunning.levelTransitioning || endlessStillRunning.finished) {
      errors.push(`${viewport.name}: endless mode still triggered level/final state (${JSON.stringify(endlessStillRunning)})`);
    }

    if (consoleErrors.length > 0) {
      errors.push(`${viewport.name}: console errors: ${consoleErrors.join(' | ')}`);
    }

    console.log(`${viewport.name}: render ok, ${samples.visible}/${samples.total} sampled pixels, chunks ${upgradedDiagnostics.generatedChunks}, simulated ${upgradedDiagnostics.simulatedItems}/${upgradedDiagnostics.totalItems}, effects ${upgradedDiagnostics.effectPieces}, debris ${upgradedDiagnostics.debrisCount}, visible parts ${upgradedDiagnostics.visibleParts}/${upgradedDiagnostics.totalParts}, draw calls ${upgradedDiagnostics.drawCalls}, moved from x=${beforeMove.tornadoX} to x=${samples.diagnostics.tornadoX}, radius ${scaleProbe.initialRadius.toFixed(1)} -> ${scaleProbe.upgradedRadius.toFixed(1)} at Cat ${scaleProbe.upgradedCategory} mass ${scaleProbe.probeMass}, camera scale ${upgradedDiagnostics.cameraZoomScale}, shader ${upgradedDiagnostics.stormShaderIntensity}, ${levelUi.levelLabel}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
