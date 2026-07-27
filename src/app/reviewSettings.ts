import type {
  ReviewStormCategory,
  WeatherMode,
} from '../core/types';
import { isReviewStormCategory } from '../storm/stormProfiles';

export interface ReviewSettings {
  category: ReviewStormCategory;
  weather: WeatherMode;
}

export function parseReviewSettings(
  search: string,
): ReviewSettings {
  const parameters = new URLSearchParams(search);
  const requestedCategory = Number(parameters.get('category'));
  const requestedWeather = parameters.get('weather');
  return {
    category: isReviewStormCategory(requestedCategory)
      ? requestedCategory
      : 1,
    weather: requestedWeather === 'clear' ? 'clear' : 'storm',
  };
}
