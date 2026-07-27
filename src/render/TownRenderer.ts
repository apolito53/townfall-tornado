import * as THREE from 'three';
import type {
  BuildingRecord,
  DioramaDistrictData,
  WorldItemRecord,
  WorldPosition,
} from '../core/types';
import {
  MaterialAtlas,
  type AtlasTileName,
  type DioramaMaterialName,
} from './MaterialAtlas';

type DetailBand = 'core' | 'standard' | 'fine';
type GeometryKind =
  | 'box'
  | 'canopy'
  | 'cylinder-6'
  | 'cylinder-8'
  | 'gable-prism'
  | 'hip-roof'
  | 'cone-8';
type TownMaterialName = Exclude<DioramaMaterialName, 'terrain'>;
type TownPropKind = Exclude<WorldItemRecord['kind'], 'building' | 'road'>;

export type TownBuildingComponent =
  | 'foundation'
  | 'wall-shell'
  | 'gable-fill'
  | 'roof'
  | 'window'
  | 'door'
  | 'garage-door'
  | 'opening-frame'
  | 'parapet'
  | 'awning'
  | 'chimney'
  | 'roof-equipment'
  | 'facade-sign';

/**
 * A destruction system can retain these handles and update one component
 * without searching the scene graph. Indices are fixed for the renderer's
 * lifetime; detail scaling only changes each batch's visible prefix.
 */
export interface TownBuildingComponentHandle {
  readonly batch: THREE.InstancedMesh;
  readonly instanceIndex: number;
  readonly component: TownBuildingComponent;
}

export interface TownBuildingHandle {
  readonly buildingId: string;
  readonly components: readonly TownBuildingComponentHandle[];
}

export interface TownRendererDiagnostics {
  readonly buildingCount: number;
  readonly propCount: number;
  readonly buildingHandleCount: number;
  readonly batchCount: number;
  readonly instanceCapacity: number;
  readonly visibleInstanceCount: number;
  readonly coreInstanceCount: number;
  readonly optionalInstanceCount: number;
  readonly detailScale: number;
  readonly disposed: boolean;
}

interface BatchSpec {
  readonly geometry: GeometryKind;
  readonly material: TownMaterialName;
  readonly tile: AtlasTileName;
  readonly detail: DetailBand;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

interface LocalTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly rotationX?: number;
  readonly rotationY?: number;
  readonly rotationZ?: number;
}

interface PendingPlacement {
  readonly matrix: THREE.Matrix4;
  readonly color: THREE.ColorRepresentation;
  readonly component: string;
  readonly buildingId: string | null;
  readonly detailOwnerId: string;
}

interface PendingBatch {
  readonly key: string;
  readonly spec: BatchSpec;
  readonly placements: PendingPlacement[];
}

interface RuntimeBatch {
  readonly mesh: THREE.InstancedMesh;
  readonly detail: DetailBand;
  readonly capacity: number;
  readonly detailGroupEnds: readonly number[];
}

interface RawGeometry {
  readonly positions: number[];
  readonly uvs: number[];
}

type Point3 = readonly [number, number, number];
type Point2 = readonly [number, number];

const MAX_BUILDINGS = 20;
const MAX_PROPS = 512;
const MAX_BATCH_INSTANCES = 2048;
const MAX_TOTAL_COMPONENT_INSTANCES = 8192;
const FOUNDATION_HEIGHT = 0.55;
const MAX_DETAIL_SCALE = 1.25;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const PROP_LIMITS: Readonly<Record<TownPropKind, number>> = {
  tree: 96,
  fence: 256,
  car: 24,
  'utility-pole': 40,
  mailbox: 24,
  'road-sign': 16,
  hydrant: 16,
  'field-prop': 24,
};

const MATERIAL_TILES: Readonly<Record<TownMaterialName, AtlasTileName>> = {
  asphalt: 'asphalt',
  concrete: 'concrete',
  siding: 'siding',
  brick: 'brick',
  shingles: 'shingles',
  metal: 'metal',
  glass: 'glass',
  gravel: 'gravel',
  soil: 'soil',
  wood: 'wood',
  'roof-dark': 'roof-dark',
  marking: 'marking',
  foliage: 'foliage',
  bark: 'bark',
  paint: 'paint',
};

const WALL_TINTS = {
  wood: [
    0xfff7e3,
    0xe4f0df,
    0xf2dfd2,
    0xdce7ec,
    0xf4e9bf,
    0xe8ddd0,
    0xd6e3d7,
    0xf0f0e8,
    0xe2d9e7,
  ],
  brick: [
    0xffe1d4,
    0xe8c5b7,
    0xf2d4c5,
    0xd8c1b6,
    0xf0c8b8,
    0xe1cfc2,
    0xf7ded1,
    0xdcc0b3,
    0xedcabe,
  ],
  steel: [
    0xe7ece8,
    0xd9e3e5,
    0xe8e2d3,
    0xd4ddd6,
    0xe1e5e8,
    0xded7cc,
    0xe7ece0,
    0xd6dee4,
    0xe3e3dc,
  ],
  concrete: [
    0xf1f0e7,
    0xe2e7e4,
    0xede2d8,
    0xdce1e4,
    0xe9e7dc,
    0xe4ded8,
    0xe7ece7,
    0xdedfd9,
    0xeeeae3,
  ],
} satisfies Readonly<
  Record<BuildingRecord['definition']['material'], readonly number[]>
>;

const ROOF_TINTS = {
  shingle: [
    0xe1d7cb,
    0xcfd6d2,
    0xd7c8c0,
    0xc6cec8,
    0xddd4c5,
  ],
  metal: [
    0xe3e9e5,
    0xd2dbe0,
    0xe4dfd1,
    0xcfd9d3,
    0xdce1e3,
  ],
  membrane: [
    0xd4d7d1,
    0xc9cfcb,
    0xd8d2ca,
    0xc8d1d2,
    0xd1d2ca,
  ],
} satisfies Readonly<
  Record<BuildingRecord['definition']['roof']['material'], readonly number[]>
>;

const CAR_TINTS = [
  0xf3f1e7,
  0xd08e84,
  0x91a7b4,
  0xc8b58d,
  0x8e9998,
];

