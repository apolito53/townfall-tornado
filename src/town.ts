import * as THREE from 'three';

const BUILDABLE_COORDS = [-34, -22, -10, 10, 22, 34];
const ROAD_COORDS = [-4, 4];
const TOWN_BOUNDARY = 50;
const CHUNK_SIZE = 72;
const WORLD_GROUND_SIZE = 6000;
const INITIAL_CHUNK_RADIUS = 2;
const EDGE_GENERATION_RADIUS = 2;
const SIMULATION_CELL_SIZE = 24;
const MAX_INTERACTION_RADIUS = 12;
const DETAIL_LOD_RADIUS_BY_CATEGORY = [64, 76, 88, 100, 116];
const MINOR_PROP_RADIUS_BY_CATEGORY = [76, 88, 104, 122, 146];
const FRAME_DYNAMIC_PIECE_BUDGET = 72;
const FRAME_STATIC_PIECE_BUDGET = 36;
const FRAME_COLLAPSE_SCAR_BUDGET = 8;
const STRUCTURAL_GENERATED_PIECE_LIMIT = 34;
const MINOR_GENERATED_PIECE_LIMIT = 12;
const MAX_TOWN_ITEMS_UPDATED_PER_FRAME = 460;

const MATERIALS = {
  grass: new THREE.MeshStandardMaterial({ color: 0x5c8f5c, roughness: 0.95 }),
  road: new THREE.MeshStandardMaterial({ color: 0x4b4943, roughness: 0.98 }),
  roadStripe: new THREE.MeshStandardMaterial({ color: 0xe9d878, roughness: 0.85 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0xc3bba6, roughness: 0.9 }),
  houseWall: new THREE.MeshStandardMaterial({ color: 0xc9d4c8, roughness: 0.82 }),
  houseAlt: new THREE.MeshStandardMaterial({ color: 0xd1b18e, roughness: 0.82 }),
  roofRed: new THREE.MeshStandardMaterial({ color: 0x9b4c44, roughness: 0.75, side: THREE.DoubleSide }),
  roofGreen: new THREE.MeshStandardMaterial({ color: 0x427d64, roughness: 0.75, side: THREE.DoubleSide }),
  roofDark: new THREE.MeshStandardMaterial({ color: 0x394f4b, roughness: 0.82, side: THREE.DoubleSide }),
  shop: new THREE.MeshStandardMaterial({ color: 0xbfc9d3, roughness: 0.74 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xa15f4d, roughness: 0.88 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fb1c2, roughness: 0.35, metalness: 0.1 }),
  door: new THREE.MeshStandardMaterial({ color: 0x5b4535, roughness: 0.86 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xe3dec9, roughness: 0.78 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xa9a99b, roughness: 0.92 }),
  awning: new THREE.MeshStandardMaterial({ color: 0xb94d43, roughness: 0.78 }),
  clockFace: new THREE.MeshStandardMaterial({ color: 0xf2e8c8, roughness: 0.68 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x745035, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f7d49, roughness: 0.9 }),
  carBlue: new THREE.MeshStandardMaterial({ color: 0x3f6e99, roughness: 0.65 }),
  carYellow: new THREE.MeshStandardMaterial({ color: 0xd6a744, roughness: 0.7 }),
  fence: new THREE.MeshStandardMaterial({ color: 0xd6c4a2, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb7b2a7, roughness: 0.48, metalness: 0.25 }),
  sign: new THREE.MeshStandardMaterial({ color: 0xce5e4d, roughness: 0.62 }),
  rubbleDark: new THREE.MeshStandardMaterial({ color: 0x554835, roughness: 1 }),
  soilScar: new THREE.MeshBasicMaterial({
    color: 0x3f3527,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  impactScar: new THREE.MeshBasicMaterial({
    color: 0x2f281f,
    transparent: true,
    opacity: 0.46,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
};

function withRole(mesh, role) {
  mesh.userData.damageRole = role;
  if (role === 'detail') {
    mesh.castShadow = false;
  }
  return mesh;
}

function chunkKey(chunkX, chunkZ) {
  return `${chunkX},${chunkZ}`;
}

function simulationCellKey(cellX, cellZ) {
  return `${cellX},${cellZ}`;
}

function simulationCellForPosition(position) {
  return {
    x: Math.floor(position.x / SIMULATION_CELL_SIZE),
    z: Math.floor(position.z / SIMULATION_CELL_SIZE),
  };
}

function createSimulationStats() {
  return {
    totalItems: 0,
    candidateItems: 0,
    activeItems: 0,
    simulatedItems: 0,
    throttledCandidates: 0,
    absorbedItems: 0,
    effectPieces: 0,
    skippedEffectPieces: 0,
  };
}

function createEffectBudget() {
  return {
    dynamicPieces: FRAME_DYNAMIC_PIECE_BUDGET,
    staticPieces: FRAME_STATIC_PIECE_BUDGET,
    createdPieces: 0,
    skippedPieces: 0,
    usePiece(dynamic) {
      const poolName = dynamic ? 'dynamicPieces' : 'staticPieces';
      if (this[poolName] <= 0) {
        this.skippedPieces += 1;
        return false;
      }

      this[poolName] -= 1;
      this.createdPieces += 1;
      return true;
    },
  };
}

function createRenderBudgetStats() {
  return {
    visibleItems: 0,
    totalItems: 0,
    visibleParts: 0,
    totalParts: 0,
  };
}

function hashChunk(chunkX, chunkZ) {
  let hash = 2166136261;
  hash ^= chunkX + 0x9e3779b9;
  hash = Math.imul(hash, 16777619);
  hash ^= chunkZ + 0x85ebca6b;
  hash = Math.imul(hash, 16777619);
  return hash >>> 0;
}

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function box(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y + height * 0.5, z);
  mesh.castShadow = height > 0.25;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, material, x = 0, y = 0, z = 0, segments = 18) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(x, y + height * 0.5, z);
  mesh.castShadow = height > 0.25 && Math.max(radiusTop, radiusBottom) > 0.12;
  mesh.receiveShadow = true;
  return mesh;
}

function createGableRoof(width, height, depth, material, x = 0, y = 0, z = 0) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -halfWidth, 0, -halfDepth,
    halfWidth, 0, -halfDepth,
    0, height, -halfDepth,
    -halfWidth, 0, halfDepth,
    halfWidth, 0, halfDepth,
    0, height, halfDepth,
  ], 3));
  geometry.setIndex([
    0, 1, 2,
    3, 5, 4,
    0, 2, 5,
    0, 5, 3,
    1, 4, 5,
    1, 5, 2,
  ]);
  geometry.computeVertexNormals();

  const roof = new THREE.Mesh(geometry, material);
  roof.position.set(x, y, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  return roof;
}

