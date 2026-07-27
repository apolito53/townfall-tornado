import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './CameraRig';

describe('CameraRig', () => {
  it('uses the literal category distance envelopes', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, { sampleHeight: () => 0 });

    rig.setCategory(5);
    rig.setPerspective(0);
    rig.reset({ x: 0, y: 0, z: 0 });
    expect(rig.getDiagnostics().distance).toBe(360);

    rig.setPerspective(1);
    rig.reset({ x: 0, y: 0, z: 0 });
    expect(rig.getDiagnostics().distance).toBe(850);
    expect(camera.far).toBe(6000);
  });

  it('samples the chase line and clears intervening terrain', () => {
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, {
      sampleHeight: (_x, z) => z > 50 && z < 160 ? 180 : 0,
    });

    rig.setCategory(1);
    rig.setPerspective(0);
    rig.reset({ x: 0, y: 0, z: 0 });

    const diagnostics = rig.getDiagnostics();
    expect(diagnostics.clearanceSamples).toBe(12);
    expect(diagnostics.clearance).toBeGreaterThanOrEqual(12);
    expect(camera.position.y).toBeGreaterThanOrEqual(192);
  });
});
