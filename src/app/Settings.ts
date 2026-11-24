import type { QualityLevel } from '../world/Environment';

export interface Settings {
  audioEnabled: boolean;
  masterVolume: number;
  engineVolume: number;
  windVolume: number;
  mouseYoke: boolean;
  mouseSensitivity: number;
  cameraSensitivity: number;
  chaseDistance: number;
  quality: QualityLevel;
  shadows: boolean;
  hudVisible: boolean;
  debugPanel: boolean;
  flightAssist: number;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  audioEnabled: true, masterVolume: 0.7, engineVolume: 0.8, windVolume: 0.6,
  mouseYoke: false, mouseSensitivity: 1, cameraSensitivity: 1, chaseDistance: 42,
  quality: 'medium', shadows: true, hudVisible: true, debugPanel: false, flightAssist: 0.7,
};

const KEY = 'atlas-flight-sim.settings.v1';

/** Settings persisted in localStorage as a per-viewer convenience; failures fall back to defaults. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const out: Settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
      const v = (parsed as Record<string, unknown>)[key];
      if (typeof v === typeof DEFAULT_SETTINGS[key]) Object.assign(out, { [key]: v });
    }
    return out;
  } catch (err) {
    console.warn('[Settings] could not read saved settings, using defaults', err);
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (err) {
    console.warn('[Settings] could not persist settings', err);
  }
}
