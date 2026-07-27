export const MAX_TORNADO_CATEGORY = 5;

const CATEGORY_TWO_MASS = 55;
const CATEGORY_MASS_CURVE = 3.55;

export function getCategoryMassRequirement(category) {
  if (category <= 1) {
    return 0;
  }

  // Log-spaced mass gates: each category needs a meaningfully bigger jump than
  // the last, which keeps late-game growth from snowballing after buildings fail.
  const curvedMass = CATEGORY_TWO_MASS
    * (Math.pow(CATEGORY_MASS_CURVE, category - 1) - 1)
    / (CATEGORY_MASS_CURVE - 1);
  return Math.round(curvedMass);
}

export const CATEGORY_MASS_REQUIREMENTS = Array.from(
  { length: MAX_TORNADO_CATEGORY + 1 },
  (_, index) => getCategoryMassRequirement(index + 1),
);
