import * as THREE from 'three';

const BUILDABLE_COORDS = [-34, -22, -10, 10, 22, 34];
const ROAD_COORDS = [-4, 4];
const TOWN_BOUNDARY = 50;

const MATERIALS = {
  grass: new THREE.MeshStandardMaterial({ color: 0x5c8f5c, roughness: 0.95 }),
  road: new THREE.MeshStandardMaterial({ color: 0x4b4943, roughness: 0.98 }),
  roadStripe: new THREE.MeshStandardMaterial({ color: 0xe9d878, roughness: 0.85 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0xc3bba6, roughness: 0.9 }),
  houseWall: new THREE.MeshStandardMaterial({ color: 0xc9d4c8, roughness: 0.82 }),
  houseAlt: new THREE.MeshStandardMaterial({ color: 0xd1b18e, roughness: 0.82 }),
  roofRed: new THREE.MeshStandardMaterial({ color: 0x9b4c44, roughness: 0.75 }),
  roofGreen: new THREE.MeshStandardMaterial({ color: 0x427d64, roughness: 0.75 }),
  shop: new THREE.MeshStandardMaterial({ color: 0xbfc9d3, roughness: 0.74 }),
  brick: new THREE.MeshStandardMaterial({ color: 0xa15f4d, roughness: 0.88 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8fb1c2, roughness: 0.35, metalness: 0.1 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x745035, roughness: 0.95 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f7d49, roughness: 0.9 }),
  carBlue: new THREE.MeshStandardMaterial({ color: 0x3f6e99, roughness: 0.65 }),
  carYellow: new THREE.MeshStandardMaterial({ color: 0xd6a744, roughness: 0.7 }),
  fence: new THREE.MeshStandardMaterial({ color: 0xd6c4a2, roughness: 0.95 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb7b2a7, roughness: 0.48, metalness: 0.25 }),
  sign: new THREE.MeshStandardMaterial({ color: 0xce5e4d, roughness: 0.62 }),
};

function box(width, height, depth, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y + height * 0.5, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, material, x = 0, y = 0, z = 0, segments = 18) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(x, y + height * 0.5, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRoof(width, height, depth, material) {
  const roof = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, height, 4), material);
  roof.position.y = height * 0.5;
  roof.rotation.y = Math.PI * 0.25;
  roof.castShadow = true;
  return roof;
}

