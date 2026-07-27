import { describe, expect, it } from 'vitest';
import {
  getStormReviewProfile,
  ONE_MILE_METERS,
} from './stormProfiles';

describe('storm review profiles', () => {
  it('uses a literal mile-wide Cat 5 condensation footprint', () => {
    const categoryFive = getStormReviewProfile(5);
    expect(categoryFive.radius * 2).toBe(ONE_MILE_METERS);
    expect(categoryFive.radius * 2).toBe(1609.344);
  });

  it('increases footprint and reduces movement speed by category', () => {
    const categoryOne = getStormReviewProfile(1);
    const categoryThree = getStormReviewProfile(3);
    const categoryFive = getStormReviewProfile(5);

    expect(categoryOne.radius).toBeLessThan(categoryThree.radius);
    expect(categoryThree.radius).toBeLessThan(categoryFive.radius);
    expect(categoryOne.movementSpeed).toBeGreaterThan(
      categoryThree.movementSpeed,
    );
    expect(categoryThree.movementSpeed).toBeGreaterThan(
      categoryFive.movementSpeed,
    );
  });
});
