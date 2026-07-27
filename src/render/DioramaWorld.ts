import * as THREE from 'three';
import type {
  DioramaDistrictData,
  RenderQualityProfile,
  WorldBounds,
  WorldPosition,
} from '../core/types';
import {
  createNorthStarDistrict,
  NORTH_STAR_PLAYABLE_HALF_EXTENT,
} from '../world/northStarDistrict';
import type { TerrainField } from '../world/TerrainField';
import { MaterialAtlas } from './MaterialAtlas';
import {
  TerrainRenderer,
  type TerrainRendererDiagnostics,
} from './TerrainRenderer';
import {
  TownRenderer,
  type TownRendererDiagnostics,
} from './TownRenderer';

export interface DioramaWorldDiagnostics {
  signature: string;
  buildingCount: number;
  propCount: number;
  instanceBatches: number;
  activeInstances: number;
  terrain: TerrainRendererDiagnostics;
  town: TownRendererDiagnostics;
}

/**
 * Owns the deterministic north-star data and every resource used to draw its
 * terrain and town. Storm and weather renderers join this composition in the
 * next delivery commit.
 */
export class DioramaWorld {
  readonly object = new THREE.Group();
  readonly data: DioramaDistrictData;
  readonly terrain: TerrainField;
  readonly movementBounds: WorldBounds = {
    minX: -NORTH_STAR_PLAYABLE_HALF_EXTENT,
    maxX: NORTH_STAR_PLAYABLE_HALF_EXTENT,
    minZ: -NORTH_STAR_PLAYABLE_HALF_EXTENT,
    maxZ: NORTH_STAR_PLAYABLE_HALF_EXTENT,
  };
  private readonly atlas = new MaterialAtlas();
  private readonly terrainRenderer: TerrainRenderer;
  private readonly townRenderer: TownRenderer;

  constructor() {
    const district = createNorthStarDistrict();
    this.data = district.data;
    this.terrain = district.terrain;
    this.object.name = 'DioramaWorld';
    this.terrainRenderer = new TerrainRenderer(
      this.data,
      this.terrain,
      this.atlas,
    );
    this.townRenderer = new TownRenderer(this.data, this.atlas);
    this.object.add(this.terrainRenderer.object, this.townRenderer.object);
  }

  get spawn(): WorldPosition {
    return { ...this.data.spawn };
  }

  reset(): void {
    // World data and instance mappings are immutable during Milestone 2.
  }

  update(_timeSeconds: number, _deltaSeconds: number): void {
    // Weather and storm visuals are attached in the atmosphere delivery.
  }

  applyQuality(profile: RenderQualityProfile): void {
    this.townRenderer.applyDetailScale(profile.townDetailScale);
  }

  getDiagnostics(): DioramaWorldDiagnostics {
    const terrain = this.terrainRenderer.getDiagnostics();
    const town = this.townRenderer.getDiagnostics();
    return {
      signature: this.data.signature,
      buildingCount: town.buildingCount,
      propCount: town.propCount,
      instanceBatches: terrain.instanceBatches + town.batchCount,
      activeInstances:
        terrain.activeInstances + town.visibleInstanceCount,
      terrain,
      town,
    };
  }

  dispose(): void {
    this.terrainRenderer.dispose();
    this.townRenderer.dispose();
    this.atlas.dispose();
    this.object.clear();
  }
}
