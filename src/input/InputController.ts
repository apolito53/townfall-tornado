import { clamp01 } from '../core/math';
import type {
  InputSource,
  MovementCommand,
} from '../core/types';

const KEY_TO_DIRECTION = new Map<string, readonly [number, number]>([
  ['KeyW', [0, -1]],
  ['ArrowUp', [0, -1]],
  ['KeyS', [0, 1]],
  ['ArrowDown', [0, 1]],
  ['KeyA', [-1, 0]],
  ['ArrowLeft', [-1, 0]],
  ['KeyD', [1, 0]],
  ['ArrowRight', [1, 0]],
]);
const MOBILE_USER_AGENT_PATTERN = /android|iphone|ipad|ipod|mobile/i;
const JOYSTICK_DEAD_ZONE = 0.08;

export interface InputControllerOptions {
  joystickElement?: HTMLElement | null;
  mobileControlsEnabled?: boolean;
}

function detectMobileControls(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('mobileControls')) {
    return true;
  }
  if (params.has('noMobileControls')) {
    return false;
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  const touchFirstDevice = navigator.maxTouchPoints > 1 && (coarsePointer || noHover);
  return MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent)
    || touchFirstDevice
    || (coarsePointer && noHover);
}

function createCommand(
  rawX: number,
  rawY: number,
  source: InputSource,
): MovementCommand {
  const rawMagnitude = Math.hypot(rawX, rawY);
  if (rawMagnitude <= 0.0001) {
    return {
      x: 0,
      y: 0,
      magnitude: 0,
      source: 'idle',
    };
  }

  const magnitude = clamp01(rawMagnitude);
  const scale = magnitude / rawMagnitude;
  return {
    x: rawX * scale,
    y: rawY * scale,
    magnitude,
    source,
  };
}

export class InputController {
  readonly mobileControlsEnabled: boolean;
  private readonly canvas: HTMLCanvasElement;
  private readonly joystickElement: HTMLElement | null;
  private readonly joystickKnobElement: HTMLElement | null;
  private readonly keys = new Set<string>();
  private enabled = false;
  private pointerActive = false;
  private joystickActive = false;
  private pointerX = 0;
  private pointerY = 0;
  private joystickX = 0;
  private joystickY = 0;

  constructor(canvas: HTMLCanvasElement, options: InputControllerOptions = {}) {
    this.canvas = canvas;
    this.joystickElement = options.joystickElement ?? null;
    this.joystickKnobElement = this.joystickElement
      ?.querySelector<HTMLElement>('.mobile-joystick__knob') ?? null;
    const requestedMobileControls = options.mobileControlsEnabled
      ?? detectMobileControls();
    this.mobileControlsEnabled = requestedMobileControls
      && this.joystickElement !== null;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    if (this.mobileControlsEnabled) {
      this.bindJoystickEvents();
      this.setMobileControlsVisible(false);
    } else {
      this.bindCanvasPointerEvents();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.unbindCanvasPointerEvents();
    this.unbindJoystickEvents();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.pointerActive = false;
      this.pointerX = 0;
      this.pointerY = 0;
      this.resetJoystick();
    }
  }

  getCommand(): MovementCommand {
    if (!this.enabled) {
      return createCommand(0, 0, 'idle');
    }

    let keyboardX = 0;
    let keyboardY = 0;
    for (const code of this.keys) {
      const direction = KEY_TO_DIRECTION.get(code);
      if (direction !== undefined) {
        keyboardX += direction[0];
        keyboardY += direction[1];
      }
    }

    if (keyboardX !== 0 || keyboardY !== 0) {
      return createCommand(keyboardX, keyboardY, 'keyboard');
    }

    if (
      this.mobileControlsEnabled
      && Math.hypot(this.joystickX, this.joystickY) > JOYSTICK_DEAD_ZONE
    ) {
      return createCommand(
        this.joystickX,
        this.joystickY,
        'mobile-joystick',
      );
    }

    if (this.pointerActive) {
      return createCommand(this.pointerX, this.pointerY, 'pointer');
    }

    return createCommand(0, 0, 'idle');
  }

  isJoystickActive(): boolean {
    return this.joystickActive
      && Math.hypot(this.joystickX, this.joystickY) > JOYSTICK_DEAD_ZONE;
  }

