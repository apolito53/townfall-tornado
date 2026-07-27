import * as THREE from 'three';

const PARTICLE_CAPACITY = 7000;
const CHUNK_CAPACITY = 340;
const MAX_PARTICLE_EMISSIONS_PER_FRAME = 720;
const MAX_CHUNK_EMISSIONS_PER_FRAME = 36;
const CHUNK_GRAVITY = 10.5;
const DEFAULT_PARTICLE_COLOR = 0x746855;

const PARTICLE_COLORS = {
  dust: 0x8f8067,
  soil: 0x554530,
  structure: 0xc3ad8b,
  roof: 0x9b5548,
  wood: 0x765236,
  leaf: 0x3f7d4d,
  glass: 0x9fc4ca,
  metal: 0xb8b1a6,
};

const PARTICLE_VERTEX_SHADER = `
  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aSpawnTime;
  attribute float aLifetime;
  attribute float aSize;
  attribute float aSwirl;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uStormRadius;
  uniform float uStormStrength;
  uniform vec3 uStormPosition;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    float age = uTime - aSpawnTime;
    float alive = step(0.0, age) * step(age, aLifetime);
    float lifeRatio = clamp(age / max(aLifetime, 0.001), 0.0, 1.0);
    vec3 displaced = position + aVelocity * age;

    vec2 stormDelta = uStormPosition.xz - displaced.xz;
    float stormDistance = max(length(stormDelta), 0.001);
    vec2 toStorm = stormDelta / stormDistance;
    vec2 tangent = vec2(-toStorm.y, toStorm.x);
    float stormFalloff = clamp(1.0 - stormDistance / max(uStormRadius, 1.0), 0.0, 1.0);
    float turbulence = sin(age * (3.4 + aSeed * 2.1) + aSeed * 6.28318);

    displaced.xz += tangent * turbulence * aSwirl * (0.18 + uStormStrength * 0.9) * stormFalloff * (1.0 - lifeRatio);
    displaced.xz += toStorm * aSwirl * uStormStrength * stormFalloff * age * 0.44;
    displaced.y += aSwirl * stormFalloff * age * (0.7 + uStormStrength * 0.8);
    displaced.y -= age * age * (0.16 + (1.0 - aSwirl) * 0.26);

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float perspective = clamp(260.0 / max(12.0, -mvPosition.z), 0.18, 18.0);
    gl_PointSize = aSize * perspective * uPixelRatio * alive * (0.22 + pow(1.0 - lifeRatio, 0.72));

    vColor = aColor;
    vAlpha = alive * pow(1.0 - lifeRatio, 1.34);
    vSeed = aSeed;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 centeredUv = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(centeredUv);
    float softDisc = smoothstep(0.5, 0.12, distanceFromCenter);
    float brokenEdge = 0.82 + 0.18 * sin((centeredUv.x + centeredUv.y + vSeed) * 34.0);
    float alpha = softDisc * brokenEdge * vAlpha * 0.72;

    if (alpha < 0.01) {
      discard;
    }

    float warmCore = smoothstep(0.34, 0.02, distanceFromCenter);
    gl_FragColor = vec4(vColor * (0.82 + warmCore * 0.22), alpha);
  }
`;

function resolveColor(colorOrType: any = 'structure') {
  if (typeof colorOrType === 'number') {
    return new THREE.Color(colorOrType);
  }

  if (colorOrType?.isColor) {
    return colorOrType.clone();
  }

  return new THREE.Color(PARTICLE_COLORS[colorOrType] ?? DEFAULT_PARTICLE_COLOR);
}

function randomHorizontalVector(scale = 1) {
  const angle = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(angle) * scale, 0, Math.sin(angle) * scale);
}

export class DebrisParticles {
  [key: string]: any;

  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Debris visual pools';
    this.scene.add(this.group);

    this.time = 0;
    this.particleCursor = 0;
    this.chunkCursor = 0;
    this.frameParticleEmissions = 0;
    this.frameChunkEmissions = 0;
    this.emittedParticles = 0;
    this.skippedParticleEmissions = 0;
    this.recycledParticles = 0;
    this.emittedChunks = 0;
    this.skippedChunks = 0;
    this.recycledChunks = 0;
    this.activeParticles = 0;
    this.activeChunks = 0;
    this.particleQualityScale = 1;
    this.chunkQualityScale = 1;
    this.pixelRatioCap = 1.6;

