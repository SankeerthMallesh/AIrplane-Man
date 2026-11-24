import type { Airline } from '../data/airlines';
import type { HudViewModel } from './FlightDataFormatter';
import { pad3 } from './FlightDataFormatter';
import { logoDataUrl } from '../aircraft/Logos';
import type { CameraMode } from '../camera/CameraRig';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PX_PER_DEG = 4;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Fixed-size canvas tape drawn at the HUD refresh rate. */
class Tape {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;
  constructor(private readonly w: number, private readonly h: number) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx = this.canvas.getContext('2d');
    this.ctx?.scale(dpr, dpr);
  }

  drawVertical(value: number, pxPerUnit: number, minorStep: number, labelStep: number, fmt: (v: number) => string, align: 'left' | 'right', redAbove?: number): void {
    const c = this.ctx;
    if (!c) return;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(6,14,26,0.6)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#cfe9ff';
    c.fillStyle = '#eaf6ff';
    c.lineWidth = 1.5;
    c.font = '600 13px ui-monospace, Menlo, monospace';
    c.textBaseline = 'middle';
    const range = h / 2 / pxPerUnit;
    const start = Math.floor((value - range) / minorStep) * minorStep;
    for (let v = start; v <= value + range; v += minorStep) {
      const y = h / 2 - (v - value) * pxPerUnit;
      const major = Math.abs(v % labelStep) < 1e-6;
      const len = major ? 14 : 7;
      c.beginPath();
      if (align === 'left') { c.moveTo(w - len, y); c.lineTo(w, y); } else { c.moveTo(0, y); c.lineTo(len, y); }
      c.stroke();
      if (major) {
        c.textAlign = align === 'left' ? 'right' : 'left';
        c.fillText(fmt(v), align === 'left' ? w - 18 : 18, y);
      }
    }
    if (redAbove !== undefined) {
      const y = h / 2 - (redAbove - value) * pxPerUnit;
      if (y > 0) {
        c.fillStyle = 'rgba(255,60,80,.8)';
        c.fillRect(align === 'left' ? w - 5 : 0, 0, 5, Math.min(h, y));
      }
    }
    // Readout box.
    c.fillStyle = '#050b14';
    c.strokeStyle = '#5fd4ff';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(4, h / 2 - 15, w - 8, 30, 6);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = '800 16px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.fillText(fmt(value), w / 2, h / 2 + 1);
  }

  drawHeading(heading: number): void {
    const c = this.ctx;
    if (!c) return;
    const { w, h } = this;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(6,14,26,0.6)';
    c.fillRect(0, 0, w, h);
    const ppd = 5;
    c.strokeStyle = '#cfe9ff';
    c.fillStyle = '#eaf6ff';
    c.font = '600 12px ui-monospace, Menlo, monospace';
    c.textAlign = 'center';
    c.textBaseline = 'top';
    const range = w / 2 / ppd;
    for (let d = Math.floor((heading - range) / 5) * 5; d <= heading + range; d += 5) {
      const x = w / 2 + (d - heading) * ppd;
      const norm = ((d % 360) + 360) % 360;
      const major = norm % 10 === 0;
      c.beginPath();
      c.moveTo(x, h);
      c.lineTo(x, h - (major ? 12 : 6));
      c.stroke();
      if (norm % 30 === 0) {
        const card = norm === 0 ? 'N' : norm === 90 ? 'E' : norm === 180 ? 'S' : norm === 270 ? 'W' : pad3(norm);
        c.fillStyle = card.length === 1 ? '#5fd4ff' : '#eaf6ff';
        c.fillText(card, x, 4);
      }
    }
    c.fillStyle = '#050b14';
    c.strokeStyle = '#5fd4ff';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(w / 2 - 26, 2, 52, 20, 5);
    c.fill();
    c.stroke();
    c.fillStyle = '#fff';
    c.font = '800 13px ui-monospace, Menlo, monospace';
    c.fillText(pad3(heading), w / 2, 5);
  }
}

/** Glass-cockpit style HUD bound to the HudViewModel. DOM is built once; updates only mutate text/transforms. */
export class FlightHUD {
  readonly root = el('div');
  private readonly speed = new Tape(92, 260);
  private readonly alt = new Tape(92, 260);
  private readonly hdg = new Tape(380, 40);
  private readonly horizon: SVGGElement;
  private readonly refs: Record<string, HTMLElement> = {};
  private accumulator = 0;

