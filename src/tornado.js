import * as THREE from 'three';

const CATEGORY_THRESHOLDS = [
  { category: 1, mass: 0, radius: 3.2, pullRadius: 8, liftLimit: 12, speed: 18 },
  { category: 2, mass: 28, radius: 4.4, pullRadius: 11, liftLimit: 34, speed: 17 },
  { category: 3, mass: 80, radius: 5.9, pullRadius: 14, liftLimit: 72, speed: 15.5 },
  { category: 4, mass: 160, radius: 7.5, pullRadius: 18, liftLimit: 122, speed: 14 },
  { category: 5, mass: 285, radius: 9.6, pullRadius: 23, liftLimit: 190, speed: 12.5 },
];

const START_POSITION = new THREE.Vector3(-48, 0, 48);

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
      color: 0x9dc8bb,
      emissive: 0x18352f,
      roughness: 0.75,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.ringMaterial = new THREE.MeshStandardMaterial({
      color: 0xe7e5d6,
      emissive: 0x4a5146,
      roughness: 0.92,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    this.funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 0.18, 5.2, 42, 1, true),
      this.funnelMaterial,
    );
    this.funnel.position.y = 2.7;
    this.group.add(this.funnel);

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
    for (let index = 0; index < 9; index += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 7, 48), this.ringMaterial);
      ring.position.y = 0.45 + index * 0.58;
      ring.rotation.x = Math.PI * 0.5;
      ring.userData.phase = index * 0.7;
      this.group.add(ring);
      this.rings.push(ring);
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
      radius: profile.radius + extraMass * 0.006,
      pullRadius: profile.pullRadius + extraMass * 0.012,
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
    this.funnel.scale.set(radiusScale, 1 + (profile.category - 1) * 0.12, radiusScale);
    this.funnel.rotation.y -= dt * (1.45 + profile.category * 0.42);
    this.funnelMaterial.opacity = 0.26 + profile.category * 0.04;
    this.groundCloud.rotation.z -= dt * (1.8 + profile.category * 0.35);
    this.groundCloud.scale.setScalar(profile.radius * 1.18);
    this.groundCloudMaterial.opacity = 0.26 + profile.category * 0.035;

    for (const ring of this.rings) {
      const normalizedHeight = ring.position.y / 5.4;
      const ringRadius = THREE.MathUtils.lerp(profile.radius * 0.2, profile.radius * 0.82, normalizedHeight);
      const pulse = Math.sin(performance.now() * 0.004 + ring.userData.phase) * 0.08;
      ring.scale.setScalar(ringRadius + pulse);
      ring.rotation.z += dt * (1.5 + profile.category * 0.45 + normalizedHeight);
      ring.material.opacity = THREE.MathUtils.clamp(0.22 + profile.category * 0.05 - normalizedHeight * 0.06, 0.18, 0.58);
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
  }
}
