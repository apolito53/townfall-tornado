import * as THREE from 'three';

const CATEGORY_THRESHOLDS = [
  { category: 1, mass: 0, radius: 3.2, pullRadius: 8, liftLimit: 12, speed: 18 },
  { category: 2, mass: 28, radius: 6.8, pullRadius: 15, liftLimit: 34, speed: 17 },
  { category: 3, mass: 80, radius: 12.5, pullRadius: 28, liftLimit: 72, speed: 15.5 },
  { category: 4, mass: 160, radius: 22, pullRadius: 52, liftLimit: 122, speed: 14 },
  { category: 5, mass: 285, radius: 36, pullRadius: 92, liftLimit: 190, speed: 12.5 },
];

const START_POSITION = new THREE.Vector3(-48, 0, 48);
const STORM_COLUMN_HEIGHT = 76;
const MIN_STORM_BASE_RADIUS = 96;

function createSeededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function makeCanvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  paint(context, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function featherTextureEdges(context, width, height, { top = 0.06, bottom = 0.2, sides = 0.12 } = {}) {
  context.save();
  context.globalCompositeOperation = 'destination-in';

  const sideMask = context.createLinearGradient(0, 0, width, 0);
  sideMask.addColorStop(0, 'rgba(0, 0, 0, 0)');
  sideMask.addColorStop(sides, 'rgba(0, 0, 0, 1)');
  sideMask.addColorStop(1 - sides, 'rgba(0, 0, 0, 1)');
  sideMask.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = sideMask;
  context.fillRect(0, 0, width, height);

  const verticalMask = context.createLinearGradient(0, 0, 0, height);
  verticalMask.addColorStop(0, 'rgba(0, 0, 0, 0)');
  verticalMask.addColorStop(top, 'rgba(0, 0, 0, 1)');
  verticalMask.addColorStop(1 - bottom, 'rgba(0, 0, 0, 1)');
  verticalMask.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = verticalMask;
  context.fillRect(0, 0, width, height);

  context.restore();
}

function createStormSkyTexture() {
  const random = createSeededRandom(9172);

  return makeCanvasTexture(1024, 512, (context, width, height) => {
    const skyGradient = context.createLinearGradient(0, 0, 0, height);
    skyGradient.addColorStop(0, 'rgba(15, 25, 29, 0.98)');
    skyGradient.addColorStop(0.38, 'rgba(24, 36, 38, 0.94)');
    skyGradient.addColorStop(0.64, 'rgba(49, 59, 56, 0.78)');
    skyGradient.addColorStop(0.82, 'rgba(80, 86, 77, 0.32)');
    skyGradient.addColorStop(1, 'rgba(80, 86, 77, 0)');
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, width, height);

    // Big, soft masses make the upper half read as storm structure instead of a flat color wash.
    for (let index = 0; index < 34; index += 1) {
      const x = random() * width;
      const y = height * (0.06 + random() * 0.42);
      const radiusX = 110 + random() * 250;
      const radiusY = 26 + random() * 74;
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, random() * 0.35 - 0.18, 0, Math.PI * 2);
      context.fillStyle = `rgba(${18 + random() * 18}, ${28 + random() * 18}, ${29 + random() * 16}, ${0.16 + random() * 0.18})`;
      context.fill();
    }

    // Ragged lower scud gives the storm base the uneven, descending edge from the references.
    for (let index = 0; index < 78; index += 1) {
      const x = random() * width;
      const y = height * (0.48 + random() * 0.22);
      const radiusX = 22 + random() * 92;
      const radiusY = 10 + random() * 38;
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, random() * 0.25 - 0.12, 0, Math.PI * 2);
      context.fillStyle = `rgba(${20 + random() * 22}, ${31 + random() * 20}, ${31 + random() * 18}, ${0.15 + random() * 0.23})`;
      context.fill();
    }

    for (let index = 0; index < 90; index += 1) {
      const x = random() * width;
      const top = height * (0.48 + random() * 0.18);
      const length = height * (0.08 + random() * 0.23);
      const wispGradient = context.createLinearGradient(x, top, x, top + length);
      wispGradient.addColorStop(0, `rgba(27, 37, 36, ${0.08 + random() * 0.12})`);
      wispGradient.addColorStop(1, 'rgba(46, 54, 50, 0)');
      context.fillStyle = wispGradient;
      context.fillRect(x - 2 - random() * 5, top, 4 + random() * 10, length);
    }

    featherTextureEdges(context, width, height, { top: 0.04, bottom: 0.26, sides: 0.16 });
  });
}