function createHouse(variant = 0) {
  const group = new THREE.Group();
  const wallMaterial = variant % 2 === 0 ? MATERIALS.houseWall : MATERIALS.houseAlt;
  const roofMaterial = variant % 3 === 0 ? MATERIALS.roofGreen : MATERIALS.roofRed;

  group.add(box(5.8, 3.2, 5.4, wallMaterial));

  const roof = createRoof(6.6, 2.2, 6.3, roofMaterial);
  roof.position.y = 4.3;
  group.add(roof);

  group.add(box(1.1, 1.5, 0.12, MATERIALS.glass, -1.6, 1.1, -2.76));
  group.add(box(1.1, 1.5, 0.12, MATERIALS.glass, 1.6, 1.1, -2.76));

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
  group.add(box(8.8, 4, 6.8, bodyMaterial));
  group.add(box(9.4, 0.7, 7.4, MATERIALS.roofGreen, 0, 4, 0));
  group.add(box(5.4, 1.8, 0.14, MATERIALS.glass, 0, 1.2, -3.46));
  group.add(box(2.2, 1.2, 0.16, MATERIALS.sign, 0, 3.1, -3.58));

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
  group.add(box(12, 5.4, 9, MATERIALS.brick));
  group.add(box(13.2, 0.9, 10.2, MATERIALS.roofRed, 0, 5.35, 0));
  group.add(box(2.5, 7.5, 2.5, MATERIALS.brick, 0, 4.7, -0.2));
  group.add(cylinder(1.75, 1.75, 0.8, MATERIALS.metal, 0, 8.3, -0.2, 24));
  group.add(box(1.9, 2.4, 0.15, MATERIALS.glass, -3.8, 1.8, -4.56));
  group.add(box(1.9, 2.4, 0.15, MATERIALS.glass, 3.8, 1.8, -4.56));

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
  group.add(cylinder(0.28, 0.36, 2.4, MATERIALS.trunk));
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), MATERIALS.leaf);
  canopy.position.y = 3.0;
  canopy.castShadow = true;
  group.add(canopy);
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
  group.add(box(length, 0.55, 0.25, MATERIALS.fence, 0, 0, 0));
  group.add(box(0.25, 1.1, 0.32, MATERIALS.fence, -length * 0.45, 0, 0));
  group.add(box(0.25, 1.1, 0.32, MATERIALS.fence, length * 0.45, 0, 0));
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
  group.add(box(3.4, 0.9, 1.8, bodyMaterial));
  group.add(box(1.55, 0.72, 1.55, MATERIALS.glass, -0.25, 0.75, 0));

  for (const x of [-1.15, 1.15]) {
    for (const z of [-0.92, 0.92]) {
      const wheel = cylinder(0.28, 0.28, 0.24, MATERIALS.metal, x, 0.15, z, 12);
      wheel.rotation.x = Math.PI * 0.5;
      group.add(wheel);
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
  group.add(cylinder(0.08, 0.08, 1.7, MATERIALS.metal));
  group.add(box(1.6, 0.75, 0.12, MATERIALS.sign, 0, 1.35, 0));
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
  group.add(cylinder(1.45, 1.45, 2.4, MATERIALS.metal, 0, 6.2, 0, 24));

  for (const x of [-1.2, 1.2]) {
    for (const z of [-1.2, 1.2]) {
      group.add(cylinder(0.09, 0.09, 6.3, MATERIALS.metal, x, 0, z, 8));
    }
  }

  group.add(box(3.4, 0.28, 3.4, MATERIALS.metal, 0, 5.8, 0));
  return {
    group,
    type: 'Water Tower',
    massRequired: 118,
    points: 1300,
    growth: 34,
    radius: 3.7,
  };
}

class Destructible {
  constructor(config, position, rotation = 0) {
    this.group = config.group;
    this.type = config.type;
    this.massRequired = config.massRequired;
    this.points = config.points;
    this.growth = config.growth;
    this.radius = config.radius;
    this.destroyed = false;
    this.isLifted = false;
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
  }

  reset() {
    this.destroyed = false;
    this.isLifted = false;
    this.velocity.set(0, 0, 0);
    this.group.visible = true;
    this.group.position.copy(this.basePosition);
    this.group.rotation.copy(this.baseRotation);
    this.group.scale.copy(this.baseScale);
  }

  update(stormProfile, stormPosition, dt) {
    if (this.destroyed) {
      return null;
    }

    const offset = new THREE.Vector3().subVectors(stormPosition, this.group.position);
    offset.y = 0;
    const distance = Math.max(0.001, offset.length());
    const reachable = distance < stormProfile.pullRadius + this.radius;
    const liftable = this.massRequired <= stormProfile.liftLimit;

    if (!reachable) {
      this.settle(dt);
      return null;
    }

    const pullRatio = THREE.MathUtils.clamp(1 - distance / (stormProfile.pullRadius + this.radius), 0, 1);

    if (!liftable) {
      this.rattleAgainstStorm(pullRatio, dt);
      return null;
    }

    this.isLifted = true;
    const inward = offset.normalize();
    const tangent = new THREE.Vector3(-inward.z, 0, inward.x);
    const liftBias = THREE.MathUtils.clamp((stormProfile.liftLimit - this.massRequired) / Math.max(1, stormProfile.liftLimit), 0.25, 1);
    const pullAcceleration = stormProfile.pullStrength * pullRatio * liftBias;

    this.velocity.addScaledVector(inward, pullAcceleration * dt);
    this.velocity.addScaledVector(tangent, pullAcceleration * 0.72 * dt);
    this.velocity.y += (2.5 + stormProfile.category * 0.65) * pullRatio * dt;
    this.velocity.multiplyScalar(1 - Math.min(0.82, dt * 1.7));

    this.group.position.addScaledVector(this.velocity, dt);
    this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, 0.7 + stormProfile.category * 0.52, dt * 1.8);
    this.group.rotation.x += this.spin.x * dt;
    this.group.rotation.y += this.spin.y * dt;
    this.group.rotation.z += this.spin.z * dt;

    if (distance < stormProfile.radius * 0.64 + this.radius * 0.38) {
      this.destroyed = true;
      this.group.visible = false;
      return this;
    }

    return null;
  }

  settle(dt) {
    const settleFactor = 1 - Math.pow(0.001, dt);
    this.group.scale.lerp(this.baseScale, settleFactor);
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, this.baseRotation.z, settleFactor);

    if (this.isLifted) {
      this.velocity.multiplyScalar(1 - Math.min(0.95, dt * 4));
      this.group.position.y = THREE.MathUtils.lerp(this.group.position.y, this.baseY, dt * 2.2);
      this.isLifted = this.group.position.y > this.baseY + 0.08;
    }
  }

  rattleAgainstStorm(pullRatio, dt) {
    const shake = Math.sin(performance.now() * 0.05 + this.massRequired) * 0.025 * pullRatio;
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, shake, dt * 12);
    this.group.scale.setScalar(1 + pullRatio * 0.018);
  }
}

