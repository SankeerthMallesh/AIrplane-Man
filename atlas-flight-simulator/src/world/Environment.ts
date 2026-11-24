import { AmbientLight, Color, DirectionalLight, FogExp2, HemisphereLight, MathUtils, Object3D, Scene, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export type QualityLevel = 'low' | 'medium' | 'high';

/** Procedural sky, sun and ambient light shared by fallback and 3D Tiles modes. */
export class Environment {
  readonly sky = new Sky();
  readonly sun = new DirectionalLight('#fff4e2', 3.2);
  private readonly hemi = new HemisphereLight('#bcd8ff', '#5b5a4c', 1.1);
  private readonly ambient = new AmbientLight('#ffffff', 0.15);
  private readonly sunDir = new Vector3();
  readonly fog = new FogExp2(new Color('#b9cde0'), 0.000035);

  constructor(private readonly scene: Scene) {
    this.sky.scale.setScalar(400000);
    const u = this.sky.material.uniforms;
    const set = (name: string, value: number): void => {
      const uniform = u[name];
      if (uniform) uniform.value = value;
    };
    set('turbidity', 6);
    set('rayleigh', 1.6);
    set('mieCoefficient', 0.004);
    set('mieDirectionalG', 0.8);
    const phi = MathUtils.degToRad(90 - 38);
    const theta = MathUtils.degToRad(200);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u['sunPosition']?.value.copy(this.sunDir);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -60;
    cam.right = cam.top = 60;
    cam.near = 1;
    cam.far = 900;
    scene.add(this.sky, this.sun, this.sun.target, this.hemi, this.ambient);
    scene.fog = this.fog;
  }

  setQuality(q: QualityLevel): void {
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 4096 : 2048;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  setFogEnabled(on: boolean, density = 0.000035): void {
    this.fog.density = on ? density : 0;
  }

  /** Keeps the shadow frustum centred on the aircraft. */
  follow(target: Object3D): void {
    this.sun.target.position.copy(target.position);
    this.sun.position.copy(target.position).addScaledVector(this.sunDir, 400);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.scene.remove(this.sky, this.sun, this.sun.target, this.hemi, this.ambient);
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.sun.shadow.map?.dispose();
    this.scene.fog = null;
  }
}
