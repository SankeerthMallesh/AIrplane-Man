import {
  BufferGeometry, CanvasTexture, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  SRGBColorSpace, SphereGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { LocalRunway } from './AirportFrame';

/**
 * Builds runway meshes sized from real data: asphalt, centreline dashes, threshold bars,
 * designators, edge stripes, a parallel taxiway and edge lights. All markings of a runway are
 * merged into one geometry to keep draw calls low.
 */
export class RunwayBuilder {
  private readonly asphalt = new MeshStandardMaterial({ color: '#3a3d42', roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly taxiway = new MeshStandardMaterial({ color: '#4a4c50', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private readonly paint = new MeshStandardMaterial({ color: '#f2f2ee', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private readonly yellow = new MeshStandardMaterial({ color: '#e8c23a', roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  private readonly lightMat = new MeshBasicMaterial({ color: '#fff3c4' });
  private readonly lightGeo = new SphereGeometry(0.35, 6, 4);
  private readonly owned: Array<{ dispose(): void }> = [];

  build(runways: readonly LocalRunway[]): Group {
    const group = new Group();
    group.name = 'Runways';
    for (const r of runways) group.add(this.buildRunway(r));
    return group;
  }

  private buildRunway(r: LocalRunway): Group {
    const g = new Group();
    g.name = `Runway ${r.data.id}`;
    // Local runway space: +X across (right of end-0 heading), −Z along end 0 → end 1.
    const heading0 = (r.headings[0] * Math.PI) / 180;
    g.rotation.y = -heading0;
    g.position.copy(r.center);
    const L = r.lengthM;
    const W = r.widthM;
    const flat = (w: number, l: number, x: number, z: number): BufferGeometry => {
      const p = new PlaneGeometry(w, l);
      p.rotateX(-Math.PI / 2);
      p.translate(x, 0, z);
      return p;
    };
    const surface = new Mesh(flat(W, L + 40, 0, 0), this.asphalt);
    surface.position.y = 0.03;
    surface.receiveShadow = true;
    g.add(surface);
    this.owned.push(surface.geometry);

    const marks: BufferGeometry[] = [];
    for (let z = -L / 2 + 120; z < L / 2 - 120; z += 60) marks.push(flat(0.9, 36, 0, z));
    for (const sgn of [-1, 1]) marks.push(flat(0.9, L, sgn * (W / 2 - 1.5), 0));
    // Threshold piano keys and touchdown-zone aiming points at both ends.
    const stripes = W >= 55 ? 16 : 12;
    const span = W - 6;
    for (const endSign of [1, -1]) {
      const zEdge = endSign * (L / 2 - 6) * 1;
      for (let i = 0; i < stripes; i++) {
        if (i === stripes / 2 - 1 || i === stripes / 2) continue;
        const x = -span / 2 + (i + 0.5) * (span / stripes);
        marks.push(flat(1.8, 30, x, zEdge - endSign * 15));
      }
      for (const sgn of [-1, 1]) marks.push(flat(9, 45, sgn * 9, endSign * (L / 2 - 400)));
    }
    const markMesh = new Mesh(mergeGeometries(marks), this.paint);
    for (const m of marks) m.dispose();
    markMesh.position.y = 0.06;
    markMesh.receiveShadow = true;
    g.add(markMesh);
    this.owned.push(markMesh.geometry);

    // Designators painted at each end, readable when approaching that end.
    r.data.ends.forEach((end, i) => {
      const tex = this.designatorTexture(end.ident);
      const mat = new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const geo = new PlaneGeometry(18, 30);
      geo.rotateX(-Math.PI / 2);
      const mesh = new Mesh(geo, mat);
      const sign = i === 0 ? 1 : -1;
      mesh.position.set(0, 0.07, sign * (L / 2 - 75));
      if (i === 1) mesh.rotation.y = Math.PI;
      g.add(mesh);
      this.owned.push(tex, mat, geo);
    });

    // Parallel taxiway with yellow centreline.
    const twOffset = W / 2 + 160;
    const tw = new Mesh(flat(23, L, twOffset, 0), this.taxiway);
    tw.position.y = 0.02;
    tw.receiveShadow = true;
    g.add(tw);
    const twLine = new Mesh(flat(0.3, L, twOffset, 0), this.yellow);
    twLine.position.y = 0.05;
    g.add(twLine);
    for (const z of [-L / 2 + 30, 0, L / 2 - 30]) {
      const link = new Mesh(flat(twOffset - W / 2, 23, W / 2 + (twOffset - W / 2) / 2, z), this.taxiway);
      link.position.y = 0.02;
      link.rotation.y = 0;
      g.add(link);
      this.owned.push(link.geometry);
    }
    this.owned.push(tw.geometry, twLine.geometry);

    // Edge lights as one instanced mesh.
    const count = Math.floor(L / 60) * 2;
    const lights = new InstancedMesh(this.lightGeo, this.lightMat, count);
    const m = new Matrix4();
    let n = 0;
    for (let z = -L / 2; z < L / 2 && n < count - 1; z += 60) {
      for (const sgn of [-1, 1]) lights.setMatrixAt(n++, m.makeTranslation(new Vector3(sgn * (W / 2 + 1.5), 0.4, z)));
    }
    lights.count = n;
    g.add(lights);
    this.owned.push(lights);
    return g;
  }

  private designatorTexture(ident: string): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 420;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f2f2ee';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const num = ident.replace(/[LRC]$/, '').padStart(2, '0');
      const letter = /[LRC]$/.exec(ident)?.[0] ?? '';
      ctx.font = '700 170px Arial, sans-serif';
      ctx.fillText(num, 128, letter ? 270 : 210);
      if (letter) ctx.fillText(letter, 128, 100);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }

  dispose(): void {
    for (const o of this.owned) o.dispose();
    this.owned.length = 0;
    for (const mat of [this.asphalt, this.taxiway, this.paint, this.yellow, this.lightMat]) mat.dispose();
    this.lightGeo.dispose();
  }
}
