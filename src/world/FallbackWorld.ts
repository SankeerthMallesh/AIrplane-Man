import {
  BoxGeometry, CanvasTexture, CircleGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion,
  RepeatWrapping, SRGBColorSpace, Vector3,
} from 'three';
import type { AirportData } from '../data/airports';
import type { LocalRunway } from './AirportFrame';
import { createRandom, hashString } from '../utils/MathUtils';

/**
 * Procedural scenery used when Google 3D Tiles are unavailable: textured ground disc, sea for
 * coastal/island airports, and instanced city blocks kept clear of the runways. It is
 * deterministic per airport.
 */
export class FallbackWorld {
  readonly group = new Group();
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(airport: AirportData, runways: readonly LocalRunway[]) {
    this.group.name = 'FallbackWorld';
    const rand = createRandom(hashString(airport.icao));
    const groundTex = this.groundTexture(rand);
    const ground = new Mesh(new CircleGeometry(60000, 64), new MeshStandardMaterial({ map: groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);
    this.disposables.push(groundTex, ground.geometry, ground.material);

    // Sea: offset to one side for coastal airports, surrounding ring for islands.
    if (airport.terrain !== 'urban') {
      const seaMat = new MeshStandardMaterial({ color: '#1f5f86', roughness: 0.25, metalness: 0.1 });
      const seaGeo = new CircleGeometry(airport.terrain === 'island' ? 70000 : 40000, 48);
      const sea = new Mesh(seaGeo, seaMat);
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = -0.4;
      if (airport.terrain === 'island') {
        ground.scale.setScalar(0.08);
        sea.position.y = -0.3;
      } else {
        const ang = rand() * Math.PI * 2;
        sea.position.set(Math.cos(ang) * 44000, -0.3, Math.sin(ang) * 44000);
        sea.position.y = 0.05;
      }
      this.group.add(sea);
      this.disposables.push(seaGeo, seaMat);
    }

    // City blocks (instanced), rejected near runways.
    const count = airport.terrain === 'island' ? 700 : 2600;
    const box = new BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const mat = new MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    const blocks = new InstancedMesh(box, mat, count);
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const color = new Color();
    const maxR = airport.terrain === 'island' ? 4200 : 14000;
    let placed = 0;
    for (let tries = 0; placed < count && tries < count * 6; tries++) {
      const r = 1600 + Math.sqrt(rand()) * maxR;
      const a = rand() * Math.PI * 2;
      p.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (this.nearRunway(p, runways, 700)) continue;
      const tall = rand() < 0.08;
      s.set(18 + rand() * 40, tall ? 40 + rand() * 120 : 6 + rand() * 22, 18 + rand() * 40);
      q.setFromAxisAngle(new Vector3(0, 1, 0), Math.floor(rand() * 4) * (Math.PI / 2) + 0.3);
      blocks.setMatrixAt(placed, m.compose(p, q, s));
      color.setHSL(0.08 + rand() * 0.08, 0.08 + rand() * 0.1, 0.55 + rand() * 0.25);
      blocks.setColorAt(placed, color);
      placed++;
    }
    blocks.count = placed;
    blocks.castShadow = false;
    blocks.receiveShadow = true;
    this.group.add(blocks);
    this.disposables.push(box, mat);
  }

  private nearRunway(p: Vector3, runways: readonly LocalRunway[], margin: number): boolean {
    for (const r of runways) {
      const dx = p.x - r.center.x;
      const dz = p.z - r.center.z;
      const along = dx * r.direction.x + dz * r.direction.z;
      const across = -dx * r.direction.z + dz * r.direction.x;
      if (Math.abs(along) < r.lengthM / 2 + margin * 2.5 && Math.abs(across) < margin) return true;
    }
    return false;
  }

  private groundTexture(rand: () => number): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#6f7d4f';
      ctx.fillRect(0, 0, 512, 512);
      const palette = ['#7a8752', '#66733f', '#8a8a5c', '#5d6b3c', '#7f7a55', '#6b7a4a'];
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = palette[Math.floor(rand() * palette.length)] ?? '#6f7d4f';
        ctx.fillRect(rand() * 512, rand() * 512, 20 + rand() * 70, 20 + rand() * 70);
      }
      for (let i = 0; i < 6000; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rand() * 0.06})`;
        ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
      }
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(220, 220);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
