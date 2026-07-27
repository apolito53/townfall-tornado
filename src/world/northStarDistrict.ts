import { createWorldSeed, hashSeedLabel, SeededRandom } from '../core/random';
import type {
  BuildingArchetype,
  BuildingDefinition,
  BuildingRecord,
  DioramaDistrictData,
  LotDefinition,
  RoadDefinition,
  WorldBounds,
  WorldItemRecord,
  WorldPosition,
  WorldSeed,
} from '../core/types';
import { projectToRoad, TerrainField } from './TerrainField';

export const NORTH_STAR_SEED = createWorldSeed('townfall:v2:north-star-plains-edge');
export const NORTH_STAR_WORLD_SIZE = 3200;
export const NORTH_STAR_PLAYABLE_HALF_EXTENT = 1450;

const DISTRICT_ID = 'north-star-plains-edge';
const WORLD_BOUNDS: WorldBounds = {
  minX: -NORTH_STAR_WORLD_SIZE * 0.5,
  maxX: NORTH_STAR_WORLD_SIZE * 0.5,
  minZ: -NORTH_STAR_WORLD_SIZE * 0.5,
  maxZ: NORTH_STAR_WORLD_SIZE * 0.5,
};

interface BuildingPlan {
  lot: LotDefinition;
  archetype: BuildingDefinition['archetype'];
  footprint: BuildingDefinition['footprint'];
  height: number;
  stories: number;
  material: BuildingDefinition['material'];
  roof: BuildingDefinition['roof'];
  resistance: number;
}

interface DistrictBuildResult {
  data: DioramaDistrictData;
  terrain: TerrainField;
}

function position(
  x: number,
  y: number,
  z: number,
): WorldPosition {
  return { x, y, z };
}

function createLot(
  id: string,
  roadId: string,
  use: LotDefinition['use'],
  center: WorldPosition,
  width: number,
  depth: number,
  rotationY: number,
  surface: LotDefinition['surface'],
  drivewayAnchor: WorldPosition,
): LotDefinition {
  return {
    id,
    roadId,
    use,
    center,
    width,
    depth,
    rotationY,
    padBlend: use === 'commercial' || use === 'civic'
      ? 110
      : use === 'agricultural'
        ? 90
        : 80,
    surface,
    drivewayAnchor,
  };
}

const ROADS: readonly RoadDefinition[] = [
  {
    id: 'valley-collector',
    kind: 'collector',
    surface: 'road',
    width: 13,
    shoulderWidth: 5,
    markings: 'center-dash',
    sidewalk: 'none',
    points: [
      { x: -280, z: 1300, elevation: 38 },
      { x: -220, z: 900, elevation: 24 },
      { x: -110, z: 520, elevation: 2 },
      { x: 60, z: 120, elevation: -18 },
      { x: 190, z: -340, elevation: -8 },
      { x: 150, z: -820, elevation: 20 },
      { x: 80, z: -1380, elevation: 42 },
    ],
  },
  {
    id: 'east-hillside-loop',
    kind: 'local',
    surface: 'road',
    width: 8,
    shoulderWidth: 3,
    markings: 'none',
    sidewalk: 'none',
    points: [
      { x: 40, z: 260, elevation: -14 },
      { x: 360, z: 330, elevation: -2 },
      { x: 650, z: 120, elevation: 18 },
      { x: 620, z: -220, elevation: 22 },
      { x: 360, z: -440, elevation: 2 },
      { x: 160, z: -270, elevation: -10 },
      { x: 90, z: -60, elevation: -17 },
    ],
  },
  {
    id: 'west-ridge-loop',
    kind: 'local',
    surface: 'road',
    width: 8,
    shoulderWidth: 3,
    markings: 'none',
    sidewalk: 'none',
    points: [
      { x: -80, z: 430, elevation: -2 },
      { x: -390, z: 420, elevation: 12 },
      { x: -650, z: 160, elevation: 30 },
      { x: -610, z: -170, elevation: 34 },
      { x: -390, z: -360, elevation: 16 },
      { x: -140, z: -250, elevation: -4 },
      { x: 100, z: -130, elevation: -17 },
    ],
  },
  {
    id: 'east-service-spur',
    kind: 'service',
    surface: 'gravel',
    width: 7,
    shoulderWidth: 2,
    markings: 'none',
    sidewalk: 'none',
    points: [
      { x: 180, z: -520, elevation: 4 },
      { x: 470, z: -650, elevation: 18 },
      { x: 820, z: -880, elevation: 48 },
      { x: 1150, z: -1080, elevation: 64 },
    ],
  },
];

