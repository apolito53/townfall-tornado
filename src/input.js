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

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerActive = false;
    this.pointerVector = new THREE.Vector2();
    this.keyboardVector = new THREE.Vector2();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
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

    if (this.pointerActive && this.pointerVector.lengthSq() > 0.01) {
      return this.pointerVector.clone().normalize();
    }

    return new THREE.Vector2();
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
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
}
