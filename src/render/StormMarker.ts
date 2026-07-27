import * as THREE from 'three';
import { createWorldSeed, SeededRandom } from '../core/random';
import type { MovementCommand } from '../core/types';

const PARTICLE_COUNT = 260;
const MARKER_HEIGHT = 18;

function createSoftParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context === null) {
    throw new Error('Unable to create the storm marker particle texture.');
  }

  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  gradient.addColorStop(0.35, 'rgba(242, 247, 239, 0.72)');
  gradient.addColorStop(0.72, 'rgba(221, 229, 217, 0.2)');
  gradient.addColorStop(1, 'rgba(221, 229, 217, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export class StormMarker {
  readonly object = new THREE.Group();
  private readonly particles: THREE.Points;
  private readonly particleGeometry: THREE.BufferGeometry;
  private readonly particleMaterial: THREE.PointsMaterial;
  private readonly particleTexture = createSoftParticleTexture();
  private readonly positions = new Float32Array(PARTICLE_COUNT * 3);
  private readonly heightSeeds = new Float32Array(PARTICLE_COUNT);
  private readonly angleSeeds = new Float32Array(PARTICLE_COUNT);
  private readonly radiusSeeds = new Float32Array(PARTICLE_COUNT);
  private readonly groundContact: THREE.Mesh<
    THREE.CircleGeometry,
    THREE.MeshBasicMaterial
  >;
  private effectsScale = 1;

  constructor() {
    this.object.name = 'FoundationStormMarker';

    const random = new SeededRandom(createWorldSeed('townfall:v2:storm-marker'));
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      this.heightSeeds[index] = random.next();
      this.angleSeeds[index] = random.range(0, Math.PI * 2);
      this.radiusSeeds[index] = random.range(0.35, 1);
    }

    this.particleGeometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(this.positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    this.particleGeometry.setAttribute('position', positionAttribute);
    this.particleGeometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, MARKER_HEIGHT * 0.5, 0),
      24,
    );

    this.particleMaterial = new THREE.PointsMaterial({
      color: 0xdce3d8,
      size: 0.72,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      map: this.particleTexture,
      alphaTest: 0.015,
      fog: true,
    });
    this.particles = new THREE.Points(
      this.particleGeometry,
      this.particleMaterial,
    );
    this.particles.name = 'FoundationStormParticles';
    this.particles.frustumCulled = false;
    this.object.add(this.particles);

    this.groundContact = new THREE.Mesh(
      new THREE.CircleGeometry(3.7, 32),
      new THREE.MeshBasicMaterial({
        color: 0x56635a,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    this.groundContact.name = 'FoundationGroundContact';
    this.groundContact.rotation.x = -Math.PI * 0.5;
    this.groundContact.position.y = 0.05;
    this.object.add(this.groundContact);
    this.update(0, {
      x: 0,
      y: 0,
      magnitude: 0,
      source: 'idle',
    });
  }

  setPosition(x: number, z: number): void {
    this.object.position.set(x, 0, z);
  }

  setEffectsScale(scale: number): void {
    this.effectsScale = Math.max(0.25, scale);
    this.particleMaterial.size = 0.72 * (0.8 + this.effectsScale * 0.2);
    this.particleMaterial.opacity = 0.48 + this.effectsScale * 0.24;
  }

  update(timeSeconds: number, command: MovementCommand): void {
    const visibleCount = Math.max(
      72,
      Math.round(PARTICLE_COUNT * Math.min(1, this.effectsScale)),
    );
    this.particleGeometry.setDrawRange(0, visibleCount);

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const heightSeed = this.heightSeeds[index] ?? 0;
      const angleSeed = this.angleSeeds[index] ?? 0;
      const radiusSeed = this.radiusSeeds[index] ?? 0;
      const cycle = (heightSeed + timeSeconds * (0.055 + radiusSeed * 0.025)) % 1;
      const height = 0.3 + cycle * MARKER_HEIGHT;
      const taper = 0.45 + cycle * 3.2;
      const radius = taper * radiusSeed;
      const angle = angleSeed
        + timeSeconds * (1.9 - cycle * 0.55)
        + Math.sin(timeSeconds * 0.7 + cycle * 8) * 0.18;
      const centerWobble = Math.sin(timeSeconds * 0.8 + cycle * 7.5)
        * cycle
        * 0.75;
      const offset = index * 3;
      this.positions[offset] = Math.cos(angle) * radius
        + centerWobble
        - command.x * cycle * 1.4;
      this.positions[offset + 1] = height;
      this.positions[offset + 2] = Math.sin(angle) * radius
        + Math.cos(timeSeconds * 0.65 + cycle * 6) * cycle * 0.55
        - command.y * cycle * 1.4;
    }

    const positionAttribute = this.particleGeometry.getAttribute('position');
    positionAttribute.needsUpdate = true;
    const pulse = 0.97 + Math.sin(timeSeconds * 2.2) * 0.035;
    this.groundContact.scale.setScalar(pulse);
  }

  dispose(): void {
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    this.particleTexture.dispose();
    this.groundContact.geometry.dispose();
    this.groundContact.material.dispose();
  }
}
