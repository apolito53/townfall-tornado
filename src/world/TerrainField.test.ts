import { describe, expect, it } from 'vitest';
import { getRoadSegmentGrade } from './TerrainField';
import { createNorthStarDistrict } from './northStarDistrict';

describe('TerrainField', () => {
  it('produces a continuous dramatic surface with normalized samples', () => {
    const { terrain } = createNorthStarDistrict();
    const elevationRange = terrain.getElevationRange(72);

    expect(elevationRange.maximum - elevationRange.minimum).toBeGreaterThan(75);
    expect(elevationRange.maximum - elevationRange.minimum).toBeLessThan(130);

    let largestOneMeterStep = 0;
    for (let z = -1400; z <= 1400; z += 140) {
      for (let x = -1400; x <= 1400; x += 140) {
        const sample = terrain.sample(x, z);
        const normalLength = Math.hypot(
          sample.normal.x,
          sample.normal.y,
          sample.normal.z,
        );
        expect(Number.isFinite(sample.height)).toBe(true);
        expect(normalLength).toBeCloseTo(1, 5);

        largestOneMeterStep = Math.max(
          largestOneMeterStep,
          Math.abs(terrain.sampleHeight(x + 1, z) - sample.height),
          Math.abs(terrain.sampleHeight(x, z + 1) - sample.height),
        );
      }
    }

    expect(largestOneMeterStep).toBeLessThan(1.2);
  });

  it('keeps authored roads and lots within their grade limits', () => {
    const { data, terrain } = createNorthStarDistrict();

    for (const road of data.roads) {
      for (let index = 0; index < road.points.length - 1; index += 1) {
        const start = road.points[index];
        const end = road.points[index + 1];
        expect(start).toBeDefined();
        expect(end).toBeDefined();
        if (start !== undefined && end !== undefined) {
          expect(getRoadSegmentGrade(start, end)).toBeLessThanOrEqual(0.08);
        }
      }
    }

    for (const lot of data.lots) {
      const cosine = Math.cos(lot.rotationY);
      const sine = Math.sin(lot.rotationY);
      const cornerHeights: number[] = [];
      for (const localX of [-lot.width * 0.45, lot.width * 0.45]) {
        for (const localZ of [-lot.depth * 0.45, lot.depth * 0.45]) {
          const x = lot.center.x + localX * cosine - localZ * sine;
          const z = lot.center.z + localX * sine + localZ * cosine;
          cornerHeights.push(terrain.sampleHeight(x, z));
        }
      }
      expect(Math.max(...cornerHeights) - Math.min(...cornerHeights))
        .toBeLessThanOrEqual(Math.max(lot.width, lot.depth) * 0.02);
    }
  });
});
