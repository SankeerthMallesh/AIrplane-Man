import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, Timer, WebGLRenderer } from 'three';
import { AIRLINES, findAirline, type Airline } from '../data/airlines';
import { AIRPORTS, findAirport, findRunwayEnd, type AirportData } from '../data/airports';
import { ATLAS_AJ220 } from '../data/aircraft';
import { AppStateManager, type AppState } from './AppState';
import { HangarScene } from './HangarScene';
import { FlightSession } from './FlightSession';
import { loadSettings, saveSettings, type Settings } from './Settings';
import { MAX_FRAME_DELTA_S, PHYSICS_HZ, PIXEL_RATIO_CAP, TILES_CONNECT_TIMEOUT_MS, TILES_INITIAL_LOAD_TIMEOUT_MS, readGoogleApiKey } from './ApplicationConfig';
import { UIManager } from '../ui/UIManager';
import { FlightHUD } from '../ui/FlightHUD';
import { formatFlightData } from '../ui/FlightDataFormatter';
import { InputManager } from '../input/InputManager';
import { AudioManager } from '../audio/AudioManager';
import type { FlightEvent } from '../physics/FlightModel';
import type { FlightAction } from '../input/ControlState';
import { mpsToFpm } from '../utils/MathUtils';

/**
 * Application root: owns the renderer, the single requestAnimationFrame loop and the state machine.
 * Per-frame order in FLIGHT: input → fixed-step physics (120 Hz) → visual sync/cameras → tiles →
 * audio → HUD → render.
 */
