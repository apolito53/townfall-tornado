import * as THREE from 'three';

const KEY_TO_DIRECTION = new Map([
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

function detectMobileControls() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('mobileControls')) {
    return true;
  }

  if (params.has('noMobileControls')) {
    return false;
  }

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const noHover = window.matchMedia?.('(hover: none)').matches ?? false;
  // Touch laptops often report touch points but still have precise pointer/hover.
  // Require a mobile-ish UA or coarse/no-hover signals before replacing canvas drag.
  const touchFirstDevice = navigator.maxTouchPoints > 1 && (coarsePointer || noHover);
  return MOBILE_USER_AGENT_PATTERN.test(navigator.userAgent)
    || touchFirstDevice
    || (coarsePointer && noHover);
}

export class InputController {
  canvas: HTMLCanvasElement;
  joystickElement: HTMLElement | null;
  joystickKnobElement: HTMLElement | null;
  keys: Set<string>;
  pointerActive: boolean;
  joystickActive: boolean;
  mobileControlsEnabled: boolean;
  pointerVector: THREE.Vector2;
  joystickVector: THREE.Vector2;
  keyboardVector: THREE.Vector2;

  constructor(canvas, { joystickElement = null, mobileControlsEnabled = detectMobileControls() } = {}) {
    this.canvas = canvas;
    this.joystickElement = joystickElement;
    this.joystickKnobElement = joystickElement?.querySelector('.mobile-joystick__knob') ?? null;
    this.keys = new Set();
    this.pointerActive = false;
    this.joystickActive = false;
    this.mobileControlsEnabled = Boolean(mobileControlsEnabled && joystickElement);
    this.pointerVector = new THREE.Vector2();
    this.joystickVector = new THREE.Vector2();
    this.keyboardVector = new THREE.Vector2();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Mobile gets an owned thumb control so game input does not fight HUD/menu gestures.
    if (this.mobileControlsEnabled) {
      this.bindJoystickEvents();
      this.setMobileControlsVisible(false);
    } else {
      this.bindCanvasPointerEvents();
    }
  }

  getMoveVector() {
    this.keyboardVector.set(0, 0);

    for (const code of this.keys) {
      const direction = KEY_TO_DIRECTION.get(code);
      if (direction) {
        this.keyboardVector.x += direction[0];
        this.keyboardVector.y += direction[1];
      }
    }

    if (this.keyboardVector.lengthSq() > 0) {
      return this.keyboardVector.normalize();
    }

    if (this.mobileControlsEnabled && this.joystickVector.lengthSq() > JOYSTICK_DEAD_ZONE * JOYSTICK_DEAD_ZONE) {
      return this.joystickVector.clone().normalize();
    }

    if (this.pointerActive && this.pointerVector.lengthSq() > 0.01) {
      return this.pointerVector.clone().normalize();
    }

    return new THREE.Vector2();
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.unbindCanvasPointerEvents();
    this.unbindJoystickEvents();
  }

  usesMobileControls() {
    return this.mobileControlsEnabled;
  }

  isJoystickActive() {
    return this.joystickActive && this.joystickVector.lengthSq() > JOYSTICK_DEAD_ZONE * JOYSTICK_DEAD_ZONE;
  }

  getInputMode() {
    if (this.keyboardVector.lengthSq() > 0) {
      return 'keyboard';
    }

    if (this.mobileControlsEnabled) {
      return this.isJoystickActive() ? 'mobile-joystick' : 'mobile-idle';
    }

    return this.pointerActive ? 'pointer-drag' : 'idle';
  }

  setMobileControlsVisible(isVisible) {
    if (!this.joystickElement || !this.mobileControlsEnabled) {
      return;
    }

    this.joystickElement.hidden = !isVisible;
    this.joystickElement.setAttribute('aria-hidden', String(!isVisible));
    if (!isVisible) {
      this.resetJoystick();
    }
  }

  bindCanvasPointerEvents() {
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
  }

