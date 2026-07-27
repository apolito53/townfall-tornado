import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type {
  DioramaDistrictData,
  LotDefinition,
  RoadControlPoint,
  RoadDefinition,
  TerrainSample,
} from '../core/types';
import {
  getSmoothedRoadPoints,
  type TerrainElevationRange,
  TerrainField,
} from '../world/TerrainField';
import {
  type AtlasTileName,
  MaterialAtlas,
  remapGeometryUvs,
} from './MaterialAtlas';

const TERRAIN_SEGMENTS = 256;
const ROAD_SAMPLE_SPACING = 12;
const SURFACE_LIFT = 0.14;
const SIDEWALK_MIN_Z = -300;
const SIDEWALK_MAX_Z = 340;

interface PathPoint {
  x: number;
  z: number;
}

interface SurfaceBatch {
  tile: AtlasTileName;
  material:
    | 'asphalt'
    | 'concrete'
    | 'gravel'
    | 'soil'
    | 'marking';
  geometries: THREE.BufferGeometry[];
  name: string;
}

export interface TerrainRendererDiagnostics {
  segments: number;
  elevationRange: TerrainElevationRange;
  roadCount: number;
  drivewayCount: number;
  hardscapeLots: number;
  instanceBatches: number;
  activeInstances: number;
  terrainTriangles: number;
}

const SURFACE_COLORS: Readonly<
  Record<TerrainSample['surface'], THREE.ColorRepresentation>
> = {
  grass: 0x708265,
  soil: 0x7c694f,
  road: 0x4b514e,
  concrete: 0xa4a59d,
  gravel: 0x837f75,
};

