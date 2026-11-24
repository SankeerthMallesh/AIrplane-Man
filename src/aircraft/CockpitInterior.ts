import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TorusGeometry, Vector3, Quaternion, Euler, Color,
} from 'three';

/** Live values shown on the cockpit displays (already in display units). */
export interface CockpitData {
  pitchDeg: number; bankDeg: number; iasKt: number; altFt: number; vsFpm: number; headingDeg: number;
  n1: number; throttle: number; flaps: string; gear: string; brakes: boolean; elevator: number; aileron: number;
}

const SLOT = 384;
const SLOTS = 6;

/**
 * Procedural airliner flight deck: main panel with six live glass displays (shared canvas atlas),
 * glareshield + autopilot control panel, overhead panel, centre pedestal with thrust levers and
 * two animated yokes. Visible only in cockpit camera mode.
 */
export class CockpitInterior {
  readonly group = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly screenTex: CanvasTexture;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly yokes: Group[] = [];
  private readonly levers: Group[] = [];
  private accumulator = 1;

  constructor() {
    this.group.name = 'CockpitInterior';
    this.canvas.width = SLOT * SLOTS;
    this.canvas.height = SLOT;
    this.ctx = this.canvas.getContext('2d');
    this.screenTex = new CanvasTexture(this.canvas);
    this.screenTex.colorSpace = SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    this.disposables.push(this.screenTex);

    const panelMat = this.std('#46505c', 0.35, 0.65);
    const darkMat = this.std('#1c2127', 0.2, 0.8);
    const bezelMat = this.std('#2a3038', 0.4, 0.5);
    const knobMat = this.std('#c9cdd2', 0.7, 0.35);
    const stickMat = this.std('#26292e', 0.3, 0.55);

    // Main instrument panel, tilted back toward the pilots.
    const panel = new Group();
    panel.position.set(0, 0.42, -17.0);
    panel.rotation.x = -0.28;
    this.group.add(panel);
    panel.add(this.box(2.7, 0.78, 0.08, panelMat, 0, 0, -0.04));
    // Six displays: CAPT PFD, CAPT ND, ECAM upper, ECAM lower (below), FO ND, FO PFD.
    const layout: Array<[number, number]> = [[-1.06, 0.06], [-0.64, 0.06], [0, 0.17], [0, -0.2], [0.64, 0.06], [1.06, 0.06]];
    layout.forEach(([x, y], i) => {
      panel.add(this.box(0.4, 0.38, 0.03, bezelMat, x, y, 0.005));
      const geo = new PlaneGeometry(0.34, 0.32);
      const uv = geo.attributes['uv'];
      if (uv) {
        for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / SLOTS);
        uv.needsUpdate = true;
      }
      const screen = new Mesh(geo, new MeshBasicMaterial({ map: this.screenTex, toneMapped: false }));
      screen.position.set(x, y, 0.024);
      panel.add(screen);
      this.disposables.push(geo, screen.material);
    });
    // Standby instruments and switch clusters.
    panel.add(this.box(0.12, 0.12, 0.03, darkMat, -0.3, 0.2, 0.01), this.box(0.12, 0.12, 0.03, darkMat, 0.3, 0.2, 0.01));
    this.addButtons(panel, [[-1.25, -0.3, 10, 2], [0.85, -0.3, 10, 2], [-0.45, -0.25, 2, 4], [0.38, -0.25, 2, 4]], 0.045, 0.025);

    // Glareshield with the autopilot control unit.
    const glare = new Group();
    glare.position.set(0, 0.86, -17.15);
    this.group.add(glare);
    glare.add(this.box(2.9, 0.1, 0.55, darkMat, 0, 0, 0));
    glare.add(this.box(1.5, 0.13, 0.04, panelMat, 0, -0.03, 0.27));
    for (let i = 0; i < 6; i++) {
      const knob = new Mesh(new CylinderGeometry(0.022, 0.026, 0.035, 16), knobMat);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(-0.6 + i * 0.24, -0.04, 0.3);
      glare.add(knob);
      this.disposables.push(knob.geometry);
      glare.add(this.box(0.09, 0.03, 0.005, new MeshBasicMaterial({ color: '#ffb33a', toneMapped: false }), -0.6 + i * 0.24, 0.025, 0.293));
    }
    this.addButtons(glare, [[-1.35, -0.03, 4, 1], [1.05, -0.03, 4, 1]], 0.05, 0.27);