  unbindCanvasPointerEvents() {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
  }

  bindJoystickEvents() {
    this.joystickElement?.addEventListener('pointerdown', this.handleJoystickPointerDown);
    this.joystickElement?.addEventListener('pointermove', this.handleJoystickPointerMove);
    this.joystickElement?.addEventListener('pointerup', this.handleJoystickPointerUp);
    this.joystickElement?.addEventListener('pointercancel', this.handleJoystickPointerUp);
  }

  unbindJoystickEvents() {
    this.joystickElement?.removeEventListener('pointerdown', this.handleJoystickPointerDown);
    this.joystickElement?.removeEventListener('pointermove', this.handleJoystickPointerMove);
    this.joystickElement?.removeEventListener('pointerup', this.handleJoystickPointerUp);
    this.joystickElement?.removeEventListener('pointercancel', this.handleJoystickPointerUp);
  }

  handleKeyDown = (event) => {
    if (KEY_TO_DIRECTION.has(event.code)) {
      event.preventDefault();
      this.keys.add(event.code);
    }
  };

  handleKeyUp = (event) => {
    if (KEY_TO_DIRECTION.has(event.code)) {
      event.preventDefault();
      this.keys.delete(event.code);
    }
  };

  handlePointerDown = (event) => {
    this.pointerActive = true;
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointerVector(event);
  };

  handlePointerMove = (event) => {
    if (this.pointerActive) {
      this.updatePointerVector(event);
    }
  };

  handlePointerUp = (event) => {
    this.pointerActive = false;
    this.pointerVector.set(0, 0);

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  updatePointerVector(event) {
    const bounds = this.canvas.getBoundingClientRect();
    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.5;
    const longestSide = Math.max(bounds.width, bounds.height);

    this.pointerVector.set(
      ((event.clientX - centerX) / longestSide) * 3,
      ((event.clientY - centerY) / longestSide) * 3,
    );
  }

  handleJoystickPointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    this.joystickActive = true;
    this.joystickElement?.setPointerCapture(event.pointerId);
    this.joystickElement?.classList.add('mobile-joystick--active');
    this.updateJoystickVector(event);
  };

  handleJoystickPointerMove = (event) => {
    if (!this.joystickActive) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.updateJoystickVector(event);
  };

  handleJoystickPointerUp = (event) => {
    event.preventDefault();
    event.stopPropagation();
    this.joystickElement?.classList.remove('mobile-joystick--active');
    this.joystickActive = false;
    this.resetJoystick();

    if (this.joystickElement?.hasPointerCapture(event.pointerId)) {
      this.joystickElement.releasePointerCapture(event.pointerId);
    }
  };

  updateJoystickVector(event) {
    const bounds = this.joystickElement.getBoundingClientRect();
    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.5;
    const maxDistance = Math.max(1, Math.min(bounds.width, bounds.height) * 0.36);
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const rawLength = Math.hypot(rawX, rawY);
    const clampRatio = rawLength > maxDistance ? maxDistance / rawLength : 1;
    // Keep the knob inside its base while preserving the full normalized intent vector.
    const knobX = rawX * clampRatio;
    const knobY = rawY * clampRatio;

    this.joystickVector.set(knobX / maxDistance, knobY / maxDistance);
    if (this.joystickVector.lengthSq() < JOYSTICK_DEAD_ZONE * JOYSTICK_DEAD_ZONE) {
      this.joystickVector.set(0, 0);
    }

    this.setJoystickKnobOffset(knobX, knobY);
  }

  resetJoystick() {
    this.joystickVector.set(0, 0);
    this.setJoystickKnobOffset(0, 0);
    this.joystickElement?.classList.remove('mobile-joystick--active');
  }

  setJoystickKnobOffset(x, y) {
    if (!this.joystickKnobElement) {
      return;
    }

    this.joystickKnobElement.style.transform = `translate(${x}px, ${y}px)`;
  }
}
