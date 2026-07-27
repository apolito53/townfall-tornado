import * as THREE from 'three';
import { CameraRig } from '../camera/CameraRig';
import { FixedStepClock, type ClockFrame } from '../core/clock';
import { roundTo } from '../core/math';
import type {
  GameMode,
  MovementCommand,
  RuntimeDiagnostics,
} from '../core/types';
import {
  Diagnostics,
} from '../diagnostics/Diagnostics';
import type { DebugLogger } from '../diagnostics/debugLogger';
import { logRuntimeReady } from '../diagnostics/debugLogger';
import { InputController } from '../input/InputController';
import {
  isCustomQualityKey,
  isQualityMode,
  QualityManager,
  type QualityState,
} from '../quality/QualityManager';
import { DioramaWorld } from '../render/DioramaWorld';
import {
  getStormReviewProfile,
  type StormReviewProfile,
} from '../storm/stormProfiles';
import { TornadoSystem } from '../storm/TornadoSystem';
import { Hud } from '../ui/Hud';
import { Menus } from '../ui/menus';
import { GameSession } from './GameSession';
import { parseReviewSettings } from './reviewSettings';

const IDLE_COMMAND: MovementCommand = {
  x: 0,
  y: 0,
  magnitude: 0,
  source: 'idle',
};

const EMPTY_CLOCK_FRAME: ClockFrame = {
  frameSeconds: 0,
  simulationSteps: 0,
  droppedSimulationSteps: 0,
  interpolationAlpha: 0,
  simulationTime: 0,
  frameNumber: 0,
};

export interface GameAppOptions {
  canvas: HTMLCanvasElement;
  diagnosticsElement: HTMLElement;
  logger: DebugLogger;
}

interface SceneCounts {
  objects: number;
  meshes: number;
}

