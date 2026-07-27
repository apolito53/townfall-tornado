import * as THREE from 'three';
import { clamp01, dampFactor } from '../core/math';

export interface CameraRigDiagnostics {
  perspectiveAmount: number;
  distance: number;
  height: number;
  fov: number;
}

export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly desiredPosition = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly desiredLookTarget = new THREE.Vector3();
  private perspectiveAmount = 0.35;
  private distance = 50;
  private height = 28;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  setPerspective(amount: number): void {
    this.perspectiveAmount = clamp01(amount);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  reset(target: THREE.Vector3): void {
    this.update(target, 1, true);
  }

  update(
    target: THREE.Vector3,
    deltaSeconds: number,
    immediate = false,
  ): void {
    const amount = this.perspectiveAmount;
    this.distance = THREE.MathUtils.lerp(42, 76, amount);
    this.height = THREE.MathUtils.lerp(17, 58, amount);
    this.camera.fov = THREE.MathUtils.lerp(54, 62, amount);
    this.camera.updateProjectionMatrix();

    this.desiredPosition.set(
      target.x,
      target.y + this.height,
      target.z + this.distance,
    );
    this.desiredLookTarget.set(
      target.x,
      target.y + THREE.MathUtils.lerp(4, 1.5, amount),
      target.z - THREE.MathUtils.lerp(7, 2, amount),
    );

    if (immediate) {
      this.camera.position.copy(this.desiredPosition);
      this.lookTarget.copy(this.desiredLookTarget);
    } else {
      const positionFactor = dampFactor(5.5, deltaSeconds);
      const lookFactor = dampFactor(7, deltaSeconds);
      this.camera.position.lerp(this.desiredPosition, positionFactor);
      this.lookTarget.lerp(this.desiredLookTarget, lookFactor);
    }

    this.camera.lookAt(this.lookTarget);
  }

  getDiagnostics(): CameraRigDiagnostics {
    return {
      perspectiveAmount: this.perspectiveAmount,
      distance: this.distance,
      height: this.height,
      fov: this.camera.fov,
    };
  }
}