    // Overhead panel.
    const overhead = new Group();
    overhead.position.set(0, 1.72, -16.4);
    overhead.rotation.x = 0.5;
    this.group.add(overhead);
    overhead.add(this.box(1.4, 0.03, 1.1, panelMat, 0, 0, 0));
    this.addButtons(overhead, [[-0.6, 0, 14, 10]], 0.07, -0.02, true);

    // Centre pedestal with thrust levers.
    const ped = new Group();
    ped.position.set(0, 0.1, -16.25);
    this.group.add(ped);
    ped.add(this.box(0.5, 0.5, 1.2, panelMat, 0, 0, 0));
    ped.add(this.box(0.46, 0.02, 1.1, darkMat, 0, 0.26, 0));
    for (const x of [-0.07, 0.07]) {
      const lever = new Group();
      lever.position.set(x, 0.27, -0.25);
      lever.add(this.box(0.03, 0.22, 0.03, stickMat, 0, 0.11, 0));
      lever.add(this.box(0.08, 0.04, 0.05, knobMat, 0, 0.23, 0));
      ped.add(lever);
      this.levers.push(lever);
    }

    // Yokes for both seats.
    for (const x of [-0.55, 0.55]) {
      const yoke = new Group();
      yoke.position.set(x, 0.35, -16.6);
      yoke.add(this.box(0.06, 0.06, 0.45, stickMat, 0, 0, -0.2));
      const wheel = new Group();
      wheel.position.z = 0.03;
      const rim = new Mesh(new TorusGeometry(0.15, 0.018, 10, 24, Math.PI * 1.1), stickMat);
      rim.rotation.z = -Math.PI * 0.05 + Math.PI;
      wheel.add(rim, this.box(0.3, 0.05, 0.04, stickMat, 0, -0.02, 0), this.box(0.08, 0.08, 0.05, darkMat, 0, -0.02, 0.01));
      this.disposables.push(rim.geometry);
      yoke.add(wheel);
      this.group.add(yoke);
      this.yokes.push(wheel);
    }

