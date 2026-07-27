import { describe, expect, it } from 'vitest';
import { parseReviewSettings } from './reviewSettings';

describe('review settings', () => {
  it('defaults to Cat 1 storm weather', () => {
    expect(parseReviewSettings('')).toEqual({
      category: 1,
      weather: 'storm',
    });
  });

  it('accepts only the milestone review matrix values', () => {
    expect(parseReviewSettings('?category=5&weather=clear')).toEqual({
      category: 5,
      weather: 'clear',
    });
    expect(parseReviewSettings('?category=4&weather=sunny')).toEqual({
      category: 1,
      weather: 'storm',
    });
  });
});
