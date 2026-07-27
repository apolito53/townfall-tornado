import { clamp01 } from '../core/math';
import type {
  LotDefinition,
  RoadControlPoint,
  RoadDefinition,
  TerrainSample,
  WorldBounds,
  WorldSeed,
} from '../core/types';

export interface TerrainElevationRange {
  minimum: number;
  maximum: number;
}

export interface RoadProjection {
  distance: number;
  elevation: number;
  rotationY: number;
}

export interface TerrainFieldOptions {
  seed: WorldSeed;
  bounds: WorldBounds;
  roads: readonly RoadDefinition[];
  lots: readonly LotDefinition[];
}

const NORMAL_SAMPLE_DISTANCE = 2;
const ROAD_BLEND_MARGIN = 90;

function smoothstep(minimum: number, maximum: number, value: number): number {
  if (minimum === maximum) {
    return value < minimum ? 0 : 1;
  }
  const amount = clamp01((value - minimum) / (maximum - minimum));
  return amount * amount * (3 - 2 * amount);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function hashLattice(seed: number, x: number, z: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function projectToSegment(
  x: number,
  z: number,
  start: RoadControlPoint,
  end: RoadControlPoint,
): RoadProjection {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const amount = lengthSquared === 0
    ? 0
    : clamp01(
      ((x - start.x) * segmentX + (z - start.z) * segmentZ)
      / lengthSquared,
    );
  const nearestX = start.x + segmentX * amount;
  const nearestZ = start.z + segmentZ * amount;

  return {
    distance: Math.hypot(x - nearestX, z - nearestZ),
    elevation: lerp(start.elevation, end.elevation, amount),
    rotationY: Math.atan2(segmentX, segmentZ),
  };
}

export function projectToRoad(
  x: number,
  z: number,
  road: RoadDefinition,
): RoadProjection {
  return projectToRoadPoints(x, z, getSmoothedRoadPoints(road));
}

function projectToRoadPoints(
  x: number,
  z: number,
  points: readonly RoadControlPoint[],
): RoadProjection {
  let nearest: RoadProjection = {
    distance: Number.POSITIVE_INFINITY,
    elevation: 0,
    rotationY: 0,
  };

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const projection = projectToSegment(x, z, start, end);
    if (projection.distance < nearest.distance) {
      nearest = projection;
    }
  }

  return nearest;
}

export function getSmoothedRoadPoints(
  road: RoadDefinition,
  iterations = 3,
): readonly RoadControlPoint[] {
  let points = road.points.map((point) => ({ ...point }));
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (points.length < 2) {
      break;
    }
    const smoothed: RoadControlPoint[] = [];
    const first = points[0];
    const last = points[points.length - 1];
    if (first === undefined || last === undefined) {
      break;
    }
    smoothed.push({ ...first });
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (start === undefined || end === undefined) {
        continue;
      }
      smoothed.push({
        x: lerp(start.x, end.x, 0.25),
        z: lerp(start.z, end.z, 0.25),
        elevation: lerp(start.elevation, end.elevation, 0.25),
      });
      smoothed.push({
        x: lerp(start.x, end.x, 0.75),
        z: lerp(start.z, end.z, 0.75),
        elevation: lerp(start.elevation, end.elevation, 0.75),
      });
    }
    smoothed.push({ ...last });
    points = smoothed;
  }
  return points;
}

export function getRoadSegmentGrade(
  start: RoadControlPoint,
  end: RoadControlPoint,
): number {
  const horizontalDistance = Math.hypot(end.x - start.x, end.z - start.z);
  return horizontalDistance === 0
    ? 0
    : Math.abs(end.elevation - start.elevation) / horizontalDistance;
}

function getLotLocalPosition(
  x: number,
  z: number,
  lot: LotDefinition,
): { x: number; z: number } {
  const offsetX = x - lot.center.x;
  const offsetZ = z - lot.center.z;
  const cosine = Math.cos(-lot.rotationY);
  const sine = Math.sin(-lot.rotationY);
  return {
    x: offsetX * cosine - offsetZ * sine,
    z: offsetX * sine + offsetZ * cosine,
  };
}

function distanceOutsideLot(
  x: number,
  z: number,
  lot: LotDefinition,
): number {
  const local = getLotLocalPosition(x, z, lot);
  const outsideX = Math.max(0, Math.abs(local.x) - lot.width * 0.5);
  const outsideZ = Math.max(0, Math.abs(local.z) - lot.depth * 0.5);
  return Math.hypot(outsideX, outsideZ);
}

function isInsideLot(
  x: number,
  z: number,
  lot: LotDefinition,
): boolean {
  const local = getLotLocalPosition(x, z, lot);
  return Math.abs(local.x) <= lot.width * 0.5
    && Math.abs(local.z) <= lot.depth * 0.5;
}

/**
 * Pure, deterministic terrain sampling for the north-star diorama.
 * Renderers may tessellate this field at any resolution without changing the
 * underlying world surface or placement heights.
 */
export class TerrainField {
  readonly bounds: WorldBounds;
  private readonly seedValue: number;
  private readonly roads: readonly RoadDefinition[];
  private readonly roadPaths: readonly (readonly RoadControlPoint[])[];
  private readonly lots: readonly LotDefinition[];

  constructor(options: TerrainFieldOptions) {
    this.seedValue = options.seed.value;
    this.bounds = { ...options.bounds };
    this.roads = options.roads;
    this.roadPaths = options.roads.map((road) => getSmoothedRoadPoints(road));
    this.lots = options.lots;
  }

