import * as THREE from 'three';
import { clamp01, dampFactor } from '../core/math';
import type {
  ReviewStormCategory,
  WorldPosition,
} from '../core/types';

const CAMERA_CLEARANCE = 12;
const CLEARANCE_SAMPLE_COUNT = 12;

interface CameraEnvelope {
  minimumDistance: number;
  maximumDistance: number;
  minimumHeight: number;
  maximumHeight: number;
  minimumFov: number;
  maximumFov: number;
  lookHeight: number;
  lookAhead: number;
  lookLateral: number;
  lateralAmount: number;
}

export interface CameraTerrainSampler {
  sampleHeight(x: number, z: number): number;
}

export interface CameraRigDiagnostics {
  perspectiveAmount: number;
  distance: number;
  height: number;
  fov: number;
  category: ReviewStormCategory;
  clearance: number;
  clearanceSamples: number;
}

const CAMERA_ENVELOPES: Readonly<
  Record<ReviewStormCategory, CameraEnvelope>
> = {
  1: {
    minimumDistance: 120,
    maximumDistance: 260,
    minimumHeight: 38,
    maximumHeight: 150,
    minimumFov: 53,
    maximumFov: 61,
    lookHeight: 12,
    lookAhead: 190,
    lookLateral: 100,
    lateralAmount: 0.12,
  },
  3: {
    minimumDistance: 220,
    maximumDistance: 520,
    minimumHeight: 70,
    maximumHeight: 295,
    minimumFov: 54,
    maximumFov: 62,
    lookHeight: 30,
    lookAhead: 420,
    lookLateral: 160,
    lateralAmount: 0.35,
  },
  5: {
    minimumDistance: 360,
    maximumDistance: 850,
    minimumHeight: 130,
    maximumHeight: 510,
    minimumFov: 55,
    maximumFov: 63,
    lookHeight: 72,
    lookAhead: 620,
    lookLateral: 40,
    lateralAmount: 0.79,
  },
};

export class CameraRig {
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredLookTarget = new THREE.Vector3();
  private perspectiveAmount = 0.52;
  private category: ReviewStormCategory = 1;
  private distance = CAMERA_ENVELOPES[1].minimumDistance;
  private height = CAMERA_ENVELOPES[1].minimumHeight;
  private clearance = CAMERA_CLEARANCE;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly terrain: CameraTerrainSampler = {
      sampleHeight: () => 0,
    },
  ) {
    this.camera.far = 6000;
    this.camera.updateProjectionMatrix();
  }

  setCategory(category: ReviewStormCategory): void {
    this.category = category;
  }

  setPerspective(amount: number): void {
    this.perspectiveAmount = clamp01(amount);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  reset(target: WorldPosition): void {
    this.update(target, 1, true);
  }

  update(
    target: WorldPosition,
    deltaSeconds: number,
    immediate = false,
  ): void {
    const envelope = CAMERA_ENVELOPES[this.category];
    const amount = this.perspectiveAmount;
    this.distance = THREE.MathUtils.lerp(
      envelope.minimumDistance,
      envelope.maximumDistance,
      amount,
    );
    const nominalHeight = THREE.MathUtils.lerp(
      envelope.minimumHeight,
      envelope.maximumHeight,
      amount,
    );
    this.camera.fov = THREE.MathUtils.lerp(
      envelope.minimumFov,
      envelope.maximumFov,
      amount,
    );
    this.camera.updateProjectionMatrix();

    const targetHeight = this.terrain.sampleHeight(target.x, target.z);
    const cameraX = target.x - this.distance * envelope.lateralAmount;
    const cameraZ = target.z
      + this.distance * Math.sqrt(1 - envelope.lateralAmount ** 2);
    const terrainCeiling = this.sampleTerrainCeiling(
      target.x,
      target.z,
      cameraX,
      cameraZ,
    );
    const desiredY = Math.max(
      targetHeight + nominalHeight,
      terrainCeiling + CAMERA_CLEARANCE,
    );
    this.height = desiredY - targetHeight;
    this.clearance = desiredY - terrainCeiling;

    this.desiredPosition.set(cameraX, desiredY, cameraZ);
    const lookX = target.x + envelope.lookLateral;
    const lookZ = target.z - envelope.lookAhead;
    this.desiredLookTarget.set(
      lookX,
      this.terrain.sampleHeight(lookX, lookZ) + envelope.lookHeight,
      lookZ,
    );

    if (immediate) {
      this.camera.position.copy(this.desiredPosition);
      this.lookTarget.copy(this.desiredLookTarget);
    } else {
      const positionFactor = dampFactor(4.4, deltaSeconds);
      const lookFactor = dampFactor(6.5, deltaSeconds);
      this.camera.position.lerp(this.desiredPosition, positionFactor);
      this.lookTarget.lerp(this.desiredLookTarget, lookFactor);
      this.enforceCurrentPositionClearance();
    }

    this.camera.lookAt(this.lookTarget);
  }

  getDiagnostics(): CameraRigDiagnostics {
    return {
      perspectiveAmount: this.perspectiveAmount,
      distance: this.distance,
      height: this.height,
      fov: this.camera.fov,
      category: this.category,
      clearance: this.clearance,
      clearanceSamples: CLEARANCE_SAMPLE_COUNT,
    };
  }

  private sampleTerrainCeiling(
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
  ): number {
    let terrainCeiling = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < CLEARANCE_SAMPLE_COUNT; index += 1) {
      const amount = index / (CLEARANCE_SAMPLE_COUNT - 1);
      const x = THREE.MathUtils.lerp(startX, endX, amount);
      const z = THREE.MathUtils.lerp(startZ, endZ, amount);
      terrainCeiling = Math.max(
        terrainCeiling,
        this.terrain.sampleHeight(x, z),
      );
    }
    return terrainCeiling;
  }

  private enforceCurrentPositionClearance(): void {
    const groundHeight = this.terrain.sampleHeight(
      this.camera.position.x,
      this.camera.position.z,
    );
    const minimumY = groundHeight + CAMERA_CLEARANCE;
    if (this.camera.position.y < minimumY) {
      this.camera.position.y = minimumY;
    }
  }
}
