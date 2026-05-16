import * as THREE from 'three';

const ZERO_SCALE = new THREE.Vector3(0, 0, 0);

const BATCH_DEFINITIONS = {
  houseBody: {
    capacity: 7200,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, vertexColors: true }),
  },
  houseRoof: {
    capacity: 7200,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, vertexColors: true }),
  },
  treeTrunk: {
    capacity: 5200,
    geometry: new THREE.CylinderGeometry(1, 1, 1, 8),
    material: new THREE.MeshStandardMaterial({ color: 0x745035, roughness: 0.94 }),
  },
  treeCanopy: {
    capacity: 5200,
    geometry: new THREE.IcosahedronGeometry(1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0x31774a, roughness: 0.9 }),
  },
  fence: {
    capacity: 8200,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0xd6c4a2, roughness: 0.95 }),
  },
  carBody: {
    capacity: 3600,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.66, vertexColors: true }),
  },
  carCabin: {
    capacity: 3600,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0x8fb1c2, roughness: 0.38 }),
  },
  roadStripe: {
    capacity: 18000,
    geometry: new THREE.BoxGeometry(1, 1, 1),
    material: new THREE.MeshStandardMaterial({ color: 0xe9d878, roughness: 0.85 }),
  },
};

function colorForHouse(type, variant = 0) {
  if (type === 'Shop') {
    return variant % 2 === 0 ? 0xbfc9d3 : 0xa15f4d;
  }

  return variant % 2 === 0 ? 0xc9d4c8 : 0xd1b18e;
}

function colorForRoof(variant = 0) {
  if (variant % 3 === 0) {
    return 0x427d64;
  }

  return variant % 4 === 0 ? 0x394f4b : 0x9b4c44;
}

function colorForCar(variant = 0) {
  return variant % 2 === 0 ? 0x3f6e99 : 0xd6a744;
}

class InstanceBatch {
  [key: string]: any;