const FOLIAGE_TINTS = [
  0xe6f0d5,
  0xd1e5c6,
  0xf0e7c2,
  0xc5ddc8,
  0xdde9bf,
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothCoverage(
  scale: number,
  start: number,
  end: number,
): number {
  const amount = clamp((scale - start) / (end - start), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pickCycled<T>(values: readonly T[], index: number): T {
  if (values.length === 0) {
    throw new Error('Cannot select from an empty town palette.');
  }
  const wrappedIndex = ((index % values.length) + values.length) % values.length;
  const value = values[wrappedIndex];
  if (value === undefined) {
    throw new Error(`Town palette index ${wrappedIndex} is unavailable.`);
  }
  return value;
}

function wallMaterialName(
  material: BuildingRecord['definition']['material'],
): TownMaterialName {
  switch (material) {
    case 'wood':
      return 'siding';
    case 'brick':
      return 'brick';
    case 'steel':
      return 'metal';
    case 'concrete':
      return 'concrete';
  }
}

function roofMaterialName(
  material: BuildingRecord['definition']['roof']['material'],
): TownMaterialName {
  switch (material) {
    case 'shingle':
      return 'shingles';
    case 'metal':
      return 'metal';
    case 'membrane':
      return 'roof-dark';
  }
}

function createBatchSpec(
  geometry: GeometryKind,
  material: TownMaterialName,
  detail: DetailBand,
  castShadow = true,
  receiveShadow = true,
): BatchSpec {
  return {
    geometry,
    material,
    tile: MATERIAL_TILES[material],
    detail,
    castShadow,
    receiveShadow,
  };
}

function getBatchKey(spec: BatchSpec): string {
  return [
    spec.geometry,
    spec.material,
    spec.tile,
    spec.detail,
    spec.castShadow ? 'cast' : 'no-cast',
    spec.receiveShadow ? 'receive' : 'no-receive',
  ].join(':');
}

function composeMatrix(
  origin: WorldPosition,
  baseRotationY: number,
  transform: LocalTransform,
): THREE.Matrix4 {
  const cosine = Math.cos(baseRotationY);
  const sine = Math.sin(baseRotationY);
  const worldPosition = new THREE.Vector3(
    origin.x + transform.x * cosine - transform.z * sine,
    origin.y + transform.y,
    origin.z + transform.x * sine + transform.z * cosine,
  );
  const localRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    transform.rotationX ?? 0,
    transform.rotationY ?? 0,
    transform.rotationZ ?? 0,
    'XYZ',
  ));
  const baseRotation = new THREE.Quaternion().setFromAxisAngle(
    Y_AXIS,
    baseRotationY,
  );
  localRotation.premultiply(baseRotation);

  return new THREE.Matrix4().compose(
    worldPosition,
    localRotation,
    new THREE.Vector3(
      transform.scaleX,
      transform.scaleY,
      transform.scaleZ,
    ),
  );
}

function addTriangle(
  raw: RawGeometry,
  first: Point3,
  second: Point3,
  third: Point3,
  firstUv: Point2 = [0, 0],
  secondUv: Point2 = [1, 0],
  thirdUv: Point2 = [0.5, 1],
): void {
  raw.positions.push(...first, ...second, ...third);
  raw.uvs.push(...firstUv, ...secondUv, ...thirdUv);
}

function addQuad(
  raw: RawGeometry,
  first: Point3,
  second: Point3,
  third: Point3,
  fourth: Point3,
): void {
  addTriangle(raw, first, second, third, [0, 0], [0, 1], [1, 1]);
  addTriangle(raw, first, third, fourth, [0, 0], [1, 1], [1, 0]);
}

function finishRawGeometry(raw: RawGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(raw.positions, 3),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(raw.uvs, 2),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * A triangular prism fills the attic volume beneath paired gable roof slabs.
 * It keeps the gable end readable without introducing a building-level mesh.
 */
function createGablePrismGeometry(): THREE.BufferGeometry {
  const raw: RawGeometry = { positions: [], uvs: [] };
  const leftNorth: Point3 = [-0.5, 0, -0.5];
  const leftSouth: Point3 = [-0.5, 0, 0.5];
  const leftRidge: Point3 = [-0.5, 1, 0];
  const rightNorth: Point3 = [0.5, 0, -0.5];
  const rightSouth: Point3 = [0.5, 0, 0.5];
  const rightRidge: Point3 = [0.5, 1, 0];

  addQuad(raw, leftNorth, leftRidge, rightRidge, rightNorth);
  addQuad(raw, leftSouth, rightSouth, rightRidge, leftRidge);
  addTriangle(raw, leftNorth, leftSouth, leftRidge);
  addTriangle(raw, rightSouth, rightNorth, rightRidge);
  addQuad(raw, leftNorth, rightNorth, rightSouth, leftSouth);
  return finishRawGeometry(raw);
}

/**
 * The hip roof is a closed, low-poly volume with a visible eave skirt. Scaling
 * it per building produces a thick silhouette instead of a paper-thin pyramid.
 */
function createHipRoofGeometry(): THREE.BufferGeometry {
  const raw: RawGeometry = { positions: [], uvs: [] };
  const eaveY = 0.16;
  const ridgeHalfLength = 0.24;
  const bottomNorthWest: Point3 = [-0.5, 0, -0.5];
  const bottomNorthEast: Point3 = [0.5, 0, -0.5];
  const bottomSouthWest: Point3 = [-0.5, 0, 0.5];
  const bottomSouthEast: Point3 = [0.5, 0, 0.5];
  const eaveNorthWest: Point3 = [-0.5, eaveY, -0.5];
  const eaveNorthEast: Point3 = [0.5, eaveY, -0.5];
  const eaveSouthWest: Point3 = [-0.5, eaveY, 0.5];
  const eaveSouthEast: Point3 = [0.5, eaveY, 0.5];
  const ridgeWest: Point3 = [-ridgeHalfLength, 1, 0];
  const ridgeEast: Point3 = [ridgeHalfLength, 1, 0];

  addQuad(raw, eaveNorthWest, ridgeWest, ridgeEast, eaveNorthEast);
  addQuad(raw, eaveSouthWest, eaveSouthEast, ridgeEast, ridgeWest);
  addTriangle(raw, eaveNorthWest, eaveSouthWest, ridgeWest);
  addTriangle(raw, eaveSouthEast, eaveNorthEast, ridgeEast);

  addQuad(
    raw,
    bottomNorthWest,
    eaveNorthWest,
    eaveNorthEast,
    bottomNorthEast,
  );
  addQuad(
    raw,
    bottomSouthWest,
    bottomSouthEast,
    eaveSouthEast,
    eaveSouthWest,
  );
  addQuad(
    raw,
    bottomNorthWest,
    bottomSouthWest,
    eaveSouthWest,
    eaveNorthWest,
  );
  addQuad(
    raw,
    bottomSouthEast,
    bottomNorthEast,
    eaveNorthEast,
    eaveSouthEast,
  );
  addQuad(
    raw,
    bottomNorthWest,
    bottomNorthEast,
    bottomSouthEast,
    bottomSouthWest,
  );
  return finishRawGeometry(raw);
}

/**
 * Cottonwood crowns use an angular four-ring hull. This reads as a broad,
 * irregular deciduous canopy while avoiding the familiar stack of spheres.
 */
function createCanopyGeometry(): THREE.BufferGeometry {
  const raw: RawGeometry = { positions: [], uvs: [] };
  const segmentCount = 7;
  const rings = [
    { y: -0.5, radius: 0.38, offset: 0 },
    { y: -0.24, radius: 0.84, offset: 0.16 },
    { y: 0.2, radius: 1, offset: -0.08 },
    { y: 0.5, radius: 0.2, offset: 0.1 },
  ] as const;
  const ringPoints = rings.map((ring, ringIndex) => {
    const points: Point3[] = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2 + ring.offset;
      const irregularity = 0.94
        + ((index * 5 + ringIndex * 3) % segmentCount) * 0.018;
      points.push([
        Math.cos(angle) * ring.radius * irregularity,
        ring.y,
        Math.sin(angle) * ring.radius * irregularity,
      ]);
    }
    return points;
  });

  for (let ringIndex = 0; ringIndex < ringPoints.length - 1; ringIndex += 1) {
    const lower = ringPoints[ringIndex];
    const upper = ringPoints[ringIndex + 1];
    if (lower === undefined || upper === undefined) {
      continue;
    }
    for (let index = 0; index < segmentCount; index += 1) {
      const nextIndex = (index + 1) % segmentCount;
      const lowerCurrent = lower[index];
      const lowerNext = lower[nextIndex];
      const upperCurrent = upper[index];
      const upperNext = upper[nextIndex];
      if (
        lowerCurrent === undefined
        || lowerNext === undefined
        || upperCurrent === undefined
        || upperNext === undefined
      ) {
        continue;
      }
      addQuad(raw, lowerCurrent, upperCurrent, upperNext, lowerNext);
    }
  }

  const bottom = ringPoints[0];
  const top = ringPoints[ringPoints.length - 1];
  if (bottom !== undefined && top !== undefined) {
    for (let index = 0; index < segmentCount; index += 1) {
      const nextIndex = (index + 1) % segmentCount;
      const bottomCurrent = bottom[index];
      const bottomNext = bottom[nextIndex];
      const topCurrent = top[index];
      const topNext = top[nextIndex];
      if (
        bottomCurrent === undefined
        || bottomNext === undefined
        || topCurrent === undefined
        || topNext === undefined
      ) {
        continue;
      }
      addTriangle(raw, [0, -0.54, 0], bottomCurrent, bottomNext);
      addTriangle(raw, [0, 0.56, 0], topNext, topCurrent);
    }
  }
  return finishRawGeometry(raw);
}

function createBaseGeometry(kind: GeometryKind): THREE.BufferGeometry {
  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'canopy':
      return createCanopyGeometry();
    case 'cylinder-6':
      return new THREE.CylinderGeometry(0.5, 0.62, 1, 6);
    case 'cylinder-8':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    case 'gable-prism':
      return createGablePrismGeometry();
    case 'hip-roof':
      return createHipRoofGeometry();
    case 'cone-8':
      return new THREE.ConeGeometry(0.5, 1, 8);
  }
}

