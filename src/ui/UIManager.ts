import { AIRLINES, type Airline } from '../data/airlines';
import { AIRPORTS, type AirportData, listRunwayEnds, findRunwayEnd } from '../data/airports';
import { ATLAS_AJ220 } from '../data/aircraft';
import { logoDataUrl } from '../aircraft/Logos';
import type { Settings } from '../app/Settings';
import { metersToFeet, feetToMeters } from '../utils/MathUtils';

export interface UIHandlers {
  start(): void; hangar(): void; openSettings(): void; mainMenu(): void;
  selectAirline(id: string): void; chooseAirport(): void; backToHangar(): void;
  selectAirport(iata: string): void; selectRunway(ident: string): void; launch(): void;
  resume(): void; returnHangar(): void; returnMenu(): void; restart(): void;
  settingsChanged(s: Settings): void; settingsClosed(): void;
  apiKeyContinue(): void; apiKeyDismiss(): void;
}

type Screen = 'menu' | 'hangar' | 'airports' | 'loading' | 'none';

const h = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  const e = t.content.firstElementChild;
  if (!(e instanceof HTMLElement)) throw new Error('template error');
  return e;
};

/** Owns every non-HUD DOM screen. Buttons only call handlers; app state lives in Application. */
export class UIManager {
  private readonly screens: Record<Exclude<Screen, 'none'>, HTMLElement>;
  private readonly modals: Record<'settings' | 'controls' | 'about' | 'pause' | 'apikey' | 'crash' | 'error', HTMLElement>;
  readonly notifications = h('<div id="notifications" aria-live="polite"></div>');
  readonly attribution = h('<div id="attribution" class="hidden"></div>');
  readonly debug = h('<div id="debug" class="hidden"></div>');