function addFrontWindow(group, x, y, z, width = 1.05, height = 1.05) {
  group.add(withRole(box(width + 0.22, height + 0.22, 0.1, MATERIALS.trim, x, y - 0.11, z), 'detail'));
  group.add(withRole(box(width, height, 0.13, MATERIALS.glass, x, y, z - 0.015), 'detail'));
}

function addSideWindow(group, x, y, z, width = 1.05, height = 1.05) {
  group.add(withRole(box(0.1, height + 0.22, width + 0.22, MATERIALS.trim, x, y - 0.11, z), 'detail'));
  group.add(withRole(box(0.13, height, width, MATERIALS.glass, x, y, z), 'detail'));
}

function createHouse(variant = 0) {
  const group = new THREE.Group();
  const wallMaterial = variant % 2 === 0 ? MATERIALS.houseWall : MATERIALS.houseAlt;
  const roofMaterial = variant % 3 === 0 ? MATERIALS.roofGreen : (variant % 4 === 0 ? MATERIALS.roofDark : MATERIALS.roofRed);
  const width = 5.7 + (variant % 3) * 0.45;
  const depth = 5.15 + (variant % 4) * 0.34;
  const wallHeight = 3.05 + (variant % 2) * 0.28;
  const frontZ = -depth * 0.5 - 0.06;
  const backZ = depth * 0.5 + 0.06;
  const leftX = -width * 0.5 - 0.06;
  const rightX = width * 0.5 + 0.06;

  group.add(withRole(box(width, 0.34, depth, MATERIALS.concrete, 0, 0, 0), 'structure'));
  group.add(withRole(box(width, wallHeight, depth, wallMaterial, 0, 0.28, 0), 'structure'));

  const roof = createGableRoof(width + 1.25, 1.75, depth + 1.05, roofMaterial, 0, wallHeight + 0.28, 0);
  if (variant % 2 === 1) {
    roof.rotation.y = Math.PI * 0.5;
  }
  group.add(withRole(roof, 'roof'));

  group.add(withRole(box(1, 1.85, 0.16, MATERIALS.door, -width * 0.22, 0.36, frontZ - 0.02), 'detail'));
  group.add(withRole(box(1.28, 0.16, 0.22, MATERIALS.trim, -width * 0.22, 2.21, frontZ - 0.03), 'detail'));
  addFrontWindow(group, width * 0.22, 1.34, frontZ, 1.05, 1.08);
  addFrontWindow(group, width * 0.02, 2.42, backZ, 0.9, 0.78);
  addSideWindow(group, leftX, 1.42, -depth * 0.12, 0.92, 0.94);
  addSideWindow(group, rightX, 1.42, depth * 0.12, 0.92, 0.94);

  group.add(withRole(box(width * 0.46, 0.16, 1.35, MATERIALS.concrete, -width * 0.22, 0.02, frontZ - 0.52), 'detail'));
  group.add(withRole(box(0.18, 1.05, 0.18, MATERIALS.trim, -width * 0.56, 0.34, frontZ - 0.58), 'detail'));
  group.add(withRole(box(0.18, 1.05, 0.18, MATERIALS.trim, width * 0.02, 0.34, frontZ - 0.58), 'detail'));
  group.add(withRole(box(0.52, 1.1, 0.52, MATERIALS.brick, width * 0.28, wallHeight + 1.15, depth * 0.1), 'detail'));

  return {
    group,
    type: 'House',
    massRequired: 54,
    points: 520,
    growth: 14,
    radius: 4.2,
  };
}

function createShop(variant = 0) {
  const group = new THREE.Group();
  const bodyMaterial = variant % 2 === 0 ? MATERIALS.shop : MATERIALS.brick;
  const width = 8.7 + (variant % 3) * 0.75;
  const depth = 6.55 + (variant % 2) * 0.7;
  const frontZ = -depth * 0.5 - 0.08;

  group.add(withRole(box(width, 0.32, depth, MATERIALS.concrete), 'structure'));
  group.add(withRole(box(width, 4, depth, bodyMaterial, 0, 0.3, 0), 'structure'));
  group.add(withRole(box(width + 0.5, 0.62, depth + 0.55, MATERIALS.roofGreen, 0, 4.25, 0), 'roof'));
  group.add(withRole(box(width + 0.9, 0.78, 0.44, MATERIALS.brick, 0, 4.55, frontZ + 0.04), 'roof'));

  const windowWidth = (width - 2.5) / 3;
  for (let index = 0; index < 3; index += 1) {
    const x = -width * 0.31 + index * windowWidth;
    group.add(withRole(box(windowWidth * 0.82, 1.75, 0.16, MATERIALS.glass, x, 1.08, frontZ - 0.02), 'detail'));
  }

  group.add(withRole(box(1.08, 2.1, 0.18, MATERIALS.door, width * 0.32, 0.42, frontZ - 0.04), 'detail'));
  group.add(withRole(box(width * 0.86, 0.5, 0.64, MATERIALS.awning, -width * 0.02, 2.95, frontZ - 0.2), 'detail'));
  group.add(withRole(box(2.7, 0.86, 0.18, MATERIALS.sign, -width * 0.2, 3.48, frontZ - 0.3), 'detail'));

  for (const x of [-width * 0.28, width * 0.08]) {
    group.add(withRole(box(1.15, 0.55, 1.15, MATERIALS.metal, x, 4.95, depth * 0.1), 'detail'));
  }

  return {
    group,
    type: 'Shop',
    massRequired: 82,
    points: 860,
    growth: 23,
    radius: 5.4,
  };
}

function createTownHall() {
  const group = new THREE.Group();
  group.add(withRole(box(12, 5.4, 9, MATERIALS.brick), 'structure'));
  group.add(withRole(box(13.2, 0.65, 10.2, MATERIALS.concrete, 0, 5.35, 0), 'roof'));
  group.add(withRole(createGableRoof(13.8, 1.9, 10.8, MATERIALS.roofRed, 0, 5.95, 0), 'roof'));
  group.add(withRole(box(2.5, 7.5, 2.5, MATERIALS.brick, 0, 4.7, -0.2), 'structure'));
  group.add(withRole(cylinder(1.75, 1.75, 0.8, MATERIALS.metal, 0, 8.3, -0.2, 24), 'roof'));
  group.add(withRole(box(1.1, 1.1, 0.16, MATERIALS.clockFace, 0, 7.15, -1.52), 'detail'));

  for (const x of [-4.1, -1.4, 1.4, 4.1]) {
    group.add(withRole(cylinder(0.18, 0.24, 3.2, MATERIALS.concrete, x, 0.1, -4.72, 12), 'detail'));
    addFrontWindow(group, x, 2.1, -4.62, 1.2, 1.8);
  }

  group.add(withRole(box(4.1, 2.25, 0.18, MATERIALS.door, 0, 0.22, -4.7), 'detail'));
  group.add(withRole(box(7.8, 0.24, 2.1, MATERIALS.concrete, 0, 0.02, -5.45), 'detail'));

  return {
    group,
    type: 'Town Hall',
    massRequired: 148,
    points: 1800,
    growth: 45,
    radius: 7.4,
  };
}