function createStormBaseTexture() {
  const random = createSeededRandom(4219);

  return makeCanvasTexture(1024, 256, (context, width, height) => {
    const baseGradient = context.createLinearGradient(0, 0, 0, height);
    baseGradient.addColorStop(0, 'rgba(20, 29, 30, 0)');
    baseGradient.addColorStop(0.18, 'rgba(22, 31, 31, 0.62)');
    baseGradient.addColorStop(0.46, 'rgba(28, 38, 37, 0.86)');
    baseGradient.addColorStop(0.76, 'rgba(40, 48, 43, 0.64)');
    baseGradient.addColorStop(1, 'rgba(54, 57, 49, 0)');
    context.fillStyle = baseGradient;
    context.fillRect(0, 0, width, height);

    for (let index = 0; index < 58; index += 1) {
      const x = random() * width;
      const y = height * (0.34 + random() * 0.34);
      const radiusX = 34 + random() * 116;
      const radiusY = 9 + random() * 31;
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, random() * 0.32 - 0.16, 0, Math.PI * 2);
      context.fillStyle = `rgba(${21 + random() * 20}, ${31 + random() * 18}, ${31 + random() * 16}, ${0.16 + random() * 0.24})`;
      context.fill();
    }

    for (let index = 0; index < 38; index += 1) {
      const x = random() * width;
      const y = height * (0.57 + random() * 0.18);
      const drop = height * (0.08 + random() * 0.2);
      const scudGradient = context.createLinearGradient(x, y, x, y + drop);
      scudGradient.addColorStop(0, `rgba(26, 35, 34, ${0.14 + random() * 0.18})`);
      scudGradient.addColorStop(1, 'rgba(39, 45, 40, 0)');
      context.fillStyle = scudGradient;
      context.fillRect(x - 5 - random() * 7, y, 10 + random() * 18, drop);
    }

    featherTextureEdges(context, width, height, { top: 0.16, bottom: 0.22, sides: 0.14 });
  });
}