  constructor(root: HTMLElement, private readonly on: UIHandlers, private settings: Settings, tilesConfigured: boolean) {
    const chip = tilesConfigured
      ? '<span class="status-chip"><span class="dot ok"></span>Google 3D Tiles key configured</span>'
      : '<span class="status-chip"><span class="dot"></span>No Google Maps key · procedural world</span>';
    this.screens = {
      menu: h(`<section id="menu" class="screen"><div class="menu-inner">
        <div class="eyebrow">Browser flight simulation</div><h1 class="brand">ATLAS</h1><div class="brand-sub">FLIGHT SIMULATOR</div>
        <nav class="menu-list">
          <button class="btn primary" data-a="start">▶ Start flight</button>
          <button class="btn" data-a="hangar">Aircraft hangar</button>
          <button class="btn" data-a="settings">Settings</button>
          <button class="btn" data-a="controls">Controls</button>
          <button class="btn" data-a="about">About</button>
        </nav><div class="menu-foot">${chip}<span class="status-chip">AJ-220 · 6 fictional airlines · 5 airports</span></div></div></section>`),
      hangar: h(`<section id="hangar" class="screen"><aside class="info-panel" data-r="info"></aside>
        <div class="hangar-bottom"><button class="btn nav-btn" data-a="prev" aria-label="Previous airline">‹</button>
        <div class="airline-strip" data-r="strip" role="listbox" aria-label="Airlines"></div>
        <button class="btn nav-btn" data-a="next" aria-label="Next airline">›</button>
        <button class="btn" data-a="menu">Back</button><button class="btn primary" data-a="airport">Choose airport →</button></div></section>`),
      airports: h(`<section id="airports" class="screen"><div class="eyebrow">Step 2 of 2 · Departure</div><h2 class="section-title">Choose your airport</h2>
        <div class="airport-grid" data-r="grid"></div><div class="airport-detail" data-r="detail"></div>
        <div class="actions"><button class="btn" data-a="back">← Hangar</button><button class="btn primary" data-a="launch">Launch flight</button></div></section>`),
      loading: h(`<section id="loading" class="screen"><div class="loading-box"><div class="eyebrow" data-r="lsub">Preparing flight</div>
        <div class="loading-title" data-r="ltitle">Initializing world</div><div class="progress" data-r="lprog"><div></div></div>
        <div class="loading-steps" data-r="lsteps"></div></div></section>`),
    };
    const modal = (id: string, inner: string): HTMLElement => h(`<div class="modal-wrap hidden" id="${id}"><div class="modal" role="dialog" aria-modal="true">${inner}</div></div>`);
    this.modals = {
      settings: modal('settings', '<div class="eyebrow">Configuration</div><h2>Settings</h2><div data-r="settings-body"></div><div class="actions"><button class="btn primary" data-a="close-settings">Done</button></div>'),
      controls: modal('controls', `<div class="eyebrow">Reference</div><h2>Controls</h2><div class="keys">
        <span><kbd>W</kbd> / <kbd>S</kbd></span><span>Pitch up / down</span><span><kbd>A</kbd> / <kbd>D</kbd></span><span>Roll left / right</span>
        <span><kbd>Q</kbd> / <kbd>E</kbd></span><span>Yaw left / right (nose-wheel steering on ground)</span>
        <span><kbd>Shift</kbd> / <kbd>=</kbd></span><span>Increase thrust</span><span><kbd>Ctrl</kbd> / <kbd>-</kbd></span><span>Decrease thrust</span>
        <span><kbd>G</kbd></span><span>Landing gear</span><span><kbd>F</kbd></span><span>Cycle flaps UP → TAKEOFF → LANDING</span>
        <span><kbd>C</kbd></span><span>Cycle camera (chase, cockpit, orbit)</span><span><kbd>Space</kbd></span><span>Apply / release brakes</span>
        <span><kbd>Esc</kbd></span><span>Pause menu</span><span><kbd>R</kbd></span><span>Restart on runway</span><span><kbd>F3</kbd></span><span>Debug panel</span>
        <span>Mouse</span><span>Optional yoke (Settings). Orbit camera: drag to rotate, wheel to zoom, right-drag to pan.</span></div>
        <p>Takeoff: release brakes (Space), full thrust, rotate with W around 140 kt, then G for gear up and F for flaps up.</p>
        <div class="actions"><button class="btn primary" data-a="close-controls">Close</button></div>`),
      about: modal('about', `<div class="eyebrow">About</div><h2>Atlas Flight Simulator</h2>
        <p>A browser flight sim with a procedural airliner, six original fictional airlines and five real airports with runway geometry from OurAirports open data. When a Google Maps API key is configured the world streams Google Photorealistic 3D Tiles; otherwise a procedural world is used.</p>
        <p>The flight model is an arcade-simulation hybrid, not certified aircraft data. All airline names, codes and logos are fictional.</p>
        <div class="actions"><button class="btn primary" data-a="close-about">Close</button></div>`),
      pause: modal('pause', `<div class="eyebrow">Simulation paused</div><h2>Flight menu</h2><div class="stack">
        <button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="restart">Restart on runway</button>
        <button class="btn" data-a="p-settings">Settings</button><button class="btn" data-a="p-controls">Controls</button>
        <button class="btn" data-a="p-hangar">Return to hangar</button><button class="btn" data-a="p-menu">Return to main menu</button></div>`),
      apikey: modal('apikey', `<div class="eyebrow">Google Photorealistic 3D Tiles</div><h2>Missing Google Maps API key</h2>
        <p>Real-world terrain and buildings need a Google Maps Platform key with the <b>Map Tiles API</b> enabled.</p>
        <ol><li>Create <code>.env.local</code> in the project root.</li><li>Add <code>VITE_GOOGLE_MAPS_API_KEY=your_key</code></li>
        <li>Restrict the key to your site (HTTP referrer) and to the Map Tiles API; billing must be enabled.</li><li>Restart <code>npm run dev</code> — Vite reads env vars only at startup.</li></ol>
        <p>This key is embedded in the browser bundle, so treat it as public and rely on Google Cloud restrictions. You can fly now with the procedural world.</p>
        <div class="actions"><button class="btn" data-a="key-dismiss">Dismiss</button><button class="btn primary" data-a="key-continue">Continue in fallback mode</button></div>`),
      crash: modal('crash', `<div class="eyebrow">Flight ended</div><h2 data-r="crash-title">Crash detected</h2><p data-r="crash-text"></p>
        <div class="actions"><button class="btn" data-a="p-hangar">Hangar</button><button class="btn primary" data-a="restart">Restart on runway</button></div>`),
      error: modal('error', '<div class="eyebrow">Notice</div><h2 data-r="err-title"></h2><p data-r="err-text"></p><div class="actions"><button class="btn primary" data-a="close-error">OK</button></div>'),
    };
    for (const s of Object.values(this.screens)) { s.classList.add('hidden'); root.appendChild(s); }
    for (const m of Object.values(this.modals)) root.appendChild(m);
    root.append(this.notifications, this.attribution, this.debug);
    root.addEventListener('click', (e) => this.onClick(e));
    this.buildHangarStrip();
    this.buildAirportGrid();
    this.renderSettings();
  }

