import * as THREE from 'three';
import type { StormSnapshot } from '../core/types';
import type { StormReviewProfile } from '../storm/stormProfiles';

const CONDENSATION_CAPACITY = 4200;
const GROUND_DUST_CAPACITY = 1800;

export interface StormSilhouetteDiagnostics {
  batches: 2;
  activeCondensation: number;
  condensationCapacity: number;
  activeGroundDust: number;
  groundDustCapacity: number;
}

interface ParticleAttributes {
  height: Float32Array;
  radius: Float32Array;
  angle: Float32Array;
  seed: Float32Array;
  size: Float32Array;
}

function randomFromIndex(index: number, salt: number): number {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createAttributes(
  count: number,
  heightPower: number,
): ParticleAttributes {
  const height = new Float32Array(count);
  const radius = new Float32Array(count);
  const angle = new Float32Array(count);
  const seed = new Float32Array(count);
  const size = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    height[index] = randomFromIndex(index, 1) ** heightPower;
    radius[index] = Math.sqrt(randomFromIndex(index, 2));
    angle[index] = randomFromIndex(index, 3) * Math.PI * 2;
    seed[index] = randomFromIndex(index, 4);
    size[index] = THREE.MathUtils.lerp(
      0.58,
      1.38,
      randomFromIndex(index, 5),
    );
  }
  return { height, radius, angle, seed, size };
}

function createGeometry(
  name: string,
  count: number,
  heightPower: number,
): THREE.BufferGeometry {
  const attributes = createAttributes(count, heightPower);
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute(
    'aHeight',
    new THREE.BufferAttribute(attributes.height, 1),
  );
  geometry.setAttribute(
    'aRadius',
    new THREE.BufferAttribute(attributes.radius, 1),
  );
  geometry.setAttribute(
    'aAngle',
    new THREE.BufferAttribute(attributes.angle, 1),
  );
  geometry.setAttribute(
    'aSeed',
    new THREE.BufferAttribute(attributes.seed, 1),
  );
  geometry.setAttribute(
    'aSize',
    new THREE.BufferAttribute(attributes.size, 1),
  );
  geometry.setDrawRange(0, count);
  return geometry;
}

const SOFT_POINT_FRAGMENT_SHADER = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(centered) * 2.0;
    float alpha = smoothstep(1.0, 0.12, distanceFromCenter);
    alpha *= alpha * uOpacity;
    if (alpha < 0.015) {
      discard;
    }
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function createCondensationMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'TemporaryCondensationSilhouetteMaterial',
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: 40 },
      uHeight: { value: 260 },
      uPointScale: { value: 1 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(0x59635f) },
      uOpacity: { value: 0.085 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uRadius;
      uniform float uHeight;
      uniform float uPointScale;
      uniform float uPixelRatio;
      attribute float aHeight;
      attribute float aRadius;
      attribute float aAngle;
      attribute float aSeed;
      attribute float aSize;

      void main() {
        float spin = uTime * mix(0.34, 0.76, aSeed);
        float angle = aAngle + spin + aHeight * 7.0;
        float bodyWidth = mix(0.12, 0.88, pow(aHeight, 0.72));
        float asymmetricPulse = 1.0
          + sin(aHeight * 15.0 + uTime * 0.42 + aSeed * 8.0) * 0.13;
        float radialDistance = uRadius * bodyWidth * aRadius
          * asymmetricPulse;
        float leanX = sin(aHeight * 4.2 + uTime * 0.18) * uRadius * 0.13
          + aHeight * aHeight * uRadius * 0.08;
        float leanZ = cos(aHeight * 3.4 - uTime * 0.14) * uRadius * 0.08;

        vec3 localPosition = vec3(
          cos(angle) * radialDistance + leanX,
          aHeight * uHeight,
          sin(angle) * radialDistance + leanZ
        );
        vec4 viewPosition = modelViewMatrix * vec4(localPosition, 1.0);
        gl_Position = projectionMatrix * viewPosition;

        float worldSize = max(14.0, uRadius * 0.075) * aSize * uPointScale;
        gl_PointSize = clamp(
          worldSize * uPixelRatio * (260.0 / max(1.0, -viewPosition.z)),
          1.25,
          42.0
        );
      }
    `,
    fragmentShader: SOFT_POINT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

function createGroundDustMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'TemporaryGroundDustCirculationMaterial',
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: 40 },
      uDustHeight: { value: 14 },
      uPointScale: { value: 1 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Color(0x756e5f) },
      uOpacity: { value: 0.1 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uRadius;
      uniform float uDustHeight;
      uniform float uPointScale;
      uniform float uPixelRatio;
      attribute float aHeight;
      attribute float aRadius;
      attribute float aAngle;
      attribute float aSeed;
      attribute float aSize;

      void main() {
        float spin = uTime * mix(0.48, 1.15, aSeed);
        float angle = aAngle + spin;
        float radialDistance = uRadius
          * mix(0.14, 1.08, aRadius)
          * (0.92 + sin(aAngle * 3.0 + uTime * 0.35) * 0.08);
        float lift = aHeight * uDustHeight
          + sin(aAngle * 4.0 + uTime + aSeed * 10.0) * uDustHeight * 0.08;

        vec3 localPosition = vec3(
          cos(angle) * radialDistance,
          max(0.35, lift),
          sin(angle) * radialDistance
        );
        vec4 viewPosition = modelViewMatrix * vec4(localPosition, 1.0);
        gl_Position = projectionMatrix * viewPosition;

        float worldSize = max(10.0, uRadius * 0.05) * aSize * uPointScale;
        gl_PointSize = clamp(
          worldSize * uPixelRatio * (260.0 / max(1.0, -viewPosition.z)),
          1.0,
          34.0
        );
      }
    `,
    fragmentShader: SOFT_POINT_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
}

