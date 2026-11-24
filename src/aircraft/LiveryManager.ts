import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import type { Airline } from '../data/airlines';
import { drawLogo } from './Logos';
import { FIN_MAIN_FRACTION, FUSELAGE, V_FIN, replaceMap, type AircraftMaterials } from './AircraftModel';

const FUSE_W = 2048;
const FUSE_H = 1024;
const LENGTH = FUSELAGE.zTail - FUSELAGE.zNose;
/** Vertical/horizontal pixel density ratio of the fuselage UV map at cabin radius. */
const ASPECT = (FUSE_H / (2 * Math.PI * 2)) / (FUSE_W / LENGTH);

const xAt = (z: number): number => ((z - FUSELAGE.zNose) / LENGTH) * FUSE_W;
/** Canvas Y for an angle measured from the top, clockwise when viewed from behind (90 = right side). */
const yAt = (thetaDeg: number): number => (1 - thetaDeg / 360) * FUSE_H;

/**
 * Applies airline liveries by repainting canvas textures and recolouring shared materials.
 * Geometry is never rebuilt; previous textures are disposed when replaced.
 */
export class LiveryManager {
  private current: Airline | null = null;

  constructor(private readonly materials: AircraftMaterials, private readonly anisotropy = 4) {}

  get airline(): Airline | null {
    return this.current;
  }

  apply(airline: Airline): void {
    if (this.current?.id === airline.id) return;
    this.current = airline;
    const p = airline.palette;
    const m = this.materials;
    replaceMap(m.fuselage, this.texture(this.paintFuselage(airline)));
    replaceMap(m.fin, this.texture(this.paintFin(airline)));
    m.rudder.color = new Color(p.tailBase);
    m.accent.color = new Color(p.wingAccent);
    m.nacelle.color = new Color(p.engine);
    m.lip.color = new Color(p.engineLip);
  }

  private texture(canvas: HTMLCanvasElement): CanvasTexture {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = this.anisotropy;
    return t;
  }

