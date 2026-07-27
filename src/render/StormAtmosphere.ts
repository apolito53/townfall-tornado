import * as THREE from 'three';
import { clamp01 } from '../core/math';
import { createWorldSeed, SeededRandom } from '../core/random';
import type {
  RenderQualityProfile,
  WeatherMode,
  WorldPosition,
} from '../core/types';

const SKY_RADIUS = 5_500;
const RAIN_CAPACITY = 1_600;
const RAIN_HALF_WIDTH = 130;
const RAIN_HALF_DEPTH = 110;
const RAIN_CAMERA_Y_OFFSET = -35;

const STORM_FOG_COLOR = 0x78898b;
const STORM_FOG_NEAR = 720;
const STORM_FOG_FAR = 2_850;
const CLEAR_FOG_COLOR = 0xb8c2be;
const CLEAR_FOG_NEAR = 1_600;
const CLEAR_FOG_FAR = 5_200;

const SKY_VERTEX_SHADER = `
  varying vec3 vSkyDirection;

  void main() {
    vSkyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform float uStormAmount;
  uniform float uCloudContrast;

  varying vec3 vSkyDirection;

  float cloudPattern(vec3 direction) {
    vec3 point = direction * vec3(5.1, 2.4, 5.1);
    float flow = uTime * 0.018;
    float broad = sin(point.x * 1.35 + flow + sin(point.z * 1.1));
    float crossing = sin(
      point.z * 2.15 - flow * 0.8 + sin(point.y * 4.0 + point.x)
    );
    float detail = sin(
      dot(point, vec3(2.9, 2.1, -2.6)) + flow * 1.7
    );
    return broad * 0.48 + crossing * 0.34 + detail * 0.18;
  }

  void main() {
    vec3 direction = normalize(vSkyDirection);
    float height = clamp(direction.y, -0.25, 1.0);
    float skyAmount = smoothstep(-0.18, 0.9, height);
    float horizonHaze = 1.0 - smoothstep(-0.08, 0.34, height);

    vec3 clearHorizon = vec3(0.66, 0.72, 0.72);
    vec3 clearZenith = vec3(0.34, 0.51, 0.61);
    vec3 clearSky = mix(clearHorizon, clearZenith, skyAmount);

    vec3 stormHorizon = vec3(0.18, 0.23, 0.24);
    vec3 stormZenith = vec3(0.035, 0.06, 0.08);
    vec3 stormSky = mix(stormHorizon, stormZenith, skyAmount);

    float pattern = cloudPattern(direction);
    float cloud = smoothstep(
      -0.25,
      mix(0.72, 0.38, uCloudContrast),
      pattern + horizonHaze * 0.22
    );
    float stormDeck = 1.0 - smoothstep(0.42, 0.88, height);
    vec3 cloudColor = mix(
      vec3(0.11, 0.16, 0.18),
      vec3(0.34, 0.39, 0.39),
      cloud
    );
    stormSky = mix(stormSky, cloudColor, cloud * stormDeck * 0.56);

    vec3 color = mix(clearSky, stormSky, uStormAmount);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const RAIN_VERTEX_SHADER = `
  uniform float uTime;
  uniform float uPointSize;

  attribute float aSpeed;
  attribute float aBrightness;

  varying float vAlpha;

  void main() {
    float cycle = fract(position.y + uTime * mix(0.42, 0.72, aSpeed));
    vec3 rainPosition = vec3(
      position.x + (cycle - 0.5) * 20.0,
      mix(92.0, -68.0, cycle),
      position.z - cycle * 8.0
    );

    vec4 viewPosition = modelViewMatrix * vec4(rainPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float viewDepth = max(1.0, -viewPosition.z);
    float distanceFade = 1.0 - smoothstep(
      85.0,
      190.0,
      length(viewPosition.xyz)
    );
    float cycleFade = smoothstep(0.01, 0.1, cycle)
      * (1.0 - smoothstep(0.9, 1.0, cycle));
    vAlpha = aBrightness * distanceFade * cycleFade;
    gl_PointSize = clamp(uPointSize * (62.0 / viewDepth), 1.0, 12.0);
  }
`;

const RAIN_FRAGMENT_SHADER = `
  uniform vec3 uRainColor;

  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float narrowBody = 1.0 - smoothstep(0.035, 0.13, abs(point.x));
    float softEnds = 1.0 - smoothstep(0.36, 0.5, abs(point.y));
    float alpha = narrowBody * softEnds * vAlpha;
    if (alpha < 0.015) {
      discard;
    }

    gl_FragColor = vec4(uRainColor, alpha * 0.72);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export interface StormAtmosphereDiagnostics {
  weather: WeatherMode;
  drawCalls: number;
  geometryCount: number;
  materialCount: number;
  textureCount: 0;
  rainCapacity: number;
  activeRainParticles: number;
  rainVisible: boolean;
  effectsScale: number;
  stormFxScale: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  fogNear: number;
  fogFar: number;
}

type AtmosphereQuality = Pick<
  RenderQualityProfile,
  'effectsScale' | 'stormFxScale' | 'shadows'
>;

/**
 * Owns the global sky, weather lighting, fog settings, and one bounded rain
 * batch. The caller adds `object` to the scene and assigns `fog` to
 * `scene.fog`; all GPU resources created here are released by `dispose`.
 */
export class StormAtmosphere {
  readonly object = new THREE.Group();
  readonly fog = new THREE.Fog(
    STORM_FOG_COLOR,
    STORM_FOG_NEAR,
    STORM_FOG_FAR,
  );
  readonly hemisphereLight = new THREE.HemisphereLight();
  readonly directionalLight = new THREE.DirectionalLight();

  private readonly skyGeometry = new THREE.SphereGeometry(
    SKY_RADIUS,
    32,
    16,
  );
  private readonly skyTimeUniform = { value: 0 };
  private readonly skyStormUniform = { value: 1 };
  private readonly skyCloudContrastUniform = { value: 1 };
  private readonly skyMaterial = new THREE.ShaderMaterial({
    name: 'StormAtmosphereSkyMaterial',
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    uniforms: {
      uTime: this.skyTimeUniform,
      uStormAmount: this.skyStormUniform,
      uCloudContrast: this.skyCloudContrastUniform,
    },
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  private readonly sky = new THREE.Mesh(
    this.skyGeometry,
    this.skyMaterial,
  );

  private readonly rainGeometry = this.createRainGeometry();
  private readonly rainTimeUniform = { value: 0 };
  private readonly rainPointSizeUniform = { value: 6.5 };
  private readonly rainColorUniform = {
    value: new THREE.Color(0xaec3c8),
  };
  private readonly rainMaterial = new THREE.ShaderMaterial({
    name: 'StormAtmosphereRainMaterial',
    vertexShader: RAIN_VERTEX_SHADER,
    fragmentShader: RAIN_FRAGMENT_SHADER,
    uniforms: {
      uTime: this.rainTimeUniform,
      uPointSize: this.rainPointSizeUniform,
      uRainColor: this.rainColorUniform,
    },
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    fog: false,
  });
  private readonly rain = new THREE.Points(
    this.rainGeometry,
    this.rainMaterial,
  );

  private weather: WeatherMode = 'storm';
  private effectsScale = 1;
  private stormFxScale = 1;
  private activeRainParticles = RAIN_CAPACITY;
  private shadowsEnabled = true;

  constructor(initialWeather: WeatherMode = 'storm') {
    this.object.name = 'StormAtmosphere';

    this.sky.name = 'ProceduralSkyDome';
    this.sky.renderOrder = -1_000;
    this.sky.frustumCulled = false;

    // The rain geometry never changes after construction. Falling and wrapping
    // happen in the vertex shader, so update only touches uniforms/transforms.
    this.rain.name = 'CameraRelativeRain';
    this.rain.renderOrder = 100;
    this.rain.frustumCulled = false;

    this.configureLights();
    this.object.add(
      this.sky,
      this.rain,
      this.hemisphereLight,
      this.directionalLight,
      this.directionalLight.target,
    );

    this.applyQuality({
      effectsScale: 1,
      stormFxScale: 1,
      shadows: true,
    });
    this.applyWeather(initialWeather);
    this.update(0, { x: 0, y: 0, z: 0 });
  }

  applyWeather(weather: WeatherMode): void {
    this.weather = weather;
    const stormActive = weather === 'storm';

    this.skyStormUniform.value = stormActive ? 1 : 0;
    this.rain.visible = stormActive && this.activeRainParticles > 0;

    this.fog.color.set(stormActive ? STORM_FOG_COLOR : CLEAR_FOG_COLOR);
    this.fog.near = stormActive ? STORM_FOG_NEAR : CLEAR_FOG_NEAR;
    this.fog.far = stormActive ? STORM_FOG_FAR : CLEAR_FOG_FAR;

    if (stormActive) {
      this.hemisphereLight.color.set(0x91a9b0);
      this.hemisphereLight.groundColor.set(0x46564f);
      this.hemisphereLight.intensity = 2.4;
      this.directionalLight.color.set(0xcbd8d9);
      this.directionalLight.intensity = 2.7;
      return;
    }

    // Clear weather removes the storm's blue-green cast without introducing
    // a dramatic sunny grade that would fight the district material palette.
      this.hemisphereLight.color.set(0xe1e5e2);
      this.hemisphereLight.groundColor.set(0x8a8c80);
      this.hemisphereLight.intensity = 2.6;
      this.directionalLight.color.set(0xffffff);
      this.directionalLight.intensity = 3;
  }

  applyQuality(quality: Readonly<AtmosphereQuality>): void {
    this.effectsScale = clamp01(quality.effectsScale);
    this.stormFxScale = clamp01(quality.stormFxScale);
    this.shadowsEnabled = quality.shadows;

    const rainScale = this.effectsScale * this.stormFxScale;
    this.activeRainParticles = Math.round(RAIN_CAPACITY * rainScale);
    this.rainGeometry.setDrawRange(0, this.activeRainParticles);
    this.rain.visible = this.weather === 'storm'
      && this.activeRainParticles > 0;
    this.rainPointSizeUniform.value = THREE.MathUtils.lerp(
      4.5,
      7,
      this.effectsScale,
    );
    this.skyCloudContrastUniform.value = THREE.MathUtils.lerp(
      0.58,
      1,
      this.effectsScale,
    );

    this.directionalLight.castShadow = this.shadowsEnabled;
    this.setShadowMapSize(this.effectsScale >= 0.8 ? 1_024 : 512);
  }

  update(
    timeSeconds: number,
    cameraPosition: Readonly<WorldPosition>,
  ): void {
    // Wrapping time keeps shader arithmetic precise during long Endless runs.
    const wrappedTime = Number.isFinite(timeSeconds)
      ? THREE.MathUtils.euclideanModulo(timeSeconds, 4_096)
      : 0;
    this.skyTimeUniform.value = wrappedTime;
    this.rainTimeUniform.value = wrappedTime;

    this.sky.position.set(
      cameraPosition.x,
      cameraPosition.y,
      cameraPosition.z,
    );
    this.rain.position.set(
      cameraPosition.x,
      cameraPosition.y + RAIN_CAMERA_Y_OFFSET,
      cameraPosition.z,
    );

    // Keep the useful shadow footprint around the camera instead of spending
    // resolution on the full diorama.
    this.directionalLight.position.set(
      cameraPosition.x - 145,
      225,
      cameraPosition.z + 95,
    );
    this.directionalLight.target.position.set(
      cameraPosition.x,
      0,
      cameraPosition.z - 24,
    );
  }

  getDiagnostics(): StormAtmosphereDiagnostics {
    const rainVisible = this.rain.visible && this.activeRainParticles > 0;
    return {
      weather: this.weather,
      drawCalls: 1 + (rainVisible ? 1 : 0),
      geometryCount: 2,
      materialCount: 2,
      textureCount: 0,
      rainCapacity: RAIN_CAPACITY,
      activeRainParticles: this.activeRainParticles,
      rainVisible,
      effectsScale: this.effectsScale,
      stormFxScale: this.stormFxScale,
      shadowsEnabled: this.shadowsEnabled,
      shadowMapSize: this.directionalLight.shadow.mapSize.x,
      fogNear: this.fog.near,
      fogFar: this.fog.far,
    };
  }

  dispose(): void {
    this.skyGeometry.dispose();
    this.skyMaterial.dispose();
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.directionalLight.shadow.dispose();
  }

  private configureLights(): void {
    this.hemisphereLight.name = 'StormHemisphereLight';

    this.directionalLight.name = 'StormForegroundLight';
    this.directionalLight.target.name = 'StormForegroundLightTarget';
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.bias = -0.00045;
    this.directionalLight.shadow.normalBias = 0.035;
    this.directionalLight.shadow.camera.left = -115;
    this.directionalLight.shadow.camera.right = 115;
    this.directionalLight.shadow.camera.top = 115;
    this.directionalLight.shadow.camera.bottom = -115;
    this.directionalLight.shadow.camera.near = 30;
    this.directionalLight.shadow.camera.far = 420;
    this.directionalLight.shadow.camera.updateProjectionMatrix();
  }

  private createRainGeometry(): THREE.BufferGeometry {
    const random = new SeededRandom(
      createWorldSeed('townfall:v2:storm-atmosphere-rain'),
    );
    const positions = new Float32Array(RAIN_CAPACITY * 3);
    const speeds = new Float32Array(RAIN_CAPACITY);
    const brightness = new Float32Array(RAIN_CAPACITY);

    for (let index = 0; index < RAIN_CAPACITY; index += 1) {
      const positionOffset = index * 3;
      positions[positionOffset] = random.range(
        -RAIN_HALF_WIDTH,
        RAIN_HALF_WIDTH,
      );
      // The base Y value is a phase; the shader expands it into rain height.
      positions[positionOffset + 1] = random.next();
      positions[positionOffset + 2] = random.range(
        -RAIN_HALF_DEPTH,
        RAIN_HALF_DEPTH,
      );
      speeds[index] = random.next();
      brightness[index] = random.range(0.5, 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.name = 'CameraRelativeRainGeometry';
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      'aSpeed',
      new THREE.BufferAttribute(speeds, 1),
    );
    geometry.setAttribute(
      'aBrightness',
      new THREE.BufferAttribute(brightness, 1),
    );
    geometry.setDrawRange(0, RAIN_CAPACITY);
    return geometry;
  }

  private setShadowMapSize(size: number): void {
    const shadow = this.directionalLight.shadow;
    if (shadow.mapSize.x === size && shadow.mapSize.y === size) {
      return;
    }

    // A quality change may happen after the renderer allocated the old map.
    // Release it before changing dimensions so repeated toggles stay bounded.
    shadow.map?.dispose();
    shadow.map = null;
    shadow.mapPass?.dispose();
    shadow.mapPass = null;
    shadow.mapSize.set(size, size);
    shadow.needsUpdate = true;
  }
}