function createFunnelTexture(seed, {
  top = 'rgba(72, 82, 74, 0.32)',
  middle = 'rgba(176, 161, 111, 0.46)',
  bottom = 'rgba(93, 72, 46, 0.62)',
} = {}) {
  const random = createSeededRandom(seed);

  const texture = makeCanvasTexture(512, 1024, (context, width, height) => {
    const bodyGradient = context.createLinearGradient(0, 0, 0, height);
    bodyGradient.addColorStop(0, top);
    bodyGradient.addColorStop(0.55, middle);
    bodyGradient.addColorStop(1, bottom);
    context.fillStyle = bodyGradient;
    context.fillRect(0, 0, width, height);

    for (let index = 0; index < 72; index += 1) {
      const startX = random() * width;
      const widthJitter = 7 + random() * 34;
      const alpha = 0.05 + random() * 0.16;
      const shade = random() > 0.48 ? 245 : 42;
      const strokeGradient = context.createLinearGradient(startX, 0, startX + widthJitter, height);
      strokeGradient.addColorStop(0, `rgba(${shade}, ${shade}, ${shade}, 0)`);
      strokeGradient.addColorStop(0.5, `rgba(${shade}, ${shade}, ${shade}, ${alpha})`);
      strokeGradient.addColorStop(1, `rgba(${shade}, ${shade}, ${shade}, 0)`);

      context.beginPath();
      context.moveTo(startX, height + 40);
      for (let step = 0; step <= 6; step += 1) {
        const y = height - step * (height / 5);
        const x = startX
          + Math.sin(step * 0.9 + random() * 3.2) * (18 + random() * 42)
          + step * (random() - 0.5) * 22;
        context.lineTo(x, y);
      }
      context.lineWidth = widthJitter;
      context.strokeStyle = strokeGradient;
      context.globalAlpha = 0.55 + random() * 0.45;
      context.stroke();
      context.globalAlpha = 1;
    }

    for (let index = 0; index < 52; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const radiusX = 16 + random() * 80;
      const radiusY = 8 + random() * 42;
      context.beginPath();
      context.ellipse(x, y, radiusX, radiusY, random() * Math.PI, 0, Math.PI * 2);
      context.fillStyle = `rgba(238, 226, 184, ${0.035 + random() * 0.07})`;
      context.fill();
    }

    featherTextureEdges(context, width, height, { top: 0.04, bottom: 0.04, sides: 0.08 });
  });

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function getCategoryProfile(mass) {
  let profile = CATEGORY_THRESHOLDS[0];
  for (const threshold of CATEGORY_THRESHOLDS) {
    if (mass >= threshold.mass) {
      profile = threshold;
    }
  }
  return profile;
}

export class Tornado {
  constructor(scene) {
    this.scene = scene;
    this.position = START_POSITION.clone();
    this.mass = 0;
    this.lastCategory = 1;
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.outerFunnelTexture = createFunnelTexture(11831);
    this.coreFunnelTexture = createFunnelTexture(24017, {
      top: 'rgba(28, 38, 36, 0.5)',
      middle: 'rgba(57, 62, 50, 0.56)',
      bottom: 'rgba(54, 42, 30, 0.72)',
    });

    this.funnelMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8d4bd,
      map: this.outerFunnelTexture,
      emissive: 0x3b3b31,
      roughness: 0.75,
      metalness: 0,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.coreMaterial = new THREE.MeshStandardMaterial({
      color: 0x3e4b45,
      map: this.coreFunnelTexture,
      emissive: 0x121917,
      roughness: 0.95,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.turbulenceMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0xe8dfc6,
        emissive: 0x3b372b,
        roughness: 1,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x8c9992,
        emissive: 0x1c2421,
        roughness: 1,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      new THREE.MeshStandardMaterial({
        color: 0xc8aa70,
        emissive: 0x382e18,
        roughness: 1,
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ];

    this.funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.42, 0.16, STORM_COLUMN_HEIGHT, 48, 5, true),
      this.funnelMaterial,
    );
    this.funnel.position.y = STORM_COLUMN_HEIGHT * 0.5;
    this.group.add(this.funnel);

    this.funnelSections = [];
    const sectionGeometry = new THREE.CylinderGeometry(1, 1, 1, 44, 1, true);
    for (let index = 0; index < 12; index += 1) {
      const heightRatio = 0.04 + index / 11 * 0.92;
      const sectionMaterial = new THREE.MeshStandardMaterial({
        color: index % 2 === 0 ? 0xd2c398 : 0x67736a,
        map: createFunnelTexture(5100 + index * 173),
        emissive: 0x211f19,
        roughness: 1,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const section = new THREE.Mesh(sectionGeometry, sectionMaterial);
      section.position.y = heightRatio * STORM_COLUMN_HEIGHT;
      section.userData.heightRatio = heightRatio;
      section.userData.phase = Math.random() * Math.PI * 2;
      section.userData.spin = 0.45 + Math.random() * 0.95;
      section.userData.heightScale = 7.6 + Math.random() * 6.4;
      this.group.add(section);
      this.funnelSections.push(section);
    }

    this.funnelBands = [];
    const bandMaterial = new THREE.MeshStandardMaterial({
      color: 0xded7bd,
      map: createFunnelTexture(9301, {
        top: 'rgba(95, 102, 88, 0.2)',
        middle: 'rgba(198, 183, 129, 0.28)',
        bottom: 'rgba(132, 101, 62, 0.3)',
      }),
      emissive: 0x302e25,
      roughness: 1,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let index = 0; index < 8; index += 1) {
      const heightRatio = 0.06 + (index / 7) * 0.74;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.6, 42, 1, true), bandMaterial.clone());
      band.position.y = 1.2 + heightRatio * (STORM_COLUMN_HEIGHT * 0.9);
      band.userData.heightRatio = heightRatio;
      band.userData.phase = Math.random() * Math.PI * 2;
      band.userData.spin = 0.85 + Math.random() * 0.8;
      this.group.add(band);
      this.funnelBands.push(band);
    }

    this.core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.74, 0.1, STORM_COLUMN_HEIGHT * 1.04, 36, 5, true),
      this.coreMaterial,
    );
    this.core.position.y = STORM_COLUMN_HEIGHT * 0.52;
    this.group.add(this.core);

    this.turbulenceLayers = [];
    for (let index = 0; index < 5; index += 1) {
      const layer = new THREE.Mesh(
        new THREE.CylinderGeometry(
          1.25 + index * 0.18,
          0.18 + index * 0.035,
          STORM_COLUMN_HEIGHT * (0.94 + index * 0.035),
          44,
          6,
          true,
        ),
        this.turbulenceMaterials[index % this.turbulenceMaterials.length],
      );
      layer.position.y = STORM_COLUMN_HEIGHT * (0.47 + index * 0.016);
      layer.userData.phase = Math.random() * Math.PI * 2;
      layer.userData.spin = 0.65 + Math.random() * 0.6;
      this.group.add(layer);
      this.turbulenceLayers.push(layer);
    }

    this.groundCloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xd7c288,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.groundCloud = new THREE.Mesh(new THREE.CircleGeometry(1, 48), this.groundCloudMaterial);
    this.groundCloud.rotation.x = -Math.PI * 0.5;
    this.groundCloud.position.y = 0.08;
    this.group.add(this.groundCloud);

    this.stormSkyMaterial = new THREE.MeshBasicMaterial({
      map: createStormSkyTexture(),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.stormSky = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), this.stormSkyMaterial);
    this.stormSky.position.set(0, STORM_COLUMN_HEIGHT + 35, -145);
    this.stormSky.renderOrder = -4;
    this.group.add(this.stormSky);

    this.stormBaseMaterial = new THREE.MeshBasicMaterial({
      map: createStormBaseTexture(),
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.stormBaseCurtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), this.stormBaseMaterial);
    this.stormBaseCurtain.position.set(0, STORM_COLUMN_HEIGHT + 7, -48);
    this.stormBaseCurtain.renderOrder = 6;
    this.group.add(this.stormBaseCurtain);

    this.dustMaterial = new THREE.MeshStandardMaterial({
      color: 0xcbb98d,
      emissive: 0x352b19,
      roughness: 1,
      transparent: true,
      opacity: 0.72,
    });

    this.dust = [];
    const dustGeometry = new THREE.IcosahedronGeometry(0.09, 0);
    for (let index = 0; index < 120; index += 1) {
      const mote = new THREE.Mesh(dustGeometry, this.dustMaterial);
      mote.userData.angle = Math.random() * Math.PI * 2;
      mote.userData.height = Math.random();
      mote.userData.radiusJitter = 0.72 + Math.random() * 0.65;
      mote.userData.speed = 1.8 + Math.random() * 2.2;
      this.group.add(mote);
      this.dust.push(mote);
    }

    this.debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x7a6546,
      roughness: 0.92,
      transparent: true,
      opacity: 0.78,
    });

    this.orbitingDebris = [];
    const debrisGeometry = new THREE.BoxGeometry(0.22, 0.12, 0.34);
    for (let index = 0; index < 56; index += 1) {
      const debris = new THREE.Mesh(debrisGeometry, this.debrisMaterial);
      debris.userData.angle = Math.random() * Math.PI * 2;
      debris.userData.height = Math.random();
      debris.userData.radiusJitter = 0.8 + Math.random() * 0.85;
      debris.userData.speed = 1.3 + Math.random() * 2.1;
      debris.userData.tilt = Math.random() * Math.PI;
      debris.castShadow = true;
      this.group.add(debris);
      this.orbitingDebris.push(debris);
    }

    this.airborneDebrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4035,
      roughness: 0.94,
      transparent: true,
      opacity: 0.82,
    });

    this.airborneDebris = [];
    const highDebrisGeometry = new THREE.BoxGeometry(0.18, 0.08, 0.3);
    for (let index = 0; index < 72; index += 1) {
      const speck = new THREE.Mesh(highDebrisGeometry, this.airborneDebrisMaterial);
      speck.userData.angle = Math.random() * Math.PI * 2;
      speck.userData.height = 0.25 + Math.random() * 0.72;
      speck.userData.radiusJitter = 0.75 + Math.random() * 1.35;
      speck.userData.speed = 0.6 + Math.random() * 1.6;
      speck.userData.tilt = Math.random() * Math.PI;
      this.group.add(speck);
      this.airborneDebris.push(speck);
    }
  }

  restart(mass = 0) {
    this.position.copy(START_POSITION);
    this.mass = mass;
    this.lastCategory = getCategoryProfile(mass).category;
    this.group.position.copy(this.position);
  }

  absorb(item) {
    this.mass += item.growth;
  }

  getProfile() {
    const profile = getCategoryProfile(this.mass);
    const extraMass = Math.max(0, this.mass - profile.mass);
    return {
      category: profile.category,
      mass: this.mass,
      radius: profile.radius + extraMass * 0.022,
      pullRadius: profile.pullRadius + extraMass * 0.04,
      liftLimit: profile.liftLimit + extraMass * 0.22,
      speed: Math.max(9.5, profile.speed - extraMass * 0.008),
      pullStrength: 17 + profile.category * 7 + extraMass * 0.08,
    };
  }

  update(dt, inputVector, bounds) {
    const profile = this.getProfile();
    const velocity = new THREE.Vector3(inputVector.x, 0, inputVector.y);

    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(profile.speed * dt);
      this.position.add(velocity);
    }

    this.position.x = THREE.MathUtils.clamp(this.position.x, -bounds, bounds);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -bounds, bounds);
    this.group.position.lerp(this.position, 1 - Math.pow(0.0001, dt));
    this.updateVisuals(dt, profile);

    const categoryChanged = profile.category !== this.lastCategory;
    this.lastCategory = profile.category;
    return { profile, categoryChanged };
  }

  updateVisuals(dt, profile) {
    const radiusScale = profile.radius / 3.2;
    this.funnel.scale.set(radiusScale, 1 + (profile.category - 1) * 0.06, radiusScale);
    this.funnel.rotation.y -= dt * (1.45 + profile.category * 0.42);
    this.funnelMaterial.opacity = 0.24 + profile.category * 0.038;
    this.outerFunnelTexture.offset.x = (this.outerFunnelTexture.offset.x + dt * (0.035 + profile.category * 0.01)) % 1;
    this.outerFunnelTexture.offset.y = (this.outerFunnelTexture.offset.y - dt * (0.08 + profile.category * 0.015)) % 1;
    const wobbleTime = performance.now() * 0.0015;
    this.funnel.position.x = Math.sin(wobbleTime * 1.7) * profile.radius * 0.035;
    this.funnel.position.z = Math.cos(wobbleTime * 1.25) * profile.radius * 0.028;
    this.core.scale.set(radiusScale * 0.82, 1 + (profile.category - 1) * 0.06, radiusScale * 0.82);
    this.core.rotation.y += dt * (1.9 + profile.category * 0.55);
    this.coreMaterial.opacity = 0.34 + profile.category * 0.035;
    this.coreFunnelTexture.offset.x = (this.coreFunnelTexture.offset.x - dt * (0.045 + profile.category * 0.012)) % 1;
    this.coreFunnelTexture.offset.y = (this.coreFunnelTexture.offset.y - dt * (0.05 + profile.category * 0.012)) % 1;
    this.core.position.x = this.funnel.position.x * 0.72;
    this.core.position.z = this.funnel.position.z * 0.72;
    this.groundCloud.rotation.z -= dt * (1.8 + profile.category * 0.35);
    this.groundCloud.scale.setScalar(profile.radius * 1.18);
    this.groundCloudMaterial.opacity = 0.3 + profile.category * 0.04;
    const stormBaseRadius = Math.max(MIN_STORM_BASE_RADIUS, profile.radius * 2.65);
    this.stormSky.position.x = Math.sin(wobbleTime * 0.12) * profile.radius * 0.38;
    this.stormSky.position.y = STORM_COLUMN_HEIGHT + 62 + profile.category * 1.35;
    this.stormSky.position.z = -Math.max(170, stormBaseRadius * 1.6);
    this.stormSky.scale.set(
      Math.max(820, stormBaseRadius * 7.2),
      Math.max(220, stormBaseRadius * 1.75),
      1,
    );
    this.stormSkyMaterial.opacity = THREE.MathUtils.clamp(0.74 + profile.category * 0.028, 0.74, 0.9);

    this.stormBaseCurtain.position.x = Math.sin(wobbleTime * 0.2) * profile.radius * 0.2;
    this.stormBaseCurtain.position.y = STORM_COLUMN_HEIGHT + 7 + profile.category * 0.58;
    this.stormBaseCurtain.position.z = -Math.max(42, profile.radius * 1.32);
    this.stormBaseCurtain.scale.set(
      Math.max(148, stormBaseRadius * 1.58),
      Math.max(38, stormBaseRadius * 0.42),
      1,
    );
    this.stormBaseMaterial.opacity = THREE.MathUtils.clamp(0.52 + profile.category * 0.04, 0.52, 0.76);

    for (const section of this.funnelSections) {
      const heightRatio = section.userData.heightRatio;
      const phase = wobbleTime * (1.15 + heightRatio * 1.4) + section.userData.phase;
      const radius = THREE.MathUtils.lerp(profile.radius * 0.2, profile.radius * 1.08, heightRatio);
      const upperWobble = THREE.MathUtils.lerp(0.03, 0.18, heightRatio);
      section.position.y = heightRatio * STORM_COLUMN_HEIGHT;
      section.position.x = Math.sin(phase) * profile.radius * upperWobble + this.funnel.position.x * (0.25 + heightRatio * 0.5);
      section.position.z = Math.cos(phase * 0.74) * profile.radius * upperWobble * 0.78 + this.funnel.position.z * (0.25 + heightRatio * 0.5);
      section.scale.set(
        radius * (0.74 + Math.sin(phase * 1.7) * 0.11),
        section.userData.heightScale * (1 + profile.category * 0.04),
        radius * (0.66 + Math.cos(phase * 1.3) * 0.12),
      );
      section.rotation.y += dt * (section.userData.spin + profile.category * 0.16) * (heightRatio > 0.5 ? -1 : 1);
      section.material.opacity = THREE.MathUtils.clamp(0.06 + profile.category * 0.015 + heightRatio * 0.03, 0.06, 0.18);
      section.material.map.offset.y = (section.material.map.offset.y - dt * (0.04 + heightRatio * 0.06)) % 1;
      section.material.map.offset.x = (section.material.map.offset.x + dt * (0.018 + heightRatio * 0.025)) % 1;
    }

    for (let index = 0; index < this.turbulenceLayers.length; index += 1) {
      const layer = this.turbulenceLayers[index];
      const phase = performance.now() * 0.0017 + layer.userData.phase;
      const wobble = Math.sin(phase * (1.2 + index * 0.12)) * profile.radius * 0.055 * (index + 1);
      const counterWobble = Math.cos(phase * 0.9) * profile.radius * 0.035 * (index + 1);
      layer.position.x = wobble;
      layer.position.z = counterWobble;
      layer.rotation.y -= dt * (layer.userData.spin + profile.category * 0.34) * (index % 2 === 0 ? 1 : -1);
      layer.scale.set(
        radiusScale * (1 + index * 0.15 + Math.sin(phase) * 0.035),
        1 + index * 0.04 + profile.category * 0.07,
        radiusScale * (1 + index * 0.12 + Math.cos(phase) * 0.035),
      );
      layer.material.opacity = THREE.MathUtils.clamp(0.09 + profile.category * 0.023 - index * 0.004, 0.08, 0.25);
    }

    for (const band of this.funnelBands) {
      const heightRatio = band.userData.heightRatio;
      const radius = THREE.MathUtils.lerp(profile.radius * 0.18, profile.radius * 1.03, heightRatio);
      const phase = wobbleTime * (1.4 + heightRatio * 0.8) + band.userData.phase;
      const lateral = Math.sin(phase) * profile.radius * THREE.MathUtils.lerp(0.02, 0.12, heightRatio);
      const cross = Math.cos(phase * 0.82) * profile.radius * THREE.MathUtils.lerp(0.018, 0.09, heightRatio);
      band.position.x = lateral;
      band.position.z = cross;
      band.scale.set(
        radius * (0.95 + Math.sin(phase * 1.3) * 0.07),
        1 + profile.category * 0.05,
        radius * (0.86 + Math.cos(phase) * 0.08),
      );
      band.rotation.y += dt * band.userData.spin * (heightRatio % 0.2 > 0.1 ? 1 : -1);
      band.material.opacity = THREE.MathUtils.clamp(0.08 + profile.category * 0.012 - heightRatio * 0.018, 0.04, 0.16);
    }

    for (const mote of this.dust) {
      mote.userData.angle -= dt * mote.userData.speed * (1 + profile.category * 0.15);
      mote.userData.height = (mote.userData.height + dt * 0.13 * mote.userData.speed) % 1;

      const height = mote.userData.height * 5.4;
      const radiusAtHeight = THREE.MathUtils.lerp(profile.radius * 0.28, profile.radius, mote.userData.height);
      const radius = radiusAtHeight * mote.userData.radiusJitter;

      mote.position.set(
        Math.cos(mote.userData.angle) * radius,
        0.18 + height,
        Math.sin(mote.userData.angle) * radius,
      );
      mote.scale.setScalar(0.6 + profile.category * 0.18);
    }

    for (const debris of this.orbitingDebris) {
      debris.userData.angle -= dt * debris.userData.speed * (1 + profile.category * 0.18);
      debris.userData.height = (debris.userData.height + dt * 0.08 * debris.userData.speed) % 1;

      const height = 0.35 + debris.userData.height * (2.7 + profile.category * 0.28);
      const lowerBias = 1 - debris.userData.height;
      const radius = THREE.MathUtils.lerp(profile.radius * 0.48, profile.radius * 1.18, lowerBias) * debris.userData.radiusJitter;

      debris.position.set(
        Math.cos(debris.userData.angle) * radius,
        height,
        Math.sin(debris.userData.angle) * radius,
      );
      debris.rotation.set(
        debris.userData.tilt + performance.now() * 0.004,
        debris.userData.angle,
        performance.now() * 0.003 + debris.userData.tilt,
      );
      debris.scale.setScalar(0.65 + profile.category * 0.08);
    }

    for (const speck of this.airborneDebris) {
      speck.userData.angle -= dt * speck.userData.speed * (1 + profile.category * 0.14);
      speck.userData.height = (speck.userData.height + dt * 0.018 * speck.userData.speed) % 1;

      const height = 4 + speck.userData.height * (STORM_COLUMN_HEIGHT + profile.category * 1.4);
      const heightRatio = height / STORM_COLUMN_HEIGHT;
      const radius = profile.radius * THREE.MathUtils.lerp(0.78, 1.9, heightRatio) * speck.userData.radiusJitter;

      speck.position.set(
        Math.cos(speck.userData.angle) * radius,
        height,
        Math.sin(speck.userData.angle) * radius * 0.78,
      );
      speck.rotation.set(
        speck.userData.tilt + performance.now() * 0.0025,
        speck.userData.angle,
        performance.now() * 0.002 + speck.userData.tilt,
      );
      speck.scale.setScalar(0.55 + profile.category * 0.045 + heightRatio * 0.16);
    }
  }
}
