import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { DebrisParticles } from './debrisParticles';
import { InputController } from './input';
import { StormAtmosphereShader } from './stormAtmosphereShader';
import { Tornado } from './tornado';
import { Town } from './town';
import { Hud } from './ui';

const LEVEL_COMPLETE_DELAY = 2.35;
const MAX_RENDER_PIXEL_RATIO = 1.35;
const SHADOW_MAP_SIZE = 1024;
const MAX_ABSORPTIONS_PER_FRAME = 8;
const DIAGNOSTICS_UPDATE_INTERVAL_MS = 450;
const HITCH_FRAME_THRESHOLD_MS = 75;
const MIN_LEVEL_DURATION_BY_INDEX = [10, 14, 18, 22, 26];
const LEVEL_TARGET_MULTIPLIER_BY_CATEGORY = [1, 2.4, 5.5, 12, 25];
const LEVEL_DAMAGE_BONUS_BY_CATEGORY = [0, 0.04, 0.1, 0.17, 0.24];
const GAME_MODES = {
  LEVELS: 'levels',
  ENDLESS: 'endless',
};
const LEVELS = [
  {
    name: 'First Touchdown',
    timeLimit: 110,
    scoreTarget: 1400,
    damageTarget: 0.06,
  },
  {
    name: 'Subdivision',
    timeLimit: 130,
    scoreTarget: 5200,
    damageTarget: 0.12,
  },
  {
    name: 'Main Street',
    timeLimit: 150,
    scoreTarget: 12000,
    damageTarget: 0.18,
  },
  {
    name: 'Civic Core',
    timeLimit: 165,
    scoreTarget: 24000,
    damageTarget: 0.25,
  },
  {
    name: 'Wedge Outbreak',
    timeLimit: 180,
    scoreTarget: 42000,
    damageTarget: 0.34,
  },
];
const BASE_CAMERA_OFFSET = new THREE.Vector3(0, 23, 76);
const CAMERA_SCALE_BY_CATEGORY = [
  { distance: 1, height: 1, lookHeight: 5, fov: 58, fogDensity: 0.0058 },
  { distance: 1.22, height: 1.08, lookHeight: 6.4, fov: 58.8, fogDensity: 0.0042 },
  { distance: 1.55, height: 1.2, lookHeight: 9.5, fov: 59.5, fogDensity: 0.0028 },
  { distance: 1.95, height: 1.34, lookHeight: 14, fov: 60.5, fogDensity: 0.0017 },
  { distance: 2.34, height: 1.48, lookHeight: 20, fov: 61.5, fogDensity: 0.001 },
];

function getCameraScaleForCategory(category) {
  return CAMERA_SCALE_BY_CATEGORY[Math.min(CAMERA_SCALE_BY_CATEGORY.length - 1, Math.max(0, category - 1))];
}

function getCategoryIndex(category) {
  return Math.min(LEVEL_TARGET_MULTIPLIER_BY_CATEGORY.length - 1, Math.max(0, category - 1));
}

function createPerformanceStats() {
  return {
    lastFrameStartedAt: 0,
    sampleStartedAt: performance.now(),
    sampleFrames: 0,
    sampleFrameMs: 0,
    sampleWorkMs: 0,
    sampleMaxFrameMs: 0,
    sampleMaxWorkMs: 0,
    fps: 0,
    averageFrameMs: 0,
    averageWorkMs: 0,
    lastFrameMs: 0,
    lastWorkMs: 0,
    maxFrameMs: 0,
    maxWorkMs: 0,
    hitchCount: 0,
    lastHitchMs: 0,
    longestHitchMs: 0,
  };
}

function createSceneStats() {
  return {
    sceneObjects: 0,
    meshes: 0,
    groups: 0,
    lights: 0,
    materials: 0,
  };
}