export class Town {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.items = [];
    this.scene.add(this.group);
    this.createTerrain();
    this.populateTown();
  }

  get boundary() {
    return TOWN_BOUNDARY;
  }

  restart() {
    for (const item of this.items) {
      item.reset();
    }
  }

  update(stormProfile, stormPosition, dt) {
    const absorbedItems = [];

    for (const item of this.items) {
      const absorbed = item.update(stormProfile, stormPosition, dt);
      if (absorbed) {
        absorbedItems.push(absorbed);
      }
    }

    return absorbedItems;
  }

  getDestroyedRatio() {
    const destroyed = this.items.filter((item) => item.destroyed).length;
    return destroyed / this.items.length;
  }

  createTerrain() {
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

  populateTown() {
    let variant = 0;

    for (const x of BUILDABLE_COORDS) {
      for (const z of BUILDABLE_COORDS) {
        if (Math.abs(x) < 12 && Math.abs(z) < 12) {
          continue;
        }

        const selector = Math.abs((x * 13 + z * 7 + variant) % 7);
        const config = selector === 0 ? createShop(variant) : createHouse(variant);
        this.addItem(config, new THREE.Vector3(x, 0, z), ((x + z) % 4) * Math.PI * 0.5);
        variant += 1;
      }
    }

    this.addItem(createTownHall(), new THREE.Vector3(0, 0, 22), Math.PI);
    this.addItem(createWaterTower(), new THREE.Vector3(35, 0, -36), 0);

    for (let index = 0; index < 28; index += 1) {
      const angle = index * 1.618;
      const radius = 18 + (index % 5) * 7;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(x) < 8 || Math.abs(z) < 8) {
        continue;
      }
      this.addItem(createTree(), new THREE.Vector3(x, 0, z), angle);
    }

    for (let index = 0; index < 16; index += 1) {
      const alongRoad = -44 + index * 6.2;
      const side = index % 2 === 0 ? -7.3 : 7.3;
      const car = createCar(index);
      const rotateOnNorthRoad = index % 3 === 0;
      this.addItem(
        car,
        new THREE.Vector3(rotateOnNorthRoad ? side : alongRoad, 0, rotateOnNorthRoad ? alongRoad : side),
        rotateOnNorthRoad ? Math.PI * 0.5 : 0,
      );
    }

    for (let index = 0; index < 24; index += 1) {
      const x = -46 + (index % 8) * 13;
      const z = index < 12 ? -46 : 46;
      const fence = createFence(4 + (index % 3));
      this.addItem(fence, new THREE.Vector3(x, 0, z), index % 2 === 0 ? 0 : Math.PI * 0.5);
    }

    for (let index = 0; index < 12; index += 1) {
      const sign = createSign();
      const x = index % 2 === 0 ? -10.8 : 10.8;
      const z = -42 + index * 7.6;
      this.addItem(sign, new THREE.Vector3(x, 0, z), index % 2 === 0 ? -0.2 : 0.2);
    }
  }

  addItem(config, position, rotation = 0) {
    const item = new Destructible(config, position, rotation);
    this.items.push(item);
    this.group.add(item.group);
  }
}