const BUILDING_PLANS: readonly BuildingPlan[] = [
  {
    lot: createLot(
      'lot-ranch-west-1',
      'valley-collector',
      'residential',
      position(-350, 17, 720),
      82,
      68,
      -0.1,
      'grass',
      position(-196, 17, 720),
    ),
    archetype: 'ranch',
    footprint: { width: 19, depth: 12 },
    height: 6.2,
    stories: 1,
    material: 'wood',
    roof: { shape: 'hip', material: 'shingle', pitch: 0.32 },
    resistance: 0.46,
  },
  {
    lot: createLot(
      'lot-ranch-east-1',
      'valley-collector',
      'residential',
      position(-65, 16, 760),
      78,
      64,
      0.12,
      'grass',
      position(-194, 16, 760),
    ),
    archetype: 'ranch',
    footprint: { width: 17, depth: 11 },
    height: 5.8,
    stories: 1,
    material: 'wood',
    roof: { shape: 'gable', material: 'shingle', pitch: 0.38 },
    resistance: 0.43,
  },
  {
    lot: createLot(
      'lot-manufactured-west',
      'west-ridge-loop',
      'residential',
      position(-500, 20, 300),
      84,
      58,
      0.68,
      'grass',
      position(-425, 20, 382),
    ),
    archetype: 'manufactured',
    footprint: { width: 23, depth: 8.5 },
    height: 4.6,
    stories: 1,
    material: 'steel',
    roof: { shape: 'gable', material: 'metal', pitch: 0.2 },
    resistance: 0.34,
  },
  {
    lot: createLot(
      'lot-ranch-west-2',
      'west-ridge-loop',
      'residential',
      position(-760, 38, 60),
      92,
      70,
      0.08,
      'grass',
      position(-636, 38, 60),
    ),
    archetype: 'ranch',
    footprint: { width: 18, depth: 12 },
    height: 6,
    stories: 1,
    material: 'brick',
    roof: { shape: 'hip', material: 'shingle', pitch: 0.3 },
    resistance: 0.58,
  },
  {
    lot: createLot(
      'lot-two-story-west',
      'west-ridge-loop',
      'residential',
      position(-490, 25, -260),
      76,
      68,
      -0.78,
      'grass',
      position(-430, 25, -324),
    ),
    archetype: 'two-story',
    footprint: { width: 14, depth: 12 },
    height: 10.4,
    stories: 2,
    material: 'wood',
    roof: { shape: 'gable', material: 'shingle', pitch: 0.44 },
    resistance: 0.51,
  },
  {
    lot: createLot(
      'lot-ranch-east-2',
      'east-hillside-loop',
      'residential',
      position(280, -2, 460),
      80,
      70,
      -0.18,
      'grass',
      position(300, -2, 318),
    ),
    archetype: 'ranch',
    footprint: { width: 18, depth: 12 },
    height: 6,
    stories: 1,
    material: 'wood',
    roof: { shape: 'gable', material: 'shingle', pitch: 0.36 },
    resistance: 0.45,
  },
  {
    lot: createLot(
      'lot-ranch-east-3',
      'east-hillside-loop',
      'residential',
      position(540, 12, 260),
      82,
      68,
      -0.9,
      'grass',
      position(496, 12, 231),
    ),
    archetype: 'ranch',
    footprint: { width: 20, depth: 12.5 },
    height: 6.3,
    stories: 1,
    material: 'brick',
    roof: { shape: 'hip', material: 'shingle', pitch: 0.31 },
    resistance: 0.59,
  },
  {
    lot: createLot(
      'lot-two-story-east',
      'east-hillside-loop',
      'residential',
      position(760, -8, -70),
      78,
      72,
      -0.02,
      'grass',
      position(626, -8, -70),
    ),
    archetype: 'two-story',
    footprint: { width: 14, depth: 13 },
    height: 10.8,
    stories: 2,
    material: 'wood',
    roof: { shape: 'gable', material: 'shingle', pitch: 0.42 },
    resistance: 0.5,
  },
  {
    lot: createLot(
      'lot-ranch-east-4',
      'east-hillside-loop',
      'residential',
      position(500, 12, -390),
      86,
      70,
      0.82,
      'grass',
      position(421, 12, -388),
    ),
    archetype: 'ranch',
    footprint: { width: 19, depth: 12 },
    height: 6.1,
    stories: 1,
    material: 'wood',
    roof: { shape: 'hip', material: 'shingle', pitch: 0.33 },
    resistance: 0.47,
  },
  {
    lot: createLot(
      'lot-duplex-east',
      'east-hillside-loop',
      'residential',
      position(170, -9, 380),
      96,
      72,
      0.15,
      'grass',
      position(188, -9, 292),
    ),
    archetype: 'duplex',
    footprint: { width: 27, depth: 12 },
    height: 7.2,
    stories: 1,
    material: 'brick',
    roof: { shape: 'gable', material: 'shingle', pitch: 0.35 },
    resistance: 0.57,
  },
  {
    lot: createLot(
      'lot-duplex-west',
      'west-ridge-loop',
      'residential',
      position(-280, 8, 510),
      100,
      76,
      -0.05,
      'grass',
      position(-180, 8, 500),
    ),
    archetype: 'ranch',
    footprint: { width: 21, depth: 13 },
    height: 6.4,
    stories: 1,
    material: 'wood',
    roof: { shape: 'gable', material: 'shingle', pitch: 0.36 },
    resistance: 0.47,
  },
  {
    lot: createLot(
      'lot-community-school',
      'west-ridge-loop',
      'civic',
      position(-320, 8, -560),
      180,
      126,
      0.06,
      'concrete',
      position(-235, 8, -306),
    ),
    archetype: 'school',
    footprint: { width: 64, depth: 34 },
    height: 11,
    stories: 2,
    material: 'brick',
    roof: { shape: 'flat', material: 'membrane', pitch: 0 },
    resistance: 0.78,
  },
  {
    lot: createLot(
      'lot-fire-station',
      'east-service-spur',
      'civic',
      position(80, 1, -600),
      126,
      94,
      0.18,
      'concrete',
      position(225, 1, -540),
    ),
    archetype: 'fire-station',
    footprint: { width: 38, depth: 27 },
    height: 10,
    stories: 1,
    material: 'brick',
    roof: { shape: 'flat', material: 'membrane', pitch: 0 },
    resistance: 0.81,
  },
  {
    lot: createLot(
      'lot-convenience-store',
      'valley-collector',
      'commercial',
      position(240, -13, -40),
      104,
      82,
      0.24,
      'concrete',
      position(100, -13, -5),
    ),
    archetype: 'convenience-store',
    footprint: { width: 30, depth: 20 },
    height: 7.5,
    stories: 1,
    material: 'concrete',
    roof: { shape: 'flat', material: 'membrane', pitch: 0 },
    resistance: 0.7,
  },
  {
    lot: createLot(
      'lot-strip-shop',
      'valley-collector',
      'commercial',
      position(270, -12, 125),
      142,
      94,
      0.32,
      'concrete',
      position(70, -12, 120),
    ),
    archetype: 'strip-shop',
    footprint: { width: 54, depth: 22 },
    height: 8.2,
    stories: 1,
    material: 'brick',
    roof: { shape: 'flat', material: 'membrane', pitch: 0 },
    resistance: 0.74,
  },
  {
    lot: createLot(
      'lot-feed-warehouse',
      'east-service-spur',
      'commercial',
      position(540, 22, -680),
      170,
      128,
      0.52,
      'gravel',
      position(490, 22, -660),
    ),
    archetype: 'warehouse',
    footprint: { width: 68, depth: 38 },
    height: 15,
    stories: 1,
    material: 'steel',
    roof: { shape: 'gable', material: 'metal', pitch: 0.2 },
    resistance: 0.68,
  },
  {
    lot: createLot(
      'lot-barn-east-1',
      'east-service-spur',
      'agricultural',
      position(880, 50, -920),
      180,
      150,
      0.56,
      'soil',
      position(840, 50, -890),
    ),
    archetype: 'barn',
    footprint: { width: 42, depth: 30 },
    height: 14,
    stories: 1,
    material: 'wood',
    roof: { shape: 'gable', material: 'metal', pitch: 0.5 },
    resistance: 0.42,
  },
  {
    lot: createLot(
      'lot-barn-east-2',
      'east-service-spur',
      'agricultural',
      position(1180, 65, -1110),
      190,
      160,
      0.56,
      'soil',
      position(1130, 65, -1068),
    ),
    archetype: 'barn',
    footprint: { width: 48, depth: 32 },
    height: 16,
    stories: 1,
    material: 'steel',
    roof: { shape: 'gable', material: 'metal', pitch: 0.42 },
    resistance: 0.5,
  },
  {
    lot: createLot(
      'lot-utility-east',
      'east-service-spur',
      'utility',
      position(720, 36, -710),
      76,
      68,
      0.54,
      'gravel',
      position(680, 36, -745),
    ),
    archetype: 'utility',
    footprint: { width: 20, depth: 14 },
    height: 7,
    stories: 1,
    material: 'steel',
    roof: { shape: 'gable', material: 'metal', pitch: 0.25 },
    resistance: 0.62,
  },
  {
    lot: createLot(
      'lot-utility-west',
      'west-ridge-loop',
      'utility',
      position(-790, 43, -50),
      74,
      64,
      0.06,
      'gravel',
      position(-645, 43, -40),
    ),
    archetype: 'utility',
    footprint: { width: 18, depth: 13 },
    height: 6.8,
    stories: 1,
    material: 'concrete',
    roof: { shape: 'flat', material: 'membrane', pitch: 0 },
    resistance: 0.72,
  },
];