  constructor(container: HTMLElement) {
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div class="hud-top-left glass"><img data-r="logo" alt=""><div><div class="cs" data-r="callsign"></div><div class="sub" data-r="ident"></div><div class="sub" data-r="airport"></div></div></div>
      <div class="hud-top-right glass"><div class="mode" data-r="camera">CHASE</div><div data-r="status">ON GROUND</div><div data-r="gs"></div><div data-r="fps"></div></div>
      <div class="hud-warnings" data-r="warnings"></div>
      <div class="heading-tape" data-r="hdg"></div>
      <div class="hud-center">
        <div class="tape glass" data-r="spd"><div class="tape-label">IAS KT</div></div>
        <div class="adi" data-r="adi"></div>
        <div class="tape glass" data-r="alt"><div class="tape-label">ALT FT</div></div>
        <div class="vsi glass"><span>VS</span><div class="bar-wrap"><div class="bar" data-r="vsbar"></div></div><span class="val" data-r="vs">0</span></div>
      </div>
      <div class="hud-systems glass">
        <div class="sys-row"><span class="k">THRUST</span><span class="v" data-r="thr">0%</span></div>
        <div class="thr" data-r="thrbar"><div></div></div>
        <div class="sys-row"><span class="k">FLAPS</span><span class="v" data-r="flaps">UP</span></div>
        <div class="sys-row"><span class="k">GEAR</span><span class="v" data-r="gear">DOWN</span></div>
        <div class="sys-row"><span class="k">BRAKES</span><span class="v" data-r="brakes">SET</span></div>
        <div class="sys-row"><span class="k">RADIO ALT</span><span class="v" data-r="ra">0</span></div>
      </div>
      <div class="hud-hint glass">W/S pitch · A/D roll · Q/E yaw<br>SHIFT/CTRL thrust · G gear · F flaps<br>SPACE brakes · C camera · ESC menu</div>`;
    this.root.querySelectorAll<HTMLElement>('[data-r]').forEach((n) => { this.refs[n.dataset['r'] ?? ''] = n; });
    this.ref('spd').appendChild(this.speed.canvas);
    this.ref('alt').appendChild(this.alt.canvas);
    this.ref('hdg').appendChild(this.hdg.canvas);
    this.horizon = this.buildAdi(this.ref('adi'));
    container.appendChild(this.root);
  }

  private ref(name: string): HTMLElement {
    const r = this.refs[name];
    if (!r) throw new Error(`HUD element ${name} missing`);
    return r;
  }

  private buildAdi(host: HTMLElement): SVGGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '-140 -140 280 280');
    const g = document.createElementNS(SVG_NS, 'g');
    let ladder = '';
    for (let d = -60; d <= 60; d += 5) {
      if (d === 0) continue;
      const y = -d * PX_PER_DEG;
      const w = d % 10 === 0 ? 36 : 18;
      ladder += `<line x1="${-w}" y1="${y}" x2="${w}" y2="${y}" stroke="#fff" stroke-width="1.6" ${d < 0 ? 'stroke-dasharray="6 4"' : ''}/>`;
      if (d % 10 === 0) ladder += `<text x="${w + 6}" y="${y + 4}" fill="#fff" font-size="11" font-family="monospace">${Math.abs(d)}</text><text x="${-w - 20}" y="${y + 4}" fill="#fff" font-size="11" font-family="monospace">${Math.abs(d)}</text>`;
    }
    g.innerHTML = `<rect x="-600" y="-1200" width="1200" height="1200" fill="#2f7fd0"/><rect x="-600" y="0" width="1200" height="1200" fill="#7a5230"/>
      <line x1="-600" y1="0" x2="600" y2="0" stroke="#fff" stroke-width="2"/>${ladder}
      <path d="M0 -118 l-8 -12 h16 z" fill="#fff"/>`;
    svg.appendChild(g);
    let scale = '';
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
      const len = a % 30 === 0 ? 14 : 8;
      scale += `<line x1="0" y1="-132" x2="0" y2="${-132 + len}" stroke="#fff" stroke-width="2" transform="rotate(${a})"/>`;
    }
    const fixed = document.createElementNS(SVG_NS, 'g');
    fixed.innerHTML = `${scale}<path d="M-80 0 h45 l10 12 M80 0 h-45 l-10 12" stroke="#ffd24a" stroke-width="5" fill="none" stroke-linejoin="round"/><rect x="-4" y="-4" width="8" height="8" fill="#ffd24a"/>`;
    svg.appendChild(fixed);
    host.appendChild(svg);
    return g;
  }

  setIdentity(airline: Airline, aircraftName: string, airportText: string): void {
    const img = this.ref('logo');
    if (img instanceof HTMLImageElement) img.src = logoDataUrl(airline, 80);
    this.ref('callsign').textContent = `${airline.callsign} · ${airline.flightNumber}`;
    this.ref('ident').textContent = `${airline.name} · ${aircraftName} · ${airline.registration}`;
    this.ref('airport').textContent = airportText;
  }

  setCameraMode(mode: CameraMode): void {
    this.ref('camera').textContent = mode;
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setFps(text: string): void {
    this.ref('fps').textContent = text;
  }

  /** Called every frame; redraws at ~20 Hz to keep DOM/canvas work bounded. */
  update(vm: HudViewModel, dt: number): void {
    this.accumulator += dt;
    if (this.accumulator < 0.05) return;
    this.accumulator = 0;
    this.horizon.setAttribute('transform', `rotate(${(-vm.bankDeg).toFixed(2)}) translate(0 ${(vm.pitchDeg * PX_PER_DEG).toFixed(2)})`);
    this.speed.drawVertical(Math.max(0, vm.iasKt), 3, 10, 20, (v) => String(Math.max(0, Math.round(v))), 'left', 350);
    this.alt.drawVertical(vm.altitudeFt, 0.3, 100, 500, (v) => String(Math.round(v)), 'right');
    this.hdg.drawHeading(vm.headingDeg);
    const vs = Math.round(vm.verticalSpeedFpm / 10) * 10;
    this.ref('vs').textContent = vs > 0 ? `+${vs}` : String(vs);
    const frac = Math.max(-1, Math.min(1, vm.verticalSpeedFpm / 3000));
    const bar = this.ref('vsbar');
    bar.style.top = frac >= 0 ? `${50 - frac * 50}%` : '50%';
    bar.style.height = `${Math.abs(frac) * 50}%`;
    bar.style.background = Math.abs(vm.verticalSpeedFpm) > 2000 ? 'var(--amber)' : 'var(--cyan)';
    this.ref('thr').textContent = `${vm.throttlePct}%`;
    this.ref('thrbar').style.setProperty('--t', String(vm.throttlePct / 100));
    this.ref('flaps').textContent = vm.flaps;
    const gear = this.ref('gear');
    gear.textContent = vm.gear;
    gear.className = `v ${vm.gear === 'DOWN' ? 'on' : vm.gear === 'UP' ? 'off' : 'amber'}`;
    const brakes = this.ref('brakes');
    brakes.textContent = vm.brakes ? 'SET' : 'OFF';
    brakes.className = `v ${vm.brakes ? 'amber' : 'off'}`;
    this.ref('ra').textContent = vm.radioAltFt < 2500 ? String(Math.round(vm.radioAltFt)) : '----';
    this.ref('status').textContent = vm.onGround ? 'ON GROUND' : 'AIRBORNE';
    this.ref('gs').textContent = `GS ${Math.round(vm.gsKt)} KT · M ${vm.mach.toFixed(2)}`;
    const warnings: string[] = [];
    if (vm.stall) warnings.push('<span class="warn red">STALL</span>');
    else if (vm.stallWarning) warnings.push('<span class="warn amber">STALL WARNING</span>');
    if (vm.overspeed) warnings.push('<span class="warn red">OVERSPEED</span>');
    if (vm.gearWarning) warnings.push('<span class="warn red">GEAR UP</span>');
    if (vm.offRunway) warnings.push('<span class="warn amber">OFF RUNWAY</span>');
    const html = warnings.join('');
    const w = this.ref('warnings');
    if (w.innerHTML !== html) w.innerHTML = html;
  }

  dispose(): void {
    this.root.remove();
  }
}
