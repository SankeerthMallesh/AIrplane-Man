import { clamp, moveTowards } from '../utils/MathUtils';

export type FlightAction = 'toggleGear' | 'cycleFlaps' | 'cycleCamera' | 'toggleBrakes' | 'pause' | 'toggleDebug' | 'restart';

/** Key-code bindings (KeyboardEvent.code). Throttle has alternates because Ctrl+W closes tabs on Windows/Linux. */
export const KEY_BINDINGS = {
  pitchUp: ['KeyW'],
  pitchDown: ['KeyS'],
  rollLeft: ['KeyA'],
  rollRight: ['KeyD'],
  yawLeft: ['KeyQ'],
  yawRight: ['KeyE'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'Equal'],
  throttleDown: ['ControlLeft', 'ControlRight', 'Minus'],
  actions: {
    KeyG: 'toggleGear',
    KeyF: 'cycleFlaps',
    KeyC: 'cycleCamera',
    Space: 'toggleBrakes',
    Escape: 'pause',
    F3: 'toggleDebug',
    KeyR: 'restart',
  } as Readonly<Record<string, FlightAction>>,
} as const;

export const CAPTURED_CODES = new Set<string>([
  ...KEY_BINDINGS.pitchUp, ...KEY_BINDINGS.pitchDown, ...KEY_BINDINGS.rollLeft, ...KEY_BINDINGS.rollRight,
  ...KEY_BINDINGS.yawLeft, ...KEY_BINDINGS.yawRight, ...KEY_BINDINGS.throttleUp, ...KEY_BINDINGS.throttleDown,
  ...Object.keys(KEY_BINDINGS.actions), 'ArrowUp', 'ArrowDown',
]);

/**
 * DOM-free input core (unit-testable). Holds pressed keys, produces smoothed axes, bounded
 * throttle and edge-triggered actions that ignore keyboard auto-repeat.
 */
export class ControlState {
  private readonly held = new Set<string>();
  private readonly queue: FlightAction[] = [];
  pitch = 0;
  roll = 0;
  yaw = 0;
  throttle = 0;
  /** External analog contributions (mouse yoke / gamepad), already in [-1, 1]. */
  analogPitch = 0;
  analogRoll = 0;
  analogYaw = 0;
  readonly rampRate = 2.6;
  readonly returnRate = 3.5;
  readonly throttleRate = 0.35;

  keyDown(code: string, repeat: boolean): void {
    const action = KEY_BINDINGS.actions[code];
    if (action) {
      if (!repeat && !this.held.has(code)) this.queue.push(action);
    }
    this.held.add(code);
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  /** Releases everything, e.g. on window blur, so no control stays stuck. */
  releaseAll(): void {
    this.held.clear();
    this.analogPitch = this.analogRoll = this.analogYaw = 0;
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  private axis(neg: readonly string[], pos: readonly string[]): number {
    const p = pos.some((c) => this.held.has(c)) ? 1 : 0;
    const n = neg.some((c) => this.held.has(c)) ? 1 : 0;
    return p - n;
  }

  private ramp(current: number, target: number, dt: number): number {
    const rate = target === 0 || Math.sign(target) !== Math.sign(current) ? this.returnRate : this.rampRate;
    return moveTowards(current, target, rate * dt);
  }

  update(dt: number): void {
    const b = KEY_BINDINGS;
    this.pitch = this.ramp(this.pitch, this.axis(b.pitchDown, b.pitchUp), dt);
    this.roll = this.ramp(this.roll, this.axis(b.rollLeft, b.rollRight), dt);
    this.yaw = this.ramp(this.yaw, this.axis(b.yawLeft, b.yawRight), dt);
    const t = this.axis(b.throttleDown, b.throttleUp);
    this.throttle = clamp(this.throttle + t * this.throttleRate * dt, 0, 1);
  }

  get pitchOutput(): number {
    return clamp(this.pitch + this.analogPitch, -1, 1);
  }

  get rollOutput(): number {
    return clamp(this.roll + this.analogRoll, -1, 1);
  }

  get yawOutput(): number {
    return clamp(this.yaw + this.analogYaw, -1, 1);
  }

  consumeActions(): FlightAction[] {
    return this.queue.splice(0, this.queue.length);
  }
}
