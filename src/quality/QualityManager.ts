import { clamp } from '../core/math';
import type {
  CustomQualitySettings,
  PlatformQualityReport,
  QualityMode,
  QualityPresetKey,
  RenderQualityProfile,
} from '../core/types';
import { detectPlatformQuality } from './platformQuality';

const QUALITY_MODE_STORAGE_KEY = 'townfall.v2.qualityMode';
const CUSTOM_QUALITY_STORAGE_KEY = 'townfall.v2.customQuality';

const QUALITY_PRESETS: Record<QualityPresetKey, RenderQualityProfile> = {
  low: {
    key: 'low',
    label: 'Low',
    pixelRatioCap: 0.7,
    effectsScale: 0.4,
    townDetailScale: 0.55,
    stormFxScale: 0.45,
    shadows: false,
    bloom: false,
  },
  medium: {
    key: 'medium',
    label: 'Medium',
    pixelRatioCap: 1,
    effectsScale: 0.7,
    townDetailScale: 0.8,
    stormFxScale: 0.75,
    shadows: true,
    bloom: false,
  },
  high: {
    key: 'high',
    label: 'High',
    pixelRatioCap: 1.35,
    effectsScale: 1,
    townDetailScale: 1,
    stormFxScale: 1,
    shadows: true,
    bloom: true,
  },
};

const DEFAULT_CUSTOM_SETTINGS: CustomQualitySettings = {
  renderScale: 100,
  effectsScale: 100,
  townDetailScale: 100,
  stormFxScale: 100,
  shadows: true,
  bloom: true,
};

export type CustomQualityKey = keyof CustomQualitySettings;

export interface QualityState {
  mode: QualityMode;
  effectiveKey: QualityPresetKey | 'custom';
  profile: RenderQualityProfile;
  customSettings: CustomQualitySettings;
  platform: PlatformQualityReport;
  summary: string;
}

type QualityListener = (state: QualityState) => void;

export function isQualityMode(value: string | undefined): value is QualityMode {
  return value === 'auto'
    || value === 'low'
    || value === 'medium'
    || value === 'high'
    || value === 'custom';
}

export function isCustomQualityKey(
  value: string | undefined,
): value is CustomQualityKey {
  return value === 'renderScale'
    || value === 'effectsScale'
    || value === 'townDetailScale'
    || value === 'stormFxScale'
    || value === 'shadows'
    || value === 'bloom';
}

function sanitizePercent(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round(clamp(numericValue, minimum, maximum))
    : fallback;
}

function sanitizeCustomSettings(value: unknown): CustomQualitySettings {
  const raw = typeof value === 'object' && value !== null
    ? value as Partial<CustomQualitySettings>
    : {};

  return {
    renderScale: sanitizePercent(raw.renderScale, 100, 50, 135),
    effectsScale: sanitizePercent(raw.effectsScale, 100, 25, 100),
    townDetailScale: sanitizePercent(raw.townDetailScale, 100, 45, 115),
    stormFxScale: sanitizePercent(raw.stormFxScale, 100, 0, 100),
    shadows: typeof raw.shadows === 'boolean' ? raw.shadows : true,
    bloom: typeof raw.bloom === 'boolean' ? raw.bloom : true,
  };
}

function createCustomProfile(
  settings: CustomQualitySettings,
): RenderQualityProfile {
  return {
    key: 'custom',
    label: 'Custom',
    pixelRatioCap: settings.renderScale / 100,
    effectsScale: settings.effectsScale / 100,
    townDetailScale: settings.townDetailScale / 100,
    stormFxScale: settings.stormFxScale / 100,
    shadows: settings.shadows,
    bloom: settings.bloom,
  };
}

function settingsFromProfile(
  profile: RenderQualityProfile,
): CustomQualitySettings {
  return {
    renderScale: Math.round(profile.pixelRatioCap * 100),
    effectsScale: Math.round(profile.effectsScale * 100),
    townDetailScale: Math.round(profile.townDetailScale * 100),
    stormFxScale: Math.round(profile.stormFxScale * 100),
    shadows: profile.shadows,
    bloom: profile.bloom,
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in privacy modes; runtime state still works.
  }
}

export class QualityManager {
  readonly platform: PlatformQualityReport;
  private mode: QualityMode;
  private customSettings: CustomQualitySettings;
  private readonly listeners = new Set<QualityListener>();

  constructor(platform = detectPlatformQuality()) {
    this.platform = platform;
    this.customSettings = this.loadCustomSettings();
    this.mode = this.loadMode();
  }

  subscribe(listener: QualityListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getState(): QualityState {
    const profile = this.resolveProfile();
    return {
      mode: this.mode,
      effectiveKey: profile.key,
      profile,
      customSettings: this.mode === 'custom'
        ? { ...this.customSettings }
        : settingsFromProfile(profile),
      platform: this.platform,
      summary: this.createSummary(profile),
    };
  }

  setMode(mode: QualityMode, persist = true): void {
    this.mode = mode;
    if (persist) {
      writeStorage(QUALITY_MODE_STORAGE_KEY, mode);
    }
    this.notify();
  }

  setCustomValue(key: CustomQualityKey, value: number | boolean): void {
    const baseSettings = this.mode === 'custom'
      ? this.customSettings
      : settingsFromProfile(this.resolveProfile());
    const nextSettings = {
      ...baseSettings,
      [key]: value,
    };
    this.customSettings = sanitizeCustomSettings(nextSettings);
    this.mode = 'custom';
    writeStorage(QUALITY_MODE_STORAGE_KEY, this.mode);
    writeStorage(CUSTOM_QUALITY_STORAGE_KEY, JSON.stringify(this.customSettings));
    this.notify();
  }

  private loadMode(): QualityMode {
    const queryMode = new URLSearchParams(window.location.search).get('quality');
    if (queryMode !== null && isQualityMode(queryMode)) {
      return queryMode;
    }

    const storedMode = readStorage(QUALITY_MODE_STORAGE_KEY);
    return storedMode !== null && isQualityMode(storedMode)
      ? storedMode
      : 'auto';
  }

  private loadCustomSettings(): CustomQualitySettings {
    const storedSettings = readStorage(CUSTOM_QUALITY_STORAGE_KEY);
    if (storedSettings === null) {
      return { ...DEFAULT_CUSTOM_SETTINGS };
    }

    try {
      return sanitizeCustomSettings(JSON.parse(storedSettings) as unknown);
    } catch {
      return { ...DEFAULT_CUSTOM_SETTINGS };
    }
  }

  private resolveProfile(): RenderQualityProfile {
    if (this.mode === 'custom') {
      return createCustomProfile(this.customSettings);
    }

    const preset = this.mode === 'auto'
      ? this.platform.recommendedQuality
      : this.mode;
    return QUALITY_PRESETS[preset];
  }

  private createSummary(profile: RenderQualityProfile): string {
    if (this.mode === 'auto') {
      return `Auto chose ${profile.label}: ${this.platform.reasons[0] ?? 'balanced browser defaults'}`;
    }

    if (this.mode === 'custom') {
      return 'Custom controls are active.';
    }

    return `${profile.label} preset. Auto recommends ${QUALITY_PRESETS[this.platform.recommendedQuality].label}.`;
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
