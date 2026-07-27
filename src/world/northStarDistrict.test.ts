import { describe, expect, it } from 'vitest';
import type { BuildingArchetype } from '../core/types';
import { projectToRoad } from './TerrainField';
import {
  countBuildingsByArchetype,
  createNorthStarDistrict,
} from './northStarDistrict';

function distanceToSegment(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
): number {
  const segmentX = endX - startX;
  const segmentZ = endZ - startZ;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const amount = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(
      1,
      ((x - startX) * segmentX + (z - startZ) * segmentZ)
        / lengthSquared,
    ));
  return Math.hypot(
    x - (startX + segmentX * amount),
    z - (startZ + segmentZ * amount),
  );
}

function pointFallsInsideRotatedRectangle(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  rotationY: number,
  margin = 0,
): boolean {
  const offsetX = x - centerX;
  const offsetZ = z - centerZ;
  const cosine = Math.cos(-rotationY);
  const sine = Math.sin(-rotationY);
  const localX = offsetX * cosine - offsetZ * sine;
  const localZ = offsetX * sine + offsetZ * cosine;
  return Math.abs(localX) <= width * 0.5 + margin
    && Math.abs(localZ) <= depth * 0.5 + margin;
}

function countPropsByKind(
  props: ReturnType<typeof createNorthStarDistrict>['data']['props'],
  kind: typeof props[number]['kind'],
): number {
  return props.filter((prop) => prop.kind === kind).length;
}

describe('north-star district', () => {
  it('is deterministic and contains the authored content inventory', () => {
    const first = createNorthStarDistrict();
    const second = createNorthStarDistrict();

    expect(first.data.signature).toBe(second.data.signature);
    expect(first.data.buildings).toEqual(second.data.buildings);
    expect(first.data.props).toEqual(second.data.props);
    expect(first.data.buildings).toHaveLength(20);
    expect(countPropsByKind(first.data.props, 'tree')).toBe(80);
    expect(countPropsByKind(first.data.props, 'car')).toBe(14);
    expect(countPropsByKind(first.data.props, 'fence')).toBe(220);
    expect(countPropsByKind(first.data.props, 'utility-pole')).toBe(28);
    expect(first.data.props).toHaveLength(374);
  });

  it('contains the required mix of homes and larger anchor buildings', () => {
    const { data } = createNorthStarDistrict();
    const counts = countBuildingsByArchetype(data.buildings);
    const expected: Readonly<Partial<Record<BuildingArchetype, number>>> = {
      ranch: 7,
      'two-story': 2,
      duplex: 1,
      manufactured: 1,
      school: 1,
      'fire-station': 1,
      'convenience-store': 1,
      'strip-shop': 1,
      warehouse: 1,
      barn: 2,
      utility: 2,
    };

    for (const [archetype, count] of Object.entries(expected)) {
      expect(counts.get(archetype as BuildingArchetype)).toBe(count);
    }
  });

  it('grounds every placement and keeps landscape props out of roads', () => {
    const { data, terrain } = createNorthStarDistrict();

    for (const building of data.buildings) {
      expect(building.item.position.y).toBeCloseTo(
        terrain.sampleHeight(
          building.item.position.x,
          building.item.position.z,
        ),
        6,
      );
      const lot = data.lots.find((candidate) => candidate.id === building.lotId);
      expect(lot).toBeDefined();
      if (lot !== undefined) {
        expect(building.definition.footprint.width).toBeLessThan(lot.width);
        expect(building.definition.footprint.depth).toBeLessThan(lot.depth);
      }
    }

    for (const prop of data.props) {
      expect(prop.position.y).toBeCloseTo(
        terrain.sampleHeight(prop.position.x, prop.position.z),
        6,
      );
      if (
        prop.kind !== 'tree'
        && prop.kind !== 'fence'
        && prop.kind !== 'utility-pole'
      ) {
        continue;
      }
      for (const road of data.roads) {
        const projection = projectToRoad(
          prop.position.x,
          prop.position.z,
          road,
        );
        expect(
          projection.distance,
          `${prop.id} overlaps ${road.id}`,
        ).toBeGreaterThan(road.width * 0.5);
      }
    }
  });

  it('keeps generated trees clear of all authored reservations', () => {
    const { data } = createNorthStarDistrict();
    const trees = data.props.filter((prop) => prop.kind === 'tree');

    for (const tree of trees) {
      for (const road of data.roads) {
        const projection = projectToRoad(
          tree.position.x,
          tree.position.z,
          road,
        );
        expect(
          projection.distance,
          `${tree.id} enters the ${road.id} road reservation`,
        ).toBeGreaterThanOrEqual(
          road.width * 0.5 + road.shoulderWidth + 4,
        );
      }

      for (const building of data.buildings) {
        expect(
          pointFallsInsideRotatedRectangle(
            tree.position.x,
            tree.position.z,
            building.item.position.x,
            building.item.position.z,
            building.definition.footprint.width,
            building.definition.footprint.depth,
            building.item.rotationY,
            14,
          ),
          `${tree.id} enters the ${building.item.id} building reservation`,
        ).toBe(false);
      }

      for (const lot of data.lots) {
        const drivewayDistance = distanceToSegment(
          tree.position.x,
          tree.position.z,
          lot.drivewayAnchor.x,
          lot.drivewayAnchor.z,
          lot.center.x,
          lot.center.z,
        );
        expect(
          drivewayDistance,
          `${tree.id} enters the ${lot.id} driveway reservation`,
        ).toBeGreaterThanOrEqual(6);

        if (lot.surface !== 'grass') {
          expect(
            pointFallsInsideRotatedRectangle(
              tree.position.x,
              tree.position.z,
              lot.center.x,
              lot.center.z,
              lot.width,
              lot.depth,
              lot.rotationY,
              4,
            ),
            `${tree.id} enters the ${lot.id} hardscape reservation`,
          ).toBe(false);
        }
      }
    }
  });
});