function createBuildingRecord(
  plan: BuildingPlan,
  index: number,
  terrain: TerrainField,
  random: SeededRandom,
): BuildingRecord {
  const buildingId = `building-${String(index + 1).padStart(2, '0')}`;
  const sampledHeight = terrain.sampleHeight(
    plan.lot.center.x,
    plan.lot.center.z,
  );
  const buildingPosition = position(
    plan.lot.center.x,
    sampledHeight,
    plan.lot.center.z,
  );

  return {
    item: {
      id: buildingId,
      kind: 'building',
      position: buildingPosition,
      rotationY: plan.lot.rotationY,
      districtId: DISTRICT_ID,
      variant: plan.archetype,
      scale: 1,
    },
    lotId: plan.lot.id,
    paletteIndex: random.integer(0, 8),
    definition: {
      id: buildingId,
      archetype: plan.archetype,
      footprint: { ...plan.footprint },
      height: plan.height,
      stories: plan.stories,
      material: plan.material,
      roof: { ...plan.roof },
      resistance: plan.resistance,
    },
  };
}

function rotateLotOffset(
  lot: LotDefinition,
  localX: number,
  localZ: number,
): { x: number; z: number } {
  const cosine = Math.cos(lot.rotationY);
  const sine = Math.sin(lot.rotationY);
  return {
    x: lot.center.x + localX * cosine - localZ * sine,
    z: lot.center.z + localX * sine + localZ * cosine,
  };
}