  private q(scope: HTMLElement, r: string): HTMLElement {
    const e = scope.querySelector<HTMLElement>(`[data-r="${r}"]`);
    if (!e) throw new Error(`UI ref ${r} missing`);
    return e;
  }

  private onClick(e: Event): void {
    const t = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-a]') : null;
    if (!t) return;
    const a = t.dataset['a'] ?? '';
    const o = this.on;
    const map: Record<string, () => void> = {
      start: o.start, hangar: o.hangar, settings: o.openSettings, controls: () => this.showModal('controls', true), about: () => this.showModal('about', true),
      menu: o.mainMenu, airport: o.chooseAirport, back: o.backToHangar, launch: o.launch,
      prev: () => this.stepAirline(-1), next: () => this.stepAirline(1),
      'close-settings': () => { this.showModal('settings', false); o.settingsClosed(); },
      'close-controls': () => this.showModal('controls', false), 'close-about': () => this.showModal('about', false), 'close-error': () => this.showModal('error', false),
      resume: o.resume, restart: o.restart, 'p-settings': o.openSettings, 'p-controls': () => this.showModal('controls', true), 'p-hangar': o.returnHangar, 'p-menu': o.returnMenu,
      'key-continue': o.apiKeyContinue, 'key-dismiss': o.apiKeyDismiss,
      airline: () => o.selectAirline(t.dataset['id'] ?? ''), apt: () => o.selectAirport(t.dataset['id'] ?? ''), rwy: () => o.selectRunway(t.dataset['id'] ?? ''),
    };
    map[a]?.();
  }

  private currentAirlineId = AIRLINES[0]?.id ?? '';
  private stepAirline(d: number): void {
    const i = AIRLINES.findIndex((a) => a.id === this.currentAirlineId);
    const next = AIRLINES[(i + d + AIRLINES.length) % AIRLINES.length];
    if (next) this.on.selectAirline(next.id);
  }

  showScreen(s: Screen): void {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== s);
  }

  showModal(name: keyof UIManager['modals'], show: boolean): void {
    this.modals[name].classList.toggle('hidden', !show);
    if (show) this.modals[name].querySelector<HTMLElement>('button')?.focus();
  }

  hideAllModals(): void {
    for (const m of Object.values(this.modals)) m.classList.add('hidden');
  }

  showError(title: string, text: string): void {
    this.q(this.modals.error, 'err-title').textContent = title;
    this.q(this.modals.error, 'err-text').textContent = text;
    this.showModal('error', true);
  }

  showCrash(reason: string): void {
    this.q(this.modals.crash, 'crash-text').textContent = reason;
    this.showModal('crash', true);
  }

  private buildHangarStrip(): void {
    const strip = this.q(this.screens.hangar, 'strip');
    strip.innerHTML = AIRLINES.map((a) => `<button class="card" role="option" data-a="airline" data-id="${a.id}" aria-pressed="false">
      <img src="${logoDataUrl(a, 76)}" alt=""><span><span class="t">${a.name}</span><br><span class="s">${a.callsign}</span></span></button>`).join('');
  }

  setAirline(a: Airline): void {
    this.currentAirlineId = a.id;
    document.documentElement.style.setProperty('--accent', a.uiAccent);
    this.screens.hangar.querySelectorAll<HTMLElement>('[data-a="airline"]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset['id'] === a.id)));
    const cfg = ATLAS_AJ220;
    const sw = [a.palette.fuselageTop, a.palette.belly, a.palette.stripe, a.palette.tailBase, a.palette.logoPrimary, a.palette.engine]
      .map((c) => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('');
    this.q(this.screens.hangar, 'info').innerHTML = `
      <img class="info-logo" src="${logoDataUrl(a, 168)}" alt="${a.name} logo"><div class="eyebrow">${a.description}</div>
      <h2 class="info-name">${a.name}</h2><div style="color:var(--accent);font-style:italic">“${a.slogan}”</div>
      <div class="info-meta"><div class="meta"><span class="eyebrow">Callsign</span><b>${a.callsign}</b></div><div class="meta"><span class="eyebrow">Code*</span><b>${a.code}</b></div>
      <div class="meta"><span class="eyebrow">Aircraft</span><b>${cfg.name}</b></div><div class="meta"><span class="eyebrow">Registration</span><b>${a.registration}</b></div>
      <div class="meta"><span class="eyebrow">MTOW (sim)</span><b>${(cfg.massKg / 1000).toFixed(0)} t</b></div><div class="meta"><span class="eyebrow">Thrust</span><b>2 × ${(cfg.maxThrustPerEngineN / 1000).toFixed(0)} kN</b></div>
      <div class="meta"><span class="eyebrow">Wing area</span><b>${cfg.wingAreaM2} m²</b></div><div class="meta"><span class="eyebrow">Span</span><b>${cfg.wingSpanM} m</b></div></div>
      <div><div class="eyebrow">Fleet</div>${a.fleet}</div><div><div class="eyebrow">Brand</div>${a.personality}</div>
      <div><div class="eyebrow">Livery palette</div><div class="swatches">${sw}</div></div>
      <div class="fictional-note">*Fictional airline and code, not an IATA assignment. ${cfg.manufacturer}. Performance values are game tuning, not certified data.</div>`;
  }

  private buildAirportGrid(): void {
    this.q(this.screens.airports, 'grid').innerHTML = AIRPORTS.map((a) => `<button class="airport-card" data-a="apt" data-id="${a.iata}" aria-pressed="false">
      <span class="code">${a.iata}</span><span class="n">${a.name}</span><span class="c">${a.city}, ${a.country} · ${a.icao}</span></button>`).join('');
  }

  setAirport(a: AirportData, runwayIdent: string): void {
    this.screens.airports.querySelectorAll<HTMLElement>('[data-a="apt"]').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset['id'] === a.iata)));
    const sel = findRunwayEnd(a, runwayIdent);
    const chips = listRunwayEnds(a).map((id) => `<button class="chip" data-a="rwy" data-id="${id}" aria-pressed="${id === runwayIdent}">${id}</button>`).join('');
    const rw = sel ? `Runway ${sel.runway.id} · ${sel.runway.lengthFt.toLocaleString()} × ${sel.runway.widthFt} ft (${Math.round(feetToMeters(sel.runway.lengthFt))} × ${Math.round(feetToMeters(sel.runway.widthFt))} m) · ${sel.runway.surface.toUpperCase()}` : '';
    this.q(this.screens.airports, 'detail').innerHTML = `
      <div><div class="eyebrow">${a.icao} / ${a.iata}</div><h3 style="margin:6px 0">${a.name}</h3><div style="color:var(--muted)">${a.city}, ${a.country}</div>
      <p style="color:#c3cfde">${a.description}</p><div class="rw-detail">Elevation ${a.elevationFt} ft (${metersToFeet(0) + Math.round(feetToMeters(a.elevationFt))} m) · ARP ${a.latitudeDeg.toFixed(4)}, ${a.longitudeDeg.toFixed(4)}<br>Data: ${a.source}</div></div>
      <div><div class="eyebrow">Departure runway</div><div class="chips">${chips}</div><div class="rw-detail">${rw}</div></div>`;
  }

  setLoading(title: string, steps: Array<{ text: string; state: 'done' | 'active' | 'todo' }>, progress: number | null): void {
    const s = this.screens.loading;
    this.q(s, 'ltitle').textContent = title;
    this.q(s, 'lsteps').innerHTML = steps.map((st) => `<div class="${st.state}">${st.state === 'done' ? '✓' : st.state === 'active' ? '›' : '·'} ${st.text}</div>`).join('');
    const bar = this.q(s, 'lprog');
    bar.classList.toggle('determinate', progress !== null);
    const inner = bar.firstElementChild;
    if (inner instanceof HTMLElement) inner.style.width = progress !== null ? `${Math.round(progress * 100)}%` : '';
  }

  notify(text: string, kind: 'info' | 'warn' | 'bad' | 'good' = 'info', ms = 3200): void {
    const t = h(`<div class="toast ${kind}"></div>`);
    t.textContent = text;
    this.notifications.appendChild(t);
    while (this.notifications.children.length > 4) this.notifications.firstElementChild?.remove();
    window.setTimeout(() => t.remove(), ms);
  }

  setAttribution(text: string | null): void {
    this.attribution.classList.toggle('hidden', text === null);
    if (text !== null) this.attribution.innerHTML = `<span class="g">Google</span><span></span>`;
    const span = this.attribution.lastElementChild;
    if (text !== null && span) span.textContent = text;
  }

  setDebug(text: string | null): void {
    this.debug.classList.toggle('hidden', text === null);
    if (text !== null) this.debug.textContent = text;
  }

  private renderSettings(): void {
    const s = this.settings;
    const body = this.q(this.modals.settings, 'settings-body');
    const range = (k: keyof Settings, label: string, min: number, max: number, step: number): string =>
      `<label class="setting">${label}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${String(s[k])}"></label>`;
    const check = (k: keyof Settings, label: string): string => `<label class="setting">${label}<input type="checkbox" data-k="${k}" ${s[k] ? 'checked' : ''}></label>`;
    body.innerHTML = `
      <label class="setting">Graphics quality<select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      ${check('shadows', 'Shadows')}${check('hudVisible', 'HUD visible')}${check('debugPanel', 'Performance / debug panel (F3)')}
      ${check('audioEnabled', 'Audio')}${range('masterVolume', 'Master volume', 0, 1, 0.05)}${range('engineVolume', 'Engine volume', 0, 1, 0.05)}${range('windVolume', 'Wind volume', 0, 1, 0.05)}
      ${check('mouseYoke', 'Mouse yoke (pitch/roll from mouse position)')}${range('mouseSensitivity', 'Mouse yoke sensitivity', 0.3, 2, 0.05)}
      ${range('cameraSensitivity', 'Orbit camera sensitivity', 0.3, 2.5, 0.05)}${range('chaseDistance', 'Chase camera distance', 25, 90, 1)}
      ${range('flightAssist', 'Flight assist (rate hold, auto-trim, bank limit)', 0, 1, 0.05)}`;
    const select = body.querySelector<HTMLSelectElement>('select');
    if (select) select.value = s.quality;
    body.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
      const k = t.dataset['k'];
      if (!k || !(k in s)) return;
      const next: Settings = { ...this.settings };
      if (t instanceof HTMLInputElement && t.type === 'checkbox') Object.assign(next, { [k]: t.checked });
      else if (t instanceof HTMLInputElement) Object.assign(next, { [k]: Number(t.value) });
      else if (t.value === 'low' || t.value === 'medium' || t.value === 'high') next.quality = t.value;
      this.settings = next;
      this.on.settingsChanged(next);
    });
  }
}