function setUniform(
  material: THREE.ShaderMaterial,
  name: string,
  value: unknown,
): void {
  const uniform = material.uniforms[name];
  if (uniform === undefined) {
    throw new Error(`Missing storm shader uniform ${name}.`);
  }
  uniform.value = value;
}

/**
 * An honest Milestone 2 scale and motion placeholder. It intentionally avoids
 * pretending to be the final volumetric tornado renderer planned for M3.
 */
export class StormSilhouette {
  readonly object = new THREE.Group();
  private readonly condensationGeometry = createGeometry(
    'TemporaryCondensationGeometry',
    CONDENSATION_CAPACITY,
    0.82,
  );
  private readonly groundDustGeometry = createGeometry(
    'TemporaryGroundDustGeometry',
    GROUND_DUST_CAPACITY,
    1.75,
  );
  private readonly condensationMaterial = createCondensationMaterial();
  private readonly groundDustMaterial = createGroundDustMaterial();
  private readonly condensation = new THREE.Points(
    this.condensationGeometry,
    this.condensationMaterial,
  );
  private readonly groundDust = new THREE.Points(
    this.groundDustGeometry,
    this.groundDustMaterial,
  );
  private effectsScale = 1;
  private activeCondensation = CONDENSATION_CAPACITY;
  private activeGroundDust = GROUND_DUST_CAPACITY;

  constructor() {
    this.object.name = 'TemporaryStormSilhouette';
    this.condensation.name = 'TemporaryCondensationBatch';
    this.groundDust.name = 'TemporaryGroundDustBatch';
    this.condensation.frustumCulled = false;
    this.groundDust.frustumCulled = false;
    this.object.add(this.condensation, this.groundDust);
  }

  applyQuality(stormFxScale: number, pixelRatio: number): void {
    this.effectsScale = THREE.MathUtils.clamp(stormFxScale, 0, 1);
    this.object.visible = this.effectsScale > 0.01;
    setUniform(this.condensationMaterial, 'uPointScale', THREE.MathUtils.lerp(
      0.72,
      1,
      this.effectsScale,
    ));
    setUniform(this.groundDustMaterial, 'uPointScale', THREE.MathUtils.lerp(
      0.7,
      1,
      this.effectsScale,
    ));
    setUniform(this.condensationMaterial, 'uPixelRatio', pixelRatio);
    setUniform(this.groundDustMaterial, 'uPixelRatio', pixelRatio);
  }

  update(
    timeSeconds: number,
    snapshot: StormSnapshot,
    profile: StormReviewProfile,
  ): void {
    this.object.position.set(
      snapshot.position.x,
      snapshot.position.y + 0.4,
      snapshot.position.z,
    );
    setUniform(this.condensationMaterial, 'uTime', timeSeconds);
    setUniform(this.condensationMaterial, 'uRadius', profile.radius);
    setUniform(this.condensationMaterial, 'uHeight', profile.visualHeight);
    setUniform(this.groundDustMaterial, 'uTime', timeSeconds);
    setUniform(this.groundDustMaterial, 'uRadius', profile.radius);
    setUniform(this.groundDustMaterial, 'uDustHeight', Math.min(
      82,
      Math.max(12, profile.radius * 0.095),
    ));

    this.activeCondensation = Math.min(
      CONDENSATION_CAPACITY,
      Math.round(
        CONDENSATION_CAPACITY
          * (0.34 + profile.condensationDensity * 0.66)
          * this.effectsScale,
      ),
    );
    this.activeGroundDust = Math.min(
      GROUND_DUST_CAPACITY,
      Math.round(
        GROUND_DUST_CAPACITY
          * (0.4 + profile.condensationDensity * 0.6)
          * this.effectsScale,
      ),
    );
    this.condensationGeometry.setDrawRange(0, this.activeCondensation);
    this.groundDustGeometry.setDrawRange(0, this.activeGroundDust);
  }

  getDiagnostics(): StormSilhouetteDiagnostics {
    return {
      batches: 2,
      activeCondensation: this.activeCondensation,
      condensationCapacity: CONDENSATION_CAPACITY,
      activeGroundDust: this.activeGroundDust,
      groundDustCapacity: GROUND_DUST_CAPACITY,
    };
  }

  dispose(): void {
    this.condensationGeometry.dispose();
    this.groundDustGeometry.dispose();
    this.condensationMaterial.dispose();
    this.groundDustMaterial.dispose();
  }
}
