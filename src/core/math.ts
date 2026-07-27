export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function dampFactor(smoothing: number, deltaSeconds: number): number {
  return 1 - Math.exp(-smoothing * Math.max(0, deltaSeconds));
}

export function roundTo(value: number, decimalPlaces = 2): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}