function createProp(
  id: string,
  kind: WorldItemRecord['kind'],
  x: number,
  z: number,
  rotationY: number,
  variant: string,
  scale: number,
  terrain: TerrainField,
): WorldItemRecord {
  return {
    id,
    kind,
    position: position(x, terrain.sampleHeight(x, z), z),
    rotationY,
    districtId: DISTRICT_ID,
    variant,
    scale,
  };
}

function distanceToBuilding(
  x: number,
  z: number,
  building: BuildingRecord,
): number {
  const offsetX = x - building.item.position.x;
  const offsetZ = z - building.item.position.z;
  const cosine = Math.cos(-building.item.rotationY);
  const sine = Math.sin(-building.item.rotationY);
  const localX = offsetX * cosine - offsetZ * sine;
  const localZ = offsetX * sine + offsetZ * cosine;
  const outsideX = Math.max(
    0,
    Math.abs(localX) - building.definition.footprint.width * 0.5,
  );
  const outsideZ = Math.max(
    0,
    Math.abs(localZ) - building.definition.footprint.depth * 0.5,
  );
  return Math.hypot(outsideX, outsideZ);
}

function isOpenLandscapePoint(
  x: number,
  z: number,
  buildings: readonly BuildingRecord[],
): boolean {
  for (const road of ROADS) {
    const projection = projectToRoad(x, z, road);
    if (projection.distance < road.width * 0.5 + road.shoulderWidth + 4) {
      return false;
    }
  }

  return buildings.every(
    (building) => distanceToBuilding(x, z, building) > 14,
  );
}

