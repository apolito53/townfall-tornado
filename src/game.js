import * as THREE from 'three';
import { InputController } from './input.js';
import { Tornado } from './tornado.js';
import { Town } from './town.js';
import { Hud } from './ui.js';

const GAME_DURATION = 180;
const CAMERA_OFFSET = new THREE.Vector3(0, 23, 76);

export class Game {
  constructor({ canvas, diagnosticsElement }) {
    this.canvas = canvas;
    this.diagnosticsElement = diagnosticsElement;
    this.clock = new THREE.Clock();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdde4df);
    this.scene.fog = new THREE.FogExp2(0xdde4df, 0.0095);

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 250);
    this.camera.position.copy(CAMERA_OFFSET);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.input = new InputController(canvas);
    this.hud = new Hud();
    this.tornado = new Tornado(this.scene);
    this.town = new Town(this.scene);
    this.debris = [];
    this.score = 0;
    this.remainingTime = GAME_DURATION;
    this.combo = 1;
    this.comboTimer = 0;
    this.isFinished = false;
    this.frame = 0;
    this.lastDiagnosticsAt = 0;

    this.setupLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  restart() {
    this.score = 0;
    this.remainingTime = GAME_DURATION;
    this.combo = 1;
    this.comboTimer = 0;
    this.isFinished = false;
    this.tornado.restart();
    this.town.restart();
    this.clearDebris();
    this.hud.flashMessage('Fresh storm front', 1.35);
  }

  setupLights() {
    const hemisphere = new THREE.HemisphereLight(0xf5efd8, 0x415f4d, 2.1);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff3ca, 3.2);
    sun.position.set(-28, 56, 24);
    sun.castShadow = true;
    sun.shadow.camera.left = -78;
    sun.shadow.camera.right = 78;
    sun.shadow.camera.top = 78;
    sun.shadow.camera.bottom = -78;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    const stormGlow = new THREE.PointLight(0xa7ffe0, 1.4, 40);
    stormGlow.position.set(-34, 8, 32);
    this.tornado.group.add(stormGlow);
  }

  resize() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frame += 1;

    if (!this.isFinished) {
      this.update(dt);
    }

    this.updateCamera(dt);
    this.updateDebris(dt);
    this.renderer.render(this.scene, this.camera);
    this.collectDiagnostics();
  }

  update(dt) {
    this.remainingTime = Math.max(0, this.remainingTime - dt);

    const inputVector = this.input.getMoveVector();
    this.town.ensureGeneratedAround(this.tornado.position);
    const { profile, categoryChanged } = this.tornado.update(dt, inputVector, this.town.boundary);
    if (categoryChanged) {
      this.hud.flashMessage(`Category ${profile.category}`, 1.7);
    }

    const absorbedItems = this.town.update(profile, this.tornado.position, dt);
    if (absorbedItems.length > 0) {
      this.handleAbsorbedItems(absorbedItems);
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 1;
      }
    }

    const destroyedRatio = this.town.getDestroyedRatio();
    if (destroyedRatio >= 1 || this.remainingTime <= 0) {
      this.isFinished = true;
      this.hud.flashMessage(destroyedRatio >= 1 ? 'Townfall complete' : 'Storm dissipated', 8);
    }

    this.hud.update({
      category: profile.category,
      mass: profile.mass,
      score: this.score,
      destroyedRatio,
      remainingTime: this.remainingTime,
    }, dt);
  }

  handleAbsorbedItems(items) {
    for (const item of items) {
      const comboBonus = Math.min(5, this.combo);
      this.score += item.points * comboBonus;
      this.combo = Math.min(5, this.combo + 0.18);
      this.comboTimer = 2.6;
      this.tornado.absorb(item);
      this.spawnDebrisBurst(item.group.position, item.radius, item.type);
    }

    const biggest = items.reduce((winner, item) => (item.points > winner.points ? item : winner), items[0]);
    if (biggest) {
      this.hud.flashMessage(`${biggest.type} claimed`, 1.2);
    }
  }

  updateCamera(dt) {
    const targetPosition = this.tornado.group.position.clone().add(CAMERA_OFFSET);
    this.camera.position.lerp(targetPosition, 1 - Math.pow(0.00001, dt));
    const lookTarget = this.tornado.group.position.clone();
    lookTarget.y = 4.8;
    this.camera.lookAt(lookTarget);
  }

  spawnDebrisBurst(position, radius, type) {
    const material = new THREE.MeshStandardMaterial({
      color: type === 'Tree' ? 0x4d8a4f : 0xd7c3a3,
      roughness: 0.88,
      transparent: true,
      opacity: 0.85,
    });
    const geometry = new THREE.BoxGeometry(0.45, 0.22, 0.32);
    const count = Math.min(18, Math.max(6, Math.round(radius * 2.2)));

    for (let index = 0; index < count; index += 1) {
      const shard = new THREE.Mesh(geometry, material);
      shard.position.copy(position);
      shard.position.y += 0.4 + Math.random() * 1.1;
      shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      shard.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 7,
        4 + Math.random() * 7,
        (Math.random() - 0.5) * 7,
      );
      shard.userData.life = 0.75 + Math.random() * 0.5;
      shard.castShadow = true;
      this.scene.add(shard);
      this.debris.push(shard);
    }
  }

  updateDebris(dt) {
    for (let index = this.debris.length - 1; index >= 0; index -= 1) {
      const shard = this.debris[index];
      shard.userData.life -= dt;
      shard.userData.velocity.y -= 14 * dt;
      shard.position.addScaledVector(shard.userData.velocity, dt);
      shard.rotation.x += dt * 5.2;
      shard.rotation.y += dt * 4.8;
      shard.material.opacity = Math.max(0, shard.userData.life);

      if (shard.userData.life <= 0 || shard.position.y < -1) {
        this.scene.remove(shard);
        this.debris.splice(index, 1);
      }
    }
  }

  clearDebris() {
    for (const shard of this.debris) {
      this.scene.remove(shard);
    }
    this.debris = [];
  }

  collectDiagnostics() {
    const now = performance.now();
    if (now - this.lastDiagnosticsAt < 450) {
      return;
    }

    this.lastDiagnosticsAt = now;

    const gl = this.renderer.getContext();
    const samplePoints = [
      [0.5, 0.5],
      [0.25, 0.35],
      [0.75, 0.35],
      [0.35, 0.68],
      [0.65, 0.68],
    ];
    let visibleSamples = 0;
    let colorVariance = 0;
    const pixel = new Uint8Array(4);

    for (const [xRatio, yRatio] of samplePoints) {
      const x = Math.floor(gl.drawingBufferWidth * xRatio);
      const y = Math.floor(gl.drawingBufferHeight * yRatio);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const luma = pixel[0] + pixel[1] + pixel[2];
      const spread = Math.max(pixel[0], pixel[1], pixel[2]) - Math.min(pixel[0], pixel[1], pixel[2]);
      if (pixel[3] > 0 && luma > 45) {
        visibleSamples += 1;
      }
      colorVariance += spread;
    }

    const diagnostics = {
      renderOk: visibleSamples >= 3 && this.renderer.info.render.calls > 0,
      sampledPixels: `${visibleSamples}/${samplePoints.length}`,
      colorVariance,
      frame: this.frame,
      tornadoX: Number(this.tornado.position.x.toFixed(2)),
      tornadoZ: Number(this.tornado.position.z.toFixed(2)),
      debrisCount: this.debris.length,
      generatedChunks: this.town.generatedChunks.size,
      groundScars: this.town.groundScars.length,
    };

    Object.assign(this.diagnosticsElement.dataset, {
      renderOk: String(diagnostics.renderOk),
      sampledPixels: diagnostics.sampledPixels,
      colorVariance: String(diagnostics.colorVariance),
      frame: String(diagnostics.frame),
      tornadoX: String(diagnostics.tornadoX),
      tornadoZ: String(diagnostics.tornadoZ),
      debrisCount: String(diagnostics.debrisCount),
      generatedChunks: String(diagnostics.generatedChunks),
      groundScars: String(diagnostics.groundScars),
    });

    window.__townfallDiagnostics = diagnostics;
  }
}