  sample(x: number, z: number): TerrainSample {
    const height = this.sampleHeight(x, z);
    const left = this.sampleHeight(x - NORMAL_SAMPLE_DISTANCE, z);
    const right = this.sampleHeight(x + NORMAL_SAMPLE_DISTANCE, z);
    const back = this.sampleHeight(x, z - NORMAL_SAMPLE_DISTANCE);
    const front = this.sampleHeight(x, z + NORMAL_SAMPLE_DISTANCE);
    const normalX = left - right;
    const normalY = NORMAL_SAMPLE_DISTANCE * 2;
    const normalZ = back - front;
    const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;

    return {
      height,
      normal: {
        x: normalX / normalLength,
        y: normalY / normalLength,
        z: normalZ / normalLength,
      },
      surface: this.sampleSurface(x, z),
    };
  }

  sampleHeight(x: number, z: number): number {
    let height = this.sampleBaseHeight(x, z);

    for (let index = 0; index < this.roads.length; index += 1) {
      const road = this.roads[index];
      const roadPath = this.roadPaths[index];
      if (road === undefined || roadPath === undefined) {
        continue;
      }
      const projection = projectToRoadPoints(x, z, roadPath);
      const roadEdge = road.width * 0.5;
      const blendEdge = roadEdge + road.shoulderWidth + ROAD_BLEND_MARGIN;
      const weight = 1 - smoothstep(roadEdge, blendEdge, projection.distance);
      if (weight > 0) {
        height = lerp(height, projection.elevation, weight);
      }
    }

    let strongestLotWeight = 0;
    let strongestLotHeight = height;
    for (const lot of this.lots) {
      const outsideDistance = distanceOutsideLot(x, z, lot);
      const weight = 1 - smoothstep(0, lot.padBlend, outsideDistance);
      if (weight > strongestLotWeight) {
        strongestLotWeight = weight;
        strongestLotHeight = lot.center.y;
      }
    }
    if (strongestLotWeight > 0) {
      height = lerp(height, strongestLotHeight, strongestLotWeight);
    }

    return height;
  }

  getElevationRange(sampleCountPerAxis = 64): TerrainElevationRange {
    const sampleCount = Math.max(2, Math.floor(sampleCountPerAxis));
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;

    for (let zIndex = 0; zIndex < sampleCount; zIndex += 1) {
      const zAmount = zIndex / (sampleCount - 1);
      const z = lerp(this.bounds.minZ, this.bounds.maxZ, zAmount);
      for (let xIndex = 0; xIndex < sampleCount; xIndex += 1) {
        const xAmount = xIndex / (sampleCount - 1);
        const x = lerp(this.bounds.minX, this.bounds.maxX, xAmount);
        const height = this.sampleHeight(x, z);
        minimum = Math.min(minimum, height);
        maximum = Math.max(maximum, height);
      }
    }

    return { minimum, maximum };
  }

  private sampleBaseHeight(x: number, z: number): number {
    const broadNoise = (this.valueNoise(x, z, 1200) - 0.5) * 30;
    const middleNoise = (this.valueNoise(x + 310, z - 170, 520) - 0.5) * 14;
    const detailNoise = (this.valueNoise(x - 90, z + 430, 220) - 0.5) * 5;

    const southernRidge = 52
      * Math.exp(-(((z - 1120) / 410) ** 2))
      * (0.82 + Math.cos(x / 520) * 0.18);
    const westernRidge = 34
      * Math.exp(
        -(((x + 920) / 520) ** 2)
        - (((z + 120) / 900) ** 2),
      );
    const easternHill = 38
      * Math.exp(
        -(((x - 980) / 560) ** 2)
        - (((z + 520) / 700) ** 2),
      );
    const townValley = -24
      * Math.exp(
        -((x / 760) ** 2)
        - (((z - 20) / 680) ** 2),
      );
    const swaleDistance = Math.abs(x * 0.68 + z * 0.22 + 120);
    const drainageSwale = -15 * Math.exp(-((swaleDistance / 95) ** 2));

    return broadNoise
      + middleNoise
      + detailNoise
      + southernRidge
      + westernRidge
      + easternHill
      + townValley
      + drainageSwale;
  }

  private valueNoise(x: number, z: number, wavelength: number): number {
    const scaledX = x / wavelength;
    const scaledZ = z / wavelength;
    const x0 = Math.floor(scaledX);
    const z0 = Math.floor(scaledZ);
    const xAmount = smoothstep(0, 1, scaledX - x0);
    const zAmount = smoothstep(0, 1, scaledZ - z0);
    const top = lerp(
      hashLattice(this.seedValue, x0, z0),
      hashLattice(this.seedValue, x0 + 1, z0),
      xAmount,
    );
    const bottom = lerp(
      hashLattice(this.seedValue, x0, z0 + 1),
      hashLattice(this.seedValue, x0 + 1, z0 + 1),
      xAmount,
    );
    return lerp(top, bottom, zAmount);
  }

  private sampleSurface(
    x: number,
    z: number,
  ): TerrainSample['surface'] {
    for (let index = 0; index < this.roads.length; index += 1) {
      const road = this.roads[index];
      const roadPath = this.roadPaths[index];
      if (road === undefined || roadPath === undefined) {
        continue;
      }
      const projection = projectToRoadPoints(x, z, roadPath);
      if (projection.distance <= road.width * 0.5) {
        return road.surface;
      }
    }

    for (const lot of this.lots) {
      if (isInsideLot(x, z, lot)) {
        return lot.surface;
      }
    }

    const height = this.sampleBaseHeight(x, z);
    if (height < -24) {
      return 'soil';
    }
    return 'grass';
  }
}