  isMobileControlsVisible(): boolean {
    return this.mobileControlsEnabled
      && this.joystickElement?.hidden === false;
  }

  setMobileControlsVisible(visible: boolean): void {
    if (!this.mobileControlsEnabled || this.joystickElement === null) {
      return;
    }

    this.joystickElement.hidden = !visible;
    this.joystickElement.setAttribute('aria-hidden', String(!visible));
    if (!visible) {
      this.resetJoystick();
    }
  }

  private bindCanvasPointerEvents(): void {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
  }

  private unbindCanvasPointerEvents(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
  }

  private bindJoystickEvents(): void {
    this.joystickElement?.addEventListener(
      'pointerdown',
      this.handleJoystickPointerDown,
    );
    this.joystickElement?.addEventListener(
      'pointermove',
      this.handleJoystickPointerMove,
    );
    this.joystickElement?.addEventListener(
      'pointerup',
      this.handleJoystickPointerUp,
    );
    this.joystickElement?.addEventListener(
      'pointercancel',
      this.handleJoystickPointerUp,
    );
  }

  private unbindJoystickEvents(): void {
    this.joystickElement?.removeEventListener(
      'pointerdown',
      this.handleJoystickPointerDown,
    );
    this.joystickElement?.removeEventListener(
      'pointermove',
      this.handleJoystickPointerMove,
    );
    this.joystickElement?.removeEventListener(
      'pointerup',
      this.handleJoystickPointerUp,
    );
    this.joystickElement?.removeEventListener(
      'pointercancel',
      this.handleJoystickPointerUp,
    );
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !KEY_TO_DIRECTION.has(event.code)) {
      return;
    }

    event.preventDefault();
    this.keys.add(event.code);
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!KEY_TO_DIRECTION.has(event.code)) {
      return;
    }

    event.preventDefault();
    this.keys.delete(event.code);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled) {
      return;
    }

    this.pointerActive = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointerVector(event);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerActive) {
      this.updatePointerVector(event);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pointerActive = false;
    this.pointerX = 0;
    this.pointerY = 0;

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private updatePointerVector(event: PointerEvent): void {
    const bounds = this.canvas.getBoundingClientRect();
    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.5;
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.35);
    this.pointerX = (event.clientX - centerX) / radius;
    this.pointerY = (event.clientY - centerY) / radius;
  }

  private readonly handleJoystickPointerDown = (
    event: PointerEvent,
  ): void => {
    if (!this.enabled || this.joystickElement === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.joystickActive = true;
    this.joystickElement.setPointerCapture(event.pointerId);
    this.joystickElement.classList.add('mobile-joystick--active');
    this.updateJoystickVector(event);
  };

  private readonly handleJoystickPointerMove = (
    event: PointerEvent,
  ): void => {
    if (!this.joystickActive) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.updateJoystickVector(event);
  };

  private readonly handleJoystickPointerUp = (
    event: PointerEvent,
  ): void => {
    if (this.joystickElement === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.joystickActive = false;
    this.resetJoystick();

    if (this.joystickElement.hasPointerCapture(event.pointerId)) {
      this.joystickElement.releasePointerCapture(event.pointerId);
    }
  };

  private updateJoystickVector(event: PointerEvent): void {
    if (this.joystickElement === null) {
      return;
    }

    const bounds = this.joystickElement.getBoundingClientRect();
    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.5;
    const maxDistance = Math.max(1, Math.min(bounds.width, bounds.height) * 0.36);
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const rawLength = Math.hypot(rawX, rawY);
    const clampRatio = rawLength > maxDistance ? maxDistance / rawLength : 1;
    const knobX = rawX * clampRatio;
    const knobY = rawY * clampRatio;
    this.joystickX = knobX / maxDistance;
    this.joystickY = knobY / maxDistance;
    this.setJoystickKnobOffset(knobX, knobY);
  }

  private resetJoystick(): void {
    this.joystickActive = false;
    this.joystickX = 0;
    this.joystickY = 0;
    this.joystickElement?.classList.remove('mobile-joystick--active');
    this.setJoystickKnobOffset(0, 0);
  }

  private setJoystickKnobOffset(x: number, y: number): void {
    if (this.joystickKnobElement !== null) {
      this.joystickKnobElement.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}
