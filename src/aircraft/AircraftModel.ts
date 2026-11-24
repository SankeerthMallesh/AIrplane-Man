import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, LatheGeometry,
  Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry, SpotLight, Texture, TorusGeometry, Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CockpitInterior, type CockpitData } from './CockpitInterior';
import { buildFuselageGeometry, buildLiftingSurface, surfaceStation, type FuselageProfile, type SurfaceParams } from './Geometry';
import { degToRad } from '../utils/MathUtils';

/** Dimensions of the procedural AJ-220 airframe (metres, body axes, origin at CG). */
export const FUSELAGE: FuselageProfile = {
  zNose: -19,
  zTail: 18.6,
  radius(z: number): number {
    const R = 2;
    if (z < -13) {
      const t = (z + 19) / 6;
      return R * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2));
    }
    if (z > 8) {
      const t = Math.min(1, (z - 8) / 10.6);
      const close = t > 0.93 ? Math.sqrt(Math.max(0, (1 - t) / 0.07)) : 1;
      return R * (1 - 0.8 * t ** 1.4) * close;
    }
    return R;
  },
  centerY(z: number): number {
    if (z < -13) return -0.32 * (1 - (z + 19) / 6) ** 2;
    if (z > 8) return 1.0 * Math.min(1, (z - 8) / 10.6) ** 2;
    return 0;
  },
  verticalScale(z: number): number {
    return z > 8 ? 1 - 0.25 * Math.min(1, (z - 8) / 10.6) : 1;
  },
};

export const WING: SurfaceParams = { span: 15.4, rootChord: 6.4, tipChord: 1.6, sweepDeg: 27, thickness: 0.14, tipThickness: 0.1 };
export const H_STAB: SurfaceParams = { span: 6.0, rootChord: 3.7, tipChord: 1.3, sweepDeg: 32, thickness: 0.1, camber: 0 };
export const V_FIN: SurfaceParams = { span: 6.3, rootChord: 5.8, tipChord: 1.9, sweepDeg: 38, thickness: 0.11, camber: 0 };
export const FIN_MAIN_FRACTION = 0.7;

export interface AircraftMaterials {
  readonly fuselage: MeshStandardMaterial;
  readonly fin: MeshStandardMaterial;
  readonly rudder: MeshStandardMaterial;
  readonly wing: MeshStandardMaterial;
  readonly accent: MeshStandardMaterial;
  readonly nacelle: MeshStandardMaterial;
  readonly lip: MeshStandardMaterial;
  readonly engineDark: MeshStandardMaterial;
  readonly metal: MeshStandardMaterial;
  readonly gear: MeshStandardMaterial;
  readonly tire: MeshStandardMaterial;
  readonly cockpit: MeshStandardMaterial;
  readonly navRed: MeshBasicMaterial;
  readonly navGreen: MeshBasicMaterial;
  readonly strobe: MeshBasicMaterial;
  readonly beacon: MeshBasicMaterial;
}

/** Visual-only inputs derived from the physics state each frame. */
export interface AircraftVisualState {
  elevator: number;
  aileron: number;
  rudder: number;
  flaps: number;
  gear: number;
  spoilers: number;
  n1: number;
  noseSteerDeg: number;
}

function createMaterials(): AircraftMaterials {
  const std = (color: string, metalness = 0.2, roughness = 0.5): MeshStandardMaterial =>
    new MeshStandardMaterial({ color, metalness, roughness });
  return {
    fuselage: std('#ffffff', 0.25, 0.38),
    fin: std('#ffffff', 0.25, 0.4),
    rudder: std('#223355', 0.25, 0.4),
    wing: std('#c4cad3', 0.55, 0.42),
    accent: std('#8fd8ff', 0.3, 0.4),
    nacelle: new MeshStandardMaterial({ color: '#223355', metalness: 0.35, roughness: 0.35, side: DoubleSide }),
    lip: new MeshStandardMaterial({ color: '#d0d6de', metalness: 0.9, roughness: 0.22 }),
    engineDark: std('#16181c', 0.4, 0.7),
    metal: new MeshStandardMaterial({ color: '#9aa3ad', metalness: 0.95, roughness: 0.28 }),
    gear: std('#8d939b', 0.6, 0.45),
    tire: std('#151515', 0, 0.9),
    cockpit: std('#1b1f26', 0.1, 0.8),
    navRed: new MeshBasicMaterial({ color: '#ff2a2a' }),
    navGreen: new MeshBasicMaterial({ color: '#2aff5a' }),
    strobe: new MeshBasicMaterial({ color: '#ffffff' }),
    beacon: new MeshBasicMaterial({ color: '#ff3030' }),
  };
}