  private paintFuselage(a: Airline): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = FUSE_W;
    c.height = FUSE_H;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const p = a.palette;
    ctx.fillStyle = p.fuselageTop;
    ctx.fillRect(0, 0, FUSE_W, FUSE_H);
    /** Fills a band between two angles on both sides (right side given, left mirrored). */
    const band = (t0: number, t1: number, color: string, x0 = 0, x1 = FUSE_W): void => {
      ctx.fillStyle = color;
      ctx.fillRect(x0, yAt(t1), x1 - x0, yAt(t0) - yAt(t1));
      ctx.fillRect(x0, yAt(360 - t0), x1 - x0, yAt(360 - t1) - yAt(360 - t0));
    };
    switch (a.style) {
      case 'cheatline':
        band(114, 180, p.belly);
        band(103, 111, p.stripe);
        band(99, 101.5, p.stripe2);
        break;
      case 'belly-wrap':
        band(108, 180, p.belly);
        band(104, 108, p.stripe);
        break;
      case 'twin-stripe':
        band(97, 101, p.stripe);
        band(103, 105.5, p.stripe2);
        break;
      case 'swoosh': {
        band(118, 180, p.belly);
        // Swoosh rising toward the tail, drawn in (z, angle) space for both sides.
        for (const mirror of [false, true]) {
          const y = (t: number): number => yAt(mirror ? 360 - t : t);
          ctx.fillStyle = p.stripe;
          ctx.beginPath();
          ctx.moveTo(xAt(-4), y(116));
          ctx.bezierCurveTo(xAt(6), y(112), xAt(12), y(70), xAt(18.6), y(8));
          ctx.lineTo(xAt(18.6), y(60));
          ctx.bezierCurveTo(xAt(13), y(100), xAt(6), y(117), xAt(-4), y(120));
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = p.stripe2;
          ctx.beginPath();
          ctx.moveTo(xAt(2), y(119));
          ctx.bezierCurveTo(xAt(9), y(117), xAt(14), y(95), xAt(18.6), y(70));
          ctx.lineTo(xAt(18.6), y(110));
          ctx.bezierCurveTo(xAt(14), y(118), xAt(9), y(121), xAt(2), y(121));
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
    }
    // Passenger windows (skipping door zones).
    ctx.fillStyle = '#18202b';
    for (let z = -12.2; z < 9.6; z += 0.53) {
      if (Math.abs(z + 0.4) < 0.55) continue;
      for (const theta of [76, 284]) {
        ctx.beginPath();
        ctx.roundRect(xAt(z) - 7, yAt(theta) - 15, 14, 30, 6);
        ctx.fill();
      }
    }
    // Door outlines.
    ctx.strokeStyle = 'rgba(40,48,60,0.55)';
    ctx.lineWidth = 2;
    for (const [z, w, t0, t1] of [[-13.6, 0.95, 58, 122], [11.2, 0.9, 60, 122], [-0.4, 0.55, 64, 98]] as const) {
      for (const mirror of [false, true]) {
        const ya = yAt(mirror ? 360 - t0 : t0);
        const yb = yAt(mirror ? 360 - t1 : t1);
        ctx.beginPath();
        ctx.roundRect(xAt(z - w / 2), Math.min(ya, yb), xAt(z + w / 2) - xAt(z - w / 2), Math.abs(yb - ya), 8);
        ctx.stroke();
      }
    }
    // Cockpit windows: side panes and windshield.
    ctx.fillStyle = '#121820';
    for (const mirror of [false, true]) {
      const y = (t: number): number => yAt(mirror ? 360 - t : t);
      const panes: Array<[number, number, number, number]> = [[-17.75, -17.1, 22, 50], [-17.05, -16.45, 34, 58], [-16.4, -15.85, 42, 62]];
      for (const [z0, z1, t0, t1] of panes) {
        ctx.beginPath();
        ctx.moveTo(xAt(z0), y(t0 + 4));
        ctx.lineTo(xAt(z1), y(t0));
        ctx.lineTo(xAt(z1), y(t1));
        ctx.lineTo(xAt(z0), y(t1 - 3));
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillRect(xAt(-18.05), yAt(20), xAt(-17.8) - xAt(-18.05), FUSE_H - yAt(20));
    ctx.fillRect(xAt(-18.05), 0, xAt(-17.8) - xAt(-18.05), yAt(340));
    // Titles: readable on both sides (right side is drawn rotated 180° in UV space).
    const title = a.name.toUpperCase();
    const drawTitle = (cx: number, cy: number, rotated: boolean): void => {
      ctx.save();
      ctx.translate(cx, cy);
      if (rotated) ctx.rotate(Math.PI);
      ctx.scale(1, ASPECT);
      ctx.fillStyle = p.titles;
      ctx.font = '700 46px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(title.split('').join(String.fromCharCode(8202)), 0, 0);
      ctx.restore();
      ctx.save();
      ctx.translate(cx + (rotated ? 1 : -1) * 470, cy);
      if (rotated) ctx.rotate(Math.PI);
      ctx.scale(1, ASPECT);
      drawLogo(ctx, a, 0, 0, 62);
      ctx.restore();
    };
    drawTitle(xAt(-3), yAt(318), false);
    drawTitle(xAt(-3), yAt(42), true);
    // Registration near the tail.
    const reg = (cy: number, rotated: boolean): void => {
      ctx.save();
      ctx.translate(xAt(14.3), cy);
      if (rotated) ctx.rotate(Math.PI);
      ctx.scale(1, ASPECT);
      ctx.fillStyle = '#2a2f38';
      ctx.font = '600 18px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(a.registration, 0, 0);
      ctx.restore();
    };
    reg(yAt(282), false);
    reg(yAt(78), true);
    return c;
  }

  /**
   * Paints the fin in physical (metres) space, then resamples into the fin's UV space
   * (u = chordwise, v = spanwise) so the swept/tapered shape does not distort the logo.
   */
  private paintFin(a: Airline): HTMLCanvasElement {
    const PX = 140;
    const ext = 6.6;
    const phys = document.createElement('canvas');
    phys.width = phys.height = Math.round(ext * PX);
    const pctx = phys.getContext('2d', { willReadFrequently: true });
    const out = document.createElement('canvas');
    out.width = out.height = 512;
    const octx = out.getContext('2d');
    if (!pctx || !octx) return out;
    const p = a.palette;
    const g = pctx.createLinearGradient(0, phys.height, phys.width * 0.6, 0);
    g.addColorStop(0, p.tailBase);
    g.addColorStop(1, p.tailGradient);
    pctx.fillStyle = g;
    pctx.fillRect(0, 0, phys.width, phys.height);
    const tan = Math.tan((V_FIN.sweepDeg * Math.PI) / 180);
    const rootC = V_FIN.rootChord * FIN_MAIN_FRACTION;
    const tipC = V_FIN.tipChord * FIN_MAIN_FRACTION;
    const f = 0.47;
    const cz = f * V_FIN.span * tan + (rootC + (tipC - rootC) * f) * 0.5;
    drawLogo(pctx, a, cz * PX, (ext - f * V_FIN.span) * PX, 3.4 * PX);
    const src = pctx.getImageData(0, 0, phys.width, phys.height);
    const dst = octx.createImageData(512, 512);
    for (let j = 0; j < 512; j++) {
      const v = 1 - (j + 0.5) / 512;
      const chord = rootC + (tipC - rootC) * v;
      const le = v * V_FIN.span * tan;
      const py = Math.min(phys.height - 1, Math.max(0, Math.round((ext - v * V_FIN.span) * PX)));
      for (let i = 0; i < 512; i++) {
        const u = (i + 0.5) / 512;
        const px = Math.min(phys.width - 1, Math.max(0, Math.round((le + u * chord) * PX)));
        const si = (py * phys.width + px) * 4;
        const di = (j * 512 + i) * 4;
        dst.data[di] = src.data[si] ?? 0;
        dst.data[di + 1] = src.data[si + 1] ?? 0;
        dst.data[di + 2] = src.data[si + 2] ?? 0;
        dst.data[di + 3] = 255;
      }
    }
    octx.putImageData(dst, 0, 0);
    return out;
  }
}
