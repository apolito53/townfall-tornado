import { clamp } from '../core/math';
import type {
  MovementCommand,
  StormProfile,
  StormSnapshot,
  WorldBounds,
  WorldPosition,
} from '../core/types';

export interface TerrainHeightSampler {
  sampleHeight(x: number, z: number): number;
}

export interface TornadoSimulationInput {
  stepSeconds: number;
  command: MovementCommand;
  terrain: TerrainHeightSampler;
  bounds: WorldBounds;
}

function copyPosition(position: WorldPosition): WorldPosition {
  return {
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

/**
 * Renderer-independent storm movement. The render layer reads immutable
 * snapshots; it never becomes the authority for gameplay position or scale.
 */
export class TornadoSystem {
  private profile: StormProfile;
  private position: WorldPosition;
  private velocity: WorldPosition = { x: 0, y: 0, z: 0 };

  constructor(profile: StormProfile, initialPosition: WorldPosition) {
    this.profile = { ...profile };
    this.position = copyPosition(initialPosition);
  }

  setProfile(profile: StormProfile): void {
    this.profile = { ...profile };
  }

  reset(position: WorldPosition): void {
    this.position = copyPosition(position);
    this.velocity = { x: 0, y: 0, z: 0 };
  }

  simulate(input: TornadoSimulationInput): StormSnapshot {
    const stepSeconds = Math.max(0, input.stepSeconds);
    const previous = this.position;
    const requestedX = previous.x
      + input.command.x * this.profile.movementSpeed * stepSeconds;
    const requestedZ = previous.z
      + input.command.y * this.profile.movementSpeed * stepSeconds;
    const nextX = clamp(requestedX, input.bounds.minX, input.bounds.maxX);
    const nextZ = clamp(requestedZ, input.bounds.minZ, input.bounds.maxZ);
    const nextY = input.terrain.sampleHeight(nextX, nextZ);
    this.position = { x: nextX, y: nextY, z: nextZ };

    if (stepSeconds > 0) {
      this.velocity = {
        x: (nextX - previous.x) / stepSeconds,
        y: (nextY - previous.y) / stepSeconds,
        z: (nextZ - previous.z) / stepSeconds,
      };
    } else {
      this.velocity = { x: 0, y: 0, z: 0 };
    }
    return this.snapshot();
  }

  snapshot(): StormSnapshot {
    return {
      profile: { ...this.profile },
      position: copyPosition(this.position),
      velocity: copyPosition(this.velocity),
    };
  }
}
