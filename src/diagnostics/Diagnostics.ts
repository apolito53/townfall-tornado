import type { RuntimeDiagnostics } from '../core/types';

const WARMUP_DURATION_MS = 3000;
const HITCH_THRESHOLD_MS = 75;
const MAX_SAMPLE_COUNT = 240;
const OVERLAY_UPDATE_INTERVAL_MS = 250;

interface PerformanceSnapshot {
  performancePhase: 'warmup' | 'gameplay';
  warmupComplete: boolean;
  startupFrameCount: number;
  startupHitchCount: number;
  startupLongestFrameMs: number;
  fps: number;
  averageFrameMs: number;
  p95FrameMs: number;
  averageWorkMs: number;
  p95WorkMs: number;
  maxFrameMs: number;
  maxWorkMs: number;
  hitchCount: number;
  longestHitchMs: number;
}

export interface DiagnosticsOptions {
  onHitch?: (frameMs: number, workMs: number) => void;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], percentileValue: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? 0;
}

function formatNumber(value: number, decimalPlaces = 1): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
}

export class Diagnostics {
  private readonly element: HTMLElement;
  private readonly onHitch: ((frameMs: number, workMs: number) => void) | null;
  private readonly warmupStartedAt = performance.now();
  private readonly warmupUntil = this.warmupStartedAt + WARMUP_DURATION_MS;
  private warmupComplete = false;
  private startupFrameCount = 0;
  private startupHitchCount = 0;
  private startupLongestFrameMs = 0;
  private lastFrameStartedAt: number | null = null;
  private currentFrameStartedAt = 0;
  private readonly frameSamples: number[] = [];
  private readonly workSamples: number[] = [];
  private maxFrameMs = 0;
  private maxWorkMs = 0;
  private hitchCount = 0;
  private longestHitchMs = 0;
  private overlayVisible = false;
  private lastOverlayUpdateAt = 0;