function createTree() {
  const group = new THREE.Group();
  group.add(withRole(cylinder(0.28, 0.36, 2.4, MATERIALS.trunk), 'structure'));
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), MATERIALS.leaf);
  canopy.position.y = 3.0;
  canopy.castShadow = true;
  group.add(withRole(canopy, 'canopy'));
  return {
    group,
    type: 'Tree',
    massRequired: 8,
    points: 80,
    growth: 2.5,
    radius: 1.5,
  };
}

function createFence(length = 4.8) {
  const group = new THREE.Group();
  group.add(withRole(box(length, 0.55, 0.25, MATERIALS.fence, 0, 0, 0), 'detail'));
  group.add(withRole(box(0.25, 1.1, 0.32, MATERIALS.fence, -length * 0.45, 0, 0), 'structure'));
  group.add(withRole(box(0.25, 1.1, 0.32, MATERIALS.fence, length * 0.45, 0, 0), 'structure'));
  return {
    group,
    type: 'Fence',
    massRequired: 4,
    points: 35,
    growth: 1,
    radius: length * 0.55,
  };
}

function createCar(variant = 0) {
  const group = new THREE.Group();
  const bodyMaterial = variant % 2 === 0 ? MATERIALS.carBlue : MATERIALS.carYellow;
  group.add(withRole(box(3.4, 0.9, 1.8, bodyMaterial), 'structure'));
  group.add(withRole(box(1.55, 0.72, 1.55, MATERIALS.glass, -0.25, 0.75, 0), 'roof'));

  for (const x of [-1.15, 1.15]) {
    for (const z of [-0.92, 0.92]) {
      const wheel = cylinder(0.28, 0.28, 0.24, MATERIALS.metal, x, 0.15, z, 12);
      wheel.rotation.x = Math.PI * 0.5;
      group.add(withRole(wheel, 'detail'));
    }
  }

  return {
    group,
    type: 'Car',
    massRequired: 22,
    points: 210,
    growth: 6,
    radius: 2.2,
  };
}

function createSign() {
  const group = new THREE.Group();
  group.add(withRole(cylinder(0.08, 0.08, 1.7, MATERIALS.metal), 'structure'));
  group.add(withRole(box(1.6, 0.75, 0.12, MATERIALS.sign, 0, 1.35, 0), 'detail'));
  return {
    group,
    type: 'Sign',
    massRequired: 3,
    points: 45,
    growth: 1.2,
    radius: 0.95,
  };
}

function createWaterTower() {
  const group = new THREE.Group();
  group.add(withRole(cylinder(1.45, 1.45, 2.4, MATERIALS.metal, 0, 6.2, 0, 24), 'structure'));

  for (const x of [-1.2, 1.2]) {
    for (const z of [-1.2, 1.2]) {
      group.add(withRole(cylinder(0.09, 0.09, 6.3, MATERIALS.metal, x, 0, z, 8), 'detail'));
    }
  }

  group.add(withRole(box(3.4, 0.28, 3.4, MATERIALS.metal, 0, 5.8, 0), 'detail'));
  return {
    group,
    type: 'Water Tower',
    massRequired: 118,
    points: 1300,
    growth: 34,
    radius: 3.7,
  };
}

const DAMAGE_STAGE_THRESHOLDS = [0.2, 0.48, 0.74];
const STRUCTURAL_TYPES = new Set(['House', 'Shop', 'Town Hall', 'Water Tower']);

class Destructible {
  [key: string]: any;

  constructor(config, position, rotation = 0) {
    this.model = config.group;
    this.group = new THREE.Group();
    this.group.add(this.model);
    this.type = config.type;
    this.massRequired = config.massRequired;
    this.points = config.points;
    this.growth = config.growth;
    this.radius = config.radius;
    this.isStructural = STRUCTURAL_TYPES.has(this.type);
    this.integrity = config.integrity ?? Math.max(9, this.massRequired * 0.85 + this.radius * 7);
    this.collapseLiftRatio = this.isStructural ? 0.75 : 0.42;
    this.destroyed = false;
    this.isLifted = false;
    this.damage = 0;
    this.damageStage = 0;
    this.pressureBurstTimer = 0;
    this.generatedPieces = [];
    this.lastPullDirection = new THREE.Vector3(1, 0, 0);
    this.velocity = new THREE.Vector3();
    this.spin = new THREE.Vector3(
      (Math.random() - 0.5) * 1.2,
      0.8 + Math.random() * 1.8,
      (Math.random() - 0.5) * 1.2,
    );

    this.group.position.copy(position);
    this.group.rotation.y = rotation;
    this.basePosition = position.clone();
    this.baseRotation = this.group.rotation.clone();
    this.baseY = position.y;
    this.baseScale = this.group.scale.clone();
    this.parts = this.collectParts();
  }

