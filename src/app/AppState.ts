export type AppState =
  | 'BOOT' | 'MAIN_MENU' | 'HANGAR' | 'AIRPORT_SELECTION' | 'FLIGHT_CONFIGURATION' | 'LOADING' | 'FLIGHT' | 'PAUSED' | 'SETTINGS';

/** Allowed transitions. SETTINGS is a modal that returns to wherever it was opened from. */
const TRANSITIONS: Readonly<Record<AppState, readonly AppState[]>> = {
  BOOT: ['MAIN_MENU'],
  MAIN_MENU: ['HANGAR', 'SETTINGS'],
  HANGAR: ['MAIN_MENU', 'AIRPORT_SELECTION', 'SETTINGS'],
  AIRPORT_SELECTION: ['HANGAR', 'MAIN_MENU', 'FLIGHT_CONFIGURATION'],
  FLIGHT_CONFIGURATION: ['LOADING', 'AIRPORT_SELECTION'],
  LOADING: ['FLIGHT', 'AIRPORT_SELECTION', 'MAIN_MENU'],
  FLIGHT: ['PAUSED', 'LOADING'],
  PAUSED: ['FLIGHT', 'HANGAR', 'MAIN_MENU', 'SETTINGS', 'LOADING'],
  SETTINGS: ['MAIN_MENU', 'HANGAR', 'PAUSED'],
};

export class AppStateManager {
  private current: AppState = 'BOOT';
  private readonly listeners: Array<(next: AppState, prev: AppState) => void> = [];

  get state(): AppState {
    return this.current;
  }

  canTransition(to: AppState): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  transition(to: AppState): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[AppState] rejected transition ${this.current} -> ${to}`);
      return false;
    }
    const prev = this.current;
    this.current = to;
    for (const l of this.listeners) l(to, prev);
    return true;
  }

  onChange(listener: (next: AppState, prev: AppState) => void): void {
    this.listeners.push(listener);
  }
}