interface ControlSurface {
  readonly deflect: Group;
  readonly maxDeg: number;
}

/**
 * Builds the complete procedural airliner. The hierarchy follows
 * AircraftRoot → Fuselage / MainWings / TailAssembly / Engines / LandingGear / Lights.
 * Geometry is built once per instance; livery changes only touch materials (see LiveryManager).
 */
export class AircraftModel {
  readonly root = new Group();
  readonly materials = createMaterials();
  readonly cockpitFrame = new Group();
  readonly cockpit = new CockpitInterior();
  private readonly geometries: BufferGeometry[] = [];
  private readonly surfaces: Record<'leftAileron' | 'rightAileron' | 'leftFlap' | 'rightFlap' | 'leftElevator' | 'rightElevator' | 'rudder', ControlSurface>;
  private readonly spoilers: Group[] = [];
  private readonly fans: Group[] = [];
  private readonly noseGear = new Group();
  private readonly noseSteer = new Group();
  private readonly mainGears: Group[] = [];
  private readonly gearDoors: Group[] = [];
  private readonly strobes: Mesh[] = [];
  private readonly beacons: Mesh[] = [];
  private readonly landingLight: SpotLight | null;
  private fanAngle = 0;
  private time = 0;

  constructor(options: { landingLight?: boolean } = {}) {
    this.root.name = 'AircraftRoot';
    const m = this.materials;

    const fuselage = this.mesh(buildFuselageGeometry(FUSELAGE), m.fuselage, 'Fuselage');
    this.root.add(fuselage);
    this.buildCockpitFrame();

    // Main wings, each with aileron, flaps and spoilers.
    const wings = new Group();
    wings.name = 'MainWings';
    this.root.add(wings);
    const wingSide = (side: 1 | -1): { group: Group; aileron: ControlSurface; flap: ControlSurface } => {
      const g = new Group();
      g.name = side === 1 ? 'RightWing' : 'LeftWing';
      g.position.set(side * 1.5, -1.05, -3.6);
      g.rotation.z = side * degToRad(5);
      g.add(this.mesh(buildLiftingSurface({ ...WING, rootChord: WING.rootChord * 0.76, tipChord: WING.tipChord * 0.76, side }), m.wing, 'WingBox'));
      const aileron = this.controlSurface(g, WING, side, 0.72, 0.95, 0.76, m.wing, 20, side === 1 ? 'RightAileron' : 'LeftAileron');
      const flap = this.controlSurface(g, WING, side, 0.06, 0.66, 0.76, m.wing, 38, side === 1 ? 'RightFlaps' : 'LeftFlaps');
      // Spoiler panels sitting on the upper surface ahead of the flaps.
      for (let i = 0; i < 3; i++) {
        const f = 0.25 + i * 0.13;
        const st = surfaceStation(WING, f);
        const sp = new Group();
        sp.position.set(side * f * WING.span, 0.33 - f * 0.12, st.le + st.chord * 0.6);
        sp.rotation.y = -side * degToRad(12);
        const panel = this.mesh(new BoxGeometry(1.9, 0.04, st.chord * 0.15), m.wing, 'Spoiler');
        panel.position.z = st.chord * 0.075;
        sp.add(panel);
        sp.name = side === 1 ? 'RightSpoilers' : 'LeftSpoilers';
        g.add(sp);
        this.spoilers.push(sp);
      }
      // Sharklet winglet.
      const tip = surfaceStation(WING, 1);
      const winglet = this.mesh(buildLiftingSurface({ span: 2.2, rootChord: tip.chord * 0.9, tipChord: 0.45, sweepDeg: 40, thickness: 0.09, camber: 0 }), m.accent, 'Winglet');
      winglet.position.set(side * WING.span, 0, tip.le + 0.05);
      winglet.rotation.z = degToRad(side === 1 ? 78 : 102);
      g.add(winglet);
      // Navigation light + strobe at the tip.
      const nav = this.mesh(new SphereGeometry(0.12, 8, 6), side === 1 ? m.navGreen : m.navRed, 'NavLight');
      nav.position.set(side * (WING.span + 0.05), 0.05, tip.le + 0.25);
      g.add(nav);
      const strobe = this.mesh(new SphereGeometry(0.1, 8, 6), m.strobe, 'Strobe');
      strobe.position.set(side * (WING.span + 0.05), 0.05, tip.le + tip.chord);
      g.add(strobe);
      this.strobes.push(strobe);
      wings.add(g);
      return { group: g, aileron, flap };
    };
    const right = wingSide(1);
    const left = wingSide(-1);

    // Tail assembly.
    const tail = new Group();
    tail.name = 'TailAssembly';
    this.root.add(tail);
    const fin = new Group();
    fin.name = 'VerticalStabilizer';
    fin.position.set(0, 1.2, 11.6);
    fin.rotation.z = Math.PI / 2;
    fin.add(this.mesh(buildLiftingSurface({ ...V_FIN, rootChord: V_FIN.rootChord * FIN_MAIN_FRACTION, tipChord: V_FIN.tipChord * FIN_MAIN_FRACTION }), m.fin, 'FinBox'));
    const rudder = this.controlSurface(fin, V_FIN, 1, 0.04, 0.94, FIN_MAIN_FRACTION, m.rudder, 25, 'Rudder');
    tail.add(fin);
    const stab = (side: 1 | -1): ControlSurface => {
      const g = new Group();
      g.name = side === 1 ? 'RightHorizontalStabilizer' : 'LeftHorizontalStabilizer';
      g.position.set(side * 0.4, 0.35, 13.4);
      g.rotation.z = side * degToRad(6);
      g.add(this.mesh(buildLiftingSurface({ ...H_STAB, rootChord: H_STAB.rootChord * 0.7, tipChord: H_STAB.tipChord * 0.7, side }), m.wing, 'StabBox'));
      tail.add(g);
      return this.controlSurface(g, H_STAB, side, 0.05, 0.95, 0.7, m.wing, 25, side === 1 ? 'RightElevator' : 'LeftElevator');
    };
    const rightElevator = stab(1);
    const leftElevator = stab(-1);
    const tailStrobe = this.mesh(new SphereGeometry(0.1, 8, 6), m.strobe, 'TailStrobe');
    tailStrobe.position.set(0, FUSELAGE.centerY(18.5), 18.6);
    this.root.add(tailStrobe);
    this.strobes.push(tailStrobe);

    this.surfaces = {
      leftAileron: left.aileron, rightAileron: right.aileron, leftFlap: left.flap, rightFlap: right.flap,
      leftElevator, rightElevator, rudder,
    };

    this.buildEngines();
    this.buildLandingGear();

    for (const [y, z] of [[2.02, -1.5], [-2.02, 2.5]] as const) {
      const b = this.mesh(new SphereGeometry(0.13, 8, 6), m.beacon, 'Beacon');
      b.position.set(0, y, z);
      this.root.add(b);
      this.beacons.push(b);
    }
    if (options.landingLight) {
      const spot = new SpotLight('#fff6e0', 0, 900, degToRad(14), 0.5, 1.2);
      spot.position.set(0, -1.6, -12);
      spot.target.position.set(0, -6, -80);
      spot.name = 'LandingLight';
      this.root.add(spot, spot.target);
      this.landingLight = spot;
    } else {
      this.landingLight = null;
    }

    this.root.traverse((o: Object3D) => {
      if (o instanceof Mesh && !(o.material instanceof MeshBasicMaterial)) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }

  private mesh(geometry: BufferGeometry, material: Material, name: string): Mesh {
    this.geometries.push(geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  /**
   * Control surface hinged along the line at `chordFraction` of the parent surface's chord
   * between span fractions f0..f1. Positive deflection = trailing edge down (local +X hinge).
   */
  private controlSurface(parent: Group, p: SurfaceParams, side: 1 | -1, f0: number, f1: number, chordFraction: number, mat: Material, maxDeg: number, name: string): ControlSurface {
    const s0 = surfaceStation(p, f0);
    const s1 = surfaceStation(p, f1);
    const x0 = f0 * p.span;
    const x1 = f1 * p.span;
    const z0 = s0.le + s0.chord * chordFraction;
    const z1 = s1.le + s1.chord * chordFraction;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const pivot = new Group();
    pivot.name = name;
    pivot.position.set(side * x0, 0, z0);
    pivot.rotation.y = -side * Math.atan2(z1 - z0, x1 - x0);
    const deflect = new Group();
    pivot.add(deflect);
    const rest = 1 - chordFraction;
    const geom = buildLiftingSurface({
      span: len, rootChord: s0.chord * rest, tipChord: s1.chord * rest, sweepDeg: 0,
      thickness: p.thickness * 0.9, tipThickness: (p.tipThickness ?? p.thickness) * 0.9, camber: 0, side, stations: 2,
    });
    const meshObj = this.mesh(geom, mat, `${name}Surface`);
    meshObj.position.z = -0.02;
    deflect.add(meshObj);
    parent.add(pivot);
    return { deflect, maxDeg };
  }

  private buildCockpitFrame(): void {
    this.cockpitFrame.name = 'CockpitFrame';
    this.cockpitFrame.add(this.cockpit.group);
    this.cockpitFrame.visible = false;
    this.root.add(this.cockpitFrame);
  }

  private buildEngines(): void {
    const m = this.materials;
    const engines = new Group();
    engines.name = 'Engines';
    this.root.add(engines);
    // Lathe profile (r, y) with +y = forward after rotateX(-90°).
    const pts = [[0.78, -2.15], [0.96, -1.0], [1.05, 0.4], [1.03, 1.6], [0.97, 2.2], [0.9, 2.34], [0.83, 2.26], [0.84, 1.9], [0.85, 1.4]]
      .map(([r, y]) => new Vector2(r, y));
    const nacelleGeo = new LatheGeometry(pts, 40);
    nacelleGeo.rotateX(-Math.PI / 2);
    const coreGeo = new LatheGeometry([new Vector2(0.01, -3.1), new Vector2(0.35, -2.6), new Vector2(0.62, -2.0), new Vector2(0.66, -1.4)], 24);
    coreGeo.rotateX(-Math.PI / 2);
    const blades: BufferGeometry[] = [];
    for (let i = 0; i < 22; i++) {
      const b = new BoxGeometry(0.16, 0.66, 0.03);
      b.translate(0, 0.5, 0);
      b.rotateY(degToRad(32));
      b.rotateZ((i / 22) * Math.PI * 2);
      blades.push(b);
    }
    const bladeGeo = mergeGeometries(blades);
    for (const b of blades) b.dispose();
    const spinnerGeo = new ConeGeometry(0.24, 0.55, 20);
    spinnerGeo.rotateX(-Math.PI / 2);
    const lipGeo = new TorusGeometry(0.9, 0.07, 10, 40);
    const pylonGeo = new BoxGeometry(0.32, 0.95, 3.8);
    for (const side of [-1, 1] as const) {
      const e = new Group();
      e.name = side === 1 ? 'RightEngine' : 'LeftEngine';
      e.position.set(side * 5.7, -2.05, -4.5);
      e.add(this.mesh(nacelleGeo, m.nacelle, 'Nacelle'));
      const lip = this.mesh(lipGeo, m.lip, 'IntakeLip');
      lip.position.z = -2.3;
      e.add(lip);
      const intake = this.mesh(new CylinderGeometry(0.84, 0.84, 0.05, 32), m.engineDark, 'IntakeBackplate');
      intake.rotation.x = Math.PI / 2;
      intake.position.z = -1.2;
      e.add(intake);
      e.add(this.mesh(coreGeo, m.engineDark, 'ExhaustCone'));
      const fan = new Group();
      fan.name = 'FanAssembly';
      fan.position.z = -1.45;
      fan.add(this.mesh(bladeGeo, m.metal, 'FanBlades'));
      const spinner = this.mesh(spinnerGeo, m.metal, 'Spinner');
      spinner.position.z = -0.25;
      fan.add(spinner);
      e.add(fan);
      this.fans.push(fan);
      const pylon = this.mesh(pylonGeo, m.wing, 'Pylon');
      pylon.position.set(0, 1.05, 0.6);
      e.add(pylon);
      engines.add(e);
    }
    // Shared geometries registered once.
    this.geometries.push(nacelleGeo, coreGeo, bladeGeo, spinnerGeo, lipGeo, pylonGeo);
  }

  private buildLandingGear(): void {
    const m = this.materials;
    const gear = new Group();
    gear.name = 'LandingGear';
    this.root.add(gear);
    const noseWheel = new CylinderGeometry(0.38, 0.38, 0.28, 20);
    noseWheel.rotateZ(Math.PI / 2);
    const mainWheel = new CylinderGeometry(0.62, 0.62, 0.42, 24);
    mainWheel.rotateZ(Math.PI / 2);
    this.geometries.push(noseWheel, mainWheel);

    this.noseGear.name = 'NoseGear';
    this.noseGear.position.set(0, -1.55, -12.5);
    this.noseGear.add(this.noseSteer);
    const ns = this.mesh(new CylinderGeometry(0.1, 0.1, 1.4, 10), m.gear, 'NoseStrut');
    ns.position.y = -0.7;
    this.noseSteer.add(ns);
    for (const x of [-0.25, 0.25]) {
      const w = this.mesh(noseWheel, m.tire, 'NoseWheel');
      w.position.set(x, -1.37, 0);
      this.noseSteer.add(w);
    }
    gear.add(this.noseGear);

    for (const side of [-1, 1] as const) {
      const g = new Group();
      g.name = side === 1 ? 'RightMainGear' : 'LeftMainGear';
      g.position.set(side * 3.8, -1.25, 1.6);
      const strut = this.mesh(new CylinderGeometry(0.16, 0.16, 1.5, 12), m.gear, 'MainStrut');
      strut.position.y = -0.7;
      g.add(strut);
      for (const x of [-0.42, 0.42]) {
        const w = this.mesh(mainWheel, m.tire, 'MainWheel');
        w.position.set(x, -1.43, 0);
        g.add(w);
      }
      gear.add(g);
      this.mainGears.push(g);
      const door = new Group();
      door.position.set(side * 1.1, -1.85, 1.6);
      const panel = this.mesh(new BoxGeometry(1.4, 0.05, 1.6), m.fuselage, 'GearDoor');
      panel.position.x = side * 0.7;
      door.add(panel);
      gear.add(door);
      this.gearDoors.push(door);
    }
  }

  setCockpitMode(enabled: boolean): void {
    this.cockpitFrame.visible = enabled;
    this.cockpit.group.visible = enabled;
  }

  updateCockpit(data: CockpitData, dt: number): void {
    this.cockpit.update(data, dt);
  }

  /** Synchronises every animated part with the simulated state. */
  update(v: AircraftVisualState, dt: number): void {
    this.time += dt;
    const s = this.surfaces;
    const set = (c: ControlSurface, amount: number): void => {
      c.deflect.rotation.x = degToRad(c.maxDeg) * amount;
    };
    set(s.rightAileron, -v.aileron);
    set(s.leftAileron, v.aileron);
    set(s.rightElevator, -v.elevator);
    set(s.leftElevator, -v.elevator);
    set(s.rudder, v.rudder);
    set(s.rightFlap, v.flaps);
    set(s.leftFlap, v.flaps);
    s.rightFlap.deflect.position.z = v.flaps * 0.45;
    s.leftFlap.deflect.position.z = v.flaps * 0.45;
    for (const sp of this.spoilers) sp.rotation.x = -degToRad(45) * v.spoilers;

    // Gear: 1 = down. Nose folds forward, mains fold inboard.
    const retract = 1 - v.gear;
    this.noseGear.rotation.x = (Math.PI / 2) * retract;
    this.noseSteer.rotation.y = -degToRad(v.noseSteerDeg) * v.gear;
    this.mainGears.forEach((g, i) => {
      const side = i === 0 ? -1 : 1;
      g.rotation.z = side * -(Math.PI / 2) * retract;
    });
    const doorAngle = degToRad(85) * Math.min(1, v.gear * 3);
    this.gearDoors.forEach((d, i) => {
      d.rotation.z = (i === 0 ? 1 : -1) * doorAngle;
    });
    const gearVisible = v.gear > 0.02;
    this.noseGear.visible = gearVisible;
    for (const g of this.mainGears) g.visible = gearVisible;

    this.fanAngle += (3 + v.n1 * 38) * dt;
    for (const f of this.fans) f.rotation.z = this.fanAngle;

    const strobeOn = this.time % 1.2 < 0.06;
    for (const st of this.strobes) st.visible = strobeOn;
    const beaconOn = this.time % 1.0 < 0.12;
    for (const b of this.beacons) b.visible = beaconOn;
    if (this.landingLight) this.landingLight.intensity = v.gear > 0.9 ? 40 : 0;
  }

  dispose(): void {
    this.cockpit.dispose();
    for (const g of this.geometries) g.dispose();
    const textures = new Set<Texture>();
    for (const mat of Object.values(this.materials) as Material[]) {
      if (mat instanceof MeshStandardMaterial && mat.map) textures.add(mat.map);
      mat.dispose();
    }
    for (const t of textures) t.dispose();
    this.root.removeFromParent();
  }
}

/** Helper used by LiveryManager to swap a material's texture and free the previous one. */
export function replaceMap(material: MeshStandardMaterial, texture: CanvasTexture): void {
  const old = material.map;
  material.map = texture;
  material.color = new Color('#ffffff');
  material.needsUpdate = true;
  if (old && old !== texture) old.dispose();
}

