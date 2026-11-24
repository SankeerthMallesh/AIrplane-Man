import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import type { Vec3Tuple } from '../data/aircraft';
import { clamp, damp } from '../utils/MathUtils';

export type CameraMode = 'CHASE' | 'COCKPIT' | 'ORBIT';
export const CAMERA_MODES: readonly CameraMode[] = ['CHASE', 'COCKPIT', 'ORBIT'];

export interface CameraSettings {
  chaseDistance: number;
  chaseHeight: number;
  orbitSensitivity: number;
}

const UP = new Vector3(0, 1, 0);

/**
 * Chase / cockpit / orbit cameras driving one PerspectiveCamera. Switching blends from the
 * previous pose over `blendTime` seconds. All smoothing is exponential in real time.
 */
export class CameraRig {
  mode: CameraMode = 'CHASE';
  readonly settings: CameraSettings = { chaseDistance: 42, chaseHeight: 9, orbitSensitivity: 1 };
  private readonly chasePos = new Vector3();
  private chaseInit = false;
  private orbitYaw = 0.6;
  private orbitPitch = 0.25;
  private orbitDistance = 60;
  private readonly orbitPan = new Vector3();
  private blend = 1;
  private readonly blendFromPos = new Vector3();
  private readonly blendFromQuat = new Quaternion();
  private dragging: 0 | 1 | 2 = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly tmpPos = new Vector3();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpV = new Vector3();
  private readonly tmpV2 = new Vector3();
  private readonly fwdV = new Vector3();
  private readonly flatV = new Vector3();
  private readonly desiredV = new Vector3();
  private readonly velV = new Vector3();
  private readonly lookDown = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.22);
  private readonly listeners: Array<[string, EventListener]> = [];
  onModeChanged: (m: CameraMode) => void = () => undefined;

  constructor(readonly camera: PerspectiveCamera, private readonly element: HTMLElement, private readonly cockpitEye: Vec3Tuple) {
    const on = (type: string, fn: EventListener): void => {
      element.addEventListener(type, fn, { passive: false });
      this.listeners.push([type, fn]);
    };
    on('pointerdown', (e) => {
      const ev = e as PointerEvent;
      if (this.mode !== 'ORBIT') return;
      this.dragging = ev.button === 2 || ev.shiftKey ? 2 : 1;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
    });
    on('pointermove', (e) => {
      const ev = e as PointerEvent;
      if (!this.dragging) return;
      const dx = ev.clientX - this.lastX;
      const dy = ev.clientY - this.lastY;
      this.lastX = ev.clientX;
      this.lastY = ev.clientY;
      const k = 0.005 * this.settings.orbitSensitivity;
      if (this.dragging === 1) {
        this.orbitYaw -= dx * k;
        this.orbitPitch = clamp(this.orbitPitch + dy * k, -0.2, 1.45);
      } else {
        const right = this.tmpV.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this.orbitPan.addScaledVector(right, -dx * 0.05).addScaledVector(UP, dy * 0.05);
      }
    });
    on('pointerup', () => { this.dragging = 0; });
    on('pointerleave', () => { this.dragging = 0; });
    on('contextmenu', (e) => { if (this.mode === 'ORBIT') e.preventDefault(); });
    on('wheel', (e) => {
      if (this.mode !== 'ORBIT') return;
      e.preventDefault();
      this.orbitDistance = clamp(this.orbitDistance * Math.exp((e as WheelEvent).deltaY * 0.001), 22, 600);
    });
  }

  setMode(mode: CameraMode, instant = false): void {
    if (mode === this.mode && !instant) return;
    this.blendFromPos.copy(this.camera.position);
    this.blendFromQuat.copy(this.camera.quaternion);
    this.blend = instant ? 1 : 0;
    this.mode = mode;
    if (mode === 'ORBIT') this.orbitPan.set(0, 0, 0);
    this.onModeChanged(mode);
  }

  cycle(): CameraMode {
    const i = CAMERA_MODES.indexOf(this.mode);
    const next = CAMERA_MODES[(i + 1) % CAMERA_MODES.length] ?? 'CHASE';
    this.setMode(next);
    return next;
  }

  reset(): void {
    this.chaseInit = false;
    this.blend = 1;
  }

  /** Orbit mode consumes mouse drags, so the mouse yoke is suspended there. */
  get capturesMouse(): boolean {
    return this.mode === 'ORBIT';
  }

  update(dt: number, pos: Vector3, quat: Quaternion, velocity: Vector3): void {
    const target = this.tmpPos;
    const targetQ = this.tmpQuat;
    if (this.mode === 'COCKPIT') {
      target.set(...this.cockpitEye).applyQuaternion(quat).add(pos);
      // Look slightly down so the instrument panel frames the bottom of the view.
      targetQ.copy(quat).multiply(this.lookDown);
      this.camera.near = 0.05;
    } else if (this.mode === 'CHASE') {
      // Follow behind along a heading-only frame blended with the true attitude, so rolls do
      // not swing the camera violently.
      const fwd = this.fwdV.set(0, 0, -1).applyQuaternion(quat);
      const flatFwd = this.flatV.set(fwd.x, 0, fwd.z);
      if (flatFwd.lengthSq() < 1e-4) flatFwd.set(0, 0, -1);
      flatFwd.normalize();
      const speed = velocity.length();
      if (speed > 25) flatFwd.lerp(this.velV.copy(velocity).setY(0).normalize(), 0.3).normalize();
      const desired = this.desiredV.copy(pos)
        .addScaledVector(flatFwd, -this.settings.chaseDistance)
        .addScaledVector(UP, this.settings.chaseHeight + fwd.y * -this.settings.chaseDistance * 0.5);
      if (!this.chaseInit) {
        this.chasePos.copy(desired);
        this.chaseInit = true;
      }
      this.chasePos.x = damp(this.chasePos.x, desired.x, 5, dt);
      this.chasePos.y = damp(this.chasePos.y, desired.y, 4, dt);
      this.chasePos.z = damp(this.chasePos.z, desired.z, 5, dt);
      // Keep a minimum distance even when the aircraft outruns the smoothing.
      const off = this.tmpV2.subVectors(this.chasePos, pos);
      const d = off.length();
      if (d < this.settings.chaseDistance * 0.7) this.chasePos.copy(pos).addScaledVector(off.normalize(), this.settings.chaseDistance * 0.7);
      target.copy(this.chasePos);
      this.camera.position.copy(target);
      this.camera.up.copy(UP);
      this.camera.lookAt(this.tmpV.copy(pos).addScaledVector(fwd, 12).addScaledVector(UP, 2));
      targetQ.copy(this.camera.quaternion);
      this.camera.near = 0.5;
    } else {
      const c = Math.cos(this.orbitPitch);
      const center = this.tmpV2.copy(pos).add(this.orbitPan);
      target.set(Math.sin(this.orbitYaw) * c, Math.sin(this.orbitPitch), Math.cos(this.orbitYaw) * c).multiplyScalar(this.orbitDistance).add(center);
      this.camera.position.copy(target);
      this.camera.up.copy(UP);
      this.camera.lookAt(center);
      targetQ.copy(this.camera.quaternion);
      this.camera.near = 0.5;
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.6);
      const t = this.blend * this.blend * (3 - 2 * this.blend);
      this.camera.position.lerpVectors(this.blendFromPos, target, t);
      this.camera.quaternion.slerpQuaternions(this.blendFromQuat, targetQ, t);
    } else {
      this.camera.position.copy(target);
      this.camera.quaternion.copy(targetQ);
    }
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.element.removeEventListener(type, fn);
    this.listeners.length = 0;
  }
}