function asTownPropKind(kind: WorldItemRecord['kind']): TownPropKind {
  switch (kind) {
    case 'tree':
    case 'fence':
    case 'car':
    case 'utility-pole':
    case 'mailbox':
    case 'road-sign':
    case 'hydrant':
    case 'field-prop':
      return kind;
    case 'building':
    case 'road':
      throw new Error(`District props cannot contain an item of kind "${kind}".`);
  }
}

export class TownRenderer {
  readonly object = new THREE.Group();

  private readonly atlas: MaterialAtlas;
  private readonly buildingCount: number;
  private readonly propCount: number;
  private readonly pendingBatches = new Map<string, PendingBatch>();
  private readonly batches: RuntimeBatch[] = [];
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly mutableBuildingHandles = new Map<
    string,
    TownBuildingComponentHandle[]
  >();
  private readonly buildingHandles = new Map<string, TownBuildingHandle>();
  private detailScale = 1;
  private disposed = false;

  constructor(district: DioramaDistrictData, atlas: MaterialAtlas) {
    this.atlas = atlas;
    this.buildingCount = district.buildings.length;
    this.propCount = district.props.length;
    this.object.name = `TownRenderer:${district.descriptor.id}`;

    try {
      this.validateDistrict(district);
      for (const building of district.buildings) {
        this.mutableBuildingHandles.set(building.item.id, []);
        this.createBuilding(building);
      }
      for (const prop of district.props) {
        this.createProp(prop);
      }
      this.createInstancedBatches();
      this.finalizeBuildingHandles();
      this.applyDetailScale(1);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /**
   * Scales optional component coverage without reallocating or reordering a
   * batch. Core walls, roofs, openings, and one readable form for every prop
   * remain present even when the detail scale reaches zero.
   */
  applyDetailScale(scale: number): void {
    if (this.disposed) {
      return;
    }
    this.detailScale = Number.isFinite(scale)
      ? clamp(scale, 0, MAX_DETAIL_SCALE)
      : 1;

    for (const batch of this.batches) {
      const coverage = this.getDetailCoverage(batch.detail);
      const groupCount = Math.round(batch.detailGroupEnds.length * coverage);
      const visibleCount = groupCount <= 0
        ? 0
        : batch.detailGroupEnds[groupCount - 1] ?? batch.capacity;
      batch.mesh.count = batch.detail === 'core'
        ? batch.capacity
        : visibleCount;
      batch.mesh.visible = batch.mesh.count > 0;
    }
  }

  getBuildingHandle(buildingId: string): TownBuildingHandle | undefined {
    return this.buildingHandles.get(buildingId);
  }

  getDiagnostics(): TownRendererDiagnostics {
    let instanceCapacity = 0;
    let visibleInstanceCount = 0;
    let coreInstanceCount = 0;
    for (const batch of this.batches) {
      instanceCapacity += batch.capacity;
      visibleInstanceCount += batch.mesh.count;
      if (batch.detail === 'core') {
        coreInstanceCount += batch.capacity;
      }
    }

    return {
      buildingCount: this.buildingCount,
      propCount: this.propCount,
      buildingHandleCount: this.buildingHandles.size,
      batchCount: this.batches.length,
      instanceCapacity,
      visibleInstanceCount,
      coreInstanceCount,
      optionalInstanceCount: instanceCapacity - coreInstanceCount,
      detailScale: this.detailScale,
      disposed: this.disposed,
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const batch of this.batches) {
      batch.mesh.dispose();
    }
    for (const geometry of this.geometries.values()) {
      geometry.dispose();
    }
    this.object.clear();
    this.batches.length = 0;
    this.geometries.clear();
    this.pendingBatches.clear();
    this.mutableBuildingHandles.clear();
    this.buildingHandles.clear();
  }

  private validateDistrict(district: DioramaDistrictData): void {
    if (district.buildings.length > MAX_BUILDINGS) {
      throw new Error(
        `TownRenderer supports at most ${MAX_BUILDINGS} authored buildings; `
        + `received ${district.buildings.length}.`,
      );
    }
    if (district.props.length > MAX_PROPS) {
      throw new Error(
        `TownRenderer supports at most ${MAX_PROPS} props; `
        + `received ${district.props.length}.`,
      );
    }

    const itemIds = new Set<string>();
    for (const building of district.buildings) {
      if (itemIds.has(building.item.id)) {
        throw new Error(`Duplicate town item id "${building.item.id}".`);
      }
      itemIds.add(building.item.id);
    }

    const propCounts = new Map<TownPropKind, number>();
    for (const prop of district.props) {
      if (itemIds.has(prop.id)) {
        throw new Error(`Duplicate town item id "${prop.id}".`);
      }
      itemIds.add(prop.id);
      const propKind = asTownPropKind(prop.kind);
      const nextCount = (propCounts.get(propKind) ?? 0) + 1;
      propCounts.set(propKind, nextCount);
      if (nextCount > PROP_LIMITS[propKind]) {
        throw new Error(
          `TownRenderer ${propKind} capacity is ${PROP_LIMITS[propKind]}; `
          + `received at least ${nextCount}.`,
        );
      }
    }
  }

  private createBuilding(building: BuildingRecord): void {
    const itemScale = Math.max(0.01, building.item.scale);
    const width = building.definition.footprint.width * itemScale;
    const depth = building.definition.footprint.depth * itemScale;
    const wallHeight = building.definition.height * itemScale;
    const foundationHeight = FOUNDATION_HEIGHT * itemScale;
    const wallBottom = foundationHeight * 0.68;
    const roofBase = wallBottom + wallHeight;
    const wallMaterial = wallMaterialName(building.definition.material);
    const wallTint = pickCycled(
      WALL_TINTS[building.definition.material],
      building.paletteIndex,
    );
    const roofMaterial = roofMaterialName(building.definition.roof.material);
    const roofTint = pickCycled(
      ROOF_TINTS[building.definition.roof.material],
      building.paletteIndex,
    );

    this.addBuildingComponent(
      building,
      'foundation',
      createBatchSpec('box', 'concrete', 'core', false, true),
      {
        x: 0,
        y: foundationHeight * 0.5,
        z: 0,
        scaleX: width + itemScale * 0.8,
        scaleY: foundationHeight,
        scaleZ: depth + itemScale * 0.8,
      },
      0xe5e1d5,
      `${building.item.id}:foundation`,
    );
    this.addBuildingComponent(
      building,
      'wall-shell',
      createBatchSpec('box', wallMaterial, 'core'),
      {
        x: 0,
        y: wallBottom + wallHeight * 0.5,
        z: 0,
        scaleX: width,
        scaleY: wallHeight,
        scaleZ: depth,
      },
      wallTint,
      `${building.item.id}:shell`,
    );

    const roofRise = this.createRoof(
      building,
      width,
      depth,
      roofBase,
      wallMaterial,
      wallTint,
      roofMaterial,
      roofTint,
      itemScale,
    );
    this.createBuildingFacade(
      building,
      width,
      depth,
      wallBottom,
      wallHeight,
      roofBase,
      itemScale,
    );
    this.createBuildingDetails(
      building,
      width,
      depth,
      roofBase,
      roofRise,
      itemScale,
    );
  }

  private createRoof(
    building: BuildingRecord,
    width: number,
    depth: number,
    roofBase: number,
    wallMaterial: TownMaterialName,
    wallTint: THREE.ColorRepresentation,
    roofMaterial: TownMaterialName,
    roofTint: THREE.ColorRepresentation,
    itemScale: number,
  ): number {
    const roof = building.definition.roof;
    const overhang = (
      building.definition.archetype === 'warehouse'
      || building.definition.archetype === 'school'
    )
      ? 1.05 * itemScale
      : 0.68 * itemScale;
    const thickness = Math.max(0.34, 0.46 * itemScale);

    if (roof.shape === 'gable') {
      const halfRun = depth * 0.5 + overhang;
      const rise = Math.max(0.5 * itemScale, halfRun * roof.pitch);
      const angle = Math.atan2(rise, halfRun);
      const slopeLength = Math.hypot(halfRun, rise) + 0.12 * itemScale;

      this.addBuildingComponent(
        building,
        'gable-fill',
        createBatchSpec('gable-prism', wallMaterial, 'core'),
        {
          x: 0,
          y: roofBase,
          z: 0,
          scaleX: width,
          scaleY: rise,
          scaleZ: depth,
        },
        wallTint,
        `${building.item.id}:gable-fill`,
      );
      for (const side of [-1, 1] as const) {
        this.addBuildingComponent(
          building,
          'roof',
          createBatchSpec('box', roofMaterial, 'core'),
          {
            x: 0,
            y: roofBase + rise * 0.5 + thickness * 0.16,
            z: side * halfRun * 0.5,
            scaleX: width + overhang * 2,
            scaleY: thickness,
            scaleZ: slopeLength,
            rotationX: side * angle,
          },
          roofTint,
          `${building.item.id}:roof`,
        );
      }
      return rise;
    }

    if (roof.shape === 'hip') {
      const halfRun = depth * 0.5 + overhang;
      const rise = Math.max(0.55 * itemScale, halfRun * roof.pitch);
      this.addBuildingComponent(
        building,
        'roof',
        createBatchSpec('hip-roof', roofMaterial, 'core'),
        {
          x: 0,
          y: roofBase - thickness,
          z: 0,
          scaleX: width + overhang * 2,
          scaleY: rise + thickness,
          scaleZ: depth + overhang * 2,
        },
        roofTint,
        `${building.item.id}:roof`,
      );
      return rise;
    }

    const slabThickness = Math.max(0.45, 0.62 * itemScale);
    this.addBuildingComponent(
      building,
      'roof',
      createBatchSpec('box', roofMaterial, 'core'),
      {
        x: 0,
        y: roofBase + slabThickness * 0.5,
        z: 0,
        scaleX: width + overhang * 2,
        scaleY: slabThickness,
        scaleZ: depth + overhang * 2,
      },
      roofTint,
      `${building.item.id}:roof`,
    );

    const parapetHeight = 0.62 * itemScale;
    const parapetThickness = 0.28 * itemScale;
    const parapetY = roofBase + slabThickness + parapetHeight * 0.5;
    const parapetOwner = `${building.item.id}:parapet`;
    for (const side of [-1, 1] as const) {
      this.addBuildingComponent(
        building,
        'parapet',
        createBatchSpec('box', roofMaterial, 'standard'),
        {
          x: 0,
          y: parapetY,
          z: side * (depth * 0.5 + overhang * 0.7),
          scaleX: width + overhang * 1.4,
          scaleY: parapetHeight,
          scaleZ: parapetThickness,
        },
        roofTint,
        parapetOwner,
      );
      this.addBuildingComponent(
        building,
        'parapet',
        createBatchSpec('box', roofMaterial, 'standard'),
        {
          x: side * (width * 0.5 + overhang * 0.7),
          y: parapetY,
          z: 0,
          scaleX: parapetThickness,
          scaleY: parapetHeight,
          scaleZ: depth + overhang * 1.4,
        },
        roofTint,
        parapetOwner,
      );
    }
    return slabThickness;
  }

  private createBuildingFacade(
    building: BuildingRecord,
    width: number,
    depth: number,
    wallBottom: number,
    wallHeight: number,
    roofBase: number,
    itemScale: number,
  ): void {
    const frontZ = depth * 0.5;
    const archetype = building.definition.archetype;

    switch (archetype) {
      case 'ranch':
      case 'two-story':
      case 'duplex':
      case 'manufactured':
        this.createResidentialFacade(
          building,
          width,
          depth,
          wallBottom,
          wallHeight,
          itemScale,
        );
        return;
      case 'school':
        this.createSchoolFacade(
          building,
          width,
          frontZ,
          wallBottom,
          wallHeight,
          itemScale,
        );
        return;
      case 'fire-station':
        this.createFireStationFacade(
          building,
          width,
          frontZ,
          wallBottom,
          itemScale,
        );
        return;
      case 'convenience-store':
      case 'strip-shop':
        this.createStorefrontFacade(
          building,
          width,
          frontZ,
          wallBottom,
          archetype === 'strip-shop' ? 6 : 4,
          itemScale,
        );
        return;
      case 'warehouse':
        this.createWarehouseFacade(
          building,
          width,
          frontZ,
          wallBottom,
          wallHeight,
          itemScale,
        );
        return;
      case 'barn':
        this.createBarnFacade(
          building,
          frontZ,
          wallBottom,
          wallHeight,
          itemScale,
        );
        return;
      case 'utility':
        this.createUtilityBuildingFacade(
          building,
          width,
          frontZ,
          wallBottom,
          itemScale,
        );
        return;
    }

    // Keep roofBase in this signature as the facade/roof seam evolves.
    void roofBase;
  }

  private createResidentialFacade(
    building: BuildingRecord,
    width: number,
    depth: number,
    wallBottom: number,
    wallHeight: number,
    itemScale: number,
  ): void {
    const frontZ = depth * 0.5;
    const openingY = wallBottom + 1.72 * itemScale;
    const windowWidth = 1.45 * itemScale;
    const windowHeight = 1.35 * itemScale;
    const isDuplex = building.definition.archetype === 'duplex';
    const doorPositions = isDuplex
      ? [-width * 0.11, width * 0.11]
      : [0];
    const windowPositions = isDuplex || width < 20 * itemScale
      ? [-width * 0.31, width * 0.31]
      : [-width * 0.37, -width * 0.18, width * 0.18, width * 0.37];

    for (const [index, x] of windowPositions.entries()) {
      this.addFramedOpening(
        building,
        'window',
        {
          x,
          y: openingY,
          z: frontZ,
          width: windowWidth,
          height: windowHeight,
          faceRotationY: 0,
          detail: 'core',
        },
        `${building.item.id}:front-window-${index}`,
      );
    }
    for (const [index, x] of doorPositions.entries()) {
      this.addFramedOpening(
        building,
        'door',
        {
          x,
          y: wallBottom + 1.14 * itemScale,
          z: frontZ,
          width: 1.08 * itemScale,
          height: 2.28 * itemScale,
          faceRotationY: 0,
          detail: 'core',
        },
        `${building.item.id}:front-door-${index}`,
      );
    }

    if (building.definition.stories > 1) {
      const upperY = wallBottom + wallHeight * 0.7;
      for (const [index, x] of [
        -width * 0.3,
        0,
        width * 0.3,
      ].entries()) {
        this.addFramedOpening(
          building,
          'window',
          {
            x,
            y: upperY,
            z: frontZ,
            width: windowWidth,
            height: windowHeight,
            faceRotationY: 0,
            detail: 'core',
          },
          `${building.item.id}:upper-window-${index}`,
        );
      }
    }

    // Side windows are useful at closer quality levels but do not carry the
    // building's silhouette or human scale at a distance.
    const sideWindowY = openingY + (
      building.definition.stories > 1 ? wallHeight * 0.18 : 0
    );
    this.addFramedOpening(
      building,
      'window',
      {
        x: width * 0.5,
        y: sideWindowY,
        z: 0,
        width: windowWidth,
        height: windowHeight,
        faceRotationY: -Math.PI * 0.5,
        detail: 'standard',
      },
      `${building.item.id}:right-window`,
    );
    this.addFramedOpening(
      building,
      'window',
      {
        x: -width * 0.5,
        y: sideWindowY,
        z: 0,
        width: windowWidth,
        height: windowHeight,
        faceRotationY: Math.PI * 0.5,
        detail: 'standard',
      },
      `${building.item.id}:left-window`,
    );
  }

  private createSchoolFacade(
    building: BuildingRecord,
    width: number,
    frontZ: number,
    wallBottom: number,
    wallHeight: number,
    itemScale: number,
  ): void {
    const windowWidth = 2.2 * itemScale;
    const windowHeight = 1.6 * itemScale;
    const positions = [-0.39, -0.26, -0.13, 0.13, 0.26, 0.39];
    for (const [rowIndex, y] of [
      wallBottom + wallHeight * 0.34,
      wallBottom + wallHeight * 0.72,
    ].entries()) {
      for (const [index, amount] of positions.entries()) {
        this.addFramedOpening(
          building,
          'window',
          {
            x: width * amount,
            y,
            z: frontZ,
            width: windowWidth,
            height: windowHeight,
            faceRotationY: 0,
            detail: rowIndex === 0 ? 'core' : 'standard',
          },
          `${building.item.id}:school-window-${rowIndex}-${index}`,
        );
      }
    }
    this.addFramedOpening(
      building,
      'door',
      {
        x: 0,
        y: wallBottom + 1.35 * itemScale,
        z: frontZ,
        width: 2.7 * itemScale,
        height: 2.7 * itemScale,
        faceRotationY: 0,
        detail: 'core',
      },
      `${building.item.id}:school-entry`,
    );
  }

  private createFireStationFacade(
    building: BuildingRecord,
    width: number,
    frontZ: number,
    wallBottom: number,
    itemScale: number,
  ): void {
    for (const [index, amount] of [-0.27, 0, 0.27].entries()) {
      this.addFramedOpening(
        building,
        'garage-door',
        {
          x: width * amount,
          y: wallBottom + 2.9 * itemScale,
          z: frontZ,
          width: 7.2 * itemScale,
          height: 5.8 * itemScale,
          faceRotationY: 0,
          detail: 'core',
        },
        `${building.item.id}:apparatus-bay-${index}`,
      );
    }
  }

  private createStorefrontFacade(
    building: BuildingRecord,
    width: number,
    frontZ: number,
    wallBottom: number,
    bayCount: number,
    itemScale: number,
  ): void {
    const baySpacing = width / (bayCount + 0.7);
    const bayWidth = baySpacing * 0.72;
    for (let index = 0; index < bayCount; index += 1) {
      const x = (index - (bayCount - 1) * 0.5) * baySpacing;
      const isDoor = index === Math.floor(bayCount * 0.5);
      this.addFramedOpening(
        building,
        isDoor ? 'door' : 'window',
        {
          x,
          y: wallBottom + (isDoor ? 1.55 : 1.9) * itemScale,
          z: frontZ,
          width: isDoor ? 1.25 * itemScale : bayWidth,
          height: isDoor ? 3.1 * itemScale : 2.7 * itemScale,
          faceRotationY: 0,
          detail: 'core',
        },
        `${building.item.id}:storefront-${index}`,
      );
    }
  }

  private createWarehouseFacade(
    building: BuildingRecord,
    width: number,
    frontZ: number,
    wallBottom: number,
    wallHeight: number,
    itemScale: number,
  ): void {
    for (const [index, amount] of [-0.27, 0, 0.27].entries()) {
      this.addFramedOpening(
        building,
        'garage-door',
        {
          x: width * amount,
          y: wallBottom + 3.25 * itemScale,
          z: frontZ,
          width: 9 * itemScale,
          height: 6.5 * itemScale,
          faceRotationY: 0,
          detail: 'core',
        },
        `${building.item.id}:loading-door-${index}`,
      );
    }
    for (const [index, amount] of [-0.36, 0.36].entries()) {
      this.addFramedOpening(
        building,
        'window',
        {
          x: width * amount,
          y: wallBottom + wallHeight * 0.72,
          z: frontZ,
          width: 2.4 * itemScale,
          height: 1.4 * itemScale,
          faceRotationY: 0,
          detail: 'standard',
        },
        `${building.item.id}:warehouse-window-${index}`,
      );
    }
  }

  private createBarnFacade(
    building: BuildingRecord,
    frontZ: number,
    wallBottom: number,
    wallHeight: number,
    itemScale: number,
  ): void {
    this.addFramedOpening(
      building,
      'garage-door',
      {
        x: 0,
        y: wallBottom + 3.4 * itemScale,
        z: frontZ,
        width: 6.4 * itemScale,
        height: 6.8 * itemScale,
        faceRotationY: 0,
        detail: 'core',
      },
      `${building.item.id}:barn-door`,
    );
    this.addFramedOpening(
      building,
      'window',
      {
        x: 0,
        y: wallBottom + wallHeight * 0.78,
        z: frontZ,
        width: 1.5 * itemScale,
        height: 1.5 * itemScale,
        faceRotationY: 0,
        detail: 'standard',
      },
      `${building.item.id}:loft-window`,
    );
  }

  private createUtilityBuildingFacade(
    building: BuildingRecord,
    width: number,
    frontZ: number,
    wallBottom: number,
    itemScale: number,
  ): void {
    this.addFramedOpening(
      building,
      'door',
      {
        x: 0,
        y: wallBottom + 1.2 * itemScale,
        z: frontZ,
        width: 1.2 * itemScale,
        height: 2.4 * itemScale,
        faceRotationY: 0,
        detail: 'core',
      },
      `${building.item.id}:utility-door`,
    );
    for (const [index, x] of [-width * 0.3, width * 0.3].entries()) {
      this.addFramedOpening(
        building,
        'window',
        {
          x,
          y: wallBottom + 1.8 * itemScale,
          z: frontZ,
          width: 1.2 * itemScale,
          height: 1.2 * itemScale,
          faceRotationY: 0,
          detail: 'standard',
        },
        `${building.item.id}:utility-window-${index}`,
      );
    }
  }

  private addFramedOpening(
    building: BuildingRecord,
    component: 'window' | 'door' | 'garage-door',
    opening: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly width: number;
      readonly height: number;
      readonly faceRotationY: number;
      readonly detail: DetailBand;
    },
    ownerId: string,
  ): void {
    const panelMaterial: TownMaterialName = component === 'window'
      ? 'glass'
      : component === 'garage-door'
        ? 'metal'
        : 'paint';
    const panelTint = component === 'window'
      ? 0xcfe5e3
      : component === 'garage-door'
        ? 0xd7dad4
        : 0xf0e7d1;
    const panelDepth = 0.1;
    const frameDepth = 0.2;
    const frameDetail: DetailBand = component === 'window'
      ? 'fine'
      : opening.detail;
    const frameThickness = clamp(
      Math.min(opening.width, opening.height) * 0.09,
      0.11,
      0.22,
    );
    const normalOffsetX = -Math.sin(opening.faceRotationY);
    const normalOffsetZ = Math.cos(opening.faceRotationY);
    const panelCenterX = opening.x + normalOffsetX * 0.035;
    const panelCenterZ = opening.z + normalOffsetZ * 0.035;

    this.addBuildingComponent(
      building,
      component,
      createBatchSpec('box', panelMaterial, opening.detail, false, true),
      {
        x: panelCenterX,
        y: opening.y,
        z: panelCenterZ,
        scaleX: opening.width,
        scaleY: opening.height,
        scaleZ: panelDepth,
        rotationY: opening.faceRotationY,
      },
      panelTint,
      ownerId,
    );

    const horizontalAxisX = Math.cos(opening.faceRotationY);
    const horizontalAxisZ = Math.sin(opening.faceRotationY);
    const frameCenterX = opening.x + normalOffsetX * 0.12;
    const frameCenterZ = opening.z + normalOffsetZ * 0.12;
    for (const side of [-1, 1] as const) {
      const horizontalOffset = side * (
        opening.width * 0.5 + frameThickness * 0.5
      );
      this.addBuildingComponent(
        building,
        'opening-frame',
        createBatchSpec('box', 'paint', frameDetail, false, true),
        {
          x: frameCenterX + horizontalAxisX * horizontalOffset,
          y: opening.y,
          z: frameCenterZ + horizontalAxisZ * horizontalOffset,
          scaleX: frameThickness,
          scaleY: opening.height + frameThickness * 2,
          scaleZ: frameDepth,
          rotationY: opening.faceRotationY,
        },
        0xeee7d5,
        ownerId,
      );
      this.addBuildingComponent(
        building,
        'opening-frame',
        createBatchSpec('box', 'paint', frameDetail, false, true),
        {
          x: frameCenterX,
          y: opening.y + side * (
            opening.height * 0.5 + frameThickness * 0.5
          ),
          z: frameCenterZ,
          scaleX: opening.width,
          scaleY: frameThickness,
          scaleZ: frameDepth,
          rotationY: opening.faceRotationY,
        },
        0xeee7d5,
        ownerId,
      );
    }
  }

  private createBuildingDetails(
    building: BuildingRecord,
    width: number,
    depth: number,
    roofBase: number,
    roofRise: number,
    itemScale: number,
  ): void {
    const archetype = building.definition.archetype;
    const isStorefront = archetype === 'convenience-store'
      || archetype === 'strip-shop';
    const needsSign = isStorefront
      || archetype === 'school'
      || archetype === 'fire-station';

    if (needsSign) {
      this.addBuildingComponent(
        building,
        'facade-sign',
        createBatchSpec('box', 'paint', 'core', false, true),
        {
          x: 0,
          y: roofBase - 1.05 * itemScale,
          z: depth * 0.5 + 0.16 * itemScale,
          scaleX: Math.min(width * 0.62, 18 * itemScale),
          scaleY: 0.95 * itemScale,
          scaleZ: 0.24 * itemScale,
        },
        archetype === 'fire-station' ? 0xd88976 : 0xf0d38a,
        `${building.item.id}:sign`,
      );
    }

    if (isStorefront) {
      this.addBuildingComponent(
        building,
        'awning',
        createBatchSpec('box', 'metal', 'standard'),
        {
          x: 0,
          y: roofBase - 2.45 * itemScale,
          z: depth * 0.5 + 0.9 * itemScale,
          scaleX: width * 0.82,
          scaleY: 0.22 * itemScale,
          scaleZ: 1.8 * itemScale,
          rotationX: -0.1,
        },
        0xd4ddd6,
        `${building.item.id}:awning`,
      );
    }

    if (building.definition.roof.shape === 'flat') {
      this.addBuildingComponent(
        building,
        'roof-equipment',
        createBatchSpec('box', 'metal', 'fine'),
        {
          x: width * 0.18,
          y: roofBase + roofRise + 0.72 * itemScale,
          z: -depth * 0.12,
          scaleX: 2.2 * itemScale,
          scaleY: 1.35 * itemScale,
          scaleZ: 1.8 * itemScale,
        },
        0xd5ddd9,
        `${building.item.id}:roof-equipment`,
      );
      return;
    }

    if (
      archetype === 'ranch'
      || archetype === 'two-story'
      || archetype === 'duplex'
    ) {
      this.addBuildingComponent(
        building,
        'chimney',
        createBatchSpec('box', 'brick', 'fine'),
        {
          x: width * 0.24,
          y: roofBase + roofRise * 0.62,
          z: -depth * 0.1,
          scaleX: 0.82 * itemScale,
          scaleY: Math.max(1.7 * itemScale, roofRise * 0.75),
          scaleZ: 0.82 * itemScale,
        },
        0xe0c2b3,
        `${building.item.id}:chimney`,
      );
    }
  }

  private createProp(prop: WorldItemRecord): void {
    const propKind = asTownPropKind(prop.kind);
    switch (propKind) {
      case 'tree':
        this.createTree(prop);
        return;
      case 'fence':
        this.createFence(prop);
        return;
      case 'car':
        this.createCar(prop);
        return;
      case 'utility-pole':
        this.createUtilityPole(prop);
        return;
      case 'mailbox':
        this.createMailbox(prop);
        return;
      case 'road-sign':
        this.createRoadSign(prop);
        return;
      case 'hydrant':
        this.createHydrant(prop);
        return;
      case 'field-prop':
        this.createFieldProp(prop);
        return;
    }
  }

  private createTree(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    const isTall = prop.variant.includes('tall');
    const trunkHeight = (isTall ? 13.5 : 10.5) * scale;
    const crownHeight = (isTall ? 11 : 8.6) * scale;
    const crownWidth = (isTall ? 7.2 : 6.4) * scale;
    const tintIndex = hashString(prop.id) % FOLIAGE_TINTS.length;
    const crownTint = pickCycled(FOLIAGE_TINTS, tintIndex);

    this.addPropComponent(
      prop,
      'tree-trunk',
      createBatchSpec('cylinder-6', 'bark', 'core'),
      {
        x: 0,
        y: trunkHeight * 0.5,
        z: 0,
        scaleX: 0.75 * scale,
        scaleY: trunkHeight,
        scaleZ: 0.75 * scale,
      },
      0xe1d0bb,
      `${prop.id}:trunk`,
    );
    this.addPropComponent(
      prop,
      'tree-crown',
      createBatchSpec('canopy', 'foliage', 'core'),
      {
        x: 0,
        y: trunkHeight + crownHeight * 0.12,
        z: 0,
        scaleX: crownWidth,
        scaleY: crownHeight,
        scaleZ: crownWidth * 0.88,
        rotationY: (hashString(`${prop.id}:crown`) % 628) / 100,
      },
      crownTint,
      `${prop.id}:crown`,
    );

    const side = hashString(`${prop.id}:side`) % 2 === 0 ? -1 : 1;
    this.addPropComponent(
      prop,
      'tree-crown-secondary',
      createBatchSpec('canopy', 'foliage', 'standard'),
      {
        x: side * crownWidth * 0.24,
        y: trunkHeight + crownHeight * 0.05,
        z: crownWidth * 0.16,
        scaleX: crownWidth * 0.58,
        scaleY: crownHeight * 0.65,
        scaleZ: crownWidth * 0.52,
        rotationY: (hashString(`${prop.id}:secondary`) % 628) / 100,
      },
      pickCycled(FOLIAGE_TINTS, tintIndex + 1),
      `${prop.id}:secondary-crown`,
    );
    this.addPropComponent(
      prop,
      'tree-crown-tertiary',
      createBatchSpec('canopy', 'foliage', 'fine'),
      {
        x: -side * crownWidth * 0.22,
        y: trunkHeight + crownHeight * 0.23,
        z: -crownWidth * 0.15,
        scaleX: crownWidth * 0.48,
        scaleY: crownHeight * 0.56,
        scaleZ: crownWidth * 0.46,
        rotationY: (hashString(`${prop.id}:tertiary`) % 628) / 100,
      },
      pickCycled(FOLIAGE_TINTS, tintIndex + 2),
      `${prop.id}:tertiary-crown`,
    );
  }

  private createFence(prop: WorldItemRecord): void {
    const railLength = 4 * Math.max(0.1, prop.scale);
    this.addPropComponent(
      prop,
      'fence-post',
      createBatchSpec('cylinder-6', 'wood', 'standard'),
      {
        x: 0,
        y: 1.05,
        z: 0,
        scaleX: 0.24,
        scaleY: 2.1,
        scaleZ: 0.24,
      },
      0xe0cfb5,
      `${prop.id}:post`,
    );
    this.addPropComponent(
      prop,
      'fence-rail',
      createBatchSpec('box', 'wood', 'standard'),
      {
        x: 0,
        y: 1.48,
        z: 0,
        scaleX: 0.15,
        scaleY: 0.15,
        scaleZ: railLength,
      },
      0xddc9aa,
      `${prop.id}:top-rail`,
    );
    this.addPropComponent(
      prop,
      'fence-rail-lower',
      createBatchSpec('box', 'wood', 'fine'),
      {
        x: 0,
        y: 0.72,
        z: 0,
        scaleX: 0.14,
        scaleY: 0.14,
        scaleZ: railLength,
      },
      0xd4c09f,
      `${prop.id}:lower-rail`,
    );
  }

  private createCar(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    const tint = pickCycled(CAR_TINTS, hashString(prop.variant));

    this.addPropComponent(
      prop,
      'car-body',
      createBatchSpec('box', 'paint', 'core'),
      {
        x: 0,
        y: 0.62 * scale,
        z: 0,
        scaleX: 1.9 * scale,
        scaleY: 0.7 * scale,
        scaleZ: 4.35 * scale,
      },
      tint,
      `${prop.id}:body`,
    );
    this.addPropComponent(
      prop,
      'car-cabin',
      createBatchSpec('box', 'glass', 'core'),
      {
        x: 0,
        y: 1.2 * scale,
        z: -0.2 * scale,
        scaleX: 1.58 * scale,
        scaleY: 0.72 * scale,
        scaleZ: 2.15 * scale,
      },
      0xb8ced0,
      `${prop.id}:cabin`,
    );

    const wheelOwner = `${prop.id}:wheels`;
    for (const x of [-0.92, 0.92]) {
      for (const z of [-1.35, 1.35]) {
        this.addPropComponent(
          prop,
          'car-wheel',
          createBatchSpec('cylinder-8', 'roof-dark', 'standard'),
          {
            x: x * scale,
            y: 0.38 * scale,
            z: z * scale,
            scaleX: 0.7 * scale,
            scaleY: 0.28 * scale,
            scaleZ: 0.7 * scale,
            rotationZ: Math.PI * 0.5,
          },
          0xbfc0b8,
          wheelOwner,
        );
      }
    }
    for (const z of [-2.2, 2.2]) {
      this.addPropComponent(
        prop,
        'car-bumper',
        createBatchSpec('box', 'metal', 'fine', false, true),
        {
          x: 0,
          y: 0.48 * scale,
          z: z * scale,
          scaleX: 1.72 * scale,
          scaleY: 0.16 * scale,
          scaleZ: 0.15 * scale,
        },
        0xe0e4df,
        `${prop.id}:bumpers`,
      );
    }
  }

  private createUtilityPole(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    const height = 9.5 * scale;
    this.addPropComponent(
      prop,
      'utility-pole',
      createBatchSpec('cylinder-6', 'bark', 'core'),
      {
        x: 0,
        y: height * 0.5,
        z: 0,
        scaleX: 0.34 * scale,
        scaleY: height,
        scaleZ: 0.34 * scale,
      },
      0xd8c5ad,
      `${prop.id}:pole`,
    );
    this.addPropComponent(
      prop,
      'utility-crossarm',
      createBatchSpec('box', 'wood', 'standard'),
      {
        x: 0,
        y: height - 0.7 * scale,
        z: 0,
        scaleX: 3.4 * scale,
        scaleY: 0.22 * scale,
        scaleZ: 0.24 * scale,
      },
      0xd6c1a2,
      `${prop.id}:crossarm`,
    );
    for (const x of [-1.25, 0, 1.25]) {
      this.addPropComponent(
        prop,
        'utility-insulator',
        createBatchSpec('cylinder-8', 'paint', 'fine', false, true),
        {
          x: x * scale,
          y: height - 0.42 * scale,
          z: 0,
          scaleX: 0.16 * scale,
          scaleY: 0.38 * scale,
          scaleZ: 0.16 * scale,
        },
        0xdce7e2,
        `${prop.id}:insulators`,
      );
    }
  }

  private createMailbox(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    this.addPropComponent(
      prop,
      'mailbox-post',
      createBatchSpec('box', 'wood', 'standard', false, true),
      {
        x: 0,
        y: 0.7 * scale,
        z: 0,
        scaleX: 0.13 * scale,
        scaleY: 1.4 * scale,
        scaleZ: 0.13 * scale,
      },
      0xd6c1a3,
      `${prop.id}:post`,
    );
    this.addPropComponent(
      prop,
      'mailbox-box',
      createBatchSpec('box', 'metal', 'standard', false, true),
      {
        x: 0,
        y: 1.52 * scale,
        z: 0.18 * scale,
        scaleX: 0.58 * scale,
        scaleY: 0.5 * scale,
        scaleZ: 0.95 * scale,
      },
      0xdce1db,
      `${prop.id}:box`,
    );
    this.addPropComponent(
      prop,
      'mailbox-flag',
      createBatchSpec('box', 'paint', 'fine', false, true),
      {
        x: 0.38 * scale,
        y: 1.78 * scale,
        z: 0.2 * scale,
        scaleX: 0.08 * scale,
        scaleY: 0.55 * scale,
        scaleZ: 0.08 * scale,
      },
      0xdc8676,
      `${prop.id}:flag`,
    );
  }

  private createRoadSign(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    const isWarning = prop.variant === 'warning';
    this.addPropComponent(
      prop,
      'road-sign-post',
      createBatchSpec('cylinder-8', 'metal', 'standard', false, true),
      {
        x: 0,
        y: 1.45 * scale,
        z: 0,
        scaleX: 0.12 * scale,
        scaleY: 2.9 * scale,
        scaleZ: 0.12 * scale,
      },
      0xdfe3df,
      `${prop.id}:post`,
    );
    this.addPropComponent(
      prop,
      'road-sign-plate',
      createBatchSpec('box', 'marking', 'standard', false, true),
      {
        x: 0,
        y: 2.9 * scale,
        z: 0,
        scaleX: (isWarning ? 0.82 : 1.55) * scale,
        scaleY: (isWarning ? 0.82 : 0.5) * scale,
        scaleZ: 0.1 * scale,
        rotationZ: isWarning ? Math.PI * 0.25 : 0,
      },
      isWarning ? 0xf3cf75 : 0xdce4d8,
      `${prop.id}:plate`,
    );
  }

  private createHydrant(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    this.addPropComponent(
      prop,
      'hydrant-body',
      createBatchSpec('cylinder-8', 'paint', 'standard', false, true),
      {
        x: 0,
        y: 0.58 * scale,
        z: 0,
        scaleX: 0.5 * scale,
        scaleY: 1.16 * scale,
        scaleZ: 0.5 * scale,
      },
      0xd77b68,
      `${prop.id}:body`,
    );
    this.addPropComponent(
      prop,
      'hydrant-cap',
      createBatchSpec('cone-8', 'paint', 'fine', false, true),
      {
        x: 0,
        y: 1.28 * scale,
        z: 0,
        scaleX: 0.68 * scale,
        scaleY: 0.38 * scale,
        scaleZ: 0.68 * scale,
      },
      0xe08b76,
      `${prop.id}:cap`,
    );
    for (const x of [-0.38, 0.38]) {
      this.addPropComponent(
        prop,
        'hydrant-nozzle',
        createBatchSpec('cylinder-8', 'metal', 'fine', false, true),
        {
          x: x * scale,
          y: 0.74 * scale,
          z: 0,
          scaleX: 0.28 * scale,
          scaleY: 0.25 * scale,
          scaleZ: 0.28 * scale,
          rotationZ: Math.PI * 0.5,
        },
        0xe1e5df,
        `${prop.id}:nozzles`,
      );
    }
  }

  private createFieldProp(prop: WorldItemRecord): void {
    const scale = Math.max(0.1, prop.scale);
    if (prop.variant === 'hay-bale') {
      this.addPropComponent(
        prop,
        'hay-bale',
        createBatchSpec('cylinder-8', 'soil', 'standard'),
        {
          x: 0,
          y: 0.76 * scale,
          z: 0,
          scaleX: 1.5 * scale,
          scaleY: 2.2 * scale,
          scaleZ: 1.5 * scale,
          rotationZ: Math.PI * 0.5,
        },
        0xf0d59a,
        `${prop.id}:bale`,
      );
      return;
    }

    this.addPropComponent(
      prop,
      'feed-bin',
      createBatchSpec('cylinder-8', 'metal', 'standard'),
      {
        x: 0,
        y: 1.65 * scale,
        z: 0,
        scaleX: 1.8 * scale,
        scaleY: 3.3 * scale,
        scaleZ: 1.8 * scale,
      },
      0xd9dfdc,
      `${prop.id}:bin`,
    );
    this.addPropComponent(
      prop,
      'feed-bin-roof',
      createBatchSpec('cone-8', 'metal', 'fine'),
      {
        x: 0,
        y: 3.68 * scale,
        z: 0,
        scaleX: 2.15 * scale,
        scaleY: 1.25 * scale,
        scaleZ: 2.15 * scale,
      },
      0xe2e4df,
      `${prop.id}:roof`,
    );
  }

  private addBuildingComponent(
    building: BuildingRecord,
    component: TownBuildingComponent,
    spec: BatchSpec,
    transform: LocalTransform,
    color: THREE.ColorRepresentation,
    detailOwnerId: string,
  ): void {
    this.addComponent(
      building.item.position,
      building.item.rotationY,
      component,
      spec,
      transform,
      color,
      building.item.id,
      detailOwnerId,
    );
  }

  private addPropComponent(
    prop: WorldItemRecord,
    component: string,
    spec: BatchSpec,
    transform: LocalTransform,
    color: THREE.ColorRepresentation,
    detailOwnerId: string,
  ): void {
    this.addComponent(
      prop.position,
      prop.rotationY,
      component,
      spec,
      transform,
      color,
      null,
      detailOwnerId,
    );
  }

  private addComponent(
    origin: WorldPosition,
    baseRotationY: number,
    component: string,
    spec: BatchSpec,
    transform: LocalTransform,
    color: THREE.ColorRepresentation,
    buildingId: string | null,
    detailOwnerId: string,
  ): void {
    const key = getBatchKey(spec);
    let batch = this.pendingBatches.get(key);
    if (batch === undefined) {
      batch = {
        key,
        spec,
        placements: [],
      };
      this.pendingBatches.set(key, batch);
    }
    batch.placements.push({
      matrix: composeMatrix(origin, baseRotationY, transform),
      color,
      component,
      buildingId,
      detailOwnerId,
    });
  }

  private createInstancedBatches(): void {
    let totalInstances = 0;
    for (const pendingBatch of this.pendingBatches.values()) {
      const ordered = this.orderPlacements(pendingBatch);
      const capacity = ordered.placements.length;
      if (capacity === 0) {
        continue;
      }
      if (capacity > MAX_BATCH_INSTANCES) {
        throw new Error(
          `Town batch "${pendingBatch.key}" requires ${capacity} instances; `
          + `the bounded capacity is ${MAX_BATCH_INSTANCES}.`,
        );
      }
      totalInstances += capacity;
      if (totalInstances > MAX_TOTAL_COMPONENT_INSTANCES) {
        throw new Error(
          `Town component capacity exceeds ${MAX_TOTAL_COMPONENT_INSTANCES}.`,
        );
      }

      const geometry = this.getGeometry(
        pendingBatch.spec.geometry,
        pendingBatch.spec.tile,
      );
      const material = this.atlas.get(pendingBatch.spec.material);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `TownBatch:${pendingBatch.key}`;
      mesh.castShadow = pendingBatch.spec.castShadow;
      mesh.receiveShadow = pendingBatch.spec.receiveShadow;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

      const color = new THREE.Color();
      for (let index = 0; index < ordered.placements.length; index += 1) {
        const placement = ordered.placements[index];
        if (placement === undefined) {
          continue;
        }
        mesh.setMatrixAt(index, placement.matrix);
        mesh.setColorAt(index, color.set(placement.color));

        if (placement.buildingId !== null) {
          const handles = this.mutableBuildingHandles.get(
            placement.buildingId,
          );
          if (handles === undefined) {
            throw new Error(
              `Missing handle collection for "${placement.buildingId}".`,
            );
          }
          handles.push({
            batch: mesh,
            instanceIndex: index,
            component: placement.component as TownBuildingComponent,
          });
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) {
        mesh.instanceColor.needsUpdate = true;
      }
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      this.object.add(mesh);
      this.batches.push({
        mesh,
        detail: pendingBatch.spec.detail,
        capacity,
        detailGroupEnds: ordered.detailGroupEnds,
      });
    }
    this.pendingBatches.clear();
  }

  /**
   * Optional instances are ordered by stable owner hashes. A quality boundary
   * therefore removes whole cars, openings, or prop detail groups instead of
   * exposing half a wheel set, and the chosen district coverage is repeatable.
   */
  private orderPlacements(pendingBatch: PendingBatch): {
    readonly placements: readonly PendingPlacement[];
    readonly detailGroupEnds: readonly number[];
  } {
    if (pendingBatch.spec.detail === 'core') {
      return {
        placements: pendingBatch.placements,
        detailGroupEnds: [pendingBatch.placements.length],
      };
    }

    const groups = new Map<string, PendingPlacement[]>();
    for (const placement of pendingBatch.placements) {
      let group = groups.get(placement.detailOwnerId);
      if (group === undefined) {
        group = [];
        groups.set(placement.detailOwnerId, group);
      }
      group.push(placement);
    }

    const orderedGroups = [...groups.entries()].sort(
      ([firstId], [secondId]) => {
        const firstHash = hashString(`${pendingBatch.key}:${firstId}`);
        const secondHash = hashString(`${pendingBatch.key}:${secondId}`);
        return firstHash - secondHash || firstId.localeCompare(secondId);
      },
    );
    const placements: PendingPlacement[] = [];
    const detailGroupEnds: number[] = [];
    for (const [, group] of orderedGroups) {
      placements.push(...group);
      detailGroupEnds.push(placements.length);
    }
    return { placements, detailGroupEnds };
  }

  private finalizeBuildingHandles(): void {
    for (const [buildingId, mutableHandles] of this.mutableBuildingHandles) {
      const components = mutableHandles.map((handle) => Object.freeze(handle));
      this.buildingHandles.set(buildingId, Object.freeze({
        buildingId,
        components: Object.freeze(components),
      }));
    }
    this.mutableBuildingHandles.clear();
  }

  private getGeometry(
    kind: GeometryKind,
    tile: AtlasTileName,
  ): THREE.BufferGeometry {
    const key = `${kind}:${tile}`;
    const existing = this.geometries.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const base = createBaseGeometry(kind);
    const geometry = this.atlas.cloneGeometryForTile(base, tile);
    base.dispose();
    geometry.name = `TownGeometry:${key}`;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    this.geometries.set(key, geometry);
    return geometry;
  }

  private getDetailCoverage(detail: DetailBand): number {
    switch (detail) {
      case 'core':
        return 1;
      case 'standard':
        return smoothCoverage(this.detailScale, 0.4, 0.8);
      case 'fine':
        return smoothCoverage(this.detailScale, 0.7, 1);
    }
  }
}