    // Window frame posts and side consoles.
    for (const s of [-1, 1]) {
      const post = this.box(0.07, 1.0, 0.07, darkMat, s * 0.92, 1.25, -17.15);
      post.rotation.set(-0.55, 0, s * 0.25);
      this.group.add(post);
      this.group.add(this.box(0.35, 0.35, 1.6, panelMat, s * 1.2, 0.35, -16.0));
    }
    this.group.add(this.box(2.8, 0.06, 0.9, darkMat, 0, 1.68, -17.1));
    this.group.visible = false;
  }

  private std(color: string, metalness: number, roughness: number): MeshStandardMaterial {
    const m = new MeshStandardMaterial({ color, metalness, roughness });
    this.disposables.push(m);
    return m;
  }

  private box(w: number, h: number, d: number, mat: MeshStandardMaterial | MeshBasicMaterial, x: number, y: number, z: number): Mesh {
    const g: BufferGeometry = new BoxGeometry(w, h, d);
    this.disposables.push(g);
    if (mat instanceof MeshBasicMaterial) this.disposables.push(mat);
    const m = new Mesh(g, mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  }

  /** Grids of push-buttons as one instanced mesh; some lit like annunciators. */
  private addButtons(parent: Group, grids: Array<[number, number, number, number]>, pitch: number, z: number, horizontal = false): void {
    const total = grids.reduce((n, [, , c, r]) => n + c * r, 0);
    const geo = new BoxGeometry(0.035, 0.025, 0.012);
    const mat = new MeshStandardMaterial({ color: '#d5d9de', roughness: 0.5, emissive: '#000000' });
    const mesh = new InstancedMesh(geo, mat, total);
    const m = new Matrix4();
    const q = new Quaternion().setFromEuler(new Euler(horizontal ? -Math.PI / 2 : 0, 0, 0));
    const one = new Vector3(1, 1, 1);
    const lit = new Color('#5fe08f');
    const amber = new Color('#ffb33a');
    const off = new Color('#c8ccd1');
    let i = 0;
    for (const [x0, y0, cols, rows] of grids) {
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const p = horizontal ? new Vector3(x0 + c * pitch * 0.9, z, -0.45 + r * pitch * 1.3) : new Vector3(x0 + c * pitch, y0 + r * pitch, z);
          mesh.setMatrixAt(i, m.compose(p, q, one));
          const h = (c * 7 + r * 13) % 11;
          mesh.setColorAt(i, h === 0 ? lit : h === 5 ? amber : off);
          i++;
        }
      }
    }
    parent.add(mesh);
    this.disposables.push(geo, mat);
  }

  /** Animates controls every frame; redraws displays at ~15 Hz. */
  update(d: CockpitData, dt: number): void {
    if (!this.group.visible) return;
    for (const w of this.yokes) {
      w.rotation.z = -d.aileron * 0.6;
      w.position.z = 0.03 + d.elevator * 0.08;
    }
    for (const l of this.levers) l.rotation.x = -0.6 + d.throttle * 1.1;
    this.accumulator += dt;
    if (this.accumulator < 1 / 15 || !this.ctx) return;
    this.accumulator = 0;
    const c = this.ctx;
    c.fillStyle = '#05070a';
    c.fillRect(0, 0, this.canvas.width, SLOT);
    this.drawPfd(c, 0, d);
    this.drawNd(c, SLOT, d);
    this.drawEngines(c, SLOT * 2, d);
    this.drawSystems(c, SLOT * 3, d);
    this.drawNd(c, SLOT * 4, d);
    this.drawPfd(c, SLOT * 5, d);
    this.screenTex.needsUpdate = true;
  }

  private drawPfd(c: CanvasRenderingContext2D, ox: number, d: CockpitData): void {
    const cx = ox + SLOT / 2;
    const cy = SLOT / 2 - 10;
    c.save();
    c.beginPath();
    c.rect(ox + 70, 40, SLOT - 140, SLOT - 110);
    c.clip();
    c.translate(cx, cy);
    c.rotate((-d.bankDeg * Math.PI) / 180);
    c.translate(0, d.pitchDeg * 6);
    c.fillStyle = '#2f86d6';
    c.fillRect(-400, -800, 800, 800);
    c.fillStyle = '#8a5a2b';
    c.fillRect(-400, 0, 800, 800);
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(-400, 0); c.lineTo(400, 0); c.stroke();
    c.font = '14px monospace';
    c.fillStyle = '#fff';
    for (let p = -30; p <= 30; p += 10) {
      if (p === 0) continue;
      const y = -p * 6;
      c.beginPath(); c.moveTo(-30, y); c.lineTo(30, y); c.stroke();
      c.fillText(String(Math.abs(p)), 36, y + 5);
    }
    c.restore();
    c.strokeStyle = '#ffd23a';
    c.lineWidth = 5;
    c.beginPath(); c.moveTo(cx - 70, cy); c.lineTo(cx - 25, cy); c.moveTo(cx + 25, cy); c.lineTo(cx + 70, cy); c.stroke();
    c.fillStyle = '#ffd23a';
    c.fillRect(cx - 4, cy - 4, 8, 8);
    // Speed and altitude tapes.
    c.fillStyle = '#1b2430';
    c.fillRect(ox + 8, 40, 58, SLOT - 110);
    c.fillRect(ox + SLOT - 66, 40, 58, SLOT - 110);
    c.fillStyle = '#fff';
    c.font = 'bold 22px monospace';
    c.textAlign = 'center';
    c.fillText(String(Math.round(Math.max(0, d.iasKt))), ox + 37, cy + 8);
    c.fillText(String(Math.round(d.altFt / 10) * 10), ox + SLOT - 37, cy + 8);
    c.font = '14px monospace';
    c.fillStyle = '#5fd4ff';
    c.fillText(`${Math.round(d.vsFpm / 100) * 100}`, ox + SLOT - 37, cy + 40);
    // Heading strip and FMA.
    c.fillStyle = '#fff';
    c.font = 'bold 20px monospace';
    c.fillText(String(Math.round(d.headingDeg) % 360).padStart(3, '0'), cx, SLOT - 30);
    c.fillStyle = '#52e08f';
    c.font = '15px monospace';
    c.fillText('SPEED   ALT   NAV', cx, 26);
    c.textAlign = 'left';
  }

  private drawNd(c: CanvasRenderingContext2D, ox: number, d: CockpitData): void {
    const cx = ox + SLOT / 2;
    const cy = SLOT * 0.78;
    const r = SLOT * 0.6;
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, r, Math.PI * 1.18, Math.PI * 1.82);
    c.stroke();
    c.font = '15px monospace';
    c.textAlign = 'center';
    for (let a = -50; a <= 50; a += 10) {
      const hdg = Math.round(d.headingDeg / 10) * 10 + a;
      const ang = ((hdg - d.headingDeg - 90) * Math.PI) / 180;
      const x1 = cx + Math.cos(ang) * r;
      const y1 = cy + Math.sin(ang) * r;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(cx + Math.cos(ang) * (r - 12), cy + Math.sin(ang) * (r - 12)); c.stroke();
      if (((hdg % 30) + 30) % 30 === 0) {
        c.fillStyle = '#fff';
        c.fillText(String((((hdg / 10) % 36) + 36) % 36), cx + Math.cos(ang) * (r - 28), cy + Math.sin(ang) * (r - 28) + 5);
      }
    }
    c.strokeStyle = '#52e08f';
    c.setLineDash([8, 8]);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 30, cy - r * 0.9); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#d66cff';
    c.fillText('◇ ATLAS1', cx + 60, cy - r * 0.8);
    c.strokeStyle = '#ffd23a';
    c.lineWidth = 4;
    c.beginPath(); c.moveTo(cx - 14, cy); c.lineTo(cx + 14, cy); c.moveTo(cx, cy - 18); c.lineTo(cx, cy + 10); c.stroke();
    c.fillStyle = '#52e08f';
    c.textAlign = 'left';
    c.fillText(`GS ${Math.round(d.iasKt)}  TAS ${Math.round(d.iasKt * 1.02)}`, ox + 12, 24);
  }

  private drawEngines(c: CanvasRenderingContext2D, ox: number, d: CockpitData): void {
    for (const [i, x] of [[0, ox + SLOT * 0.3], [1, ox + SLOT * 0.7]] as const) {
      const y = SLOT * 0.38;
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 60, Math.PI * 0.8, Math.PI * 2.2); c.stroke();
      c.strokeStyle = '#52e08f';
      c.lineWidth = 8;
      c.beginPath(); c.arc(x, y, 52, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * (0.2 + 0.8 * d.n1))); c.stroke();
      c.fillStyle = '#52e08f';
      c.font = 'bold 22px monospace';
      c.textAlign = 'center';
      c.fillText((20 + 80 * d.n1).toFixed(1), x, y + 40);
      c.fillStyle = '#9fb4cc';
      c.font = '14px monospace';
      c.fillText(`N1 ENG ${i + 1}`, x, y + 85);
    }
    c.fillStyle = '#5fd4ff';
    c.textAlign = 'left';
    c.font = '16px monospace';
    c.fillText(`THR ${Math.round(d.throttle * 100)}%   FLAPS ${d.flaps}`, ox + 20, SLOT - 30);
  }

  private drawSystems(c: CanvasRenderingContext2D, ox: number, d: CockpitData): void {
    c.font = 'bold 18px monospace';
    c.textAlign = 'center';
    c.fillStyle = '#fff';
    c.fillText('WHEEL', ox + SLOT / 2, 30);
    for (const [x, y] of [[0.5, 0.3], [0.3, 0.6], [0.7, 0.6]] as const) {
      c.fillStyle = d.gear === 'DOWN' ? '#52e08f' : d.gear === 'UP' ? '#4a5563' : '#ff4d5e';
      c.beginPath();
      c.moveTo(ox + SLOT * x - 20, SLOT * y + 15); c.lineTo(ox + SLOT * x + 20, SLOT * y + 15); c.lineTo(ox + SLOT * x, SLOT * y - 15);
      c.closePath(); c.fill();
    }
    c.fillStyle = d.brakes ? '#ffb33a' : '#52e08f';
    c.fillText(d.brakes ? 'PARK BRK' : 'BRK REL', ox + SLOT / 2, SLOT * 0.85);
    c.textAlign = 'left';
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
