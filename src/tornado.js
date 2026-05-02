import * as THREE from 'three';

const CATEGORY_THRESHOLDS = [
  { category: 1, mass: 0, radius: 3.2, pullRadius: 8, liftLimit: 12, speed: 18 },
  { category: 2, mass: 28, radius: 6.8, pullRadius: 15, liftLimit: 34, speed: 17 },
  { category: 3, mass: 80, radius: 12.5, pullRadius: 28, liftLimit: 72, speed: 15.5 },
  { category: 4, mass: 160, radius: 22, pullRadius: 52, liftLimit: 122, speed: 14 },
  { category: 5, mass: 285, radius: 36, pullRadius: 92, liftLimit: 190, speed: 12.5 },
];

const START_POSITION = new THREE.Vector3(-48, 0, 48);
const STORM_COLUMN_HEIGHT = 13.5;

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

    this.funnelMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8d4bd,
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

    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xe7e5d6,
      emissive: 0x4a5146,
      roughness: 0.92,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    this.funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.42, 0.16, STORM_COLUMN_HEIGHT, 48, 5, true),
      this.funnelMaterial,
    );
    this.funnel.position.y = STORM_COLUMN_HEIGHT * 0.5;
    this.group.add(this.funnel);

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
      layer.position.y = STORM_COLUMN_HEIGHT * (0.47 + index * 0.018);
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

    this.rings = [];
    for (let index = 0; index < 16; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 7, 48), this.ringMaterial);
      ring.position.y = 0.45 + index * (STORM_COLUMN_HEIGHT * 0.82 / 15);
      ring.rotation.x = Math.PI * 0.5;
      ring.userData.phase = index * 0.7;
      this.group.add(ring);
      this.rings.push(ring);
    }

    this.cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6d2c0,
      emissive: 0x3b3a31,
      roughness: 1,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    });

    this.cloudShelf = [];
    for (let index = 0; index < 8; index += 1) {
      const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), this.cloudMaterial);
      const angle = (index / 8) * Math.PI * 2;
      cloud.position.set(Math.cos(angle) * 2.2, STORM_COLUMN_HEIGHT + 0.6 + Math.random() * 0.85, Math.sin(angle) * 1.5);
      cloud.rotation.set(Math.random(), Math.random(), Math.random());
      cloud.scale.set(3.2 + Math.random() * 2.2, 0.55 + Math.random() * 0.26, 1.9 + Math.random() * 1.3);
      cloud.userData.angle = angle;
      cloud.userData.phase = Math.random() * Math.PI * 2;
      this.group.add(cloud);
      this.cloudShelf.push(cloud);
    }

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

  restart() {
    this.position.copy(START_POSITION);
    this.mass = 0;
    this.lastCategory = 1;
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
    this.funnel.scale.set(radiusScale, 1 + (profile.category - 1) * 0.035, radiusScale);
    this.funnel.rotation.y -= dt * (1.45 + profile.category * 0.42);
    this.funnelMaterial.opacity = 0.3 + profile.category * 0.045;
    this.core.scale.set(radiusScale * 0.82, 1 + (profile.category - 1) * 0.035, radiusScale * 0.82);
    this.core.rotation.y += dt * (1.9 + profile.category * 0.55);
    this.coreMaterial.opacity = 0.32 + profile.category * 0.035;
    this.groundCloud.rotation.z -= dt * (1.8 + profile.category * 0.35);
    this.groundCloud.scale.setScalar(profile.radius * 1.18);
    this.groundCloudMaterial.opacity = 0.3 + profile.category * 0.04;

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
        1 + index * 0.045 + profile.category * 0.055,
        radiusScale * (1 + index * 0.12 + Math.cos(phase) * 0.035),
      );
      layer.material.opacity = THREE.MathUtils.clamp(0.09 + profile.category * 0.023 - index * 0.004, 0.08, 0.25);
    }

    for (const ring of this.rings) {
      const normalizedHeight = ring.position.y / STORM_COLUMN_HEIGHT;
      const ringRadius = THREE.MathUtils.lerp(profile.radius * 0.18, profile.radius * 0.98, normalizedHeight);
      const pulse = Math.sin(performance.now() * 0.004 + ring.userData.phase) * 0.08;
      ring.scale.setScalar(ringRadius + pulse);
      ring.rotation.z += dt * (1.5 + profile.category * 0.45 + normalizedHeight);
      ring.material.opacity = THREE.MathUtils.clamp(0.14 + profile.category * 0.038 - normalizedHeight * 0.05, 0.1, 0.44);
    }

    for (const cloud of this.cloudShelf) {
      cloud.userData.angle -= dt * (0.18 + profile.category * 0.04);
      const shelfRadius = profile.radius * (0.95 + Math.sin(performance.now() * 0.001 + cloud.userData.phase) * 0.08);
      cloud.position.x = Math.cos(cloud.userData.angle) * shelfRadius;
      cloud.position.z = Math.sin(cloud.userData.angle) * shelfRadius * 0.72;
      cloud.position.y = STORM_COLUMN_HEIGHT + 0.3 + profile.category * 0.22 + Math.sin(performance.now() * 0.0018 + cloud.userData.phase) * 0.28;
      cloud.rotation.y += dt * 0.18;
      cloud.scale.setScalar((0.9 + profile.category * 0.08) * (1.8 + Math.sin(cloud.userData.phase) * 0.12));
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

      const height = 3.2 + speck.userData.height * (STORM_COLUMN_HEIGHT + profile.category * 0.55);
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