function formatDebugNumber(value, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return String(value);
  }

  return value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export class Game {
  [key: string]: any;

  constructor({ canvas, diagnosticsElement }) {
    this.appElement = document.querySelector('#app');
    this.startScreenElement = document.querySelector('#start-screen');
    this.pauseMenuElement = document.querySelector('#pause-menu');
    this.pauseButtonElement = document.querySelector('#pause-button');
    this.retryLevelButtonElement = document.querySelector('#retry-level-button');
    this.restartButtonElement = document.querySelector('#restart-button');
    this.canvas = canvas;
    this.diagnosticsElement = diagnosticsElement;
    this.pixelDiagnosticsEnabled = new URLSearchParams(window.location.search).has('pixelDiagnostics');
    this.debugOverlayVisible = new URLSearchParams(window.location.search).has('debug')
      || window.localStorage.getItem('townfall.debugOverlay') === 'true';
    this.performanceStats = createPerformanceStats();
    this.lastSceneStats = createSceneStats();
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7f8d8a);
    this.scene.fog = new THREE.FogExp2(0x7f8d8a, 0.0058);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 700);
    this.camera.position.copy(BASE_CAMERA_OFFSET);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_RENDER_PIXEL_RATIO));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.info.autoReset = false;
    this.pendingShadowRefresh = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.setupPostProcessing();

    this.input = new InputController(canvas);
    this.hud = new Hud();
    this.tornado = new Tornado(this.scene);
    this.debrisParticles = new DebrisParticles(this.scene);
    this.town = new Town(this.scene, this.debrisParticles);
    this.pendingAbsorbedItems = [];
    this.levelIndex = 0;
    this.levelStartScore = 0;
    this.levelStartMass = 0;
    this.levelElapsed = 0;
    this.levelTransitionTimer = 0;
    this.isLevelTransitioning = false;
    this.score = 0;
    this.remainingTime = this.currentLevel.timeLimit;
    this.combo = 1;
    this.comboTimer = 0;
    this.gameMode = null;
    this.isAwaitingStart = true;
    this.isFinished = false;
    this.isPaused = false;
    this.perspectiveAmount = 0.35;
    this.frame = 0;
    this.lastDiagnosticsAt = 0;
    this.lastHitchLogAt = 0;
    this.lastSimulationPressureLogAt = 0;
    this.weatherTime = 0;
    this.lightningTimer = 4.8;
    this.lightningEnergy = 0;
    this.renderBudgetTimer = 0;
    this.currentStormProfile = this.tornado.getProfile();
    this.cameraOffset = BASE_CAMERA_OFFSET.clone();
    this.cameraLookHeight = CAMERA_SCALE_BY_CATEGORY[0].lookHeight;

    this.setupLights();
    this.resize();
    this.queueShadowRefresh();
    this.syncGameShell();
    this.setDebugOverlayVisible(this.debugOverlayVisible, { persist: false });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'F3') {
        return;
      }

      event.preventDefault();
      this.setDebugOverlayVisible(!this.debugOverlayVisible);
    });
  }

  get currentLevel() {
    return LEVELS[this.levelIndex];
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  restart() {
    this.restartCurrentMode();
  }

  startLevels() {
    this.gameMode = GAME_MODES.LEVELS;
    this.isAwaitingStart = false;
    this.restartRun();
  }

  startEndless() {
    this.gameMode = GAME_MODES.ENDLESS;
    this.isAwaitingStart = false;
    this.levelIndex = 0;
    this.levelStartScore = 0;
    this.levelStartMass = 0;
    this.score = 0;
    this.startLevel(0, {
      carryScore: false,
      carryMass: false,
      message: 'Endless Free Roam',
    });
    this.remainingTime = Infinity;
    this.syncGameShell();
  }

  restartCurrentMode() {
    if (this.gameMode === GAME_MODES.ENDLESS) {
      this.startEndless();
      return;
    }

    this.restartRun();
  }

  showStartScreen() {
    this.isAwaitingStart = true;
    this.gameMode = null;
    this.isPaused = false;
    this.isFinished = false;
    this.isLevelTransitioning = false;
    this.levelTransitionTimer = 0;
    this.syncGameShell();
  }

  restartRun() {
    this.gameMode = GAME_MODES.LEVELS;
    this.isAwaitingStart = false;
    this.levelIndex = 0;
    this.levelStartScore = 0;
    this.levelStartMass = 0;
    this.score = 0;
    this.startLevel(0, {
      carryScore: false,
      carryMass: false,
      message: 'Level 1: First Touchdown',
    });
    this.syncGameShell();
  }

  restartLevel() {
    if (this.gameMode === GAME_MODES.ENDLESS) {
      this.startEndless();
      return;
    }

    this.score = this.levelStartScore;
    this.startLevel(this.levelIndex, {
      carryScore: true,
      carryMass: false,
      massOverride: this.levelStartMass,
      message: `Retry: ${this.currentLevel.name}`,
    });
  }

  startLevel(levelIndex, {
    carryScore = true,
    carryMass = true,
    massOverride = null,
    message = null,
  } = {}) {
    const previousMass = this.tornado.mass;
    this.levelIndex = THREE.MathUtils.clamp(levelIndex, 0, LEVELS.length - 1);
    const startingMass = massOverride ?? (carryMass ? previousMass : 0);

    if (!carryScore) {
      this.score = 0;
    }

    this.levelStartScore = this.score;
    this.levelStartMass = startingMass;
    this.levelElapsed = 0;
    this.remainingTime = this.currentLevel.timeLimit;
    this.combo = 1;
    this.comboTimer = 0;
    this.isFinished = false;
    this.isLevelTransitioning = false;
    this.levelTransitionTimer = 0;
    this.tornado.restart(startingMass);
    this.town.resetForLevel(this.levelIndex);
    this.queueShadowRefresh();
    this.currentStormProfile = this.tornado.getProfile();
    this.renderBudgetTimer = 0;
    this.town.updateRenderBudget(this.tornado.position, this.currentStormProfile.category);
    this.cameraOffset.copy(BASE_CAMERA_OFFSET);
    this.cameraLookHeight = CAMERA_SCALE_BY_CATEGORY[0].lookHeight;
    this.camera.fov = CAMERA_SCALE_BY_CATEGORY[0].fov;
    this.camera.updateProjectionMatrix();
    this.pendingAbsorbedItems = [];
    this.debrisParticles.reset();
    this.hud.flashMessage(message ?? `Level ${this.levelIndex + 1}: ${this.currentLevel.name}`, 1.8);
    this.syncGameShell();
  }

  setPaused(isPaused) {
    if (this.isAwaitingStart) {
      this.isPaused = false;
      this.syncGameShell();
      return;
    }

    this.isPaused = isPaused;
    this.syncGameShell();
  }

  setPerspective(amount) {
    this.perspectiveAmount = THREE.MathUtils.clamp(amount, 0, 1);
  }

  syncGameShell() {
    this.appElement?.classList.toggle('is-starting', this.isAwaitingStart);

    if (this.startScreenElement) {
      this.startScreenElement.hidden = !this.isAwaitingStart;
      this.startScreenElement.setAttribute('aria-hidden', String(!this.isAwaitingStart));
    }

    if (this.pauseMenuElement) {
      const showPauseMenu = this.isPaused && !this.isAwaitingStart;
      this.pauseMenuElement.hidden = !showPauseMenu;
      this.pauseMenuElement.setAttribute('aria-hidden', String(!showPauseMenu));
    }

    if (this.pauseButtonElement) {
      this.pauseButtonElement.hidden = this.isAwaitingStart || this.isPaused;
    }

    const isEndless = this.gameMode === GAME_MODES.ENDLESS;
    if (this.retryLevelButtonElement) {
      this.retryLevelButtonElement.hidden = isEndless;
      this.retryLevelButtonElement.setAttribute('aria-hidden', String(isEndless));
    }

    if (this.restartButtonElement) {
      this.restartButtonElement.textContent = isEndless ? 'Restart Endless' : 'Restart Run';
    }
  }

  setupPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.54, 0.74);
    this.composer.addPass(this.bloomPass);

    this.stormAtmospherePass = new ShaderPass(StormAtmosphereShader);
    this.composer.addPass(this.stormAtmospherePass);
    this.composer.addPass(new OutputPass());
  }

  setupLights() {
    const hemisphere = new THREE.HemisphereLight(0xaeb8b1, 0x354c42, 1.42);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xdfd2ad, 2.05);
    sun.position.set(-28, 56, 24);
    sun.castShadow = true;
    sun.shadow.camera.left = -78;
    sun.shadow.camera.right = 78;
    sun.shadow.camera.top = 78;
    sun.shadow.camera.bottom = -78;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.scene.add(sun);

    const stormGlow = new THREE.PointLight(0xa7ffe0, 1.4, 40);
    stormGlow.position.set(-34, 8, 32);
    this.tornado.group.add(stormGlow);

    this.lightningLight = new THREE.PointLight(0xcfe7ff, 0, 260);
    this.lightningLight.position.set(-60, 72, -90);
    this.scene.add(this.lightningLight);
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.stormAtmospherePass.uniforms.resolution.value.set(width, height);
  }

  queueShadowRefresh() {
    this.pendingShadowRefresh = true;
  }

  tick() {
    const frameStartedAt = performance.now();
    const realFrameMs = this.performanceStats.lastFrameStartedAt > 0
      ? frameStartedAt - this.performanceStats.lastFrameStartedAt
      : 0;
    this.performanceStats.lastFrameStartedAt = frameStartedAt;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frame += 1;

    if (this.isLevelTransitioning && !this.isPaused && !this.isAwaitingStart) {
      this.levelTransitionTimer -= dt;
      if (this.levelTransitionTimer <= 0) {
        this.advanceToNextLevel();
      }
    }

    if (!this.isAwaitingStart && !this.isFinished && !this.isPaused && !this.isLevelTransitioning) {
      this.update(dt);
    }

    this.updateCamera(dt);
    this.updateWeatherShaders(dt);
    this.debrisParticles.update(this.weatherTime, dt, this.tornado.position, this.currentStormProfile);
    this.renderer.info.reset();
    this.renderer.shadowMap.needsUpdate = this.pendingShadowRefresh;
    this.pendingShadowRefresh = false;
    this.composer.render();
    this.renderer.shadowMap.needsUpdate = false;
    this.samplePerformance(realFrameMs, performance.now() - frameStartedAt);
    this.collectDiagnostics();
  }

  setDebugOverlayVisible(isVisible, { persist = true } = {}) {
    this.debugOverlayVisible = Boolean(isVisible);

    if (persist) {
      window.localStorage.setItem('townfall.debugOverlay', String(this.debugOverlayVisible));
    }

    if (!this.diagnosticsElement) {
      return;
    }

    this.diagnosticsElement.hidden = !this.debugOverlayVisible;
    this.diagnosticsElement.setAttribute('aria-hidden', String(!this.debugOverlayVisible));
    this.diagnosticsElement.classList.toggle('diagnostics--visible', this.debugOverlayVisible);
  }

  samplePerformance(frameMs, workMs) {
    const stats = this.performanceStats;
    stats.lastFrameMs = frameMs;
    stats.lastWorkMs = workMs;

    if (frameMs > 0) {
      stats.sampleFrames += 1;
      stats.sampleFrameMs += frameMs;
      stats.sampleWorkMs += workMs;
      stats.sampleMaxFrameMs = Math.max(stats.sampleMaxFrameMs, frameMs);
      stats.sampleMaxWorkMs = Math.max(stats.sampleMaxWorkMs, workMs);
      stats.maxFrameMs = Math.max(stats.maxFrameMs, frameMs);
      stats.maxWorkMs = Math.max(stats.maxWorkMs, workMs);
    }

    if (frameMs >= HITCH_FRAME_THRESHOLD_MS) {
      stats.hitchCount += 1;
      stats.lastHitchMs = frameMs;
      stats.longestHitchMs = Math.max(stats.longestHitchMs, frameMs);

      const now = performance.now();
      if (now - this.lastHitchLogAt > 2000) {
        this.lastHitchLogAt = now;
        window.__townfallLog?.('warn', 'frame-hitch', {
          frameMs: Number(frameMs.toFixed(2)),
          workMs: Number(workMs.toFixed(2)),
          thresholdMs: HITCH_FRAME_THRESHOLD_MS,
          hitchCount: stats.hitchCount,
          longestHitchMs: Number(stats.longestHitchMs.toFixed(2)),
        });
      }
    }

    const now = performance.now();
    const sampleDuration = now - stats.sampleStartedAt;
    if (sampleDuration < 1000 || stats.sampleFrames === 0) {
      return;
    }

    stats.fps = stats.sampleFrames / (sampleDuration / 1000);
    stats.averageFrameMs = stats.sampleFrameMs / stats.sampleFrames;
    stats.averageWorkMs = stats.sampleWorkMs / stats.sampleFrames;
    stats.maxFrameMs = stats.sampleMaxFrameMs;
    stats.maxWorkMs = stats.sampleMaxWorkMs;
    stats.sampleStartedAt = now;
    stats.sampleFrames = 0;
    stats.sampleFrameMs = 0;
    stats.sampleWorkMs = 0;
    stats.sampleMaxFrameMs = 0;
    stats.sampleMaxWorkMs = 0;
  }

  update(dt) {
    this.levelElapsed += dt;
    this.debrisParticles.beginFrame();
    this.remainingTime = this.gameMode === GAME_MODES.ENDLESS
      ? Infinity
      : Math.max(0, this.remainingTime - dt);

    const inputVector = this.input.getMoveVector();
    let generatedTownChunks = this.town.ensureGeneratedAround(this.tornado.position);
    const { profile, categoryChanged } = this.tornado.update(dt, inputVector, this.town.boundary);
    generatedTownChunks = this.town.ensureGeneratedAround(this.tornado.position) || generatedTownChunks;
    if (generatedTownChunks) {
      this.queueShadowRefresh();
    }

    this.currentStormProfile = profile;
    this.renderBudgetTimer -= dt;
    if (this.renderBudgetTimer <= 0) {
      this.town.updateRenderBudget(this.tornado.position, profile.category);
      this.renderBudgetTimer = 0.32;
    }

    if (categoryChanged) {
      this.hud.flashMessage(`Category ${profile.category}`, 1.7);
    }

    const absorbedItems = this.town.update(profile, this.tornado.position, dt);
    if (absorbedItems.length > 0) {
      this.queueAbsorbedItems(absorbedItems);
    }
    this.processAbsorbedQueue();

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
      }
    }

    const destroyedRatio = this.town.getDestroyedRatio();
    const levelTargets = this.getLevelTargets();
    this.checkLevelProgress(destroyedRatio, levelTargets);

    this.hud.update({
      mode: this.gameMode,
      levelNumber: this.levelIndex + 1,
      levelCount: LEVELS.length,
      levelName: this.currentLevel.name,
      category: profile.category,
      mass: profile.mass,
      score: this.score,
      levelScore: this.score - this.levelStartScore,
      scoreTarget: levelTargets.scoreTarget,
      destroyedRatio,
      damageTarget: levelTargets.damageTarget,
      remainingTime: this.remainingTime,
      isLevelTransitioning: this.isLevelTransitioning,
      isFinished: this.isFinished,
    }, dt);
  }

  checkLevelProgress(destroyedRatio, levelTargets = this.getLevelTargets()) {
    if (this.gameMode !== GAME_MODES.LEVELS) {
      return;
    }

    if (this.isFinished || this.isLevelTransitioning) {
      return;
    }

    const levelScore = this.score - this.levelStartScore;
    const metScoreTarget = levelScore >= levelTargets.scoreTarget;
    const metDamageTarget = destroyedRatio >= levelTargets.damageTarget;
    const metMinimumDuration = this.levelElapsed >= this.getMinimumLevelDuration();

    if (metScoreTarget && metDamageTarget && metMinimumDuration) {
      this.completeCurrentLevel();
      return;
    }

    if (this.remainingTime <= 0) {
      this.isFinished = true;
      this.hud.flashMessage(`Level failed: ${this.currentLevel.name}`, 8);
    }
  }

  getMinimumLevelDuration() {
    return MIN_LEVEL_DURATION_BY_INDEX[Math.min(MIN_LEVEL_DURATION_BY_INDEX.length - 1, this.levelIndex)];
  }

  getLevelTargets() {
    if (this.gameMode === GAME_MODES.ENDLESS) {
      return { scoreTarget: Infinity, damageTarget: 1 };
    }

    const profile = this.currentStormProfile ?? this.tornado.getProfile();
    const categoryIndex = getCategoryIndex(profile.category);
    const overgrowth = THREE.MathUtils.clamp((profile.radius - 36) / 36, 0, 5);
    const scoreTarget = Math.round(this.currentLevel.scoreTarget * LEVEL_TARGET_MULTIPLIER_BY_CATEGORY[categoryIndex] * (1 + overgrowth));
    const damageTarget = THREE.MathUtils.clamp(
      this.currentLevel.damageTarget + LEVEL_DAMAGE_BONUS_BY_CATEGORY[categoryIndex] + overgrowth * 0.035,
      this.currentLevel.damageTarget,
      0.82,
    );

    return { scoreTarget, damageTarget };
  }

  completeCurrentLevel() {
    const isFinalLevel = this.levelIndex >= LEVELS.length - 1;

    if (isFinalLevel) {
      this.isFinished = true;
      this.hud.flashMessage('Outbreak mastered', 8);
      return;
    }

    this.isLevelTransitioning = true;
    this.levelTransitionTimer = LEVEL_COMPLETE_DELAY;
    this.hud.flashMessage(`Level ${this.levelIndex + 1} cleared`, LEVEL_COMPLETE_DELAY);
  }

  advanceToNextLevel() {
    this.startLevel(this.levelIndex + 1, {
      carryScore: true,
      carryMass: true,
      message: `Level ${this.levelIndex + 2}: ${LEVELS[this.levelIndex + 1].name}`,
    });
  }

  queueAbsorbedItems(items) {
    this.pendingAbsorbedItems.push(...items);
  }

  processAbsorbedQueue() {
    const processCount = Math.min(MAX_ABSORPTIONS_PER_FRAME, this.pendingAbsorbedItems.length);
    if (processCount <= 0) {
      return;
    }

    const items = this.pendingAbsorbedItems.splice(0, processCount);
    for (const item of items) {
      const comboBonus = Math.min(5, this.combo);
      this.score += item.points * comboBonus;
      this.combo = Math.min(5, this.combo + 0.18);
      this.comboTimer = 2.6;
      this.tornado.absorb(item);
      this.spawnDebrisBurst(item.group.position, item.radius, item.type);
    }

    const biggest = items.reduce((winner, item) => (item.points > winner.points ? item : winner), items[0]);
    if (biggest) {
      this.hud.flashMessage(`${biggest.type} claimed`, 1.2);
    }
  }

  updateCamera(dt) {
    const cameraScale = getCameraScaleForCategory(this.currentStormProfile.category);
    const targetOffset = BASE_CAMERA_OFFSET.clone();
    const perspectiveHeight = THREE.MathUtils.lerp(0.58, 1.72, this.perspectiveAmount);
    const perspectiveDistance = THREE.MathUtils.lerp(0.86, 1.12, this.perspectiveAmount);
    const perspectiveLookBoost = THREE.MathUtils.lerp(-5.5, 9, this.perspectiveAmount);
    targetOffset.y *= cameraScale.height * perspectiveHeight;
    targetOffset.z *= perspectiveDistance;
    targetOffset.z *= cameraScale.distance;

    const settleFactor = 1 - Math.pow(0.00003, dt);
    this.cameraOffset.lerp(targetOffset, settleFactor);
    this.cameraLookHeight = THREE.MathUtils.lerp(this.cameraLookHeight, cameraScale.lookHeight, settleFactor);
    const targetFov = cameraScale.fov + THREE.MathUtils.lerp(-1.5, 2.5, this.perspectiveAmount);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, settleFactor);
    this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, cameraScale.fogDensity, settleFactor);
    this.camera.updateProjectionMatrix();

    const targetPosition = this.tornado.group.position.clone().add(this.cameraOffset);
    this.camera.position.lerp(targetPosition, 1 - Math.pow(0.00001, dt));
    const lookTarget = this.tornado.group.position.clone();
    lookTarget.y = Math.max(1.5, this.cameraLookHeight + perspectiveLookBoost);
    this.camera.lookAt(lookTarget);
  }

  updateWeatherShaders(dt) {
    const category = this.currentStormProfile?.category ?? 1;
    const stormIntensity = THREE.MathUtils.clamp((category - 1) / 4, 0, 1);

    this.weatherTime += dt;
    this.lightningTimer -= dt * (0.72 + stormIntensity * 0.48);
    if (this.lightningTimer <= 0) {
      this.lightningEnergy = 0.72 + Math.random() * 0.48 + stormIntensity * 0.34;
      this.lightningTimer = THREE.MathUtils.lerp(7.8, 3.8, stormIntensity) + Math.random() * 4.2;
    }

    this.lightningEnergy = Math.max(0, this.lightningEnergy - dt * (3.8 + stormIntensity * 1.2));
    const lightning = Math.pow(this.lightningEnergy, 1.7);

    this.stormAtmospherePass.uniforms.time.value = this.weatherTime;
    this.stormAtmospherePass.uniforms.intensity.value = THREE.MathUtils.lerp(0.18, 0.74, stormIntensity);
    this.stormAtmospherePass.uniforms.lightning.value = lightning;
    this.bloomPass.strength = 0.08 + stormIntensity * 0.055 + lightning * 0.18;
    this.bloomPass.radius = 0.32 + stormIntensity * 0.12;
    this.bloomPass.threshold = 0.78 - stormIntensity * 0.06;
    this.renderer.toneMappingExposure = 0.9 + lightning * 0.12;
    this.lightningLight.intensity = lightning * (3.5 + stormIntensity * 6.5);
  }

  spawnDebrisBurst(position, radius, type) {
    const materialType = type === 'Tree' ? 'leaf' : 'structure';
    const intensity = THREE.MathUtils.clamp(radius * 0.18, 0.55, 1.9);
    this.debrisParticles.emitStructuralBurst(position, radius, materialType, intensity);
    this.debrisParticles.emitSuctionDebris(position, this.currentStormProfile, intensity * 0.72, this.tornado.position);
  }

  collectDiagnostics() {
    const now = performance.now();
    if (now - this.lastDiagnosticsAt < DIAGNOSTICS_UPDATE_INTERVAL_MS) {
      return;
    }

    this.lastDiagnosticsAt = now;

    const renderInfo = this.renderer.info.render;
    const samplePoints = [
      [0.5, 0.5],
      [0.25, 0.35],
      [0.75, 0.35],
      [0.35, 0.68],
      [0.65, 0.68],
    ];
    let visibleSamples = samplePoints.length;
    let colorVariance = 0;

    if (this.pixelDiagnosticsEnabled) {
      const gl = this.renderer.getContext();
      const pixel = new Uint8Array(4);
      visibleSamples = 0;

      for (const [xRatio, yRatio] of samplePoints) {
        const x = Math.floor(gl.drawingBufferWidth * xRatio);
        const y = Math.floor(gl.drawingBufferHeight * yRatio);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        const luma = pixel[0] + pixel[1] + pixel[2];
        const spread = Math.max(pixel[0], pixel[1], pixel[2]) - Math.min(pixel[0], pixel[1], pixel[2]);
        if (pixel[3] > 0 && luma > 45) {
          visibleSamples += 1;
        }
        colorVariance += spread;
      }
    }

    const townStats = this.town.lastUpdateStats;
    const renderBudgetStats = this.town.lastRenderBudgetStats;
    const townInstancingStats = this.town.lastInstancingStats ?? this.town.instancedTown?.getDiagnostics?.() ?? {};
    const levelTargets = this.getLevelTargets();
    const sceneStats = this.debugOverlayVisible ? this.collectSceneStats() : this.lastSceneStats;
    const profile = this.currentStormProfile ?? this.tornado.getProfile();
    const performanceStats = this.performanceStats;
    const debrisStats = this.debrisParticles.getDiagnostics();
    const diagnostics = {
      renderOk: visibleSamples >= 3 && renderInfo.calls > 0,
      sampledPixels: this.pixelDiagnosticsEnabled ? `${visibleSamples}/${samplePoints.length}` : 'skipped',
      colorVariance,
      frame: this.frame,
      fps: Number(performanceStats.fps.toFixed(1)),
      averageFrameMs: Number(performanceStats.averageFrameMs.toFixed(2)),
      averageWorkMs: Number(performanceStats.averageWorkMs.toFixed(2)),
      lastFrameMs: Number(performanceStats.lastFrameMs.toFixed(2)),
      lastWorkMs: Number(performanceStats.lastWorkMs.toFixed(2)),
      maxFrameMs: Number(performanceStats.maxFrameMs.toFixed(2)),
      maxWorkMs: Number(performanceStats.maxWorkMs.toFixed(2)),
      hitchCount: performanceStats.hitchCount,
      lastHitchMs: Number(performanceStats.lastHitchMs.toFixed(2)),
      longestHitchMs: Number(performanceStats.longestHitchMs.toFixed(2)),
      hitchThresholdMs: HITCH_FRAME_THRESHOLD_MS,
      tornadoX: Number(this.tornado.position.x.toFixed(2)),
      tornadoZ: Number(this.tornado.position.z.toFixed(2)),
      stormCategory: profile.category,
      stormMass: Math.round(profile.mass),
      stormRadius: Number(profile.radius.toFixed(2)),
      stormPullRadius: Number(profile.pullRadius.toFixed(2)),
      stormLiftLimit: Number(profile.liftLimit.toFixed(2)),
      debrisCount: debrisStats.activeChunks,
      activeParticles: debrisStats.activeParticles,
      particleCapacity: debrisStats.particleCapacity,
      emittedParticles: debrisStats.emittedParticles,
      skippedParticleEmissions: debrisStats.skippedParticleEmissions,
      recycledParticles: debrisStats.recycledParticles,
      activeInstancedChunks: debrisStats.activeChunks,
      instancedDebrisCapacity: debrisStats.chunkCapacity,
      emittedInstancedChunks: debrisStats.emittedChunks,
      skippedInstancedChunks: debrisStats.skippedChunks,
      recycledInstancedChunks: debrisStats.recycledChunks,
      pendingAbsorptions: this.pendingAbsorbedItems.length,
      generatedChunks: this.town.generatedChunks.size,
      totalItems: townStats.totalItems,
      candidateItems: townStats.candidateItems,
      activeItems: townStats.activeItems,
      activeCarryoverItems: townStats.activeCarryoverItems,
      activeCandidateItems: townStats.activeCandidateItems,
      freshCandidateItems: townStats.freshCandidateItems,
      simulatedItems: townStats.simulatedItems,
      throttledCandidates: townStats.throttledCandidates,
      absorbedItems: townStats.absorbedItems,
      effectPieces: townStats.effectPieces,
      skippedEffectPieces: townStats.skippedEffectPieces,
      visibleItems: renderBudgetStats.visibleItems,
      visibleParts: renderBudgetStats.visibleParts,
      totalParts: renderBudgetStats.totalParts,
      detailedTownItems: renderBudgetStats.detailedItems ?? 0,
      instancedTownProxies: townInstancingStats.proxyCount ?? 0,
      visibleInstancedTownProxies: townInstancingStats.visibleProxyCount ?? 0,
      instancedTownInstances: townInstancingStats.usedInstances ?? 0,
      visibleInstancedTownInstances: townInstancingStats.visibleInstances ?? 0,
      instancedTownCapacity: townInstancingStats.capacity ?? 0,
      skippedInstancedTownInstances: townInstancingStats.skippedInstances ?? 0,
      groundScars: this.town.groundScars.length,
      drawCalls: renderInfo.calls,
      triangles: renderInfo.triangles,
      sceneObjects: sceneStats.sceneObjects,
      sceneMeshes: sceneStats.meshes,
      sceneGroups: sceneStats.groups,
      sceneLights: sceneStats.lights,
      sceneMaterials: sceneStats.materials,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      cameraZoomScale: Number((this.cameraOffset.z / BASE_CAMERA_OFFSET.z).toFixed(3)),
      cameraFov: Number(this.camera.fov.toFixed(2)),
      fogDensity: Number(this.scene.fog.density.toFixed(4)),
      perspectiveAmount: Number(this.perspectiveAmount.toFixed(2)),
      gameMode: this.gameMode,
      awaitingStart: this.isAwaitingStart,
      paused: this.isPaused,
      levelNumber: this.levelIndex + 1,
      levelName: this.currentLevel.name,
      levelScore: Math.round(this.score - this.levelStartScore),
      levelScoreTarget: levelTargets.scoreTarget,
      levelDamageTarget: levelTargets.damageTarget,
      levelElapsed: Number(this.levelElapsed.toFixed(2)),
      minimumLevelDuration: this.getMinimumLevelDuration(),
      remainingTime: Number.isFinite(this.remainingTime) ? Number(this.remainingTime.toFixed(2)) : Infinity,
      levelTransitioning: this.isLevelTransitioning,
      finished: this.isFinished,
      postProcessing: true,
      stormShaderIntensity: Number(this.stormAtmospherePass.uniforms.intensity.value.toFixed(3)),
      lightning: Number(this.stormAtmospherePass.uniforms.lightning.value.toFixed(3)),
      bloomStrength: Number(this.bloomPass.strength.toFixed(3)),
    };

    Object.assign(this.diagnosticsElement.dataset, {
      renderOk: String(diagnostics.renderOk),
      sampledPixels: diagnostics.sampledPixels,
      colorVariance: String(diagnostics.colorVariance),
      frame: String(diagnostics.frame),
      fps: String(diagnostics.fps),
      averageFrameMs: String(diagnostics.averageFrameMs),
      averageWorkMs: String(diagnostics.averageWorkMs),
      lastFrameMs: String(diagnostics.lastFrameMs),
      lastWorkMs: String(diagnostics.lastWorkMs),
      maxFrameMs: String(diagnostics.maxFrameMs),
      maxWorkMs: String(diagnostics.maxWorkMs),
      hitchCount: String(diagnostics.hitchCount),
      lastHitchMs: String(diagnostics.lastHitchMs),
      longestHitchMs: String(diagnostics.longestHitchMs),
      hitchThresholdMs: String(diagnostics.hitchThresholdMs),
      tornadoX: String(diagnostics.tornadoX),
      tornadoZ: String(diagnostics.tornadoZ),
      stormCategory: String(diagnostics.stormCategory),
      stormMass: String(diagnostics.stormMass),
      stormRadius: String(diagnostics.stormRadius),
      stormPullRadius: String(diagnostics.stormPullRadius),
      stormLiftLimit: String(diagnostics.stormLiftLimit),
      debrisCount: String(diagnostics.debrisCount),
      activeParticles: String(diagnostics.activeParticles),
      particleCapacity: String(diagnostics.particleCapacity),
      emittedParticles: String(diagnostics.emittedParticles),
      skippedParticleEmissions: String(diagnostics.skippedParticleEmissions),
      recycledParticles: String(diagnostics.recycledParticles),
      activeInstancedChunks: String(diagnostics.activeInstancedChunks),
      instancedDebrisCapacity: String(diagnostics.instancedDebrisCapacity),
      emittedInstancedChunks: String(diagnostics.emittedInstancedChunks),
      skippedInstancedChunks: String(diagnostics.skippedInstancedChunks),
      recycledInstancedChunks: String(diagnostics.recycledInstancedChunks),
      pendingAbsorptions: String(diagnostics.pendingAbsorptions),
      generatedChunks: String(diagnostics.generatedChunks),
      totalItems: String(diagnostics.totalItems),
      candidateItems: String(diagnostics.candidateItems),
      activeItems: String(diagnostics.activeItems),
      activeCarryoverItems: String(diagnostics.activeCarryoverItems),
      activeCandidateItems: String(diagnostics.activeCandidateItems),
      freshCandidateItems: String(diagnostics.freshCandidateItems),
      simulatedItems: String(diagnostics.simulatedItems),
      throttledCandidates: String(diagnostics.throttledCandidates),
      absorbedItems: String(diagnostics.absorbedItems),
      effectPieces: String(diagnostics.effectPieces),
      skippedEffectPieces: String(diagnostics.skippedEffectPieces),
      visibleItems: String(diagnostics.visibleItems),
      visibleParts: String(diagnostics.visibleParts),
      totalParts: String(diagnostics.totalParts),
      detailedTownItems: String(diagnostics.detailedTownItems),
      instancedTownProxies: String(diagnostics.instancedTownProxies),
      visibleInstancedTownProxies: String(diagnostics.visibleInstancedTownProxies),
      instancedTownInstances: String(diagnostics.instancedTownInstances),
      visibleInstancedTownInstances: String(diagnostics.visibleInstancedTownInstances),
      instancedTownCapacity: String(diagnostics.instancedTownCapacity),
      skippedInstancedTownInstances: String(diagnostics.skippedInstancedTownInstances),
      groundScars: String(diagnostics.groundScars),
      drawCalls: String(diagnostics.drawCalls),
      triangles: String(diagnostics.triangles),
      sceneObjects: String(diagnostics.sceneObjects),
      sceneMeshes: String(diagnostics.sceneMeshes),
      sceneGroups: String(diagnostics.sceneGroups),
      sceneLights: String(diagnostics.sceneLights),
      sceneMaterials: String(diagnostics.sceneMaterials),
      geometries: String(diagnostics.geometries),
      textures: String(diagnostics.textures),
      pixelRatio: String(diagnostics.pixelRatio),
      cameraZoomScale: String(diagnostics.cameraZoomScale),
      cameraFov: String(diagnostics.cameraFov),
      fogDensity: String(diagnostics.fogDensity),
      perspectiveAmount: String(diagnostics.perspectiveAmount),
      gameMode: String(diagnostics.gameMode),
      awaitingStart: String(diagnostics.awaitingStart),
      paused: String(diagnostics.paused),
      levelNumber: String(diagnostics.levelNumber),
      levelName: diagnostics.levelName,
      levelScore: String(diagnostics.levelScore),
      levelScoreTarget: String(diagnostics.levelScoreTarget),
      levelDamageTarget: String(diagnostics.levelDamageTarget),
      levelElapsed: String(diagnostics.levelElapsed),
      minimumLevelDuration: String(diagnostics.minimumLevelDuration),
      remainingTime: String(diagnostics.remainingTime),
      levelTransitioning: String(diagnostics.levelTransitioning),
      finished: String(diagnostics.finished),
      postProcessing: String(diagnostics.postProcessing),
      stormShaderIntensity: String(diagnostics.stormShaderIntensity),
      lightning: String(diagnostics.lightning),
      bloomStrength: String(diagnostics.bloomStrength),
    });

    window.__townfallDiagnostics = diagnostics;
    this.logSimulationPressure(diagnostics);
    this.updateDebugOverlay(diagnostics);
  }

  logSimulationPressure(diagnostics) {
    if (diagnostics.candidateItems <= 0) {
      return;
    }

    const throttledRatio = diagnostics.throttledCandidates / diagnostics.candidateItems;
    if (diagnostics.candidateItems < 80 || throttledRatio < 0.65) {
      return;
    }

    const now = performance.now();
    if (now - this.lastSimulationPressureLogAt < 5000) {
      return;
    }

    this.lastSimulationPressureLogAt = now;
    window.__townfallLog?.('warn', 'town-simulation-pressure', {
      category: diagnostics.stormCategory,
      mass: diagnostics.stormMass,
      candidateItems: diagnostics.candidateItems,
      simulatedItems: diagnostics.simulatedItems,
      activeCarryoverItems: diagnostics.activeCarryoverItems,
      activeCandidateItems: diagnostics.activeCandidateItems,
      freshCandidateItems: diagnostics.freshCandidateItems,
      throttledCandidates: diagnostics.throttledCandidates,
      throttledRatio: Number(throttledRatio.toFixed(3)),
    });
  }

  collectSceneStats() {
    const materials = new Set();
    const stats = createSceneStats();

    this.scene.traverse((object) => {
      stats.sceneObjects += 1;

      if (object.isGroup) {
        stats.groups += 1;
      }

      if (object.isLight) {
        stats.lights += 1;
      }

      if (!object.isMesh) {
        return;
      }

      stats.meshes += 1;
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of meshMaterials) {
        if (material) {
          materials.add(material.uuid);
        }
      }
    });

    stats.materials = materials.size;
    this.lastSceneStats = stats;
    return stats;
  }

  updateDebugOverlay(diagnostics) {
    if (!this.debugOverlayVisible || !this.diagnosticsElement) {
      return;
    }

    this.diagnosticsElement.innerHTML = `
      <div class="diagnostics__header">
        <span>Diagnostics</span>
        <strong>F3</strong>
      </div>
      ${this.renderDebugSection('Performance', [
        ['FPS', formatDebugNumber(diagnostics.fps, 1)],
        ['Frame Avg / Max', `${formatDebugNumber(diagnostics.averageFrameMs, 1)} / ${formatDebugNumber(diagnostics.maxFrameMs, 1)} ms`],
        ['Work Avg / Max', `${formatDebugNumber(diagnostics.averageWorkMs, 1)} / ${formatDebugNumber(diagnostics.maxWorkMs, 1)} ms`],
        ['Hitches', `${formatDebugNumber(diagnostics.hitchCount)} over ${formatDebugNumber(diagnostics.hitchThresholdMs)} ms`],
        ['Worst Hitch', `${formatDebugNumber(diagnostics.longestHitchMs, 1)} ms`],
      ])}
      ${this.renderDebugSection('Render', [
        ['Draw Calls', formatDebugNumber(diagnostics.drawCalls)],
        ['Triangles', formatDebugNumber(diagnostics.triangles)],
        ['Scene Objects', formatDebugNumber(diagnostics.sceneObjects)],
        ['Meshes / Groups', `${formatDebugNumber(diagnostics.sceneMeshes)} / ${formatDebugNumber(diagnostics.sceneGroups)}`],
        ['Geometries / Textures', `${formatDebugNumber(diagnostics.geometries)} / ${formatDebugNumber(diagnostics.textures)}`],
        ['Pixel Ratio', formatDebugNumber(diagnostics.pixelRatio, 2)],
      ])}
      ${this.renderDebugSection('Town', [
        ['Chunks', formatDebugNumber(diagnostics.generatedChunks)],
        ['Items', formatDebugNumber(diagnostics.totalItems)],
        ['Detailed / Visible', `${formatDebugNumber(diagnostics.detailedTownItems)} / ${formatDebugNumber(diagnostics.visibleItems)}`],
        ['Proxy Items', `${formatDebugNumber(diagnostics.visibleInstancedTownProxies)} / ${formatDebugNumber(diagnostics.instancedTownProxies)}`],
        ['Proxy Instances', `${formatDebugNumber(diagnostics.visibleInstancedTownInstances)} / ${formatDebugNumber(diagnostics.instancedTownInstances)}`],
        ['Simulated / Candidates', `${formatDebugNumber(diagnostics.simulatedItems)} / ${formatDebugNumber(diagnostics.candidateItems)}`],
        ['Carry / Fresh', `${formatDebugNumber(diagnostics.activeCarryoverItems)} / ${formatDebugNumber(diagnostics.freshCandidateItems)}`],
        ['Active / Throttled', `${formatDebugNumber(diagnostics.activeItems)} / ${formatDebugNumber(diagnostics.throttledCandidates)}`],
      ])}
      ${this.renderDebugSection('Effects', [
        ['Particles', `${formatDebugNumber(diagnostics.activeParticles)} / ${formatDebugNumber(diagnostics.particleCapacity)}`],
        ['Instanced Chunks', `${formatDebugNumber(diagnostics.activeInstancedChunks)} / ${formatDebugNumber(diagnostics.instancedDebrisCapacity)}`],
        ['Pending Absorptions', formatDebugNumber(diagnostics.pendingAbsorptions)],
        ['Town Pieces', `${formatDebugNumber(diagnostics.effectPieces)} made, ${formatDebugNumber(diagnostics.skippedEffectPieces)} skipped`],
        ['Recycled / Skipped', `${formatDebugNumber(diagnostics.recycledParticles + diagnostics.recycledInstancedChunks)} / ${formatDebugNumber(diagnostics.skippedParticleEmissions + diagnostics.skippedInstancedChunks)}`],
        ['Ground Scars', formatDebugNumber(diagnostics.groundScars)],
      ])}
      ${this.renderDebugSection('Storm', [
        ['Mode / Level', `${diagnostics.gameMode ?? 'menu'} / ${formatDebugNumber(diagnostics.levelNumber)}`],
        ['Category / Mass', `${formatDebugNumber(diagnostics.stormCategory)} / ${formatDebugNumber(diagnostics.stormMass)}`],
        ['Radius / Pull', `${formatDebugNumber(diagnostics.stormRadius, 1)} / ${formatDebugNumber(diagnostics.stormPullRadius, 1)}`],
        ['Lift Limit', formatDebugNumber(diagnostics.stormLiftLimit, 1)],
        ['Camera Zoom', `${formatDebugNumber(diagnostics.cameraZoomScale, 2)}x`],
        ['Fog', formatDebugNumber(diagnostics.fogDensity, 4)],
      ])}
    `;
  }

  renderDebugSection(title, rows) {
    const renderedRows = rows.map(([label, value]) => `
      <div class="diagnostics__row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join('');

    return `
      <section class="diagnostics__section">
        <h2>${title}</h2>
        ${renderedRows}
      </section>
    `;
  }
}