    this.createParticleBatch();
    this.createChunkPool();
  }

  beginFrame() {
    this.frameParticleEmissions = 0;
    this.frameChunkEmissions = 0;
  }

  setQuality({ particleScale = 1, chunkScale = 1, pixelRatioCap = 1.6 } = {}) {
    this.particleQualityScale = THREE.MathUtils.clamp(particleScale, 0.15, 1.25);
    this.chunkQualityScale = THREE.MathUtils.clamp(chunkScale, 0.1, 1.25);
    this.pixelRatioCap = THREE.MathUtils.clamp(pixelRatioCap, 0.5, 1.6);
  }

  scaleParticleCount(count, minimum = 1) {
    return Math.max(minimum, Math.round(count * this.particleQualityScale));
  }

  scaleChunkCount(count, minimum = 0) {
    return Math.max(minimum, Math.round(count * this.chunkQualityScale));
  }

  createParticleBatch() {
    this.particlePositions = new Float32Array(PARTICLE_CAPACITY * 3);
    this.particleVelocities = new Float32Array(PARTICLE_CAPACITY * 3);
    this.particleColors = new Float32Array(PARTICLE_CAPACITY * 3);
    this.particleSpawnTimes = new Float32Array(PARTICLE_CAPACITY);
    this.particleLifetimes = new Float32Array(PARTICLE_CAPACITY);
    this.particleSizes = new Float32Array(PARTICLE_CAPACITY);
    this.particleSwirls = new Float32Array(PARTICLE_CAPACITY);
    this.particleSeeds = new Float32Array(PARTICLE_CAPACITY);

    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      this.particleSpawnTimes[index] = -1000;
      this.particleLifetimes[index] = 0;
      this.particleColors[index * 3] = 1;
      this.particleColors[index * 3 + 1] = 1;
      this.particleColors[index * 3 + 2] = 1;
      this.particleSeeds[index] = Math.random();
    }

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.particleVelocities, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aColor', new THREE.BufferAttribute(this.particleColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aSpawnTime', new THREE.BufferAttribute(this.particleSpawnTimes, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aLifetime', new THREE.BufferAttribute(this.particleLifetimes, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.particleSizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aSwirl', new THREE.BufferAttribute(this.particleSwirls, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.setAttribute('aSeed', new THREE.BufferAttribute(this.particleSeeds, 1).setUsage(THREE.DynamicDrawUsage));
    this.particleGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10000);

    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, this.pixelRatioCap) },
        uStormPosition: { value: new THREE.Vector3() },
        uStormRadius: { value: 8 },
        uStormStrength: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });

    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.particles.name = 'GPU debris particles';
    this.particles.frustumCulled = false;
    this.group.add(this.particles);
  }

  createChunkPool() {
    this.chunkGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.chunkMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.02,
      vertexColors: true,
    });
    this.chunkMesh = new THREE.InstancedMesh(this.chunkGeometry, this.chunkMaterial, CHUNK_CAPACITY);
    this.chunkMesh.name = 'Pooled instanced debris chunks';
    this.chunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chunkMesh.castShadow = false;
    this.chunkMesh.receiveShadow = false;
    this.chunkMesh.frustumCulled = false;
    this.chunkMesh.count = 0;
    this.group.add(this.chunkMesh);

    this.chunkTransform = new THREE.Object3D();
    this.chunkColor = new THREE.Color();
    this.chunkSlots = Array.from({ length: CHUNK_CAPACITY }, () => ({
      active: false,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      angularVelocity: new THREE.Vector3(),
      scale: new THREE.Vector3(1, 1, 1),
      color: new THREE.Color(DEFAULT_PARTICLE_COLOR),
      age: 0,
      lifetime: 0,
      floorY: 0,
    }));
  }

  emitGroundDust(position, radius = 2, intensity = 1) {
    const color = resolveColor('dust');
    const particleCount = this.scaleParticleCount(Math.min(180, Math.max(8, Math.round(radius * 6.5 * intensity))), 4);

    for (let index = 0; index < particleCount; index += 1) {
      const distance = Math.sqrt(Math.random()) * radius;
      const offset = randomHorizontalVector(distance);
      const spawnPosition = new THREE.Vector3(position.x + offset.x, 0.16 + Math.random() * 0.3, position.z + offset.z);
      const outward = offset.lengthSq() > 0.001 ? offset.clone().normalize() : randomHorizontalVector(1).normalize();
      const velocity = new THREE.Vector3(
        outward.x * (0.8 + Math.random() * 3.2),
        0.45 + Math.random() * (1.2 + intensity),
        outward.z * (0.8 + Math.random() * 3.2),
      );

      this.emitParticle({
        position: spawnPosition,
        velocity,
        color,
        lifetime: 1.2 + Math.random() * 1.4,
        size: 10 + Math.random() * 20 + radius * 0.18,
        swirl: 0.18 + intensity * 0.16,
      });
    }
  }

  emitStructuralBurst(position, radius = 2, materialType = 'structure', intensity = 1) {
    const color = resolveColor(materialType);
    const particleCount = this.scaleParticleCount(Math.min(240, Math.max(10, Math.round(radius * 12 * intensity))), 5);

    for (let index = 0; index < particleCount; index += 1) {
      const offset = randomHorizontalVector(Math.random() * radius * 0.45);
      const velocity = randomHorizontalVector(1.4 + Math.random() * (4.8 + radius * 0.15));
      velocity.y = 1.4 + Math.random() * (3.2 + radius * 0.2);
      this.emitParticle({
        position: new THREE.Vector3(position.x + offset.x, position.y + 0.3 + Math.random() * Math.max(1, radius * 0.35), position.z + offset.z),
        velocity,
        color,
        lifetime: 0.85 + Math.random() * 1.4,
        size: 4 + Math.random() * 9 + radius * 0.16,
        swirl: 0.22 + intensity * 0.28,
      });
    }

    const chunkCount = this.scaleChunkCount(Math.min(18, Math.max(1, Math.round(radius * 1.4 * intensity))), 1);
    for (let index = 0; index < chunkCount; index += 1) {
      const velocity = randomHorizontalVector(2 + Math.random() * 4.6);
      velocity.y = 2 + Math.random() * 4.2;
      this.emitChunk({
        position: new THREE.Vector3(
          position.x + (Math.random() - 0.5) * radius,
          position.y + 0.4 + Math.random() * Math.max(0.8, radius * 0.24),
          position.z + (Math.random() - 0.5) * radius,
        ),
        velocity,
        color,
        size: 0.2 + Math.random() * Math.max(0.28, radius * 0.12),
        lifetime: 1.5 + Math.random() * 2.2,
      });
    }
  }

  emitSuctionDebris(position, stormProfile, intensity = 1, stormPosition = position) {
    const particleCount = this.scaleParticleCount(Math.min(160, Math.max(8, Math.round(stormProfile.category * 14 * intensity))), 3);
    const color = resolveColor('soil');

    for (let index = 0; index < particleCount; index += 1) {
      const offset = randomHorizontalVector(Math.random() * Math.max(1, stormProfile.radius * 0.6));
      const spawnPosition = new THREE.Vector3(position.x + offset.x, position.y + Math.random() * 1.4, position.z + offset.z);
      const toStorm = stormPosition.clone().sub(spawnPosition);
      if (toStorm.lengthSq() < 0.001) {
        toStorm.copy(randomHorizontalVector(1));
      }
      toStorm.y = 0;
      toStorm.normalize();
      const tangent = new THREE.Vector3(-toStorm.z, 0, toStorm.x);
      const velocity = toStorm.multiplyScalar(2 + Math.random() * 3.5).addScaledVector(tangent, (Math.random() - 0.5) * 5.5);
      velocity.y = 1.8 + Math.random() * (3.8 + stormProfile.category);
      this.emitParticle({
        position: spawnPosition,
        velocity,
        color,
        lifetime: 1.1 + Math.random() * 1.6,
        size: 4 + Math.random() * 9,
        swirl: 0.62 + intensity * 0.34,
      });
    }
  }

  emitChunk({ position, velocity, color = 'structure', size = 0.35, lifetime = 2.4 }) {
    const frameChunkLimit = Math.max(4, Math.round(MAX_CHUNK_EMISSIONS_PER_FRAME * this.chunkQualityScale));
    if (this.frameChunkEmissions >= frameChunkLimit) {
      this.skippedChunks += 1;
      return false;
    }

    const slotIndex = this.claimChunkSlot();
    if (slotIndex < 0) {
      this.skippedChunks += 1;
      return false;
    }

    const slot = this.chunkSlots[slotIndex];
    slot.active = true;
    slot.position.copy(position);
    slot.velocity.copy(velocity);
    slot.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    slot.angularVelocity.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 6,
    );
    slot.scale.set(
      size * (0.7 + Math.random() * 1.4),
      size * (0.28 + Math.random() * 0.7),
      size * (0.7 + Math.random() * 1.2),
    );
    slot.color.copy(resolveColor(color));
    slot.age = 0;
    slot.lifetime = lifetime;
    slot.floorY = Math.max(0.08, slot.scale.y * 0.5);
    this.frameChunkEmissions += 1;
    this.emittedChunks += 1;
    return true;
  }

  emitParticle({ position, velocity, color, lifetime, size, swirl }) {
    const frameParticleLimit = Math.max(80, Math.round(MAX_PARTICLE_EMISSIONS_PER_FRAME * this.particleQualityScale));
    if (this.frameParticleEmissions >= frameParticleLimit) {
      this.skippedParticleEmissions += 1;
      return false;
    }

    const index = this.particleCursor;
    const existingAge = this.time - this.particleSpawnTimes[index];
    if (existingAge >= 0 && existingAge < this.particleLifetimes[index]) {
      this.recycledParticles += 1;
    }

    const offset = index * 3;
    this.particlePositions[offset] = position.x;
    this.particlePositions[offset + 1] = position.y;
    this.particlePositions[offset + 2] = position.z;
    this.particleVelocities[offset] = velocity.x;
    this.particleVelocities[offset + 1] = velocity.y;
    this.particleVelocities[offset + 2] = velocity.z;
    this.particleColors[offset] = color.r;
    this.particleColors[offset + 1] = color.g;
    this.particleColors[offset + 2] = color.b;
    this.particleSpawnTimes[index] = this.time;
    this.particleLifetimes[index] = lifetime;
    this.particleSizes[index] = size;
    this.particleSwirls[index] = swirl;
    this.particleSeeds[index] = Math.random();
    this.particleCursor = (index + 1) % PARTICLE_CAPACITY;
    this.frameParticleEmissions += 1;
    this.emittedParticles += 1;
    this.needsParticleUpload = true;
    return true;
  }

  claimChunkSlot() {
    for (let checked = 0; checked < CHUNK_CAPACITY; checked += 1) {
      const slotIndex = (this.chunkCursor + checked) % CHUNK_CAPACITY;
      if (!this.chunkSlots[slotIndex].active) {
        this.chunkCursor = (slotIndex + 1) % CHUNK_CAPACITY;
        return slotIndex;
      }
    }

    const recycledSlot = this.chunkCursor;
    this.recycledChunks += 1;
    this.chunkCursor = (this.chunkCursor + 1) % CHUNK_CAPACITY;
    return recycledSlot;
  }

  update(time, dt, stormPosition, stormProfile) {
    this.time = time;
    this.particleMaterial.uniforms.uTime.value = time;
    this.particleMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, this.pixelRatioCap);
    this.particleMaterial.uniforms.uStormPosition.value.copy(stormPosition);
    this.particleMaterial.uniforms.uStormRadius.value = stormProfile.pullRadius;
    this.particleMaterial.uniforms.uStormStrength.value = THREE.MathUtils.clamp(stormProfile.category / 5, 0.15, 1.25);

    if (this.needsParticleUpload) {
      for (const name of ['position', 'aVelocity', 'aColor', 'aSpawnTime', 'aLifetime', 'aSize', 'aSwirl', 'aSeed']) {
        this.particleGeometry.getAttribute(name).needsUpdate = true;
      }
      this.needsParticleUpload = false;
    }

    this.activeParticles = 0;
    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const age = time - this.particleSpawnTimes[index];
      if (age >= 0 && age < this.particleLifetimes[index]) {
        this.activeParticles += 1;
      }
    }

    this.updateChunks(dt, stormPosition, stormProfile);
  }

  updateChunks(dt, stormPosition, stormProfile) {
    let instanceIndex = 0;
    const stormStrength = THREE.MathUtils.clamp(stormProfile.category / 5, 0.12, 1.2);

    for (const slot of this.chunkSlots) {
      if (!slot.active) {
        continue;
      }

      slot.age += dt;
      if (slot.age >= slot.lifetime) {
        slot.active = false;
        continue;
      }

      const toStorm = stormPosition.clone().sub(slot.position);
      toStorm.y = 0;
      const distance = toStorm.length();
      if (distance > 0.001 && distance < stormProfile.pullRadius) {
        const inward = toStorm.normalize();
        const tangent = new THREE.Vector3(-inward.z, 0, inward.x);
        const pull = (1 - distance / stormProfile.pullRadius) * stormStrength;
        slot.velocity.addScaledVector(inward, pull * dt * 7);
        slot.velocity.addScaledVector(tangent, pull * dt * 5.6);
        slot.velocity.y += pull * dt * 4.4;
      }

      slot.velocity.y -= CHUNK_GRAVITY * dt;
      slot.position.addScaledVector(slot.velocity, dt);
      slot.rotation.x += slot.angularVelocity.x * dt;
      slot.rotation.y += slot.angularVelocity.y * dt;
      slot.rotation.z += slot.angularVelocity.z * dt;

      if (slot.position.y <= slot.floorY) {
        slot.position.y = slot.floorY;
        slot.velocity.y *= -0.14;
        slot.velocity.x *= 1 - Math.min(0.92, dt * 5);
        slot.velocity.z *= 1 - Math.min(0.92, dt * 5);
        slot.angularVelocity.multiplyScalar(1 - Math.min(0.9, dt * 4));
      }

      const fadeScale = THREE.MathUtils.clamp((slot.lifetime - slot.age) / 0.45, 0, 1);
      this.chunkTransform.position.copy(slot.position);
      this.chunkTransform.rotation.copy(slot.rotation);
      this.chunkTransform.scale.copy(slot.scale).multiplyScalar(fadeScale);
      this.chunkTransform.updateMatrix();
      this.chunkMesh.setMatrixAt(instanceIndex, this.chunkTransform.matrix);
      this.chunkMesh.setColorAt(instanceIndex, slot.color);
      instanceIndex += 1;
    }

    this.activeChunks = instanceIndex;
    this.chunkMesh.count = instanceIndex;
    this.chunkMesh.instanceMatrix.needsUpdate = true;
    if (this.chunkMesh.instanceColor) {
      this.chunkMesh.instanceColor.needsUpdate = true;
    }
  }

  reset() {
    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      this.particleSpawnTimes[index] = -1000;
      this.particleLifetimes[index] = 0;
    }

    for (const slot of this.chunkSlots) {
      slot.active = false;
      slot.age = 0;
      slot.lifetime = 0;
    }

    this.particleCursor = 0;
    this.chunkCursor = 0;
    this.activeParticles = 0;
    this.activeChunks = 0;
    this.emittedParticles = 0;
    this.skippedParticleEmissions = 0;
    this.recycledParticles = 0;
    this.emittedChunks = 0;
    this.skippedChunks = 0;
    this.recycledChunks = 0;
    this.chunkMesh.count = 0;
    this.needsParticleUpload = true;
  }

  getDiagnostics() {
    return {
      activeParticles: this.activeParticles,
      particleCapacity: PARTICLE_CAPACITY,
      emittedParticles: this.emittedParticles,
      skippedParticleEmissions: this.skippedParticleEmissions,
      recycledParticles: this.recycledParticles,
      activeChunks: this.activeChunks,
      chunkCapacity: CHUNK_CAPACITY,
      emittedChunks: this.emittedChunks,
      skippedChunks: this.skippedChunks,
      recycledChunks: this.recycledChunks,
      particleQualityScale: this.particleQualityScale,
      chunkQualityScale: this.chunkQualityScale,
    };
  }
}
