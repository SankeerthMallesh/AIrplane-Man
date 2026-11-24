import { PerspectiveCamera, Quaternion, Scene, Vector3, WebGLRenderer } from 'three';
import { AircraftModel } from '../aircraft/AircraftModel';
import { LiveryManager } from '../aircraft/LiveryManager';
import type { Airline } from '../data/airlines';
import type { AirportData, RunwaySelection } from '../data/airports';
import { ATLAS_AJ220 } from '../data/aircraft';
import { FlightModel, type FlightEvent } from '../physics/FlightModel';
import { AirportFrame } from '../world/AirportFrame';
import { Environment, type QualityLevel } from '../world/Environment';
import { FallbackWorld } from '../world/FallbackWorld';
import { RunwayBuilder } from '../world/RunwayBuilder';
import { GoogleTilesManager, type TilesStatusEvent } from '../world/GoogleTilesManager';
import { CameraRig } from '../camera/CameraRig';
import { TILE_ERROR_TARGET } from './ApplicationConfig';

/**
 * Everything that exists only during a flight: scene, world, aircraft, physics and cameras.
 * Created on launch and fully disposed when returning to the menu/hangar.
 */
export class FlightSession {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.5, 400000);
  readonly frame: AirportFrame;
  readonly aircraft = new AircraftModel({ landingLight: true });
  readonly livery: LiveryManager;
  readonly physics: FlightModel;
  readonly rig: CameraRig;
  readonly environment: Environment;
  private readonly runways = new RunwayBuilder();
  private fallback: FallbackWorld | null = null;
  tiles: GoogleTilesManager | null = null;
  private readonly renderPos = new Vector3();
  private readonly renderQuat = new Quaternion();
  private calibrated = false;

  constructor(readonly airline: Airline, readonly airport: AirportData, readonly selection: RunwaySelection, element: HTMLElement, onEvent: (e: FlightEvent) => void) {
    this.frame = new AirportFrame(airport, selection);
    this.environment = new Environment(this.scene);
    this.scene.add(this.runways.build(this.frame.runways));
    this.livery = new LiveryManager(this.aircraft.materials);
    this.livery.apply(airline);
    this.scene.add(this.aircraft.root);
    this.physics = new FlightModel(ATLAS_AJ220, this.frame, onEvent);
    this.rig = new CameraRig(this.camera, element, ATLAS_AJ220.cockpitEye);
    this.restart();
  }

  restart(): void {
    this.physics.reset(this.frame.spawn());
    this.rig.reset();
    this.syncVisual(1, 0);
  }

  useFallbackWorld(): void {
    if (this.fallback) return;
    this.fallback = new FallbackWorld(this.airport, this.frame.runways);
    this.scene.add(this.fallback.group);
    this.environment.setFogEnabled(true);
    console.info('[World] fallback environment activated');
  }

  startTiles(apiKey: string, renderer: WebGLRenderer, quality: QualityLevel, onStatus: (e: TilesStatusEvent) => void): void {
    this.tiles = new GoogleTilesManager(apiKey, this.frame.ltp, onStatus);
    this.tiles.setErrorTarget(TILE_ERROR_TARGET[quality]);
    this.tiles.attachCamera(this.camera, renderer);
    this.scene.add(this.tiles.group);
    this.environment.setFogEnabled(true, 0.000012);
  }

  stopTiles(): void {
    this.tiles?.dispose();
    this.tiles = null;
  }

  /** Aligns tile ground height to the runway plane once nearby tiles are loaded. */
  calibrateTiles(): number | null {
    if (!this.tiles || this.calibrated) return null;
    const c = this.frame.selectedRunway.center;
    const offset = this.tiles.measureGroundOffset(c.x, c.z);
    if (offset === null) return null;
    this.calibrated = true;
    if (Math.abs(offset) < 80) this.tiles.applyVerticalOffset(offset);
    return offset;
  }

  setQuality(q: QualityLevel, shadows: boolean): void {
    this.environment.setQuality(shadows ? q : 'low');
    this.tiles?.setErrorTarget(TILE_ERROR_TARGET[q]);
  }

  /** Interpolates between the last two physics states for smooth rendering. */
  syncVisual(alpha: number, dt: number): void {
    const p = this.physics;
    const s = p.state;
    this.renderPos.lerpVectors(p.previousPosition, s.position, alpha);
    this.renderQuat.slerpQuaternions(p.previousQuaternion, s.quaternion, alpha);
    this.aircraft.root.position.copy(this.renderPos);
    this.aircraft.root.quaternion.copy(this.renderQuat);
    this.aircraft.update({
      elevator: s.elevator, aileron: s.aileron, rudder: s.rudder, flaps: s.flapPosition, gear: s.gearPosition,
      spoilers: s.spoilers, n1: s.throttle, noseSteerDeg: s.noseSteerDeg,
    }, dt);
    this.rig.update(dt, this.renderPos, this.renderQuat, s.velocity);
    this.aircraft.setCockpitMode(this.rig.mode === 'COCKPIT');
    this.aircraft.updateCockpit({
      pitchDeg: s.pitchDeg, bankDeg: s.bankDeg, iasKt: s.indicatedAirspeed * 1.94384, altFt: s.altitudeMslM * 3.28084,
      vsFpm: s.verticalSpeed * 196.85, headingDeg: s.headingDeg, n1: s.throttle, throttle: s.throttleCommand,
      flaps: ATLAS_AJ220.flaps[s.flapIndex]?.name ?? 'UP', gear: s.gearPosition > 0.99 ? 'DOWN' : s.gearPosition < 0.01 ? 'UP' : 'TRANSIT',
      brakes: s.brakes, elevator: s.elevator, aileron: s.aileron,
    }, dt);
    this.environment.follow(this.aircraft.root);
  }

  resize(aspect: number, renderer: WebGLRenderer): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.tiles?.resize(this.camera, renderer);
  }

  dispose(): void {
    this.stopTiles();
    this.fallback?.dispose();
    this.runways.dispose();
    this.aircraft.dispose();
    this.environment.dispose();
    this.rig.dispose();
    this.scene.clear();
  }
}
