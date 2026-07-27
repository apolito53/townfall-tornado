import * as THREE from 'three';
import type {
  DioramaDistrictData,
  RenderQualityProfile,
  StormSnapshot,
  WeatherMode,
  WorldBounds,
  WorldPosition,
} from '../core/types';
import type { StormReviewProfile } from '../storm/stormProfiles';
import {
  createNorthStarDistrict,
  NORTH_STAR_PLAYABLE_HALF_EXTENT,
} from '../world/northStarDistrict';
import type { TerrainField } from '../world/TerrainField';
import { MaterialAtlas } from './MaterialAtlas';
import {
  StormAtmosphere,
  type StormAtmosphereDiagnostics,
} from './StormAtmosphere';
import {
  StormSilhouette,
  type StormSilhouetteDiagnostics,
} from './StormSilhouette';
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
  atmosphere: StormAtmosphereDiagnostics;
  storm: StormSilhouetteDiagnostics;
}

/**
 * Owns the deterministic north-star data and every resource used to draw its
 * terrain, town, weather, and temporary storm silhouette.
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
  private readonly atmosphere: StormAtmosphere;
  private readonly stormSilhouette = new StormSilhouette();

  constructor(weather: WeatherMode = 'storm') {
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
    this.atmosphere = new StormAtmosphere(weather);
    this.object.add(
      this.atmosphere.object,
      this.terrainRenderer.object,
      this.townRenderer.object,
      this.stormSilhouette.object,
    );
  }

  get fog(): THREE.Fog {
    return this.atmosphere.fog;
  }

  get spawn(): WorldPosition {
    return { ...this.data.spawn };
  }

  reset(
    snapshot: StormSnapshot,
    profile: StormReviewProfile,
  ): void {
    this.stormSilhouette.update(0, snapshot, profile);
  }

  update(
    timeSeconds: number,
    _deltaSeconds: number,
    snapshot: StormSnapshot,
    profile: StormReviewProfile,
    cameraPosition: Readonly<WorldPosition>,
  ): void {
    this.stormSilhouette.update(timeSeconds, snapshot, profile);
    this.atmosphere.update(timeSeconds, cameraPosition);
  }

  setWeather(weather: WeatherMode): void {
    this.atmosphere.applyWeather(weather);
  }

  applyQuality(profile: RenderQualityProfile, pixelRatio = 1): void {
    this.townRenderer.applyDetailScale(profile.townDetailScale);
    this.stormSilhouette.applyQuality(profile.stormFxScale, pixelRatio);
    this.atmosphere.applyQuality(profile);
  }

  getDiagnostics(): DioramaWorldDiagnostics {
    const terrain = this.terrainRenderer.getDiagnostics();
    const town = this.townRenderer.getDiagnostics();
    const atmosphere = this.atmosphere.getDiagnostics();
    const storm = this.stormSilhouette.getDiagnostics();
    return {
      signature: this.data.signature,
      buildingCount: town.buildingCount,
      propCount: town.propCount,
      instanceBatches: terrain.instanceBatches + town.batchCount,
      activeInstances:
        terrain.activeInstances + town.visibleInstanceCount,
      terrain,
      town,
      atmosphere,
      storm,
    };
  }

  dispose(): void {
    this.stormSilhouette.dispose();
    this.atmosphere.dispose();
    this.terrainRenderer.dispose();
    this.townRenderer.dispose();
    this.atlas.dispose();
    this.object.clear();
  }
}
