import { describe, expect, it } from 'vitest';
import type { MovementCommand, WorldBounds } from '../core/types';
import { getStormReviewProfile } from './stormProfiles';
import { TornadoSystem } from './TornadoSystem';

const BOUNDS: WorldBounds = {
  minX: -1450,
  maxX: 1450,
  minZ: -1450,
  maxZ: 1450,
};

const MOVING_NORTH_EAST: MovementCommand = {
  x: 0.6,
  y: -0.8,
  magnitude: 1,
  source: 'keyboard',
};

describe('TornadoSystem', () => {
  it('moves at the selected profile speed and follows terrain', () => {
    const system = new TornadoSystem(
      getStormReviewProfile(1),
      { x: 0, y: 2, z: 100 },
    );
    const snapshot = system.simulate({
      stepSeconds: 0.5,
      command: MOVING_NORTH_EAST,
      terrain: {
        sampleHeight: (x, z) => 10 + x * 0.01 - z * 0.005,
      },
      bounds: BOUNDS,
    });

    expect(snapshot.position.x).toBeCloseTo(7.2);
    expect(snapshot.position.z).toBeCloseTo(90.4);
    expect(snapshot.position.y).toBeCloseTo(9.62);
    expect(snapshot.velocity.x).toBeCloseTo(14.4);
    expect(snapshot.velocity.z).toBeCloseTo(-19.2);
  });

  it('clamps to the playable bounds and returns defensive snapshots', () => {
    const system = new TornadoSystem(
      getStormReviewProfile(5),
      { x: 1448, y: 0, z: -1448 },
    );
    const snapshot = system.simulate({
      stepSeconds: 1,
      command: {
        x: 1,
        y: -1,
        magnitude: 1,
        source: 'keyboard',
      },
      terrain: { sampleHeight: () => 33 },
      bounds: BOUNDS,
    });

    expect(snapshot.position).toEqual({ x: 1450, y: 33, z: -1450 });
    snapshot.position.x = 0;
    expect(system.snapshot().position.x).toBe(1450);
  });
});
