import { describe, expect, it } from 'vitest';
import type { BuildingArchetype } from '../core/types';
import { projectToRoad } from './TerrainField';
import {
  countBuildingsByArchetype,
  createNorthStarDistrict,
} from './northStarDistrict';

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
});
