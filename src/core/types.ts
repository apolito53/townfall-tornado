export type GameMode = 'levels' | 'endless';
export type AppPhase = 'menu' | 'running' | 'paused';
export type InputSource = 'idle' | 'keyboard' | 'pointer' | 'mobile-joystick';
export type QualityPresetKey = 'low' | 'medium' | 'high';
export type QualityMode = 'auto' | QualityPresetKey | 'custom';

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface MovementCommand {
  x: number;
  y: number;
  magnitude: number;
  source: InputSource;
}

export interface StormProfile {
  category: number;
  radius: number;
  influenceRadius: number;
  movementSpeed: number;
  condensationDensity: number;
}

export interface WorldSeed {
  label: string;
  value: number;
}

export interface DistrictDescriptor {
  id: string;
  seed: WorldSeed;
  center: WorldPosition;
  radius: number;
  type: 'farmland' | 'suburb' | 'main-street' | 'industrial' | 'downtown';
}

export interface TerrainSample {
  height: number;
  normal: WorldPosition;
  surface: 'grass' | 'soil' | 'road' | 'concrete';
}

export interface WorldItemRecord {
  id: string;
  kind: 'building' | 'tree' | 'fence' | 'car' | 'road';
  position: WorldPosition;
  rotationY: number;
  districtId: string;
}

export interface BuildingDefinition {
  id: string;
  footprint: {
    width: number;
    depth: number;
  };
  height: number;
  material: 'wood' | 'brick' | 'steel' | 'concrete';
  resistance: number;
}

export interface StructuralState {
  buildingId: string;
  integrity: number;
  roofIntegrity: number;
  facadeIntegrity: number;
  frameIntegrity: number;
  collapsed: boolean;
}

export interface DestructionEvent {
  id: string;
  buildingId: string;
  kind: 'roof-loss' | 'facade-failure' | 'frame-failure' | 'collapse';
  position: WorldPosition;
  force: WorldPosition;
  intensity: number;
  simulationTime: number;
}

export interface CustomQualitySettings {
  renderScale: number;
  effectsScale: number;
  townDetailScale: number;
  stormFxScale: number;
  shadows: boolean;
  bloom: boolean;
}

export interface RenderQualityProfile {
  key: QualityPresetKey | 'custom';
  label: string;
  pixelRatioCap: number;
  effectsScale: number;
  townDetailScale: number;
  stormFxScale: number;
  shadows: boolean;
  bloom: boolean;
}

export interface PlatformQualityReport {
  recommendedQuality: QualityPresetKey;
  tier: 'software' | 'low-power' | 'integrated' | 'discrete' | 'unknown';
  reasons: readonly string[];
  renderer: string;
  vendor: string;
  webglAvailable: boolean;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  devicePixelRatio: number;
  isMobile: boolean;
  softwareRenderer: boolean;
  integratedRenderer: boolean;
  discreteRenderer: boolean;
}

export interface SessionSnapshot {
  id: number;
  mode: GameMode | null;
  phase: AppPhase;
  paused: boolean;
  elapsedSeconds: number;
  distanceTraveled: number;
  objectiveProgress: number;
  restartCount: number;
  seed: WorldSeed;
}

export interface RuntimeDiagnostics {
  schemaVersion: 2;
  runtime: 'v2-foundation';
  renderOk: boolean;
  appPhase: AppPhase;
  gameMode: GameMode | null;
  awaitingStart: boolean;
  paused: boolean;
  sessionId: number;
  restartCount: number;
  elapsedSeconds: number;
  distanceTraveled: number;
  objectiveProgress: number;
  worldSeed: number;
  worldSeedLabel: string;
  stormX: number;
  stormY: number;
  stormZ: number;
  inputSource: InputSource;
  commandX: number;
  commandY: number;
  commandMagnitude: number;
  mobileControlsEnabled: boolean;
  mobileControlsVisible: boolean;
  mobileJoystickActive: boolean;
  qualityMode: QualityMode;
  effectiveQuality: QualityPresetKey | 'custom';
  pixelRatio: number;
  perspectiveAmount: number;
  cameraDistance: number;
  cameraHeight: number;
  simulationHz: number;
  simulationSteps: number;
  droppedSimulationSteps: number;
  frameNumber: number;
  performancePhase: 'warmup' | 'gameplay';
  warmupComplete: boolean;
  startupFrameCount: number;
  startupHitchCount: number;
  startupLongestFrameMs: number;
  fps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  averageWorkMs: number;
  p95WorkMs: number;
  maxFrameMs: number;
  maxWorkMs: number;
  hitchCount: number;
  longestHitchMs: number;
  drawCalls: number;
  triangles: number;
  sceneObjects: number;
  sceneMeshes: number;
  geometries: number;
  textures: number;
}