function deterministicVariation(xIndex: number, zIndex: number): number {
  let value = Math.imul(xIndex + 17, 0x45d9f3b)
    ^ Math.imul(zIndex + 31, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return 0.93 + (((value ^ (value >>> 16)) >>> 0) / 4294967295) * 0.12;
}

function createTerrainGeometry(
  terrain: TerrainField,
  data: DioramaDistrictData,
): THREE.BufferGeometry {
  const vertexCountPerAxis = TERRAIN_SEGMENTS + 1;
  const positions = new Float32Array(
    vertexCountPerAxis * vertexCountPerAxis * 3,
  );
  const colors = new Float32Array(positions.length);
  const uvs = new Float32Array(
    vertexCountPerAxis * vertexCountPerAxis * 2,
  );
  const indices: number[] = [];
  const color = new THREE.Color();
  const width = data.bounds.maxX - data.bounds.minX;
  const depth = data.bounds.maxZ - data.bounds.minZ;

  for (let zIndex = 0; zIndex < vertexCountPerAxis; zIndex += 1) {
    const zAmount = zIndex / TERRAIN_SEGMENTS;
    const z = THREE.MathUtils.lerp(data.bounds.minZ, data.bounds.maxZ, zAmount);
    for (let xIndex = 0; xIndex < vertexCountPerAxis; xIndex += 1) {
      const xAmount = xIndex / TERRAIN_SEGMENTS;
      const x = THREE.MathUtils.lerp(
        data.bounds.minX,
        data.bounds.maxX,
        xAmount,
      );
      const sample = terrain.sample(x, z);
      const vertexIndex = zIndex * vertexCountPerAxis + xIndex;
      const positionIndex = vertexIndex * 3;
      const uvIndex = vertexIndex * 2;

      positions[positionIndex] = x;
      positions[positionIndex + 1] = sample.height;
      positions[positionIndex + 2] = z;

      color
        .set(SURFACE_COLORS[sample.surface])
        .multiplyScalar(deterministicVariation(xIndex, zIndex));
      colors[positionIndex] = color.r;
      colors[positionIndex + 1] = color.g;
      colors[positionIndex + 2] = color.b;

      // One atlas tile spans the whole field. Fine geometry and vertex color
      // carry the landform; the texture is intentionally only a quiet accent.
      uvs[uvIndex] = (x - data.bounds.minX) / width;
      uvs[uvIndex + 1] = (z - data.bounds.minZ) / depth;
    }
  }

  for (let zIndex = 0; zIndex < TERRAIN_SEGMENTS; zIndex += 1) {
    for (let xIndex = 0; xIndex < TERRAIN_SEGMENTS; xIndex += 1) {
      const topLeft = zIndex * vertexCountPerAxis + xIndex;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + vertexCountPerAxis;
      const bottomRight = bottomLeft + 1;
      indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'DioramaTerrainGeometry';
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  remapGeometryUvs(geometry, 'grass');
  return geometry;
}

function createTerrainSkirtGeometry(
  terrain: TerrainField,
  data: DioramaDistrictData,
  elevationRange: TerrainElevationRange,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const bottomY = elevationRange.minimum - 90;
  const edgeVertexCount = TERRAIN_SEGMENTS + 1;
  const edges: readonly ((amount: number) => PathPoint)[] = [
    (amount) => ({
      x: THREE.MathUtils.lerp(data.bounds.minX, data.bounds.maxX, amount),
      z: data.bounds.minZ,
    }),
    (amount) => ({
      x: data.bounds.maxX,
      z: THREE.MathUtils.lerp(data.bounds.minZ, data.bounds.maxZ, amount),
    }),
    (amount) => ({
      x: THREE.MathUtils.lerp(data.bounds.maxX, data.bounds.minX, amount),
      z: data.bounds.maxZ,
    }),
    (amount) => ({
      x: data.bounds.minX,
      z: THREE.MathUtils.lerp(data.bounds.maxZ, data.bounds.minZ, amount),
    }),
  ];

  for (const edge of edges) {
    const edgeOffset = positions.length / 3;
    for (let index = 0; index < edgeVertexCount; index += 1) {
      const amount = index / TERRAIN_SEGMENTS;
      const point = edge(amount);
      const topY = terrain.sampleHeight(point.x, point.z);
      positions.push(point.x, topY, point.z, point.x, bottomY, point.z);
      colors.push(0.42, 0.38, 0.3, 0.2, 0.22, 0.2);
      uvs.push(amount, 1, amount, 0);
    }
    for (let index = 0; index < TERRAIN_SEGMENTS; index += 1) {
      const topLeft = edgeOffset + index * 2;
      const bottomLeft = topLeft + 1;
      const topRight = topLeft + 2;
      const bottomRight = topLeft + 3;
      indices.push(
        topLeft,
        bottomLeft,
        topRight,
        topRight,
        bottomLeft,
        bottomRight,
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'DioramaTerrainSkirtGeometry';
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  remapGeometryUvs(geometry, 'soil');
  return geometry;
}

function resamplePath(
  controlPoints: readonly RoadControlPoint[],
  spacing: number,
): PathPoint[] {
  const result: PathPoint[] = [];
  const first = controlPoints[0];
  if (first === undefined) {
    return result;
  }
  result.push({ x: first.x, z: first.z });

  for (let index = 0; index < controlPoints.length - 1; index += 1) {
    const start = controlPoints[index];
    const end = controlPoints[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps;
      result.push({
        x: THREE.MathUtils.lerp(start.x, end.x, amount),
        z: THREE.MathUtils.lerp(start.z, end.z, amount),
      });
    }
  }
  return result;
}

function pathNormal(points: readonly PathPoint[], index: number): PathPoint {
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  if (previous === undefined || next === undefined) {
    return { x: 1, z: 0 };
  }
  const tangentX = next.x - previous.x;
  const tangentZ = next.z - previous.z;
  const length = Math.hypot(tangentX, tangentZ) || 1;
  return { x: -tangentZ / length, z: tangentX / length };
}

function offsetPath(
  points: readonly PathPoint[],
  offset: number,
): PathPoint[] {
  return points.map((point, index) => {
    const normal = pathNormal(points, index);
    return {
      x: point.x + normal.x * offset,
      z: point.z + normal.z * offset,
    };
  });
}

function createRibbonGeometry(
  points: readonly PathPoint[],
  halfWidth: number,
  terrain: TerrainField,
  lift = SURFACE_LIFT,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let pathLength = 0;
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous === undefined || current === undefined) {
      distances.push(pathLength);
      continue;
    }
    pathLength += Math.hypot(
      current.x - previous.x,
      current.z - previous.z,
    );
    distances.push(pathLength);
  }

  points.forEach((point, index) => {
    const normal = pathNormal(points, index);
    const leftX = point.x + normal.x * halfWidth;
    const leftZ = point.z + normal.z * halfWidth;
    const rightX = point.x - normal.x * halfWidth;
    const rightZ = point.z - normal.z * halfWidth;
    positions.push(
      leftX,
      terrain.sampleHeight(leftX, leftZ) + lift,
      leftZ,
      rightX,
      terrain.sampleHeight(rightX, rightZ) + lift,
      rightZ,
    );
    const v = pathLength === 0 ? 0 : (distances[index] ?? 0) / pathLength;
    uvs.push(0, v, 1, v);
  });

  for (let index = 0; index < points.length - 1; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, right, nextLeft, nextLeft, right, nextRight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLotPlaneGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([
      -0.5, 0, -0.5,
      0.5, 0, -0.5,
      -0.5, 0, 0.5,
      0.5, 0, 0.5,
    ], 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
      0, 1, 0,
    ], 3),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ], 2),
  );
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  return geometry;
}

function createMergedGeometry(
  geometries: readonly THREE.BufferGeometry[],
  tile: AtlasTileName,
): THREE.BufferGeometry | null {
  if (geometries.length === 0) {
    return null;
  }
  const merged = mergeGeometries([...geometries], false);
  for (const geometry of geometries) {
    geometry.dispose();
  }
  if (merged === null) {
    throw new Error(`Unable to merge ${tile} terrain surface geometry.`);
  }
  remapGeometryUvs(merged, tile);
  merged.computeBoundingSphere();
  return merged;
}

function samplePathAtDistance(
  points: readonly PathPoint[],
  distance: number,
): { point: PathPoint; rotationY: number } | null {
  let remaining = distance;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
    if (remaining <= segmentLength) {
      const amount = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        point: {
          x: THREE.MathUtils.lerp(start.x, end.x, amount),
          z: THREE.MathUtils.lerp(start.z, end.z, amount),
        },
        rotationY: Math.atan2(end.x - start.x, end.z - start.z),
      };
    }
    remaining -= segmentLength;
  }
  return null;
}

