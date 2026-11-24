import { CAPTURED_CODES, ControlState, type FlightAction } from './ControlState';
import { clamp } from '../utils/MathUtils';

export interface MouseYokeSettings {
  enabled: boolean;
  sensitivity: number;
  deadZone: number;
}

/**
 * Single owner of DOM input listeners. Flight keys are only captured while `flightActive`, and
 * never while a text/range input has focus. Mouse yoke and gamepad feed ControlState's analog
 * channels.
 */
export class InputManager {
  readonly state = new ControlState();
  flightActive = false;
  readonly yoke: MouseYokeSettings = { enabled: false, sensitivity: 1, deadZone: 0.06 };
  yokeSuspended = false;
  private mouseX = 0;
  private mouseY = 0;
  private mouseInside = false;
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];
  /** Escape/F3 are delivered even outside flight so menus can react. */
  onGlobalAction: (a: FlightAction) => void = () => undefined;

  constructor(surface: HTMLElement) {
    this.listen(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, 'keyup', (e) => this.state.keyUp((e as KeyboardEvent).code));
    this.listen(window, 'blur', () => this.state.releaseAll());
    this.listen(document, 'visibilitychange', () => this.state.releaseAll());
    this.listen(surface, 'mousemove', (e) => {
      const ev = e as MouseEvent;
      const r = surface.getBoundingClientRect();
      this.mouseX = ((ev.clientX - r.left) / r.width) * 2 - 1;
      this.mouseY = ((ev.clientY - r.top) / r.height) * 2 - 1;
      this.mouseInside = true;
    });
    this.listen(surface, 'mouseleave', () => { this.mouseInside = false; });
  }

  private listen(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private static isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'button');
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (InputManager.isTyping(e.target)) return;
    if (e.code === 'Escape' || e.code === 'F3') {
      e.preventDefault();
      if (!e.repeat) this.onGlobalAction(e.code === 'Escape' ? 'pause' : 'toggleDebug');
      return;
    }
    if (!this.flightActive) return;
    if (CAPTURED_CODES.has(e.code)) e.preventDefault();
    this.state.keyDown(e.code, e.repeat);
  }

  /** Samples analog devices and advances keyboard smoothing. Call once per rendered frame. */
  update(dt: number): void {
    const s = this.state;
    if (this.yoke.enabled && !this.yokeSuspended && this.mouseInside && this.flightActive) {
      const dz = this.yoke.deadZone;
      const shape = (v: number): number => (Math.abs(v) < dz ? 0 : Math.sign(v) * ((Math.abs(v) - dz) / (1 - dz)));
      s.analogRoll = clamp(shape(this.mouseX) * this.yoke.sensitivity, -1, 1);
      s.analogPitch = clamp(shape(this.mouseY) * this.yoke.sensitivity, -1, 1);
    } else {
      s.analogRoll = 0;
      s.analogPitch = 0;
    }
    s.analogYaw = 0;
    this.pollGamepad();
    s.update(dt);
  }

  /** Optional native Gamepad API support: left stick pitch/roll, triggers yaw. */
  private pollGamepad(): void {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !this.flightActive) continue;
      const ax = (i: number): number => {
        const v = pad.axes[i] ?? 0;
        return Math.abs(v) < 0.12 ? 0 : v;
      };
      this.state.analogRoll = clamp(this.state.analogRoll + ax(0), -1, 1);
      this.state.analogPitch = clamp(this.state.analogPitch + ax(1), -1, 1);
      const lt = pad.buttons[6]?.value ?? 0;
      const rt = pad.buttons[7]?.value ?? 0;
      this.state.analogYaw = clamp(rt - lt, -1, 1);
      break;
    }
  }

  dispose(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
    this.listeners.length = 0;
  }
}