  collectParts() {
    const parts = [];

    this.model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      child.geometry.computeBoundingBox();
      const size = new THREE.Vector3();
      child.geometry.boundingBox.getSize(size);
      size.multiply(child.scale);

      parts.push({
        mesh: child,
        role: child.userData.damageRole ?? 'structure',
        material: Array.isArray(child.material) ? child.material[0] : child.material,
        originalPosition: child.position.clone(),
        originalRotation: child.rotation.clone(),
        originalScale: child.scale.clone(),
        originalVisible: child.visible,
        damageVisible: child.visible,
        size,
      });
    });

    return parts;
  }

  reset() {
    this.destroyed = false;
    this.isLifted = false;
    this.damage = 0;
    this.damageStage = 0;
    this.pressureBurstTimer = 0;
    this.velocity.set(0, 0, 0);
    this.lastPullDirection.set(1, 0, 0);
    this.group.visible = true;
    this.model.visible = true;
    this.group.position.copy(this.basePosition);
    this.group.rotation.copy(this.baseRotation);
    this.group.scale.copy(this.baseScale);
    this.removeGeneratedPieces();

    for (const part of this.parts) {
      part.damageVisible = part.originalVisible;
      part.mesh.visible = part.originalVisible;
      part.mesh.position.copy(part.originalPosition);
      part.mesh.rotation.copy(part.originalRotation);
      part.mesh.scale.copy(part.originalScale);
    }
  }

  update(stormProfile, stormPosition, dt, effectBudget = null) {
    this.group.visible = true;
    this.updateGeneratedPieces(dt);

    if (this.destroyed) {
      return null;
    }

    const offset = new THREE.Vector3().subVectors(stormPosition, this.group.position);
    offset.y = 0;
    const distance = Math.max(0.001, offset.length());
    const reachable = distance < stormProfile.pullRadius + this.radius;

    if (!reachable) {
      this.settle(dt);
      return null;
    }

    const inward = distance > 0.01 ? offset.clone().normalize() : this.lastPullDirection.clone();
    this.lastPullDirection.copy(inward);
    const pullRatio = THREE.MathUtils.clamp(1 - distance / (stormProfile.pullRadius + this.radius), 0, 1);
    const collapsedFromStress = this.applyStormStress(stormProfile, stormPosition, pullRatio, dt, effectBudget);

    if (collapsedFromStress) {
      return this;
    }

    this.applyDamagePose(inward, pullRatio, dt);

    // Buildings should not float away as whole boxes. They deform and fail into rubble instead.
    if (this.isStructural || this.massRequired > stormProfile.liftLimit) {
      this.rattleAgainstStorm(pullRatio, dt, inward);
      return null;
    }

    this.isLifted = true;
    const tangent = new THREE.Vector3(-inward.z, 0, inward.x);
    const liftBias = THREE.MathUtils.clamp((stormProfile.liftLimit - this.massRequired) / Math.max(1, stormProfile.liftLimit), 0.25, 1);
    const damageDrag = 1 + this.damage * 0.45;
    const pullAcceleration = stormProfile.pullStrength * pullRatio * liftBias * damageDrag;

    this.velocity.addScaledVector(inward, pullAcceleration * dt);
    this.velocity.addScaledVector(tangent, pullAcceleration * 0.72 * dt);
    this.velocity.y += (2.2 + stormProfile.category * 0.56) * pullRatio * dt;
    this.velocity.multiplyScalar(1 - Math.min(0.82, dt * 1.7));

    this.group.position.addScaledVector(this.velocity, dt);
    this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, 0.55 + stormProfile.category * 0.46, dt * 1.8);
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;

    if (distance < stormProfile.radius * 0.66 + this.radius * 0.36 || this.damage >= 1) {
      this.swallowIntoStorm();
      return this;
    }

    return null;
  }

  applyStormStress(stormProfile, stormPosition, pullRatio, dt, effectBudget) {
    const stormForce = pullRatio * (stormProfile.pullStrength + stormProfile.liftLimit * 0.34);
    const stability = this.massRequired * (this.isStructural ? 0.46 : 0.36) + this.radius * 2.35;
    const stress = Math.max(0, stormForce - stability);

    if (stress <= 0) {
      return false;
    }

    const canFullyFail = !this.isStructural || stormProfile.liftLimit >= this.massRequired * this.collapseLiftRatio;
    const damageCeiling = canFullyFail ? 1 : 0.68;
    const damageRate = (stress / this.integrity) * (0.72 + pullRatio * 0.85);
    this.damage = Math.min(damageCeiling, this.damage + damageRate * dt);
    this.releaseDamageStages(stormPosition, effectBudget);

    if (this.isStructural) {
      this.emitPressureBurst(stormProfile, stormPosition, stormForce, pullRatio, dt, effectBudget);
    }

    if (this.isStructural && this.damage >= 1 && canFullyFail) {
      this.collapseIntoWreckage(stormPosition, stormProfile, effectBudget);
      return true;
    }

    return false;
  }

  releaseDamageStages(stormPosition, effectBudget) {
    while (
      this.damageStage < DAMAGE_STAGE_THRESHOLDS.length
      && this.damage >= DAMAGE_STAGE_THRESHOLDS[this.damageStage]
    ) {
      this.damageStage += 1;
      this.shedDamageStage(this.damageStage, stormPosition, effectBudget);
    }
  }

  emitPressureBurst(stormProfile, stormPosition, stormForce, pullRatio, dt, effectBudget) {
    if (pullRatio < 0.3 || this.damage < 0.08) {
      return;
    }

    this.pressureBurstTimer -= dt;
    if (this.pressureBurstTimer > 0) {
      return;
    }

    this.pressureBurstTimer = THREE.MathUtils.clamp(0.42 - pullRatio * 0.22 - this.damage * 0.16, 0.11, 0.42);
    const stormLocal = this.group.worldToLocal(stormPosition.clone());
    stormLocal.y = 0;
    const towardStorm = stormLocal.lengthSq() > 0.01
      ? stormLocal.normalize()
      : this.lastPullDirection.clone();
    const chunkCount = Math.min(3, Math.max(1, Math.ceil(this.damage * 2.2 + pullRatio * 2)));
    const baseSize = THREE.MathUtils.clamp(0.16 + stormForce * 0.004, 0.2, 0.58);

    for (let index = 0; index < chunkCount; index += 1) {
      const height = 0.8 + Math.random() * (1.4 + this.radius * 0.35);
      const sideOffset = new THREE.Vector3(
        towardStorm.x * this.radius * (0.34 + Math.random() * 0.36),
        height,
        towardStorm.z * this.radius * (0.34 + Math.random() * 0.36),
      );
      const tangential = new THREE.Vector3(-towardStorm.z, 0, towardStorm.x).multiplyScalar((Math.random() - 0.5) * this.radius * 0.38);
      const part = this.parts[Math.floor(Math.random() * this.parts.length)];
      this.createGeneratedPiece(
        sideOffset.add(tangential),
        part?.material ?? MATERIALS.rubbleDark,
        baseSize,
        stormPosition,
        true,
        true,
        effectBudget,
      );
    }
  }

  shedDamageStage(stage, stormPosition, effectBudget) {
    const targetRoles = stage === 1
      ? ['detail', 'wheel']
      : ['roof', 'canopy', 'detail'];
    const candidates = this.parts
      .filter((part) => part.damageVisible && targetRoles.includes(part.role))
      .sort((a, b) => b.originalPosition.y - a.originalPosition.y);
    const partsToBreak = candidates.slice(0, Math.max(1, Math.min(candidates.length, stage)));

    for (const part of partsToBreak) {
      part.damageVisible = false;
      part.mesh.visible = false;
      this.createFragmentsFromPart(part, 1 + stage, stormPosition, effectBudget);
    }

    if (partsToBreak.length === 0) {
      const fallbackPosition = new THREE.Vector3(
        (Math.random() - 0.5) * this.radius,
        0.65 + Math.random() * 0.8,
        (Math.random() - 0.5) * this.radius,
      );
      this.createFragmentCluster(fallbackPosition, MATERIALS.rubbleDark, 1 + stage, stormPosition, 0.28, effectBudget);
    }
  }

  createFragmentsFromPart(part, count, stormPosition, effectBudget) {
    const baseSize = Math.max(0.12, Math.min(0.55, Math.max(part.size.x, part.size.y, part.size.z) * 0.22));
    this.createFragmentCluster(part.originalPosition, part.material, count, stormPosition, baseSize, effectBudget);
  }

  createFragmentCluster(localPosition, material, count, stormPosition, baseSize, effectBudget) {
    for (let index = 0; index < count; index += 1) {
      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * baseSize * 3,
        (Math.random() - 0.5) * baseSize * 2,
        (Math.random() - 0.5) * baseSize * 3,
      );
      this.createGeneratedPiece(localPosition.clone().add(jitter), material, baseSize, stormPosition, true, false, effectBudget);
    }
  }

  createGeneratedPiece(localPosition, material, baseSize, stormPosition, dynamic, pulledTowardStorm = false, effectBudget = null) {
    if (effectBudget && !effectBudget.usePiece(dynamic)) {
      return null;
    }

    const piece = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material ?? MATERIALS.rubbleDark);
    const size = baseSize * (0.55 + Math.random() * 1.5);
    piece.scale.set(size * (0.7 + Math.random()), size * (0.35 + Math.random() * 0.8), size * (0.7 + Math.random()));
    piece.position.copy(localPosition);
    piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    piece.castShadow = false;
    piece.receiveShadow = false;

    const stormLocal = this.group.worldToLocal(stormPosition.clone());
    const direction = pulledTowardStorm
      ? stormLocal.clone().sub(localPosition)
      : localPosition.clone().sub(stormLocal);
    direction.y = 0;
    if (direction.lengthSq() < 0.01) {
      direction.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    }
    direction.normalize();
    const tangent = new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar((Math.random() - 0.5) * 1.6);

    piece.userData.velocity = new THREE.Vector3(
      direction.x * (1.2 + Math.random() * 2.2) + tangent.x,
      dynamic ? 2 + Math.random() * 3.5 + (pulledTowardStorm ? 1.2 : 0) : 0,
      direction.z * (1.2 + Math.random() * 2.2) + tangent.z,
    );
    piece.userData.dynamic = dynamic;
    piece.userData.floorY = piece.scale.y * 0.5;
    this.group.add(piece);
    this.generatedPieces.push(piece);
    this.limitGeneratedPieces(this.isStructural ? STRUCTURAL_GENERATED_PIECE_LIMIT : MINOR_GENERATED_PIECE_LIMIT);
    return piece;
  }

  limitGeneratedPieces(maxPieces) {
    while (this.generatedPieces.length > maxPieces) {
      const oldestPiece = this.generatedPieces.shift();
      this.group.remove(oldestPiece);
      this.disposeGeneratedPiece(oldestPiece);
    }
  }

  disposeGeneratedPiece(piece) {
    piece.geometry?.dispose();
  }

  updateGeneratedPieces(dt) {
    for (const piece of this.generatedPieces) {
      if (!piece.userData.dynamic) {
        continue;
      }

      piece.userData.velocity.y -= 9.8 * dt;
      piece.position.addScaledVector(piece.userData.velocity, dt);
      piece.rotation.x += dt * 4.4;
      piece.rotation.y += dt * 3.8;

      if (piece.position.y <= piece.userData.floorY) {
        piece.position.y = piece.userData.floorY;
        piece.userData.velocity.y = 0;
        piece.userData.velocity.x *= 1 - Math.min(0.92, dt * 6);
        piece.userData.velocity.z *= 1 - Math.min(0.92, dt * 6);

        if (piece.userData.velocity.lengthSq() < 0.08) {
          piece.userData.dynamic = false;
        }
      }
    }
  }

  needsOngoingSimulation() {
    if (this.isLifted) {
      return true;
    }

    return this.generatedPieces.some((piece) => piece.userData.dynamic);
  }

  removeGeneratedPieces() {
    for (const piece of this.generatedPieces) {
      this.group.remove(piece);
      this.disposeGeneratedPiece(piece);
    }
    this.generatedPieces = [];
  }

  collapseIntoWreckage(stormPosition, stormProfile, effectBudget) {
    this.destroyed = true;
    this.isLifted = false;
    this.velocity.set(0, 0, 0);
    this.model.visible = false;
    this.group.position.y = this.baseY;
    this.group.rotation.copy(this.baseRotation);
    this.group.scale.copy(this.baseScale);

    const rubbleCount = Math.min(18, Math.max(6, Math.round(this.radius * 2.2)));
    const baseSize = THREE.MathUtils.clamp(this.radius * 0.11, 0.28, 0.9);

    for (let index = 0; index < rubbleCount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * this.radius * 0.92;
      const localPosition = new THREE.Vector3(
        Math.cos(angle) * distance,
        0.18 + Math.random() * 0.55,
        Math.sin(angle) * distance,
      );
      const sourcePart = this.parts[index % this.parts.length];
      this.createGeneratedPiece(localPosition, sourcePart?.material ?? MATERIALS.rubbleDark, baseSize, stormPosition, true, false, effectBudget);
    }

    // A few heavier slabs stay near the footprint, which reads more like collapse than confetti.
    for (let index = 0; index < Math.min(3, Math.ceil(this.radius / 2.8)); index += 1) {
      const slabPosition = new THREE.Vector3(
        (Math.random() - 0.5) * this.radius,
        0.12,
        (Math.random() - 0.5) * this.radius,
      );
      this.createGeneratedPiece(slabPosition, MATERIALS.rubbleDark, baseSize * 1.7, stormPosition, false, false, effectBudget);
    }

    this.damage = 1;
    this.damageStage = DAMAGE_STAGE_THRESHOLDS.length;
    this.generatedPieces.forEach((piece) => {
      piece.userData.velocity.multiplyScalar(0.65 + stormProfile.category * 0.08);
    });
  }

  swallowIntoStorm() {
    this.destroyed = true;
    this.model.visible = false;
    this.removeGeneratedPieces();
  }

  applyDamagePose(inward, pullRatio, dt) {
    if (this.isLifted) {
      return;
    }

    const lean = this.damage * 0.16 + pullRatio * 0.035;
    const crush = 1 - this.damage * (this.isStructural ? 0.1 : 0.04);
    const settleFactor = 1 - Math.pow(0.0001, dt);

    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, this.baseRotation.x + inward.z * lean, settleFactor);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, this.baseRotation.z - inward.x * lean, settleFactor);
    this.group.scale.x = THREE.MathUtils.lerp(this.group.scale.x, this.baseScale.x * (1 + this.damage * 0.025), settleFactor);
    this.group.scale.y = THREE.MathUtils.lerp(this.group.scale.y, this.baseScale.y * crush, settleFactor);
    this.group.scale.z = THREE.MathUtils.lerp(this.group.scale.z, this.baseScale.z * (1 + this.damage * 0.025), settleFactor);

    for (const part of this.parts) {
      if (!part.mesh.visible) {
        continue;
      }

      const roleLift = part.role === 'roof' || part.role === 'canopy' ? this.damage * 0.42 : this.damage * 0.08;
      const roleTwist = part.role === 'structure' ? this.damage * 0.035 : this.damage * 0.18;
      part.mesh.position.y = THREE.MathUtils.lerp(part.mesh.position.y, part.originalPosition.y + roleLift, settleFactor);
      part.mesh.rotation.z = THREE.MathUtils.lerp(
        part.mesh.rotation.z,
        part.originalRotation.z + Math.sin(performance.now() * 0.008 + this.massRequired) * roleTwist,
        settleFactor,
      );
    }
  }

  settle(dt) {
    const settleFactor = 1 - Math.pow(0.001, dt);

    if (this.damage > 0 && !this.destroyed) {
      this.applyDamagePose(this.lastPullDirection, 0, dt);
    } else {
      this.group.scale.lerp(this.baseScale, settleFactor);
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, this.baseRotation.x, settleFactor);
      this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, this.baseRotation.z, settleFactor);
    }

    if (this.isLifted) {
      this.velocity.multiplyScalar(1 - Math.min(0.95, dt * 4));
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, this.baseY, dt * 2.2);
      this.isLifted = this.group.position.y > this.baseY + 0.08;
    }
  }

  rattleAgainstStorm(pullRatio, dt, inward) {
    const shake = Math.sin(performance.now() * 0.05 + this.massRequired) * 0.03 * pullRatio;
    this.group.rotation.x += inward.z * shake * dt * 8;
    this.group.rotation.z -= inward.x * shake * dt * 8;
  }

  applyRenderBudget(focusPosition, category) {
    const distanceX = this.group.position.x - focusPosition.x;
    const distanceZ = this.group.position.z - focusPosition.z;
    const distanceSq = distanceX * distanceX + distanceZ * distanceZ;
    const categoryIndex = Math.min(DETAIL_LOD_RADIUS_BY_CATEGORY.length - 1, Math.max(0, category - 1));
    const detailRadius = DETAIL_LOD_RADIUS_BY_CATEGORY[categoryIndex];
    const minorPropRadius = MINOR_PROP_RADIUS_BY_CATEGORY[categoryIndex];
    const active = this.needsOngoingSimulation();
    const isMinorProp = !this.isStructural;
    const showWholeItem = !isMinorProp || active || distanceSq <= minorPropRadius * minorPropRadius;
    const showFineDetail = active || distanceSq <= detailRadius * detailRadius;

    this.group.visible = showWholeItem;

    if (!this.model.visible) {
      return {
        visibleItems: this.group.visible ? 1 : 0,
        visibleParts: 0,
        totalParts: this.parts.length,
      };
    }

    let visibleParts = 0;
    for (const part of this.parts) {
      const visible = Boolean(
        this.group.visible
        && part.originalVisible
        && part.damageVisible
        && (showFineDetail || part.role !== 'detail')
      );
      part.mesh.visible = visible;
      if (visible) {
        visibleParts += 1;
      }
    }

    return {
      visibleItems: this.group.visible ? 1 : 0,
      visibleParts,
      totalParts: this.parts.length,
    };
  }
}