function getPathLength(points: readonly PathPoint[]): number {
  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start !== undefined && end !== undefined) {
      length += Math.hypot(end.x - start.x, end.z - start.z);
    }
  }
  return length;
}

function getDrivewaySurface(lot: LotDefinition): 'concrete' | 'gravel' {
  return lot.use === 'agricultural'
    || lot.use === 'utility'
    || lot.surface === 'gravel'
    || lot.surface === 'soil'
    ? 'gravel'
    : 'concrete';
}

export class TerrainRenderer {
  readonly object = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly instanceMeshes: THREE.InstancedMesh[] = [];
  private readonly diagnostics: TerrainRendererDiagnostics;

  constructor(
    private readonly data: DioramaDistrictData,
    private readonly terrain: TerrainField,
    private readonly atlas: MaterialAtlas,
  ) {
    this.object.name = 'DioramaTerrain';
    const elevationRange = terrain.getElevationRange(96);
    this.createLand(elevationRange);
    const hardscapeLots = this.createRoadsAndLots();
    const terrainGeometry = this.geometries[0];
    this.diagnostics = {
      segments: TERRAIN_SEGMENTS,
      elevationRange,
      roadCount: data.roads.length,
      drivewayCount: data.lots.length,
      hardscapeLots,
      instanceBatches: this.instanceMeshes.length,
      activeInstances: this.instanceMeshes.reduce(
        (total, mesh) => total + mesh.count,
        0,
      ),
      terrainTriangles: terrainGeometry?.index === null
        ? (terrainGeometry?.getAttribute('position').count ?? 0) / 3
        : (terrainGeometry?.index?.count ?? 0) / 3,
    };
  }

  getDiagnostics(): TerrainRendererDiagnostics {
    return {
      ...this.diagnostics,
      elevationRange: { ...this.diagnostics.elevationRange },
    };
  }

  dispose(): void {
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
  }

