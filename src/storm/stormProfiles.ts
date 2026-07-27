import type {
  ReviewStormCategory,
  StormProfile,
} from '../core/types';

export const ONE_MILE_METERS = 1609.344;

export interface StormReviewProfile extends StormProfile {
  category: ReviewStormCategory;
  label: string;
  visualHeight: number;
}

const REVIEW_STORM_PROFILES: Readonly<
  Record<ReviewStormCategory, StormReviewProfile>
> = {
  1: {
    category: 1,
    label: 'Cat 1',
    radius: 40,
    influenceRadius: 100,
    movementSpeed: 24,
    condensationDensity: 0.38,
    visualHeight: 260,
  },
  3: {
    category: 3,
    label: 'Cat 3',
    radius: 210,
    influenceRadius: 400,
    movementSpeed: 18,
    condensationDensity: 0.66,
    visualHeight: 620,
  },
  5: {
    category: 5,
    label: 'Cat 5',
    radius: ONE_MILE_METERS * 0.5,
    influenceRadius: 1100,
    movementSpeed: 12,
    condensationDensity: 0.9,
    visualHeight: 1280,
  },
};

export function getStormReviewProfile(
  category: ReviewStormCategory,
): StormReviewProfile {
  return REVIEW_STORM_PROFILES[category];
}

export function isReviewStormCategory(
  value: number,
): value is ReviewStormCategory {
  return value === 1 || value === 3 || value === 5;
}