  constructor(element: HTMLElement, options: DiagnosticsOptions = {}) {
    this.element = element;
    this.onHitch = options.onHitch ?? null;
    window.addEventListener('keydown', this.handleKeyDown);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  beginFrame(timestampMs: number): void {
    this.currentFrameStartedAt = performance.now();
    const previousFrameStartedAt = this.lastFrameStartedAt;
    this.lastFrameStartedAt = timestampMs;
    if (previousFrameStartedAt === null) {
      return;
    }

    const frameMs = Math.max(0, timestampMs - previousFrameStartedAt);
    if (!this.warmupComplete && timestampMs >= this.warmupUntil) {
      this.warmupComplete = true;
      this.frameSamples.length = 0;
      this.workSamples.length = 0;
      this.maxFrameMs = 0;
      this.maxWorkMs = 0;
      this.hitchCount = 0;
      this.longestHitchMs = 0;
    }

    if (!this.warmupComplete) {
      this.startupFrameCount += 1;
      this.startupLongestFrameMs = Math.max(
        this.startupLongestFrameMs,
        frameMs,
      );
      if (frameMs >= HITCH_THRESHOLD_MS) {
        this.startupHitchCount += 1;
      }
      return;
    }

    this.pushSample(this.frameSamples, frameMs);
    this.maxFrameMs = Math.max(this.maxFrameMs, frameMs);
    if (frameMs >= HITCH_THRESHOLD_MS) {
      this.hitchCount += 1;
      this.longestHitchMs = Math.max(this.longestHitchMs, frameMs);
    }
  }

  endFrame(): void {
    if (this.currentFrameStartedAt <= 0) {
      return;
    }

    const workMs = Math.max(0, performance.now() - this.currentFrameStartedAt);
    if (this.warmupComplete) {
      this.pushSample(this.workSamples, workMs);
      this.maxWorkMs = Math.max(this.maxWorkMs, workMs);
      const frameMs = this.frameSamples.at(-1) ?? 0;
      if (frameMs >= HITCH_THRESHOLD_MS) {
        this.onHitch?.(frameMs, workMs);
      }
    }
  }

  getPerformanceSnapshot(): PerformanceSnapshot {
    const averageFrameMs = average(this.frameSamples);
    return {
      performancePhase: this.warmupComplete ? 'gameplay' : 'warmup',
      warmupComplete: this.warmupComplete,
      startupFrameCount: this.startupFrameCount,
      startupHitchCount: this.startupHitchCount,
      startupLongestFrameMs: this.startupLongestFrameMs,
      fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
      averageFrameMs,
      p95FrameMs: percentile(this.frameSamples, 0.95),
      averageWorkMs: average(this.workSamples),
      p95WorkMs: percentile(this.workSamples, 0.95),
      maxFrameMs: this.maxFrameMs,
      maxWorkMs: this.maxWorkMs,
      hitchCount: this.hitchCount,
      longestHitchMs: this.longestHitchMs,
    };
  }

  publish(diagnostics: RuntimeDiagnostics): void {
    window.__townfallDiagnostics = diagnostics;
    const dataset = this.element.dataset;
    dataset.runtime = diagnostics.runtime;
    dataset.phase = diagnostics.appPhase;
    dataset.gameMode = diagnostics.gameMode ?? '';
    dataset.paused = String(diagnostics.paused);
    dataset.perspectiveAmount = String(diagnostics.perspectiveAmount);
    dataset.qualityMode = diagnostics.qualityMode;
    dataset.quality = diagnostics.effectiveQuality;
    dataset.renderOk = String(diagnostics.renderOk);
    dataset.mobileControls = String(diagnostics.mobileControlsEnabled);
    dataset.stormX = String(diagnostics.stormX);
    dataset.stormZ = String(diagnostics.stormZ);

    const now = performance.now();
    if (
      this.overlayVisible
      && now - this.lastOverlayUpdateAt >= OVERLAY_UPDATE_INTERVAL_MS
    ) {
      this.lastOverlayUpdateAt = now;
      this.renderOverlay(diagnostics);
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'F3') {
      return;
    }

    event.preventDefault();
    this.overlayVisible = !this.overlayVisible;
    this.element.hidden = !this.overlayVisible;
    this.element.setAttribute('aria-hidden', String(!this.overlayVisible));
    if (this.overlayVisible && window.__townfallDiagnostics !== undefined) {
      this.renderOverlay(window.__townfallDiagnostics);
    }
  };

  private pushSample(samples: number[], value: number): void {
    samples.push(value);
    if (samples.length > MAX_SAMPLE_COUNT) {
      samples.shift();
    }
  }

  private renderOverlay(diagnostics: RuntimeDiagnostics): void {
    const root = document.createDocumentFragment();
    const header = document.createElement('div');
    header.className = 'diagnostics__header';
    const title = document.createElement('span');
    title.textContent = 'Diagnostics';
    const shortcut = document.createElement('strong');
    shortcut.textContent = 'F3';
    header.append(title, shortcut);
    root.append(header);

    root.append(
      this.createSection('Performance', [
        ['Phase', diagnostics.performancePhase],
        ['FPS', formatNumber(diagnostics.fps)],
        ['Frame Avg / P95', `${formatNumber(diagnostics.averageFrameMs)} / ${formatNumber(diagnostics.p95FrameMs)} ms`],
        ['Work Avg / P95', `${formatNumber(diagnostics.averageWorkMs)} / ${formatNumber(diagnostics.p95WorkMs)} ms`],
        ['Hitches / Worst', `${diagnostics.hitchCount} / ${formatNumber(diagnostics.longestHitchMs)} ms`],
        ['Startup Hitches', `${diagnostics.startupHitchCount} / ${formatNumber(diagnostics.startupLongestFrameMs)} ms`],
      ]),
      this.createSection('Runtime', [
        ['Phase / Mode', `${diagnostics.appPhase} / ${diagnostics.gameMode ?? 'none'}`],
        ['Session / Restarts', `${diagnostics.sessionId} / ${diagnostics.restartCount}`],
        ['Travel', `${formatNumber(diagnostics.distanceTraveled)} m`],
        ['Fixed Step', `${diagnostics.simulationHz} Hz`],
        ['Steps / Dropped', `${diagnostics.simulationSteps} / ${diagnostics.droppedSimulationSteps}`],
        ['Seed', diagnostics.worldSeedLabel],
      ]),
      this.createSection('Render', [
        ['Draw Calls', diagnostics.drawCalls.toLocaleString()],
        ['Triangles', diagnostics.triangles.toLocaleString()],
        ['Scene Objects', diagnostics.sceneObjects.toLocaleString()],
        ['Meshes', diagnostics.sceneMeshes.toLocaleString()],
        ['Geometries / Textures', `${diagnostics.geometries} / ${diagnostics.textures}`],
        ['Pixel Ratio', formatNumber(diagnostics.pixelRatio, 2)],
      ]),
      this.createSection('Input', [
        ['Source', diagnostics.inputSource],
        ['Command', `${formatNumber(diagnostics.commandX, 2)}, ${formatNumber(diagnostics.commandY, 2)}`],
        ['Magnitude', formatNumber(diagnostics.commandMagnitude, 2)],
        ['Mobile / Visible', `${diagnostics.mobileControlsEnabled} / ${diagnostics.mobileControlsVisible}`],
        ['Storm Position', `${formatNumber(diagnostics.stormX)}, ${formatNumber(diagnostics.stormZ)}`],
      ]),
      this.createSection('Quality', [
        ['Mode / Effective', `${diagnostics.qualityMode} / ${diagnostics.effectiveQuality}`],
        ['Perspective', formatNumber(diagnostics.perspectiveAmount, 2)],
        ['Camera Distance', formatNumber(diagnostics.cameraDistance)],
        ['Camera Height', formatNumber(diagnostics.cameraHeight)],
      ]),
    );

    this.element.replaceChildren(root);
  }

  private createSection(
    headingText: string,
    rows: readonly (readonly [string, string])[],
  ): HTMLElement {
    const section = document.createElement('section');
    section.className = 'diagnostics__section';
    const heading = document.createElement('h2');
    heading.textContent = headingText;
    section.append(heading);
    for (const [labelText, valueText] of rows) {
      const row = document.createElement('div');
      row.className = 'diagnostics__row';
      const label = document.createElement('span');
      label.textContent = labelText;
      const value = document.createElement('strong');
      value.textContent = valueText;
      row.append(label, value);
      section.append(row);
    }
    return section;
  }
}