  private createLand(elevationRange: TerrainElevationRange): void {
    const terrainGeometry = createTerrainGeometry(this.terrain, this.data);
    const land = new THREE.Mesh(terrainGeometry, this.atlas.get('terrain'));
    land.name = 'DioramaContinuousTerrain';
    land.receiveShadow = true;
    this.object.add(land);
    this.geometries.push(terrainGeometry);

    const skirtGeometry = createTerrainSkirtGeometry(
      this.terrain,
      this.data,
      elevationRange,
    );
    const skirt = new THREE.Mesh(skirtGeometry, this.atlas.get('soil'));
    skirt.name = 'DioramaTerrainSkirt';
    skirt.receiveShadow = true;
    this.object.add(skirt);
    this.geometries.push(skirtGeometry);
  }

  private createRoadsAndLots(): number {
    const batches: Record<string, SurfaceBatch> = {
      road: {
        tile: 'asphalt',
        material: 'asphalt',
        geometries: [],
        name: 'DioramaPavedRoads',
      },
      gravelRoad: {
        tile: 'gravel',
        material: 'gravel',
        geometries: [],
        name: 'DioramaGravelRoads',
      },
      shoulder: {
        tile: 'gravel',
        material: 'gravel',
        geometries: [],
        name: 'DioramaDrainageShoulders',
      },
      soilShoulder: {
        tile: 'soil',
        material: 'soil',
        geometries: [],
        name: 'DioramaServiceShoulders',
      },
      concrete: {
        tile: 'concrete',
        material: 'concrete',
        geometries: [],
        name: 'DioramaDriveways',
      },
      gravel: {
        tile: 'gravel',
        material: 'gravel',
        geometries: [],
        name: 'DioramaGravelDrives',
      },
      sidewalk: {
        tile: 'concrete',
        material: 'concrete',
        geometries: [],
        name: 'DioramaCommercialSidewalks',
      },
    };

    for (const road of this.data.roads) {
      const path = resamplePath(
        getSmoothedRoadPoints(road),
        ROAD_SAMPLE_SPACING,
      );
      const shoulderBatch = road.surface === 'road'
        ? batches.shoulder
        : batches.soilShoulder;
      const roadBatch = road.surface === 'road'
        ? batches.road
        : batches.gravelRoad;
      shoulderBatch?.geometries.push(createRibbonGeometry(
        path,
        road.width * 0.5 + road.shoulderWidth,
        this.terrain,
        SURFACE_LIFT * 0.45,
      ));
      roadBatch?.geometries.push(createRibbonGeometry(
        path,
        road.width * 0.5,
        this.terrain,
        SURFACE_LIFT,
      ));
      if (road.sidewalk !== 'none') {
        this.addCommercialSidewalks(road, path, batches.sidewalk);
      }
      if (road.markings !== 'none') {
        this.createRoadMarkings(road, path);
      }
    }

    for (const lot of this.data.lots) {
      const surface = getDrivewaySurface(lot);
      const drivewayBatch = surface === 'concrete'
        ? batches.concrete
        : batches.gravel;
      const centerPath: PathPoint[] = [
        { x: lot.drivewayAnchor.x, z: lot.drivewayAnchor.z },
        {
          x: THREE.MathUtils.lerp(lot.drivewayAnchor.x, lot.center.x, 0.55),
          z: THREE.MathUtils.lerp(lot.drivewayAnchor.z, lot.center.z, 0.55),
        },
        { x: lot.center.x, z: lot.center.z },
      ];
      drivewayBatch?.geometries.push(createRibbonGeometry(
        centerPath,
        lot.use === 'commercial' || lot.use === 'civic' ? 5.2 : 2.5,
        this.terrain,
        SURFACE_LIFT * 1.35,
      ));
    }

    for (const batch of Object.values(batches)) {
      const geometry = createMergedGeometry(batch.geometries, batch.tile);
      if (geometry === null) {
        continue;
      }
      geometry.name = `${batch.name}Geometry`;
      const mesh = new THREE.Mesh(geometry, this.atlas.get(batch.material));
      mesh.name = batch.name;
      mesh.receiveShadow = true;
      this.object.add(mesh);
      this.geometries.push(geometry);
    }

    return this.createHardscapeLotInstances();
  }

