import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Fuselage loft: rings along Z (nose at −Z). UV u = along length (0 nose → 1 tail), v = angle/2π (0 = top). */
export interface FuselageProfile {
  readonly zNose: number;
  readonly zTail: number;
  radius(z: number): number;
  centerY(z: number): number;
  verticalScale(z: number): number;
}

export function buildFuselageGeometry(p: FuselageProfile, rings = 72, segments = 40): BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    // Cosine spacing packs rings near the nose and tail where curvature is high.
    const s = 0.5 - 0.5 * Math.cos((i / rings) * Math.PI);
    const z = p.zNose + (p.zTail - p.zNose) * s;
    const r = p.radius(z);
    const cy = p.centerY(z);
    const vs = p.verticalScale(z);
    for (let j = 0; j <= segments; j++) {
      const th = (j / segments) * Math.PI * 2;
      pos.push(r * Math.sin(th), cy + r * vs * Math.cos(th), z);
      uv.push(s, j / segments);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = a + 1;
      const d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface SurfaceParams {
  readonly span: number;
  readonly rootChord: number;
  readonly tipChord: number;
  /** Leading-edge sweep in degrees. */
  readonly sweepDeg: number;
  readonly thickness: number;
  readonly tipThickness?: number;
  readonly camber?: number;
  /** +1 builds toward +X, −1 mirrors toward −X (winding is flipped to keep normals outward). */
  readonly side?: 1 | -1;
  readonly stations?: number;
}

/**
 * Generic tapered, swept lifting surface. Span along ±X, chord along +Z (leading edge at z=0
 * at the root), thickness along Y. UV u = chordwise fraction, v = spanwise fraction.
 */
export function buildLiftingSurface(p: SurfaceParams): BufferGeometry {
  const side = p.side ?? 1;
  const stations = p.stations ?? 8;
  const n = 14;
  const camber = p.camber ?? 0.02;
  const xs: number[] = [];
  for (let k = 0; k <= n; k++) xs.push(0.5 - 0.5 * Math.cos((k / n) * Math.PI));
  // Loop: TE upper -> LE -> TE lower.
  const loop: Array<[number, number]> = [];
  const yt = (x: number, t: number): number =>
    5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) + 0.002;
  for (let k = n; k >= 0; k--) loop.push([xs[k] ?? 0, 1]);
  for (let k = 1; k <= n; k++) loop.push([xs[k] ?? 0, -1]);
  const tan = Math.tan((p.sweepDeg * Math.PI) / 180);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const ring = loop.length;
  for (let s = 0; s <= stations; s++) {
    const f = s / stations;
    const chord = p.rootChord + (p.tipChord - p.rootChord) * f;
    const t = p.thickness + ((p.tipThickness ?? p.thickness) - p.thickness) * f;
    const le = f * p.span * tan;
    for (const [x, sgn] of loop) {
      const camberY = camber * 4 * x * (1 - x) * chord;
      pos.push(side * f * p.span, camberY + sgn * yt(x, t) * chord, le + x * chord);
      uv.push(x, f);
    }
  }
  const tri = (a: number, b: number, c: number): void => {
    if (side === 1) idx.push(a, b, c); else idx.push(a, c, b);
  };
  for (let s = 0; s < stations; s++) {
    for (let k = 0; k < ring - 1; k++) {
      const a = s * ring + k;
      const b = (s + 1) * ring + k;
      tri(a, a + 1, b);
      tri(b, a + 1, b + 1);
    }
  }
  // Tip cap (fan around the loop) and root cap.
  const tipStart = stations * ring;
  for (let k = 1; k < ring - 1; k++) tri(tipStart, tipStart + k + 1, tipStart + k);
  for (let k = 1; k < ring - 1; k++) tri(0, k, k + 1);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Chord, leading-edge z at a span fraction for a surface definition. */
export function surfaceStation(p: SurfaceParams, f: number): { chord: number; le: number } {
  return {
    chord: p.rootChord + (p.tipChord - p.rootChord) * f,
    le: f * p.span * Math.tan((p.sweepDeg * Math.PI) / 180),
  };
}