function createTrees(
  terrain: TerrainField,
  buildings: readonly BuildingRecord[],
  random: SeededRandom,
): WorldItemRecord[] {
  const zones = [
    { minX: -1450, maxX: -850, minZ: 550, maxZ: 1450 },
    { minX: 720, maxX: 1480, minZ: 220, maxZ: 1180 },
    { minX: -1400, maxX: -760, minZ: -1350, maxZ: -480 },
    { minX: 760, maxX: 1450, minZ: -520, maxZ: 120 },
    { minX: -720, maxX: 720, minZ: -1480, maxZ: -980 },
  ];
  const trees: WorldItemRecord[] = [];
  let attempts = 0;

  while (trees.length < 80 && attempts < 4000) {
    attempts += 1;
    const zone = random.pick(zones);
    const x = random.range(zone.minX, zone.maxX);
    const z = random.range(zone.minZ, zone.maxZ);
    if (!isOpenLandscapePoint(x, z, buildings)) {
      continue;
    }

    const variant = random.next() > 0.72 ? 'cottonwood-tall' : 'cottonwood';
    trees.push(createProp(
      `tree-${String(trees.length + 1).padStart(3, '0')}`,
      'tree',
      x,
      z,
      random.range(-Math.PI, Math.PI),
      variant,
      random.range(0.78, 1.35),
      terrain,
    ));
  }

  if (trees.length !== 80) {
    throw new Error(`Unable to place north-star trees: ${trees.length}/80.`);
  }
  return trees;
}

function createCars(
  terrain: TerrainField,
  lots: readonly LotDefinition[],
): WorldItemRecord[] {
  const carPlans = [
    { lot: 0, x: 23, z: 14 },
    { lot: 1, x: -21, z: 13 },
    { lot: 2, x: 25, z: 8 },
    { lot: 3, x: -26, z: 16 },
    { lot: 4, x: 21, z: 14 },
    { lot: 5, x: -24, z: 17 },
    { lot: 6, x: 25, z: 15 },
    { lot: 7, x: -23, z: 18 },
    { lot: 8, x: 25, z: 16 },
    { lot: 11, x: -55, z: 38 },
    { lot: 12, x: -36, z: 28 },
    { lot: 13, x: -32, z: 25 },
    { lot: 14, x: 42, z: 27 },
    { lot: 15, x: -48, z: 42 },
  ];

  return carPlans.map((plan, index) => {
    const lot = lots[plan.lot];
    if (lot === undefined) {
      throw new Error(`Missing lot ${plan.lot} for car placement.`);
    }
    const world = rotateLotOffset(lot, plan.x, plan.z);
    return createProp(
      `car-${String(index + 1).padStart(2, '0')}`,
      'car',
      world.x,
      world.z,
      lot.rotationY,
      `car-${index % 5}`,
      0.9 + (index % 3) * 0.06,
      terrain,
    );
  });
}