  private addCommercialSidewalks(
    _road: RoadDefinition,
    fullPath: readonly PathPoint[],
    batch: SurfaceBatch | undefined,
  ): void {
    if (batch === undefined) {
      return;
    }
    const commercialPath = fullPath.filter(
      (point) => point.z >= SIDEWALK_MIN_Z && point.z <= SIDEWALK_MAX_Z,
    );
    if (commercialPath.length < 2) {
      return;
    }
    const road = this.data.roads.find(
      (candidate) => candidate.id === 'valley-collector',
    );
    if (road === undefined) {
      return;
    }
    const offset = road.width * 0.5 + road.shoulderWidth + 1.35;
    batch.geometries.push(
      createRibbonGeometry(
        offsetPath(commercialPath, offset),
        1.35,
        this.terrain,
        SURFACE_LIFT * 1.75,
      ),
      createRibbonGeometry(
        offsetPath(commercialPath, -offset),
        1.35,
        this.terrain,
        SURFACE_LIFT * 1.75,
      ),
    );
  }

  private createRoadMarkings(
    road: RoadDefinition,
    path: readonly PathPoint[],
  ): void {
    const pathLength = getPathLength(path);
    const spacing = road.markings === 'center-dash' ? 24 : 8;
    const samples: { point: PathPoint; rotationY: number }[] = [];
    for (let distance = 12; distance < pathLength - 8; distance += spacing) {
      const sample = samplePathAtDistance(path, distance);
      if (sample !== null) {
        samples.push(sample);
      }
    }
    if (samples.length === 0) {
      return;
    }

    const baseGeometry = new THREE.BoxGeometry(
      0.26,
      0.055,
      road.markings === 'center-dash' ? 7 : 5,
    );
    const geometry = this.atlas.cloneGeometryForTile(baseGeometry, 'marking');
    baseGeometry.dispose();
    geometry.name = `${road.id}MarkingGeometry`;
    const markings = new THREE.InstancedMesh(
      geometry,
      this.atlas.get('marking'),
      samples.length,
    );
    markings.name = `${road.id}Markings`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    samples.forEach((sample, index) => {
      quaternion.setFromAxisAngle(up, sample.rotationY);
      matrix.compose(
        new THREE.Vector3(
          sample.point.x,
          this.terrain.sampleHeight(sample.point.x, sample.point.z) + 0.3,
          sample.point.z,
        ),
        quaternion,
        scale,
      );
      markings.setMatrixAt(index, matrix);
    });
    markings.instanceMatrix.needsUpdate = true;
    markings.computeBoundingSphere();
    markings.receiveShadow = true;
    this.object.add(markings);
    this.instanceMeshes.push(markings);
    this.geometries.push(geometry);
  }

  private createHardscapeLotInstances(): number {
    const hardscapeLots = this.data.lots.filter(
      (lot) => lot.surface !== 'grass',
    );
    const grouped = new Map<LotDefinition['surface'], LotDefinition[]>();
    for (const lot of hardscapeLots) {
      const lots = grouped.get(lot.surface) ?? [];
      lots.push(lot);
      grouped.set(lot.surface, lots);
    }

    for (const [surface, lots] of grouped) {
      const tile = surface === 'soil'
        ? 'soil'
        : surface === 'gravel'
          ? 'gravel'
          : 'concrete';
      const baseGeometry = createLotPlaneGeometry();
      const geometry = this.atlas.cloneGeometryForTile(baseGeometry, tile);
      baseGeometry.dispose();
      geometry.name = `${surface}LotPadGeometry`;
      const mesh = new THREE.InstancedMesh(
        geometry,
        this.atlas.get(tile),
        lots.length,
      );
      mesh.name = `${surface}LotPads`;
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const color = new THREE.Color();
      lots.forEach((lot, index) => {
        quaternion.setFromAxisAngle(up, lot.rotationY);
        scale.set(lot.width, 1, lot.depth);
        matrix.compose(
          new THREE.Vector3(
            lot.center.x,
            this.terrain.sampleHeight(lot.center.x, lot.center.z) + 0.08,
            lot.center.z,
          ),
          quaternion,
          scale,
        );
        mesh.setMatrixAt(index, matrix);
        color.set(
          surface === 'soil'
            ? 0x8a7255
            : surface === 'gravel'
              ? 0x8c877c
              : 0xaead9f,
        );
        mesh.setColorAt(index, color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.object.add(mesh);
      this.instanceMeshes.push(mesh);
      this.geometries.push(geometry);
    }
    return hardscapeLots.length;
  }
}
