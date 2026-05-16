import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { InputController } from './input.js';
import { StormAtmosphereShader } from './stormAtmosphereShader.js';
import { Tornado } from './tornado.js';
import { Town } from './town.js';
import { Hud } from './ui.js';

const LEVEL_COMPLETE_DELAY = 2.35;
const MAX_RENDER_PIXEL_RATIO = 1.35;
const SHADOW_MAP_SIZE = 1024;
const MAX_SCENE_DEBRIS = 96;
const MAX_DEBRIS_PER_FRAME = 16;
const MAX_ABSORPTIONS_PER_FRAME = 8;
const MIN_LEVEL_DURATION_BY_INDEX = [10, 14, 18, 22, 26];
const LEVEL_TARGET_MULTIPLIER_BY_CATEGORY = [1, 2.4, 5.5, 12, 25];
const LEVEL_DAMAGE_BONUS_BY_CATEGORY = [0, 0.04, 0.1, 0.17, 0.24];
const DEBRIS_GEOMETRY = new THREE.BoxGeometry(0.45, 0.22, 0.32);
const DEBRIS_MATERIALS = {
  tree: new THREE.MeshStandardMaterial({ color: 0x4d8a4f, roughness: 0.88 }),
  structure: new THREE.MeshStandardMaterial({ color: 0xd7c3a3, roughness: 0.88 }),
};
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

export class Game {
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
    this.town = new Town(this.scene);
    this.debris = [];
    this.pendingAbsorbedItems = [];
    this.frameDebrisBudget = MAX_DEBRIS_PER_FRAME;
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
    window.addEventListener('resize', () => this.resize());
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
    this.clearDebris();
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
    this.updateDebris(dt);
    this.updateWeatherShaders(dt);
    this.renderer.info.reset();
    this.renderer.shadowMap.needsUpdate = this.pendingShadowRefresh;
    this.pendingShadowRefresh = false;
    this.composer.render();
    this.renderer.shadowMap.needsUpdate = false;
    this.collectDiagnostics();
  }

  update(dt) {
    this.levelElapsed += dt;
    this.frameDebrisBudget = MAX_DEBRIS_PER_FRAME;
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
    const availableSceneSlots = MAX_SCENE_DEBRIS - this.debris.length;
    const availableFrameSlots = this.frameDebrisBudget;
    const count = Math.min(availableSceneSlots, availableFrameSlots, Math.min(6, Math.max(2, Math.round(radius * 0.9))));
    if (count <= 0) {
      return;
    }

    this.frameDebrisBudget -= count;
    const material = type === 'Tree' ? DEBRIS_MATERIALS.tree : DEBRIS_MATERIALS.structure;

    for (let index = 0; index < count; index += 1) {
      const shard = new THREE.Mesh(DEBRIS_GEOMETRY, material);
      shard.position.copy(position);
      shard.position.y += 0.4 + Math.random() * 1.1;
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      shard.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        4 + Math.random() * 7,
        (Math.random() - 0.5) * 7,
      );
      shard.userData.life = 0.75 + Math.random() * 0.5;
      shard.castShadow = false;
      this.scene.add(shard);
      this.debris.push(shard);
    }
  }

  updateDebris(dt) {
    for (let index = this.debris.length - 1; index >= 0; index -= 1) {
      const shard = this.debris[index];
      shard.userData.life -= dt;
      shard.userData.velocity.y -= 14 * dt;
      shard.position.addScaledVector(shard.userData.velocity, dt);
      shard.rotation.x += dt * 5.2;
      shard.rotation.y += dt * 4.8;

      if (shard.userData.life <= 0 || shard.position.y < -1) {
        this.scene.remove(shard);
        this.debris.splice(index, 1);
      }
    }
  }

  clearDebris() {
    for (const shard of this.debris) {
      this.scene.remove(shard);
    }
    this.debris = [];
  }

  collectDiagnostics() {
    const now = performance.now();
    if (now - this.lastDiagnosticsAt < 450) {
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
    const levelTargets = this.getLevelTargets();
    const diagnostics = {
      renderOk: visibleSamples >= 3 && renderInfo.calls > 0,
      sampledPixels: this.pixelDiagnosticsEnabled ? `${visibleSamples}/${samplePoints.length}` : 'skipped',
      colorVariance,
      frame: this.frame,
      tornadoX: Number(this.tornado.position.x.toFixed(2)),
      tornadoZ: Number(this.tornado.position.z.toFixed(2)),
      debrisCount: this.debris.length,
      pendingAbsorptions: this.pendingAbsorbedItems.length,
      generatedChunks: this.town.generatedChunks.size,
      totalItems: townStats.totalItems,
      candidateItems: townStats.candidateItems,
      activeItems: townStats.activeItems,
      simulatedItems: townStats.simulatedItems,
      throttledCandidates: townStats.throttledCandidates,
      absorbedItems: townStats.absorbedItems,
      effectPieces: townStats.effectPieces,
      skippedEffectPieces: townStats.skippedEffectPieces,
      visibleItems: renderBudgetStats.visibleItems,
      visibleParts: renderBudgetStats.visibleParts,
      totalParts: renderBudgetStats.totalParts,
      groundScars: this.town.groundScars.length,
      drawCalls: renderInfo.calls,
      triangles: renderInfo.triangles,
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
      tornadoX: String(diagnostics.tornadoX),
      tornadoZ: String(diagnostics.tornadoZ),
      debrisCount: String(diagnostics.debrisCount),
      pendingAbsorptions: String(diagnostics.pendingAbsorptions),
      generatedChunks: String(diagnostics.generatedChunks),
      totalItems: String(diagnostics.totalItems),
      candidateItems: String(diagnostics.candidateItems),
      activeItems: String(diagnostics.activeItems),
      simulatedItems: String(diagnostics.simulatedItems),
      throttledCandidates: String(diagnostics.throttledCandidates),
      absorbedItems: String(diagnostics.absorbedItems),
      effectPieces: String(diagnostics.effectPieces),
      skippedEffectPieces: String(diagnostics.skippedEffectPieces),
      visibleItems: String(diagnostics.visibleItems),
      visibleParts: String(diagnostics.visibleParts),
      totalParts: String(diagnostics.totalParts),
      groundScars: String(diagnostics.groundScars),
      drawCalls: String(diagnostics.drawCalls),
      triangles: String(diagnostics.triangles),
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
  }
}