function createFenceLine(
  lineIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  count: number,
  terrain: TerrainField,
): WorldItemRecord[] {
  const rotationY = Math.atan2(endX - startX, endZ - startZ);
  const items: WorldItemRecord[] = [];
  for (let index = 0; index < count; index += 1) {
    const amount = (index + 0.5) / count;
    items.push(createProp(
      `fence-${lineIndex}-${String(index + 1).padStart(3, '0')}`,
      'fence',
      startX + (endX - startX) * amount,
      startZ + (endZ - startZ) * amount,
      rotationY,
      'post-and-rail',
      1,
      terrain,
    ));
  }
  return items;
}

function createFences(terrain: TerrainField): WorldItemRecord[] {
  return [
    ...createFenceLine(1, -1400, 1080, -590, 1080, 45, terrain),
    ...createFenceLine(2, -1420, 560, -790, 560, 35, terrain),
    ...createFenceLine(3, 780, 980, 1490, 980, 40, terrain),
    ...createFenceLine(4, 930, 500, 1490, 500, 30, terrain),
    ...createFenceLine(5, -1360, -760, -620, -760, 40, terrain),
    ...createFenceLine(6, 850, -1320, 1480, -1320, 30, terrain),
  ];
}

interface PolylinePoint {
  x: number;
  z: number;
  rotationY: number;
}

function sampleRoadByAmount(
  road: RoadDefinition,
  amount: number,
): PolylinePoint {
  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let index = 0; index < road.points.length - 1; index += 1) {
    const start = road.points[index];
    const end = road.points[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    segmentLengths.push(length);
    totalLength += length;
  }

  let remaining = amount * totalLength;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index] ?? 0;
    const start = road.points[index];
    const end = road.points[index + 1];
    if (start === undefined || end === undefined) {
      continue;
    }
    if (remaining <= length || index === segmentLengths.length - 1) {
      const localAmount = length === 0 ? 0 : Math.min(1, remaining / length);
      return {
        x: start.x + (end.x - start.x) * localAmount,
        z: start.z + (end.z - start.z) * localAmount,
        rotationY: Math.atan2(end.x - start.x, end.z - start.z),
      };
    }
    remaining -= length;
  }

  const fallback = road.points[0];
  if (fallback === undefined) {
    throw new Error(`Road ${road.id} has no control points.`);
  }
  return { x: fallback.x, z: fallback.z, rotationY: 0 };
}

function createUtilityPoles(terrain: TerrainField): WorldItemRecord[] {
  const collector = ROADS[0];
  if (collector === undefined) {
    throw new Error('North-star collector road is missing.');
  }

  const offsetDistance = collector.width * 0.5 + collector.shoulderWidth + 4;
  const poles: WorldItemRecord[] = [];
  for (let index = 0; index < 28; index += 1) {
    const roadPoint = sampleRoadByAmount(collector, (index + 0.5) / 28);
    const side = index % 2 === 0 ? 1 : -1;
    let resolvedOffset = offsetDistance;
    let poleX = roadPoint.x;
    let poleZ = roadPoint.z;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const normalX = Math.cos(roadPoint.rotationY) * resolvedOffset * side;
      const normalZ = -Math.sin(roadPoint.rotationY) * resolvedOffset * side;
      poleX = roadPoint.x + normalX;
      poleZ = roadPoint.z + normalZ;
      const overlapsRoad = ROADS.some((road) =>
        projectToRoad(poleX, poleZ, road).distance <= road.width * 0.5
      );
      if (!overlapsRoad) {
        break;
      }
      resolvedOffset += 12;
    }
    poles.push(createProp(
      `utility-pole-${String(index + 1).padStart(2, '0')}`,
      'utility-pole',
      poleX,
      poleZ,
      roadPoint.rotationY,
      'wood-pole',
      1,
      terrain,
    ));
  }
  return poles;
}

