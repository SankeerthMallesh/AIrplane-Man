/** Centralised runtime configuration. The Google key is browser-facing (Vite inlines VITE_ vars). */
export const PHYSICS_HZ = 120;
export const MAX_FRAME_DELTA_S = 0.25;
export const TILES_CONNECT_TIMEOUT_MS = 15000;
export const TILES_INITIAL_LOAD_TIMEOUT_MS = 25000;
export const TILE_ERROR_TARGET = { low: 28, medium: 18, high: 10 } as const;
export const PIXEL_RATIO_CAP = { low: 1, medium: 1.5, high: 2 } as const;

export interface ApiKeyStatus {
  readonly present: boolean;
  readonly key: string;
  readonly masked: string;
}

/** Validates the configured key shape without ever logging it in full. */
export function readGoogleApiKey(): ApiKeyStatus {
  const raw: unknown = import.meta.env['VITE_GOOGLE_MAPS_API_KEY'];
  const key = typeof raw === 'string' ? raw.trim() : '';
  const present = key.length >= 20 && key !== 'YOUR_GOOGLE_MAPS_API_KEY' && !/\s/.test(key);
  return { present, key: present ? key : '', masked: present ? `${key.slice(0, 4)}…${key.slice(-2)}` : '' };
}