export class Town {
  [key: string]: any;

  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.levelIndex = 0;
    this.scene.add(this.group);
    this.resetForLevel(0);
  }

  get boundary() {
    return this.boundarySize;
  }

  resetForLevel(levelIndex = this.levelIndex) {
    this.levelIndex = levelIndex;
    this.group.clear();
    this.groundDamageGroup = new THREE.Group();
    this.items = [];
    this.itemBuckets = new Map();
    this.activeItems = new Set();
    this.simulationCursor = 0;
    this.lastUpdateStats = createSimulationStats();
    this.lastRenderBudgetStats = createRenderBudgetStats();
    this.groundScars = [];
    this.groundScarTimer = 0;
    this.generatedChunks = new Set([chunkKey(0, 0)]);
    this.createTerrain();
    this.group.add(this.groundDamageGroup);
    this.populateTown();
    this.generateChunkNeighborhood(0, 0, INITIAL_CHUNK_RADIUS);
    this.boundarySize = Math.max(
      TOWN_BOUNDARY + Math.min(4, levelIndex) * 8,
      INITIAL_CHUNK_RADIUS * CHUNK_SIZE + CHUNK_SIZE * 0.62,
    );
  }

  restart() {
    for (const item of this.items) {
      item.reset();
    }
    this.activeItems.clear();
    this.simulationCursor = 0;
    this.lastUpdateStats = createSimulationStats();
    this.lastRenderBudgetStats = createRenderBudgetStats();
    this.clearGroundDamage();
  }

  update(stormProfile, stormPosition, dt) {
    const absorbedItems = [];
    const effectBudget = createEffectBudget();
    let collapseScarsRemaining = FRAME_COLLAPSE_SCAR_BUDGET;
    this.applyStormGroundDamage(stormPosition, stormProfile, dt);

    const candidateItems = this.collectNearbyItems(stormPosition, stormProfile.pullRadius + MAX_INTERACTION_RADIUS);
    const activeItemCount = this.activeItems.size;
    const itemsToUpdate = this.selectItemsForSimulation(candidateItems);
    this.activeItems.clear();

    for (const item of itemsToUpdate) {
      const absorbed = item.update(stormProfile, stormPosition, dt, effectBudget);
      if (absorbed) {
        absorbedItems.push(absorbed);
        if (collapseScarsRemaining > 0) {
          this.addCollapseScar(absorbed.group.position, absorbed.radius, absorbed.isStructural ? 1 : 0.45);
          collapseScarsRemaining -= 1;
        }
      }

      if (item.needsOngoingSimulation()) {
        this.activeItems.add(item);
      }
    }

    this.lastUpdateStats = {
      totalItems: this.items.length,
      candidateItems: candidateItems.size,
      activeItems: this.activeItems.size,
      simulatedItems: itemsToUpdate.length,
      throttledCandidates: Math.max(0, candidateItems.size + activeItemCount - itemsToUpdate.length),
      absorbedItems: absorbedItems.length,
      effectPieces: effectBudget.createdPieces,
      skippedEffectPieces: effectBudget.skippedPieces,
    };

    return absorbedItems;
  }

  selectItemsForSimulation(candidateItems) {
    const activeItems = [...this.activeItems];
    const activeSet = new Set(activeItems);
    const inactiveCandidates = [...candidateItems].filter((item) => !activeSet.has(item));
    const availableCandidateSlots = Math.max(0, MAX_TOWN_ITEMS_UPDATED_PER_FRAME - activeItems.length);

    if (inactiveCandidates.length <= availableCandidateSlots) {
      this.simulationCursor = 0;
      return [...activeItems, ...inactiveCandidates];
    }

    const selectedCandidates = [];
    const startCursor = this.simulationCursor % inactiveCandidates.length;
    for (let index = 0; index < availableCandidateSlots; index += 1) {
      selectedCandidates.push(inactiveCandidates[(startCursor + index) % inactiveCandidates.length]);
    }

    this.simulationCursor = (startCursor + availableCandidateSlots) % inactiveCandidates.length;
    return [...activeItems, ...selectedCandidates];
  }

  collectNearbyItems(position, radius) {
    const centerCell = simulationCellForPosition(position);
    const cellRadius = Math.ceil((radius + SIMULATION_CELL_SIZE) / SIMULATION_CELL_SIZE);
    const nearbyItems = new Set();

    for (let dz = -cellRadius; dz <= cellRadius; dz += 1) {
      for (let dx = -cellRadius; dx <= cellRadius; dx += 1) {
        const bucket = this.itemBuckets.get(simulationCellKey(centerCell.x + dx, centerCell.z + dz));
        if (!bucket) {
          continue;
        }

        for (const item of bucket) {
          if (item.destroyed && !item.needsOngoingSimulation()) {
            continue;
          }

          const distanceX = item.group.position.x - position.x;
          const distanceZ = item.group.position.z - position.z;
          const interactionRadius = radius + item.radius;

          if (distanceX * distanceX + distanceZ * distanceZ <= interactionRadius * interactionRadius) {
            nearbyItems.add(item);
          }
        }
      }
    }

    return nearbyItems;
  }

  ensureGeneratedAround(position) {
    const centerChunkX = Math.round(position.x / CHUNK_SIZE);
    const centerChunkZ = Math.round(position.z / CHUNK_SIZE);
    const generatedCount = this.generateChunkNeighborhood(centerChunkX, centerChunkZ, EDGE_GENERATION_RADIUS);

    if (generatedCount > 0) {
      const furthestChunk = Math.max(
        Math.abs(centerChunkX) + EDGE_GENERATION_RADIUS,
        Math.abs(centerChunkZ) + EDGE_GENERATION_RADIUS,
      );
      this.boundarySize = Math.max(this.boundarySize, furthestChunk * CHUNK_SIZE + CHUNK_SIZE * 0.62);
    }

    return generatedCount > 0;
  }

  generateChunkNeighborhood(centerChunkX, centerChunkZ, radius) {
    let generatedCount = 0;

    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const chunkX = centerChunkX + dx;
        const chunkZ = centerChunkZ + dz;
        const key = chunkKey(chunkX, chunkZ);

        if (this.generatedChunks.has(key)) {
          continue;
        }

        this.generatedChunks.add(key);
        this.createProceduralChunk(chunkX, chunkZ);
        generatedCount += 1;
      }
    }

    return generatedCount;
  }

  getDestroyedRatio() {
    const destroyed = this.items.filter((item) => item.destroyed).length;
    return destroyed / this.items.length;
  }

  updateRenderBudget(focusPosition, category) {
    const stats = createRenderBudgetStats();
    stats.totalItems = this.items.length;

    for (const item of this.items) {
      const itemStats = item.applyRenderBudget(focusPosition, category);
      stats.visibleItems += itemStats.visibleItems;
      stats.visibleParts += itemStats.visibleParts;
      stats.totalParts += itemStats.totalParts;
    }

    this.lastRenderBudgetStats = stats;
  }

  createTerrain() {
    const worldGround = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_GROUND_SIZE, WORLD_GROUND_SIZE), MATERIALS.grass);
    worldGround.position.y = -0.04;
    worldGround.rotation.x = -Math.PI * 0.5;
    worldGround.receiveShadow = false;
    this.group.add(worldGround);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), MATERIALS.grass);
    ground.rotation.x = -Math.PI * 0.5;
    ground.receiveShadow = true;
    this.group.add(ground);

    for (const coord of ROAD_COORDS) {
      const roadX = box(130, 0.08, 5, MATERIALS.road, 0, 0, coord);
      const roadZ = box(5, 0.08, 130, MATERIALS.road, coord, 0, 0);
      roadX.receiveShadow = true;
      roadZ.receiveShadow = true;
      this.group.add(roadX, roadZ);
    }

    for (let index = -56; index <= 56; index += 12) {
      this.group.add(box(2.6, 0.1, 0.18, MATERIALS.roadStripe, index, 0.06, -4));
      this.group.add(box(2.6, 0.1, 0.18, MATERIALS.roadStripe, index, 0.06, 4));
      this.group.add(box(0.18, 0.1, 2.6, MATERIALS.roadStripe, -4, 0.06, index));
      this.group.add(box(0.18, 0.1, 2.6, MATERIALS.roadStripe, 4, 0.06, index));
    }

    for (const coord of [-9, 9]) {
      this.group.add(box(130, 0.06, 1.2, MATERIALS.sidewalk, 0, 0.02, coord));
      this.group.add(box(1.2, 0.06, 130, MATERIALS.sidewalk, coord, 0.02, 0));
    }
  }

  createProceduralChunk(chunkX, chunkZ) {
    const originX = chunkX * CHUNK_SIZE;
    const originZ = chunkZ * CHUNK_SIZE;
    const random = mulberry32(hashChunk(chunkX + this.levelIndex * 97, chunkZ - this.levelIndex * 131));

    this.createTerrainPatch(originX, originZ);
    this.populateProceduralChunk(originX, originZ, random);
  }

  createTerrainPatch(originX, originZ) {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE + 1, CHUNK_SIZE + 1), MATERIALS.grass);
    ground.position.set(originX, -0.01, originZ);
    ground.rotation.x = -Math.PI * 0.5;
    ground.receiveShadow = true;
    this.group.add(ground);

    const horizontalRoad = box(CHUNK_SIZE + 2, 0.08, 5, MATERIALS.road, originX, 0, originZ);
    const verticalRoad = box(5, 0.08, CHUNK_SIZE + 2, MATERIALS.road, originX, 0, originZ);
    this.group.add(horizontalRoad, verticalRoad);

    for (const offset of [-7, 7]) {
      this.group.add(box(CHUNK_SIZE + 2, 0.06, 1, MATERIALS.sidewalk, originX, 0.02, originZ + offset));
      this.group.add(box(1, 0.06, CHUNK_SIZE + 2, MATERIALS.sidewalk, originX + offset, 0.02, originZ));
    }

    for (let index = -CHUNK_SIZE * 0.42; index <= CHUNK_SIZE * 0.42; index += 12) {
      this.group.add(box(2.5, 0.1, 0.16, MATERIALS.roadStripe, originX + index, 0.06, originZ));
      this.group.add(box(0.16, 0.1, 2.5, MATERIALS.roadStripe, originX, 0.06, originZ + index));
    }
  }

  populateProceduralChunk(originX, originZ, random) {
    const localLots = this.levelIndex >= 3 ? [-27, -15, 15, 27] : [-25, -14, 14, 25];
    let variant = Math.floor(random() * 1000);
    const shopThreshold = Math.max(0.7, 0.82 - this.levelIndex * 0.035);

    for (const localX of localLots) {
      for (const localZ of localLots) {
        const roll = random();
        if (roll < 0.08) {
          continue;
        }

        const position = new THREE.Vector3(
          originX + localX + (random() - 0.5) * 3.2,
          0,
          originZ + localZ + (random() - 0.5) * 3.2,
        );
        const config = roll > shopThreshold ? createShop(variant) : createHouse(variant);
        this.addItem(config, position, Math.floor(random() * 4) * Math.PI * 0.5);
        variant += 1;
      }
    }

    for (let index = 0; index < 7; index += 1) {
      const alongRoad = -CHUNK_SIZE * 0.42 + index * (CHUNK_SIZE * 0.14);
      const side = random() > 0.5 ? -7.2 : 7.2;
      const onVerticalRoad = random() > 0.5;
      this.addItem(
        createCar(variant + index),
        new THREE.Vector3(
          originX + (onVerticalRoad ? side : alongRoad),
          0,
          originZ + (onVerticalRoad ? alongRoad : side),
        ),
        onVerticalRoad ? Math.PI * 0.5 : 0,
      );
    }

    for (let index = 0; index < 10; index += 1) {
      const edge = Math.floor(random() * 4);
      const x = edge < 2 ? -CHUNK_SIZE * 0.44 + random() * CHUNK_SIZE * 0.88 : (edge === 2 ? -30 : 30);
      const z = edge >= 2 ? -CHUNK_SIZE * 0.44 + random() * CHUNK_SIZE * 0.88 : (edge === 0 ? -30 : 30);
      this.addItem(createTree(), new THREE.Vector3(originX + x, 0, originZ + z), random() * Math.PI * 2);
    }

    for (let index = 0; index < 8; index += 1) {
      const x = -CHUNK_SIZE * 0.38 + index * (CHUNK_SIZE * 0.11);
      const z = random() > 0.5 ? -CHUNK_SIZE * 0.45 : CHUNK_SIZE * 0.45;
      this.addItem(createFence(3.6 + random() * 2.6), new THREE.Vector3(originX + x, 0, originZ + z), random() > 0.5 ? 0 : Math.PI * 0.5);
    }
  }

  applyStormGroundDamage(stormPosition, stormProfile, dt) {
    this.groundScarTimer += dt;
    const cadence = THREE.MathUtils.clamp(0.17 - stormProfile.category * 0.018, 0.065, 0.15);

    if (this.groundScarTimer < cadence) {
      return;
    }

    this.groundScarTimer = 0;
    const radius = stormProfile.radius * (0.86 + Math.random() * 0.28);
    const opacity = THREE.MathUtils.clamp(0.22 + stormProfile.category * 0.04, 0.24, 0.5);
    this.addGroundScar(stormPosition, radius, opacity, MATERIALS.soilScar);
  }

  addCollapseScar(position, radius, intensity = 1) {
    this.addGroundScar(
      position,
      radius * (0.9 + intensity * 0.55),
      THREE.MathUtils.clamp(0.26 + intensity * 0.18, 0.24, 0.58),
      MATERIALS.impactScar,
    );
  }

  addGroundScar(position, radius, opacity, materialTemplate) {
    const material = materialTemplate.clone();
    material.opacity = opacity;
    const scar = new THREE.Mesh(new THREE.CircleGeometry(1, 26), material);
    scar.position.set(position.x, 0.115 + this.groundScars.length * 0.0003, position.z);
    scar.rotation.x = -Math.PI * 0.5;
    scar.rotation.z = Math.random() * Math.PI;
    scar.scale.set(radius * (0.65 + Math.random() * 0.35), radius * (0.28 + Math.random() * 0.28), 1);
    scar.renderOrder = 2;
    this.groundDamageGroup.add(scar);
    this.groundScars.push(scar);

    const maxScars = 120;
    while (this.groundScars.length > maxScars) {
      const oldScar = this.groundScars.shift();
      this.groundDamageGroup.remove(oldScar);
    }
  }

  clearGroundDamage() {
    for (const scar of this.groundScars) {
      this.groundDamageGroup.remove(scar);
    }
    this.groundScars = [];
    this.groundScarTimer = 0;
  }

  populateTown() {
    let variant = 0;
    const level = this.levelIndex;
    const buildableCoords = level >= 3
      ? [-42, -30, -18, -10, 10, 18, 30, 42]
      : BUILDABLE_COORDS;
    const shopFrequency = Math.max(3, 7 - level);

    for (const x of buildableCoords) {
      for (const z of buildableCoords) {
        if (Math.abs(x) < 12 && Math.abs(z) < 12) {
          continue;
        }

        const selector = Math.abs((x * 13 + z * 7 + variant + level * 11) % shopFrequency);
        const config = selector === 0 ? createShop(variant) : createHouse(variant);
        this.addItem(config, new THREE.Vector3(x, 0, z), ((x + z) % 4) * Math.PI * 0.5);
        variant += 1;
      }
    }

    this.addItem(createTownHall(), new THREE.Vector3(0, 0, 22), Math.PI);
    this.addItem(createWaterTower(), new THREE.Vector3(35, 0, -36), 0);

    if (level >= 2) {
      this.addItem(createTownHall(), new THREE.Vector3(-34, 0, 36), Math.PI * 0.25);
    }

    if (level >= 3) {
      this.addItem(createWaterTower(), new THREE.Vector3(-42, 0, -38), 0);
    }

    for (let index = 0; index < 28 + level * 7; index += 1) {
      const angle = index * 1.618;
      const radius = 18 + (index % 5) * 7;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(x) < 8 || Math.abs(z) < 8) {
        continue;
      }
      this.addItem(createTree(), new THREE.Vector3(x, 0, z), angle);
    }

    const carCount = 16 + level * 5;
    for (let index = 0; index < carCount; index += 1) {
      const alongRoad = -44 + (index / Math.max(1, carCount - 1)) * 88;
      const side = index % 2 === 0 ? -7.3 : 7.3;
      const car = createCar(index);
      const rotateOnNorthRoad = index % 3 === 0;
      this.addItem(
        car,
        new THREE.Vector3(rotateOnNorthRoad ? side : alongRoad, 0, rotateOnNorthRoad ? alongRoad : side),
        rotateOnNorthRoad ? Math.PI * 0.5 : 0,
      );
    }

    for (let index = 0; index < 24 + level * 5; index += 1) {
      const x = -46 + (index % 8) * 13;
      const z = index < 12 + level * 2 ? -46 : 46;
      const fence = createFence(4 + (index % 3));
      this.addItem(fence, new THREE.Vector3(x, 0, z), index % 2 === 0 ? 0 : Math.PI * 0.5);
    }

    const signCount = 12 + level * 3;
    for (let index = 0; index < signCount; index += 1) {
      const sign = createSign();
      const x = index % 2 === 0 ? -10.8 : 10.8;
      const z = -42 + (index / Math.max(1, signCount - 1)) * 84;
      this.addItem(sign, new THREE.Vector3(x, 0, z), index % 2 === 0 ? -0.2 : 0.2);
    }
  }

  addItem(config, position, rotation = 0) {
    const item = new Destructible(config, position, rotation);
    this.items.push(item);
    this.registerItem(item);
    this.group.add(item.group);
  }

  registerItem(item) {
    const cell = simulationCellForPosition(item.basePosition);
    const key = simulationCellKey(cell.x, cell.z);

    if (!this.itemBuckets.has(key)) {
      this.itemBuckets.set(key, []);
    }

    this.itemBuckets.get(key).push(item);
  }
}