export class Application {
  private readonly renderer: WebGLRenderer;
  private readonly states = new AppStateManager();
  private readonly timer = new Timer();
  private readonly hangar = new HangarScene();
  private readonly ui: UIManager;
  private readonly hud: FlightHUD;
  private readonly input: InputManager;
  private readonly audio = new AudioManager();
  private settings: Settings = loadSettings();
  private readonly apiKey = readGoogleApiKey();
  private airline: Airline;
  private airport: AirportData;
  private runwayIdent: string;
  private session: FlightSession | null = null;
  private accumulator = 0;
  private settingsReturn: AppState = 'MAIN_MENU';
  private apiKeyAcknowledged = false;
  private loadToken = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private attributionTimer = 0;
  private pendingCrash: string | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    console.info('[Renderer] initialized');
    this.airline = AIRLINES[0] ?? fail('no airlines');
    this.airport = AIRPORTS[0] ?? fail('no airports');
    this.runwayIdent = this.airport.defaultRunwayEnd;
    this.ui = new UIManager(uiRoot, this.handlers(), this.settings, this.apiKey.present);
    this.hud = new FlightHUD(uiRoot);
    this.hud.setVisible(false);
    this.input = new InputManager(canvas);
    this.input.onGlobalAction = (a) => this.onGlobalAction(a);
    this.selectAirline(this.airline.id);
    this.selectAirport(this.airport.iata);
    this.applySettings(this.settings);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.states.state === 'FLIGHT') this.pause();
      this.timer.reset();
    });
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    this.states.onChange((next) => this.onStateChanged(next));
    this.resize();
    this.states.transition('MAIN_MENU');
    console.info('[App] application initialized', this.apiKey.present ? `(Google key ${this.apiKey.masked})` : '(no Google key)');
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private handlers(): ConstructorParameters<typeof UIManager>[1] {
    return {
      start: () => this.go('HANGAR'),
      hangar: () => this.go('HANGAR'),
      openSettings: () => { this.settingsReturn = this.states.state; if (this.go('SETTINGS')) this.ui.showModal('settings', true); },
      settingsClosed: () => this.go(this.settingsReturn),
      mainMenu: () => this.go('MAIN_MENU'),
      selectAirline: (id) => this.selectAirline(id),
      chooseAirport: () => this.go('AIRPORT_SELECTION'),
      backToHangar: () => this.go('HANGAR'),
      selectAirport: (iata) => this.selectAirport(iata),
      selectRunway: (id) => { this.runwayIdent = id; this.ui.setAirport(this.airport, id); },
      launch: () => this.requestLaunch(),
      resume: () => this.resume(),
      restart: () => this.restartFlight(),
      returnHangar: () => this.endFlight('HANGAR'),
      returnMenu: () => this.endFlight('MAIN_MENU'),
      settingsChanged: (s) => this.applySettings(s),
      apiKeyContinue: () => { this.apiKeyAcknowledged = true; this.ui.showModal('apikey', false); this.launch(); },
      apiKeyDismiss: () => { this.apiKeyAcknowledged = true; this.ui.showModal('apikey', false); },
    };
  }

  private go(to: AppState): boolean {
    return this.states.transition(to);
  }

  private onStateChanged(s: AppState): void {
    const screen = s === 'MAIN_MENU' ? 'menu' : s === 'HANGAR' ? 'hangar' : s === 'AIRPORT_SELECTION' ? 'airports' : s === 'LOADING' ? 'loading' : null;
    if (screen) this.ui.showScreen(screen);
    else if (s === 'FLIGHT' || s === 'PAUSED') this.ui.showScreen('none');
    if (s === 'MAIN_MENU' || s === 'HANGAR') this.hangar.mode = s === 'MAIN_MENU' ? 'menu' : 'hangar';
    this.input.flightActive = s === 'FLIGHT';
    if (s !== 'FLIGHT') this.input.state.releaseAll();
    this.hud.setVisible((s === 'FLIGHT' || s === 'PAUSED') && this.settings.hudVisible);
    this.ui.showModal('pause', s === 'PAUSED');
    this.audio.setPaused(s !== 'FLIGHT');
  }

  private selectAirline(id: string): void {
    const a = findAirline(id);
    if (!a) return;
    this.airline = a;
    this.hangar.setAirline(a);
    this.ui.setAirline(a);
  }

  private selectAirport(iata: string): void {
    const a = findAirport(iata);
    if (!a) return;
    this.airport = a;
    this.runwayIdent = a.defaultRunwayEnd;
    this.ui.setAirport(a, this.runwayIdent);
  }

  private requestLaunch(): void {
    this.audio.unlock();
    if (!this.apiKey.present && !this.apiKeyAcknowledged) {
      this.ui.showModal('apikey', true);
      return;
    }
    this.launch();
  }

  /** Validates the configuration, then builds the flight while the loading overlay is shown. */
  private launch(): void {
    const airline = findAirline(this.airline.id);
    const airport = findAirport(this.airport.iata);
    const selection = airport ? findRunwayEnd(airport, this.runwayIdent) : undefined;
    if (!airline || !airport || !selection) {
      this.ui.showError('Invalid flight configuration', 'Please choose a valid airline, airport and runway.');
      return;
    }
    if (!this.go('FLIGHT_CONFIGURATION') || !this.go('LOADING')) return;
    void this.buildFlight(airline, airport, selection);
  }

  private async buildFlight(airline: Airline, airport: AirportData, selection: NonNullable<ReturnType<typeof findRunwayEnd>>): Promise<void> {
    const token = ++this.loadToken;
    const steps = [
      { text: 'Validating configuration', state: 'done' as const },
      { text: `Building ${airport.iata} runway ${this.runwayIdent} frame`, state: 'active' as 'done' | 'active' | 'todo' },
      { text: 'Building aircraft & livery', state: 'todo' as 'done' | 'active' | 'todo' },
      { text: this.apiKey.present ? 'Connecting to Google 3D Tiles' : 'Generating procedural world', state: 'todo' as 'done' | 'active' | 'todo' },
      { text: 'Loading terrain & nearby buildings', state: 'todo' as 'done' | 'active' | 'todo' },
    ];
    const show = (title: string, progress: number | null = null): void => this.ui.setLoading(title, steps, progress);
    show('Initializing world');
    await nextFrame();
    this.session?.dispose();
    let session: FlightSession;
    try {
      session = new FlightSession(airline, airport, selection, this.canvas, (e) => this.onFlightEvent(e));
    } catch (err) {
      console.error('[App] flight construction failed', err);
      this.ui.showError('Could not start flight', 'The aircraft or airport could not be constructed. Please try another selection.');
      this.go('AIRPORT_SELECTION');
      return;
    }
    this.session = session;
    session.rig.settings.chaseDistance = this.settings.chaseDistance;
    session.rig.settings.orbitSensitivity = this.settings.cameraSensitivity;
    session.rig.onModeChanged = (m) => this.hud.setCameraMode(m);
    session.physics.assist = this.settings.flightAssist;
    session.setQuality(this.settings.quality, this.settings.shadows);
    this.resize();
    steps[1]!.state = 'done'; steps[2]!.state = 'done'; steps[3]!.state = 'active';
    show('Preparing scenery');
    await nextFrame();
    if (token !== this.loadToken) return;

    if (this.apiKey.present) {
      const ok = await this.loadTiles(session, token, steps, show);
      if (token !== this.loadToken) return;
      if (!ok) session.useFallbackWorld();
    } else {
      session.useFallbackWorld();
      steps[3]!.state = 'done'; steps[4]!.state = 'done';
      show('Offline / procedural environment');
    }
    this.ui.setAttribution(session.tiles ? '' : null);
    this.hud.setIdentity(airline, ATLAS_AJ220.name, `${airport.iata} · RWY ${this.runwayIdent} · ${airport.city}`);
    this.hud.setCameraMode(session.rig.mode);
    this.input.state.throttle = 0;
    this.accumulator = 0;
    this.timer.reset();
    if (this.settings.audioEnabled) this.audio.start();
    this.go('FLIGHT');
    this.ui.notify(`${airline.callsign} ${airline.flightNumber.split(' ')[1] ?? ''} · cleared for takeoff RWY ${this.runwayIdent}`, 'good', 4500);
    this.ui.notify('Brakes set — press SPACE to release, SHIFT for thrust', 'info', 6000);
    console.info('[App] flight started', airport.icao, this.runwayIdent, airline.id);
  }

  private async loadTiles(session: FlightSession, token: number, steps: Array<{ text: string; state: 'done' | 'active' | 'todo' }>, show: (t: string, p?: number | null) => void): Promise<boolean> {
    let status: 'connecting' | 'loading' | 'ready' | 'error' = 'connecting';
    let errorMessage = '';
    session.startTiles(this.apiKey.key, this.renderer, this.settings.quality, (e) => {
      if (e.status === 'error') { status = 'error'; errorMessage = e.message; }
      else if (e.status === 'loading' || e.status === 'ready') status = e.status;
    });
    session.syncVisual(1, 0);
    const start = performance.now();
    // Drive tile streaming from the loading loop; the main frame loop renders the scene behind the overlay.
    while (token === this.loadToken) {
      await nextFrame();
      const elapsed = performance.now() - start;
      const st: string = status;
      if (st === 'error') break;
      if (st === 'connecting' && elapsed > TILES_CONNECT_TIMEOUT_MS) { errorMessage = 'Timed out connecting to Google 3D Tiles.'; status = 'error'; break; }
      if (st === 'loading') {
        steps[3]!.state = 'done'; steps[4]!.state = 'active';
        show('Loading terrain and nearby 3D buildings', session.tiles?.progress ?? null);
        session.calibrateTiles();
      }
      if (st === 'ready' || (st === 'loading' && elapsed > TILES_INITIAL_LOAD_TIMEOUT_MS)) {
        const offset = session.calibrateTiles();
        if (offset !== null) console.info(`[GoogleTiles] vertical calibration offset ${offset.toFixed(1)} m`);
        steps[4]!.state = 'done';
        show('World ready', 1);
        return true;
      }
    }
    session.stopTiles();
    this.ui.notify('Google 3D Tiles unavailable — using procedural world', 'warn', 6000);
    this.ui.showError('Google 3D Tiles unavailable', `${errorMessage} The flight continues with the procedural fallback world.`);
    steps[3]!.state = 'done'; steps[4]!.state = 'done';
    show('Offline / procedural environment');
    return false;
  }

  private onFlightEvent(e: FlightEvent): void {
    switch (e.type) {
      case 'takeoff': this.ui.notify('TAKEOFF — positive rate', 'good'); break;
      case 'landing':
        this.ui.notify(`${e.hard ? 'HARD LANDING' : 'TOUCHDOWN'} · ${Math.round(mpsToFpm(e.sinkRateMps))} fpm${e.onRunway ? '' : ' · OFF RUNWAY'}`, e.hard || !e.onRunway ? 'warn' : 'good', 5000);
        break;
      case 'stall': this.ui.notify('STALL — lower the nose, add thrust', 'bad'); break;
      case 'stall-recovered': this.ui.notify('Stall recovered', 'good', 2000); break;
      case 'runway-departure': this.ui.notify('RUNWAY DEPARTURE', 'warn'); break;
      case 'gear-blocked': this.ui.notify('Gear locked down on ground', 'warn', 2000); break;
      case 'flap-overspeed': this.ui.notify('Flap overspeed — slow down', 'warn'); break;
      case 'crash': this.pendingCrash = e.reason; break;
    }
  }

  private onGlobalAction(a: FlightAction): void {
    if (a === 'toggleDebug') {
      this.settings = { ...this.settings, debugPanel: !this.settings.debugPanel };
      saveSettings(this.settings);
      if (!this.settings.debugPanel) this.ui.setDebug(null);
      return;
    }
    const s = this.states.state;
    if (s === 'FLIGHT') this.pause();
    else if (s === 'PAUSED') this.resume();
    else if (s === 'SETTINGS') { this.ui.showModal('settings', false); this.go(this.settingsReturn); }
    else this.ui.hideAllModals();
  }

  private pause(): void {
    if (this.go('PAUSED')) this.audio.setPaused(true);
  }

  private resume(): void {
    if (this.states.state === 'PAUSED' && this.go('FLIGHT')) {
      this.ui.hideAllModals();
      this.timer.reset();
      this.accumulator = 0;
    }
  }

  private restartFlight(): void {
    if (!this.session) return;
    this.ui.hideAllModals();
    this.session.restart();
    this.input.state.throttle = 0;
    this.pendingCrash = null;
    if (this.states.state === 'PAUSED') this.go('FLIGHT');
    this.ui.notify('Repositioned on runway', 'info');
  }

  private endFlight(to: 'HANGAR' | 'MAIN_MENU'): void {
    this.loadToken++;
    this.ui.hideAllModals();
    if (!this.go(to)) return;
    this.audio.stop();
    this.session?.dispose();
    this.session = null;
    this.ui.setAttribution(null);
    this.ui.setDebug(null);
    this.resize();
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP[s.quality]));
    this.renderer.shadowMap.enabled = s.shadows && s.quality !== 'low';
    this.audio.settings.enabled = s.audioEnabled;
    this.audio.settings.master = s.masterVolume;
    this.audio.settings.engine = s.engineVolume;
    this.audio.settings.wind = s.windVolume;
    this.audio.applyVolumes();
    if (s.audioEnabled && this.session && this.states.state !== 'LOADING') this.audio.start();
    this.input.yoke.enabled = s.mouseYoke;
    this.input.yoke.sensitivity = s.mouseSensitivity;
    if (this.session) {
      this.session.rig.settings.chaseDistance = s.chaseDistance;
      this.session.rig.settings.orbitSensitivity = s.cameraSensitivity;
      this.session.physics.assist = s.flightAssist;
      this.session.setQuality(s.quality, s.shadows);
    }
    const st = this.states.state;
    this.hud.setVisible((st === 'FLIGHT' || st === 'PAUSED' || (st === 'SETTINGS' && this.session !== null)) && s.hudVisible);
    if (!s.debugPanel) this.ui.setDebug(null);
    this.resize();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.hangar.resize(w / h);
    this.session?.resize(w / h, this.renderer);
  }

  private frame(time: number): void {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), MAX_FRAME_DELTA_S);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.5) { this.fps = this.fpsFrames / this.fpsTime; this.fpsFrames = 0; this.fpsTime = 0; }
    const s = this.states.state;
    const session = this.session;
    const inFlightScene = session && (s === 'FLIGHT' || s === 'PAUSED' || s === 'LOADING' || (s === 'SETTINGS' && this.settingsReturn === 'PAUSED'));
    if (!session || !inFlightScene) {
      this.hangar.update(dt);
      this.renderer.render(this.hangar.scene, this.hangar.camera);
      return;
    }
    let alpha = 1;
    if (s === 'FLIGHT') {
      this.input.yokeSuspended = session.rig.capturesMouse;
      this.input.update(dt);
      for (const a of this.input.state.consumeActions()) this.onFlightAction(a, session);
      const physics = session.physics;
      physics.setThrottle(this.input.state.throttle);
      const fixed = 1 / PHYSICS_HZ;
      this.accumulator += dt;
      const controls = { pitch: this.input.state.pitchOutput, roll: this.input.state.rollOutput, yaw: this.input.state.yawOutput };
      while (this.accumulator >= fixed) {
        physics.step(fixed, controls);
        this.accumulator -= fixed;
      }
      alpha = this.accumulator / fixed;
      if (this.pendingCrash) {
        const reason = this.pendingCrash;
        this.pendingCrash = null;
        this.ui.showCrash(reason);
        this.go('PAUSED');
        this.ui.showModal('pause', false);
        this.ui.showModal('crash', true);
      }
    }
    session.syncVisual(alpha, s === 'FLIGHT' ? dt : 0);
    session.tiles?.update(session.camera);
    const st = session.physics.state;
    this.audio.update(st.throttle, st.trueAirspeed);
    this.hud.update(formatFlightData(st, ATLAS_AJ220), dt);
    this.attributionTimer += dt;
    if (session.tiles && this.attributionTimer > 1) {
      this.attributionTimer = 0;
      this.ui.setAttribution(session.tiles.getAttributionText());
    }
    this.renderer.render(session.scene, session.camera);
    if (this.settings.debugPanel) this.updateDebug(session, dt);
  }

  private onFlightAction(a: FlightAction, session: FlightSession): void {
    const p = session.physics;
    switch (a) {
      case 'toggleGear': if (p.toggleGear()) this.ui.notify(p.state.gearDown ? 'GEAR DOWN' : 'GEAR UP', 'info', 1800); break;
      case 'cycleFlaps': p.cycleFlaps(); this.ui.notify(`FLAPS ${ATLAS_AJ220.flaps[p.state.flapIndex]?.name ?? ''}`, 'info', 1800); break;
      case 'cycleCamera': session.rig.cycle(); break;
      case 'toggleBrakes': p.toggleBrakes(); this.ui.notify(p.state.brakes ? 'BRAKES SET' : 'BRAKES RELEASED', 'info', 1500); break;
      case 'restart': this.restartFlight(); break;
      case 'pause': this.pause(); break;
      case 'toggleDebug': break;
    }
  }

  private updateDebug(session: FlightSession, dt: number): void {
    const s = session.physics.state;
    const info = this.renderer.info.render;
    const o = session.frame.ltp.origin;
    const f = (n: number, d = 1): string => n.toFixed(d);
    this.ui.setDebug(`RENDERING
 FPS ${f(this.fps, 0)}  frame ${f(dt * 1000)} ms
 calls ${info.calls}  tris ${info.triangles}
WORLD
 tiles ${session.tiles?.currentStatus ?? 'fallback'}
 camera ${session.rig.mode}
 origin ${f(o.latitudeDeg, 5)}, ${f(o.longitudeDeg, 5)}
 pos ${f(s.position.x)} ${f(s.position.y)} ${f(s.position.z)}
FLIGHT
 TAS ${f(s.trueAirspeed)} m/s  GS ${f(s.groundSpeed)}
 VS ${f(s.verticalSpeed)} m/s  ALT ${f(s.altitudeMslM)} m
 AoA ${f(s.alphaRad * 57.3)}°  β ${f(s.betaRad * 57.3)}°
 thr ${f(s.throttle * 100, 0)}%  thrust ${f(s.thrustN / 1000)} kN
 lift ${f(s.liftN / 1000)} kN  drag ${f(s.dragN / 1000)} kN
 gravity ${f(ATLAS_AJ220.massKg * 9.80665 / 1000)} kN (−Y)
 gear ${f(s.gearPosition, 2)}  flaps ${f(s.flapPosition, 2)}
PHYSICS
 ${PHYSICS_HZ} Hz  dt ${f(1000 / PHYSICS_HZ, 2)} ms
 wheels ${s.wheelsOnGround}  stall ${s.stalled}`);
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function fail(msg: string): never {
  throw new Error(msg);
}
