import type { Airline, LogoKind } from '../data/airlines';

/**
 * Original procedural logos, drawn with Canvas 2D in a unit box of `size` pixels centred on
 * (cx, cy). Shared by the tail texture and the hangar UI so both always agree.
 */
type Ctx = CanvasRenderingContext2D;

function star(ctx: Ctx, cx: number, cy: number, points: number, outer: number, inner: number, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const drawers: Record<LogoKind, (ctx: Ctx, s: number, a: Airline) => void> = {
  'aurora-star': (ctx, s, a) => {
    // Sweeping light trails beneath a four-point northern star.
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? a.palette.logoPrimary : a.palette.logoSecondary;
      ctx.globalAlpha = 1 - i * 0.25;
      ctx.lineWidth = s * (0.05 - i * 0.012);
      ctx.beginPath();
      ctx.moveTo(-s * 0.45, s * (0.38 - i * 0.07));
      ctx.quadraticCurveTo(-s * 0.05, s * (0.25 - i * 0.12), s * 0.1, -s * 0.02);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = a.palette.logoPrimary;
    star(ctx, s * 0.12, -s * 0.1, 4, s * 0.34, s * 0.07);
    ctx.fill();
    ctx.fillStyle = a.palette.logoSecondary;
    star(ctx, s * 0.12, -s * 0.1, 4, s * 0.16, s * 0.04, -Math.PI / 4);
    ctx.fill();
  },
  'forge-flame': (ctx, s, a) => {
    // Geometric wing (three blades) merging into a rising flame.
    ctx.fillStyle = a.palette.logoPrimary;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const y = s * (0.18 - i * 0.14);
      ctx.moveTo(-s * 0.42 + i * s * 0.06, y);
      ctx.lineTo(s * 0.05, y - s * 0.1);
      ctx.lineTo(s * 0.05, y - s * 0.02);
      ctx.lineTo(-s * 0.3 + i * s * 0.06, y + s * 0.06);
      ctx.closePath();
      ctx.globalAlpha = 1 - i * 0.2;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.05, s * 0.3);
    ctx.bezierCurveTo(s * 0.4, s * 0.15, s * 0.3, -s * 0.15, s * 0.2, -s * 0.42);
    ctx.bezierCurveTo(s * 0.12, -s * 0.2, s * 0.02, -s * 0.15, s * 0.05, s * 0.3);
    ctx.fill();
    ctx.fillStyle = a.palette.logoSecondary;
    ctx.beginPath();
    ctx.moveTo(s * 0.12, s * 0.22);
    ctx.bezierCurveTo(s * 0.3, s * 0.1, s * 0.24, -s * 0.05, s * 0.2, -s * 0.18);
    ctx.bezierCurveTo(s * 0.14, -s * 0.05, s * 0.09, 0, s * 0.12, s * 0.22);
    ctx.fill();
  },
  'celestial-orbit': (ctx, s, a) => {
    // Abstract star inside two tilted orbits with constellation points.
    ctx.strokeStyle = a.palette.logoPrimary;
    ctx.lineWidth = s * 0.025;
    for (const rot of [-0.45, 0.45]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.42, s * 0.17, rot, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = a.palette.logoPrimary;
    star(ctx, 0, 0, 8, s * 0.17, s * 0.06);
    ctx.fill();
    ctx.fillStyle = a.palette.logoSecondary;
    const pts: Array<[number, number]> = [[-0.36, -0.2], [0.33, 0.24], [0.3, -0.3], [-0.28, 0.3], [0.05, -0.42]];
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  'ocean-crown': (ctx, s, a) => {
    // Crown whose points are breaking waves, over a wave base line.
    ctx.fillStyle = a.palette.logoPrimary;
    ctx.beginPath();
    ctx.moveTo(-s * 0.38, s * 0.15);
    for (let i = 0; i < 3; i++) {
      const x0 = -s * 0.38 + i * s * 0.253;
      ctx.quadraticCurveTo(x0 + s * 0.02, -s * 0.35, x0 + s * 0.2, -s * 0.3);
      ctx.quadraticCurveTo(x0 + s * 0.08, -s * 0.18, x0 + s * 0.253, s * 0.0);
    }
    ctx.lineTo(s * 0.38, s * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = a.palette.logoSecondary;
    ctx.lineWidth = s * 0.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = -s * 0.4 + (i / 20) * s * 0.8;
      const y = s * 0.28 + Math.sin(i * 0.95) * s * 0.035;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
  'nova-rise': (ctx, s, a) => {
    // Rising star leaving an orbital arc.
    ctx.strokeStyle = a.palette.logoSecondary;
    ctx.lineWidth = s * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, s * 0.12, s * 0.36, Math.PI * 0.95, Math.PI * 2.1);
    ctx.stroke();
    ctx.fillStyle = a.palette.logoPrimary;
    star(ctx, s * 0.24, -s * 0.2, 5, s * 0.2, s * 0.085);
    ctx.fill();
    ctx.fillStyle = a.palette.logoSecondary;
    ctx.beginPath();
    ctx.arc(-s * 0.3, s * 0.32, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  },
  'solstice-sun': (ctx, s, a) => {
    // Minimal geometric sun: disc, 12 trapezoid rays, horizon cut.
    ctx.fillStyle = a.palette.logoPrimary;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.19, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 12; i++) {
      ctx.save();
      ctx.rotate((i / 12) * Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? a.palette.logoPrimary : a.palette.logoSecondary;
      ctx.beginPath();
      ctx.moveTo(-s * 0.03, -s * 0.25);
      ctx.lineTo(s * 0.03, -s * 0.25);
      ctx.lineTo(s * 0.015, -s * 0.42);
      ctx.lineTo(-s * 0.015, -s * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = a.palette.tailBase;
    ctx.fillRect(-s * 0.5, s * 0.05, s, s * 0.03);
  },
};

/** Draws the airline logo centred at (cx, cy) inside a square of `size` px. */
export function drawLogo(ctx: Ctx, airline: Airline, cx: number, cy: number, size: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  drawers[airline.logo](ctx, size, airline);
  ctx.restore();
}

/** Logo as a data URL for the DOM, drawn on the airline's tail colour. */
export function logoDataUrl(airline: Airline, size = 160, background = true): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  if (background) {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, airline.palette.tailBase);
    g.addColorStop(1, airline.palette.tailGradient);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.18);
    ctx.fill();
  }
  drawLogo(ctx, airline, size / 2, size / 2, size * 0.8);
  return canvas.toDataURL('image/png');
}
