import * as THREE from 'three';
import type { MovementCommand } from '../core/types';
import { StormMarker } from './StormMarker';

const WORLD_HALF_EXTENT = 280;

export class FoundationWorld {
  readonly object = new THREE.Group();
  readonly storm = new StormMarker();
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor() {
    this.object.name = 'FoundationWorld';
    this.createGround();
    this.createCoordinateRoads();
    this.createReferencePosts();
    this.object.add(this.storm.object);
  }

  get movementBoundary(): number {
    return WORLD_HALF_EXTENT - 12;
  }

  reset(): void {
    this.storm.setPosition(0, 0);
  }

  setEffectsScale(scale: number): void {
    this.storm.setEffectsScale(scale);
  }

  update(timeSeconds: number, command: MovementCommand): void {
    this.storm.update(timeSeconds, command);
  }

  dispose(): void {
    this.storm.dispose();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
  }

  private createGround(): void {
    const geometry = new THREE.PlaneGeometry(
      WORLD_HALF_EXTENT * 2,
      WORLD_HALF_EXTENT * 2,
      1,
      1,
    );
    const material = new THREE.MeshStandardMaterial({
      color: 0x607a63,
      roughness: 0.96,
      metalness: 0,
    });
    const ground = new THREE.Mesh(geometry, material);
    ground.name = 'FoundationGround';
    ground.rotation.x = -Math.PI * 0.5;
    ground.receiveShadow = true;
    this.object.add(ground);
    this.geometries.push(geometry);
    this.materials.push(material);

    const grid = new THREE.GridHelper(
      WORLD_HALF_EXTENT * 2,
      56,
      0xa9b89f,
      0x718871,
    );
    grid.name = 'FoundationGrid';
    grid.position.y = 0.035;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const gridMaterial of gridMaterials) {
      gridMaterial.transparent = true;
      gridMaterial.opacity = 0.28;
      this.materials.push(gridMaterial);
    }
    this.geometries.push(grid.geometry);
    this.object.add(grid);
  }

  private createCoordinateRoads(): void {
    const roadGeometry = new THREE.BoxGeometry(
      WORLD_HALF_EXTENT * 2,
      0.08,
      11,
    );
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x3e4943,
      roughness: 0.92,
    });
    const eastWest = new THREE.Mesh(roadGeometry, roadMaterial);
    eastWest.name = 'FoundationRoadEastWest';
    eastWest.position.y = 0.06;
    eastWest.receiveShadow = true;
    this.object.add(eastWest);

    const northSouth = new THREE.Mesh(roadGeometry, roadMaterial);
    northSouth.name = 'FoundationRoadNorthSouth';
    northSouth.rotation.y = Math.PI * 0.5;
    northSouth.position.y = 0.06;
    northSouth.receiveShadow = true;
    this.object.add(northSouth);
    this.geometries.push(roadGeometry);
    this.materials.push(roadMaterial);

    const stripeGeometry = new THREE.BoxGeometry(4.5, 0.025, 0.22);
    const stripeMaterial = new THREE.MeshBasicMaterial({ color: 0xd9d4a9 });
    const stripeCountPerAxis = 24;
    const stripes = new THREE.InstancedMesh(
      stripeGeometry,
      stripeMaterial,
      stripeCountPerAxis * 2,
    );
    stripes.name = 'FoundationRoadStripes';
    const matrix = new THREE.Matrix4();
    let instanceIndex = 0;
    for (let index = 0; index < stripeCountPerAxis; index += 1) {
      const coordinate = -230 + index * 20;
      matrix.makeTranslation(coordinate, 0.12, 0);
      stripes.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
      matrix.makeRotationY(Math.PI * 0.5);
      matrix.setPosition(0, 0.12, coordinate);
      stripes.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
    }
    stripes.instanceMatrix.needsUpdate = true;
    this.object.add(stripes);
    this.geometries.push(stripeGeometry);
    this.materials.push(stripeMaterial);
  }

  private createReferencePosts(): void {
    const geometry = new THREE.CylinderGeometry(0.18, 0.24, 2.8, 6);
    const material = new THREE.MeshStandardMaterial({
      color: 0xb6b090,
      roughness: 0.82,
    });
    const coordinates = [-200, -150, -100, -50, 50, 100, 150, 200];
    const posts = new THREE.InstancedMesh(
      geometry,
      material,
      coordinates.length * 4,
    );
    posts.name = 'FoundationReferencePosts';
    const matrix = new THREE.Matrix4();
    let instanceIndex = 0;
    for (const coordinate of coordinates) {
      matrix.makeTranslation(coordinate, 1.4, -18);
      posts.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
      matrix.makeTranslation(coordinate, 1.4, 18);
      posts.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
      matrix.makeTranslation(-18, 1.4, coordinate);
      posts.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
      matrix.makeTranslation(18, 1.4, coordinate);
      posts.setMatrixAt(instanceIndex, matrix);
      instanceIndex += 1;
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    this.object.add(posts);
    this.geometries.push(geometry);
    this.materials.push(material);
  }
}