export class GameApp {
  readonly runtime = 'v2-diorama' as const;
  readonly qualityManager: QualityManager;
  private readonly canvas: HTMLCanvasElement;
  private readonly logger: DebugLogger;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 1, 6000);
  private readonly reviewSettings = parseReviewSettings(window.location.search);
  private readonly stormProfile: StormReviewProfile = getStormReviewProfile(
    this.reviewSettings.category,
  );
  private readonly world = new DioramaWorld(this.reviewSettings.weather);
  private readonly tornadoSystem = new TornadoSystem(
    this.stormProfile,
    this.world.spawn,
  );
  private readonly cameraRig = new CameraRig(this.camera, this.world.terrain);
  private readonly session = new GameSession();
  private readonly clock = new FixedStepClock();
  private readonly input: InputController;
  private readonly diagnostics: Diagnostics;
  private readonly hud = new Hud();
  private readonly menus: Menus;
  private readonly unsubscribeQuality: () => void;
  private animationFrameId: number | null = null;
  private lastCommand: MovementCommand = IDLE_COMMAND;
  private lastClockFrame: ClockFrame = EMPTY_CLOCK_FRAME;
  private droppedSimulationSteps = 0;
  private renderOk = false;
  private readyLogged = false;

  constructor(options: GameAppOptions) {
    this.canvas = options.canvas;
    this.logger = options.logger;
    this.qualityManager = new QualityManager();
    const initialQuality = this.qualityManager.getState();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: initialQuality.effectiveKey !== 'low',
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(this.resolvePixelRatio(initialQuality));

    this.scene.background = new THREE.Color(0x66787a);
    this.scene.fog = this.world.fog;
    this.scene.add(this.world.object);
    this.cameraRig.setCategory(this.reviewSettings.category);
    this.hud.setStormCategory(this.reviewSettings.category);

    const joystickElement = document.querySelector<HTMLElement>('#mobile-joystick');
    this.input = new InputController(this.canvas, { joystickElement });
    this.diagnostics = new Diagnostics(options.diagnosticsElement, {
      onHitch: (frameMs, workMs) => {
        this.logger.log('warn', 'frame-hitch', {
          frameMs: roundTo(frameMs, 1),
          workMs: roundTo(workMs, 1),
          mode: this.session.snapshot().mode,
        });
      },
    });
    this.menus = new Menus(
      {
        startMode: (mode) => {
          this.startMode(mode);
        },
        restartCurrentMode: () => {
          this.restartCurrentMode();
        },
        setPaused: (paused) => {
          this.setPaused(paused);
        },
        showStartScreen: () => {
          this.showStartScreen();
        },
        setPerspective: (amount) => {
          this.setPerspective(amount);
        },
      },
      this.qualityManager,
    );
    this.menus.setMobileControlsEnabled(this.input.mobileControlsEnabled);
    this.menus.setPerspective(this.cameraRig.getDiagnostics().perspectiveAmount);
    this.unsubscribeQuality = this.qualityManager.subscribe((state) => {
      this.applyQuality(state);
    });

    window.addEventListener('resize', this.handleResize);
    this.handleResize();
    const initialStorm = this.tornadoSystem.snapshot();
    this.cameraRig.reset(initialStorm.position);
    this.world.reset(initialStorm, this.stormProfile);
    this.world.update(
      0,
      0,
      initialStorm,
      this.stormProfile,
      this.camera.position,
    );
    this.showStartScreen();
  }

  start(): void {
    if (this.animationFrameId !== null) {
      return;
    }
    this.animationFrameId = window.requestAnimationFrame(this.animate);
  }

  dispose(): void {
    if (this.animationFrameId !== null) {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.handleResize);
    this.unsubscribeQuality();
    this.menus.dispose();
    this.diagnostics.dispose();
    this.input.dispose();
    this.world.dispose();
    this.renderer.dispose();
    this.logger.dispose();
  }

  startLevels(): void {
    this.startMode('levels');
  }

  startEndless(): void {
    this.startMode('endless');
  }

  startMode(mode: GameMode): void {
    const snapshot = this.session.start(mode);
    this.resetPlayfield();
    this.syncPhase();
    this.hud.update(snapshot);
    this.logger.log('info', 'mode-started', {
      mode,
      sessionId: snapshot.id,
      seed: snapshot.seed,
    });
  }

  restartCurrentMode(): void {
    const snapshot = this.session.restart();
    this.resetPlayfield();
    this.syncPhase();
    this.hud.update(snapshot);
    this.logger.log('info', 'session-restarted', {
      mode: snapshot.mode,
      restartCount: snapshot.restartCount,
    });
  }

  restartLevel(): void {
    this.restartCurrentMode();
  }

  showStartScreen(): void {
    const snapshot = this.session.showMenu();
    this.lastCommand = IDLE_COMMAND;
    this.input.setEnabled(false);
    this.input.setMobileControlsVisible(false);
    this.clock.reset();
    this.menus.setPhase(snapshot.phase, snapshot.mode);
    this.hud.update(snapshot);
  }

  setPaused(paused: boolean): void {
    const snapshot = this.session.setPaused(paused);
    this.syncPhase();
    this.hud.update(snapshot);
    this.logger.log('debug', paused ? 'session-paused' : 'session-resumed', {
      mode: snapshot.mode,
      elapsedSeconds: roundTo(snapshot.elapsedSeconds),
    });
  }

  setPerspective(amount: number): void {
    this.cameraRig.setPerspective(amount);
    this.menus.setPerspective(amount);
  }

  setQualityMode(mode: string, persist = true): void {
    if (isQualityMode(mode)) {
      this.qualityManager.setMode(mode, persist);
    }
  }

  setCustomQualityValue(
    key: string,
    value: number | boolean,
  ): void {
    if (isCustomQualityKey(key)) {
      this.qualityManager.setCustomValue(key, value);
    }
  }

  getDiagnostics(): RuntimeDiagnostics | undefined {
    return window.__townfallDiagnostics;
  }

  private readonly animate = (timestampMs: number): void => {
    this.diagnostics.beginFrame(timestampMs);
    const snapshotBeforeFrame = this.session.snapshot();
    this.lastCommand = this.input.getCommand();
    this.lastClockFrame = this.clock.tick(
      timestampMs,
      snapshotBeforeFrame.phase === 'running',
      (stepSeconds) => {
        this.simulate(stepSeconds);
      },
    );
    this.droppedSimulationSteps += this.lastClockFrame.droppedSimulationSteps;
    const stormSnapshot = this.tornadoSystem.snapshot();
    this.cameraRig.update(
      stormSnapshot.position,
      this.lastClockFrame.frameSeconds,
    );
    this.world.update(
      timestampMs / 1000,
      this.lastClockFrame.frameSeconds,
      stormSnapshot,
      this.stormProfile,
      this.camera.position,
    );
    this.renderer.render(this.scene, this.camera);
    this.renderOk = this.canvas.width > 0
      && this.canvas.height > 0
      && this.renderer.info.render.calls > 0;
    const sessionSnapshot = this.session.snapshot();
    this.hud.update(sessionSnapshot);
    this.diagnostics.endFrame();
    const runtimeDiagnostics = this.collectDiagnostics(sessionSnapshot);
    this.diagnostics.publish(runtimeDiagnostics);

    if (this.renderOk && !this.readyLogged) {
      this.readyLogged = true;
      logRuntimeReady(this.logger, runtimeDiagnostics);
    }

    this.animationFrameId = window.requestAnimationFrame(this.animate);
  };

  private simulate(stepSeconds: number): void {
    const previous = this.tornadoSystem.snapshot().position;
    const next = this.tornadoSystem.simulate({
      stepSeconds,
      command: this.lastCommand,
      terrain: this.world.terrain,
      bounds: this.world.movementBounds,
    }).position;
    this.session.update(
      stepSeconds,
      Math.hypot(next.x - previous.x, next.z - previous.z),
    );
  }

  private resetPlayfield(): void {
    this.tornadoSystem.reset(this.world.spawn);
    this.clock.reset();
    this.lastCommand = IDLE_COMMAND;
    this.lastClockFrame = EMPTY_CLOCK_FRAME;
    this.droppedSimulationSteps = 0;
    const stormSnapshot = this.tornadoSystem.snapshot();
    this.cameraRig.reset(stormSnapshot.position);
    this.world.reset(stormSnapshot, this.stormProfile);
    this.world.update(
      0,
      0,
      stormSnapshot,
      this.stormProfile,
      this.camera.position,
    );
  }

  private syncPhase(): void {
    const snapshot = this.session.snapshot();
    const controlsActive = snapshot.phase === 'running';
    this.input.setEnabled(controlsActive);
    this.input.setMobileControlsVisible(controlsActive);
    this.menus.setPhase(snapshot.phase, snapshot.mode);
  }

  private applyQuality(state: QualityState): void {
    const profile = state.profile;
    const pixelRatio = this.resolvePixelRatio(state);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.shadowMap.enabled = profile.shadows;
    this.world.applyQuality(profile, pixelRatio);
    this.handleResize();
    this.logger.log('debug', 'quality-changed', {
      mode: state.mode,
      effective: state.effectiveKey,
      pixelRatio: this.renderer.getPixelRatio(),
    });
  }

  private resolvePixelRatio(state: QualityState): number {
    return Math.min(
      Math.max(0.5, window.devicePixelRatio || 1),
      state.profile.pixelRatioCap,
    );
  }

  private readonly handleResize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.cameraRig.resize(width, height);
  };

  private collectDiagnostics(
    sessionSnapshot = this.session.snapshot(),
  ): RuntimeDiagnostics {
    const performanceSnapshot = this.diagnostics.getPerformanceSnapshot();
    const cameraDiagnostics = this.cameraRig.getDiagnostics();
    const qualityState = this.qualityManager.getState();
    const sceneCounts = this.collectSceneCounts();
    const stormPosition = this.tornadoSystem.snapshot().position;
    const worldDiagnostics = this.world.getDiagnostics();
    const stormDiagnostics = worldDiagnostics.storm;
    const terrainRange = worldDiagnostics.terrain.elevationRange;
    const atmosphereDiagnostics = worldDiagnostics.atmosphere;

    return {
      schemaVersion: 3,
      runtime: this.runtime,
      renderOk: this.renderOk,
      appPhase: sessionSnapshot.phase,
      gameMode: sessionSnapshot.mode,
      awaitingStart: sessionSnapshot.phase === 'menu',
      paused: sessionSnapshot.paused,
      sessionId: sessionSnapshot.id,
      restartCount: sessionSnapshot.restartCount,
      elapsedSeconds: roundTo(sessionSnapshot.elapsedSeconds),
      distanceTraveled: roundTo(sessionSnapshot.distanceTraveled),
      objectiveProgress: roundTo(sessionSnapshot.objectiveProgress, 3),
      worldSeed: sessionSnapshot.seed.value,
      worldSeedLabel: sessionSnapshot.seed.label,
      stormX: roundTo(stormPosition.x),
      stormY: roundTo(stormPosition.y),
      stormZ: roundTo(stormPosition.z),
      stormCategory: this.reviewSettings.category,
      stormPhysicalDiameter: this.stormProfile.radius * 2,
      weather: this.reviewSettings.weather,
      districtSignature: worldDiagnostics.signature,
      terrainMinimum: roundTo(terrainRange.minimum),
      terrainMaximum: roundTo(terrainRange.maximum),
      buildingCount: worldDiagnostics.buildingCount,
      propCount: worldDiagnostics.propCount,
      instanceBatches: worldDiagnostics.instanceBatches,
      activeInstances: worldDiagnostics.activeInstances,
      stormBatches: stormDiagnostics.batches,
      activeStormParticles:
        stormDiagnostics.activeCondensation
        + stormDiagnostics.activeGroundDust,
      activeRainParticles: atmosphereDiagnostics.activeRainParticles,
      inputSource: this.lastCommand.source,
      commandX: roundTo(this.lastCommand.x, 3),
      commandY: roundTo(this.lastCommand.y, 3),
      commandMagnitude: roundTo(this.lastCommand.magnitude, 3),
      mobileControlsEnabled: this.input.mobileControlsEnabled,
      mobileControlsVisible: this.input.isMobileControlsVisible(),
      mobileJoystickActive: this.input.isJoystickActive(),
      qualityMode: qualityState.mode,
      effectiveQuality: qualityState.effectiveKey,
      pixelRatio: roundTo(this.renderer.getPixelRatio(), 2),
      perspectiveAmount: roundTo(cameraDiagnostics.perspectiveAmount, 2),
      cameraDistance: roundTo(cameraDiagnostics.distance),
      cameraHeight: roundTo(cameraDiagnostics.height),
      cameraClearance: roundTo(cameraDiagnostics.clearance),
      cameraClearanceSamples: cameraDiagnostics.clearanceSamples,
      simulationHz: this.clock.simulationHz,
      simulationSteps: this.lastClockFrame.simulationSteps,
      droppedSimulationSteps: this.droppedSimulationSteps,
      frameNumber: this.lastClockFrame.frameNumber,
      ...performanceSnapshot,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      sceneObjects: sceneCounts.objects,
      sceneMeshes: sceneCounts.meshes,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }

  private collectSceneCounts(): SceneCounts {
    let objects = 0;
    let meshes = 0;
    this.scene.traverse((object) => {
      objects += 1;
      if (
        object instanceof THREE.Mesh
        || object instanceof THREE.Points
        || object instanceof THREE.Line
      ) {
        meshes += 1;
      }
    });
    return { objects, meshes };
  }
}