  constructor(name, definition) {
    this.name = name;
    this.capacity = definition.capacity;
    this.usedCount = 0;
    this.visibleCount = 0;
    this.skippedInstances = 0;
    this.records = [];
    this.transform = new THREE.Object3D();
    this.color = new THREE.Color();
    this.mesh = new THREE.InstancedMesh(definition.geometry, definition.material, definition.capacity);
    this.mesh.name = `Instanced ${name}`;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  add({ position, rotationY = 0, scale, color = null }) {
    if (this.usedCount >= this.capacity) {
      this.skippedInstances += 1;
      return null;
    }

    const id = this.usedCount;
    this.usedCount += 1;
    this.mesh.count = this.usedCount;
    const record = {
      id,
      visible: true,
      position: position.clone(),
      rotationY,
      scale: scale.clone(),
      color,
    };
    this.records[id] = record;
    this.visibleCount += 1;
    this.writeRecord(record);
    return { batch: this, id };
  }

  setVisible(id, visible) {
    const record = this.records[id];
    if (!record || record.visible === visible) {
      return;
    }

    record.visible = visible;
    this.visibleCount += visible ? 1 : -1;
    this.writeRecord(record);
  }

  writeRecord(record) {
    this.transform.position.copy(record.position);
    this.transform.rotation.set(0, record.rotationY, 0);
    this.transform.scale.copy(record.visible ? record.scale : ZERO_SCALE);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(record.id, this.transform.matrix);

    if (record.color !== null) {
      this.color.setHex(record.color);
      this.mesh.setColorAt(record.id, this.color);
      if (this.mesh.instanceColor) {
        this.mesh.instanceColor.needsUpdate = true;
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
  }

  getStats() {
    return {
      capacity: this.capacity,
      usedCount: this.usedCount,
      visibleCount: this.visibleCount,
      skippedInstances: this.skippedInstances,
    };
  }

  dispose() {
    this.mesh.count = 0;
  }
}

export class TownInstancing {
  [key: string]: any;

  constructor(parentGroup) {
    this.group = new THREE.Group();
    this.group.name = 'Instanced town proxies';
    this.parentGroup = parentGroup;
    this.parentGroup.add(this.group);
    this.proxyCount = 0;
    this.visibleProxyCount = 0;
    this.skippedProxyCount = 0;
    this.batches = {};

    for (const [name, definition] of Object.entries(BATCH_DEFINITIONS)) {
      const batch = new InstanceBatch(name, definition);
      this.batches[name] = batch;
      this.group.add(batch.mesh);
    }
  }

  addItemProxy(config, position, rotation = 0) {
    const variant = config.variant ?? 0;
    let records = [];

    if (config.type === 'House' || config.type === 'Shop') {
      records = this.addBuildingProxy(config, position, rotation, variant);
    } else if (config.type === 'Tree') {
      records = this.addTreeProxy(position, rotation);
    } else if (config.type === 'Fence') {
      records = this.addFenceProxy(config, position, rotation);
    } else if (config.type === 'Car') {
      records = this.addCarProxy(position, rotation, variant);
    }

    if (records.length === 0 || records.some((record) => record === null)) {
      this.skippedProxyCount += 1;
      return null;
    }

    this.proxyCount += 1;
    this.visibleProxyCount += 1;
    return {
      visible: true,
      records,
    };
  }

  addBuildingProxy(config, position, rotation, variant) {
    const isShop = config.type === 'Shop';
    const width = isShop ? 8.8 : 5.9;
    const depth = isShop ? 6.7 : 5.3;
    const wallHeight = isShop ? 4.0 : 3.2;
    const roofHeight = isShop ? 0.62 : 0.82;

    return [
      this.batches.houseBody.add({
        position: position.clone().add(new THREE.Vector3(0, wallHeight * 0.5 + 0.25, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(width, wallHeight, depth),
        color: colorForHouse(config.type, variant),
      }),
      this.batches.houseRoof.add({
        position: position.clone().add(new THREE.Vector3(0, wallHeight + roofHeight * 0.5 + 0.36, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(width + 1.1, roofHeight, depth + 0.9),
        color: isShop ? 0x427d64 : colorForRoof(variant),
      }),
    ];
  }

  addTreeProxy(position, rotation) {
    return [
      this.batches.treeTrunk.add({
        position: position.clone().add(new THREE.Vector3(0, 1.2, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(0.33, 2.4, 0.33),
      }),
      this.batches.treeCanopy.add({
        position: position.clone().add(new THREE.Vector3(0, 3.0, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(1.28, 1.28, 1.28),
      }),
    ];
  }

  addFenceProxy(config, position, rotation) {
    const length = Math.max(2.6, config.radius * 1.8);
    const localOffset = new THREE.Vector3(Math.cos(rotation), 0, Math.sin(rotation));
    const postOffset = localOffset.multiplyScalar(length * 0.45);

    return [
      this.batches.fence.add({
        position: position.clone().add(new THREE.Vector3(0, 0.52, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(length, 0.26, 0.22),
      }),
      this.batches.fence.add({
        position: position.clone().sub(postOffset).add(new THREE.Vector3(0, 0.55, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(0.24, 1.1, 0.3),
      }),
      this.batches.fence.add({
        position: position.clone().add(postOffset).add(new THREE.Vector3(0, 0.55, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(0.24, 1.1, 0.3),
      }),
    ];
  }

  addCarProxy(position, rotation, variant) {
    return [
      this.batches.carBody.add({
        position: position.clone().add(new THREE.Vector3(0, 0.45, 0)),
        rotationY: rotation,
        scale: new THREE.Vector3(3.4, 0.9, 1.8),
        color: colorForCar(variant),
      }),
      this.batches.carCabin.add({
        position: position.clone().add(new THREE.Vector3(-0.25 * Math.cos(rotation), 1.12, -0.25 * Math.sin(rotation))),
        rotationY: rotation,
        scale: new THREE.Vector3(1.55, 0.72, 1.55),
      }),
    ];
  }

  addRoadStripe(position, scale, rotation = 0) {
    return this.batches.roadStripe.add({
      position,
      rotationY: rotation,
      scale,
    });
  }

  setProxyVisible(proxy, visible) {
    if (!proxy || proxy.visible === visible) {
      return;
    }

    proxy.visible = visible;
    this.visibleProxyCount += visible ? 1 : -1;
    for (const record of proxy.records) {
      record.batch.setVisible(record.id, visible);
    }
  }

  getDiagnostics() {
    let usedInstances = 0;
    let visibleInstances = 0;
    let capacity = 0;
    let skippedInstances = this.skippedProxyCount;
    for (const batch of Object.values(this.batches) as any[]) {
      const stats = batch.getStats();
      usedInstances += stats.usedCount;
      visibleInstances += stats.visibleCount;
      capacity += stats.capacity;
      skippedInstances += stats.skippedInstances;
    }

    return {
      proxyCount: this.proxyCount,
      visibleProxyCount: this.visibleProxyCount,
      usedInstances,
      visibleInstances,
      capacity,
      skippedInstances,
    };
  }

  dispose() {
    for (const batch of Object.values(this.batches) as any[]) {
      batch.dispose();
    }

    this.parentGroup.remove(this.group);
  }
}