function createMinorProps(
  terrain: TerrainField,
  lots: readonly LotDefinition[],
): WorldItemRecord[] {
  const props: WorldItemRecord[] = [];
  const residentialLots = lots.slice(0, 11);

  residentialLots.forEach((lot, index) => {
    const world = rotateLotOffset(lot, lot.width * 0.34, lot.depth * 0.42);
    props.push(createProp(
      `mailbox-${String(index + 1).padStart(2, '0')}`,
      'mailbox',
      world.x,
      world.z,
      lot.rotationY,
      'rural-mailbox',
      1,
      terrain,
    ));
  });

  const signs = [
    [-70, 300],
    [110, 240],
    [-185, -300],
    [220, -480],
    [430, -620],
    [-420, 430],
  ] as const;
  signs.forEach(([x, z], index) => {
    props.push(createProp(
      `road-sign-${String(index + 1).padStart(2, '0')}`,
      'road-sign',
      x,
      z,
      index * 0.4,
      index % 2 === 0 ? 'warning' : 'street',
      1,
      terrain,
    ));
  });

  const hydrants = [
    [180, 80],
    [320, 40],
    [-210, -470],
    [20, -530],
    [370, -420],
  ] as const;
  hydrants.forEach(([x, z], index) => {
    props.push(createProp(
      `hydrant-${String(index + 1).padStart(2, '0')}`,
      'hydrant',
      x,
      z,
      0,
      'hydrant',
      1,
      terrain,
    ));
  });

  for (let index = 0; index < 10; index += 1) {
    const x = 820 + (index % 5) * 72;
    const z = -1180 + Math.floor(index / 5) * 95;
    props.push(createProp(
      `field-prop-${String(index + 1).padStart(2, '0')}`,
      'field-prop',
      x,
      z,
      index * 0.61,
      index % 2 === 0 ? 'hay-bale' : 'feed-bin',
      0.9 + (index % 3) * 0.12,
      terrain,
    ));
  }

  return props;
}

function createSignature(
  seed: WorldSeed,
  buildings: readonly BuildingRecord[],
  props: readonly WorldItemRecord[],
): string {
  const signaturePayload = JSON.stringify({
    seed: seed.value,
    roads: ROADS,
    lots: BUILDING_PLANS.map((plan) => plan.lot),
    buildings: buildings.map((building) => ({
      id: building.item.id,
      lotId: building.lotId,
      archetype: building.definition.archetype,
      paletteIndex: building.paletteIndex,
    })),
    props: props.map((prop) => [
      prop.id,
      prop.kind,
      Math.round(prop.position.x * 100),
      Math.round(prop.position.z * 100),
      prop.variant,
    ]),
  });
  return hashSeedLabel(signaturePayload).toString(16).padStart(8, '0');
}

export function createNorthStarDistrict(
  seed: WorldSeed = NORTH_STAR_SEED,
): DistrictBuildResult {
  const lots = BUILDING_PLANS.map((plan) => plan.lot);
  const terrain = new TerrainField({
    seed,
    bounds: WORLD_BOUNDS,
    roads: ROADS,
    lots,
  });
  const random = new SeededRandom(seed);
  const buildings = BUILDING_PLANS.map((plan, index) =>
    createBuildingRecord(plan, index, terrain, random)
  );
  const props = [
    ...createTrees(terrain, buildings, random),
    ...createCars(terrain, lots),
    ...createFences(terrain),
    ...createUtilityPoles(terrain),
    ...createMinorProps(terrain, lots),
  ];

  const data: DioramaDistrictData = {
    descriptor: {
      id: DISTRICT_ID,
      seed,
      center: position(0, 0, 0),
      radius: NORTH_STAR_WORLD_SIZE * 0.5,
      type: 'suburb',
    },
    bounds: { ...WORLD_BOUNDS },
    spawn: position(0, terrain.sampleHeight(0, 980), 980),
    roads: ROADS,
    lots,
    buildings,
    props,
    signature: createSignature(seed, buildings, props),
  };

  return { data, terrain };
}

export function countBuildingsByArchetype(
  buildings: readonly BuildingRecord[],
): ReadonlyMap<BuildingArchetype, number> {
  const counts = new Map<BuildingArchetype, number>();
  for (const building of buildings) {
    const archetype = building.definition.archetype;
    counts.set(archetype, (counts.get(archetype) ?? 0) + 1);
  }
  return counts;
}
