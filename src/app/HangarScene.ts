import { CircleGeometry, Color, DirectionalLight, Fog, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, SpotLight } from 'three';
import { AircraftModel } from '../aircraft/AircraftModel';
import { LiveryManager } from '../aircraft/LiveryManager';
import type { Airline } from '../data/airlines';

/** Studio/hangar presentation scene used by the main menu and hangar; reuses the flight aircraft factory. */
export class HangarScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(35, 1, 0.5, 2000);
  readonly aircraft = new AircraftModel();
  readonly livery: LiveryManager;
  private t = 0;
  mode: 'menu' | 'hangar' = 'menu';

  constructor() {
    this.scene.background = new Color('#0b1220');
    this.scene.fog = new Fog('#0b1220', 120, 320);
    const floor = new Mesh(new CircleGeometry(220, 64), new MeshStandardMaterial({ color: '#1a2233', roughness: 0.35, metalness: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.3;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.scene.add(new HemisphereLight('#9ec8ff', '#1a1410', 1.2));
    const key = new DirectionalLight('#ffffff', 3);
    key.position.set(30, 50, 25);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const c = key.shadow.camera;
    c.left = c.bottom = -30; c.right = c.top = 30; c.near = 1; c.far = 150;
    this.scene.add(key);
    const rim = new SpotLight('#7fc8ff', 900, 200, 0.6, 0.6);
    rim.position.set(-40, 25, -30);
    this.scene.add(rim);
    this.livery = new LiveryManager(this.aircraft.materials, 8);
    this.scene.add(this.aircraft.root);
    this.aircraft.update({ elevator: 0, aileron: 0, rudder: 0, flaps: 0, gear: 1, spoilers: 0, n1: 0, noseSteerDeg: 0 }, 0);
  }

  setAirline(a: Airline): void {
    this.livery.apply(a);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.t += dt;
    const orbit = this.mode === 'menu' ? 0.6 + this.t * 0.05 : 2.3 + Math.sin(this.t * 0.15) * 0.6;
    const dist = this.mode === 'menu' ? 62 : 70;
    this.camera.position.set(Math.sin(orbit) * dist, 8 + Math.sin(this.t * 0.2) * 2, Math.cos(orbit) * dist);
    this.camera.lookAt(this.mode === 'menu' ? -10 : -8, 0, 0);
    this.aircraft.update({ elevator: Math.sin(this.t) * 0.2, aileron: Math.sin(this.t * 0.7) * 0.3, rudder: 0, flaps: 0, gear: 1, spoilers: 0, n1: 0.05, noseSteerDeg: 0 }, dt);
  }
}
