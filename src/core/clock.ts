import { clamp } from './math';

export interface ClockFrame {
  frameSeconds: number;
  simulationSteps: number;
  droppedSimulationSteps: number;
  interpolationAlpha: number;
  simulationTime: number;
  frameNumber: number;
}

export interface FixedStepClockOptions {
  stepSeconds?: number;
  maxFrameSeconds?: number;
  maxSubSteps?: number;
}

export class FixedStepClock {
  readonly stepSeconds: number;
  readonly maxFrameSeconds: number;
  readonly maxSubSteps: number;
  private lastTimestampMs: number | null = null;
  private accumulatorSeconds = 0;
  private simulationTimeSeconds = 0;
  private frameCount = 0;

  constructor(options: FixedStepClockOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / 60;
    this.maxFrameSeconds = options.maxFrameSeconds ?? 0.1;
    this.maxSubSteps = options.maxSubSteps ?? 5;
  }

  get simulationHz(): number {
    return Math.round(1 / this.stepSeconds);
  }

  reset(timestampMs: number | null = null): void {
    this.lastTimestampMs = timestampMs;
    this.accumulatorSeconds = 0;
    this.simulationTimeSeconds = 0;
    this.frameCount = 0;
  }

  tick(
    timestampMs: number,
    shouldSimulate: boolean,
    simulate: (stepSeconds: number, simulationTime: number) => void,
  ): ClockFrame {
    const previousTimestamp = this.lastTimestampMs;
    this.lastTimestampMs = timestampMs;
    this.frameCount += 1;

    if (previousTimestamp === null) {
      return this.createFrame(0, 0, 0);
    }

    const frameSeconds = clamp(
      (timestampMs - previousTimestamp) / 1000,
      0,
      this.maxFrameSeconds,
    );

    if (!shouldSimulate) {
      this.accumulatorSeconds = 0;
      return this.createFrame(frameSeconds, 0, 0);
    }

    this.accumulatorSeconds += frameSeconds;
    let simulationSteps = 0;

    while (
      this.accumulatorSeconds >= this.stepSeconds
      && simulationSteps < this.maxSubSteps
    ) {
      this.simulationTimeSeconds += this.stepSeconds;
      simulate(this.stepSeconds, this.simulationTimeSeconds);
      this.accumulatorSeconds -= this.stepSeconds;
      simulationSteps += 1;
    }

    let droppedSimulationSteps = 0;
    if (this.accumulatorSeconds >= this.stepSeconds) {
      droppedSimulationSteps = Math.floor(this.accumulatorSeconds / this.stepSeconds);
      this.accumulatorSeconds %= this.stepSeconds;
    }

    return this.createFrame(frameSeconds, simulationSteps, droppedSimulationSteps);
  }

  private createFrame(
    frameSeconds: number,
    simulationSteps: number,
    droppedSimulationSteps: number,
  ): ClockFrame {
    return {
      frameSeconds,
      simulationSteps,
      droppedSimulationSteps,
      interpolationAlpha: this.accumulatorSeconds / this.stepSeconds,
      simulationTime: this.simulationTimeSeconds,
      frameNumber: this.frameCount,
    };
  }
}
