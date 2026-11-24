import { Camera, Matrix4, Raycaster, Vector3, WebGLRenderer, type Object3D } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';
import type { LocalTangentPlane } from '../geo/Geodesy';

export type TilesStatus = 'idle' | 'connecting' | 'loading' | 'ready' | 'error';

export interface TilesStatusEvent {
  readonly status: TilesStatus;
  readonly message: string;
}

/**
 * Google Photorealistic 3D Tiles via NASA-AMMOS 3DTilesRendererJS.
 *
 * Alignment: tiles are authored in ECEF. Instead of moving the camera into ECEF we place the
 * tiles group with the LocalTangentPlane's ECEF→local matrix (rows E, U, −N), so tile geometry
 * lands in the same East-Up-South frame as the runway and aircraft. Only the group transform is
 * set — tile-internal transforms are left to the renderer, so nothing is transformed twice.
 */
export class GoogleTilesManager {
  readonly tiles: TilesRenderer;
  private readonly draco = new DRACOLoader();
  private status: TilesStatus = 'idle';
  private readonly groundMatrix = new Matrix4();
  private disposed = false;

  constructor(apiKey: string, ltp: LocalTangentPlane, private readonly onStatus: (e: TilesStatusEvent) => void) {
    this.draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
    this.tiles = new TilesRenderer();
    this.tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
    this.tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.draco }));
    this.tiles.downloadQueue.maxJobsPerOrigin = 12;
    this.tiles.lruCache.maxBytesSize = 600 * 1024 * 1024;
    const group = this.tiles.group;
    ltp.getEcefToLocalMatrix(this.groundMatrix);
    this.groundMatrix.decompose(group.position, group.quaternion, group.scale);
    group.updateMatrixWorld(true);
    group.name = 'GoogleTiles';

    this.tiles.addEventListener('load-error', (e) => {
      // Root failures (bad key, API disabled, network) are fatal; individual tile errors are not.
      if (e.tile === null || this.status === 'connecting') {
        this.setStatus('error', describeError(e.error));
      } else {
        console.warn('[GoogleTiles] tile failed to load');
      }
    });
    this.tiles.addEventListener('load-root-tileset', () => this.setStatus('loading', 'Loading terrain and nearby 3D buildings…'));
    this.tiles.addEventListener('tiles-load-end', () => {
      if (this.status === 'loading') this.setStatus('ready', 'World ready');
    });
    this.setStatus('connecting', 'Connecting to Google Photorealistic 3D Tiles…');
    console.info('[GoogleTiles] initialization started');
  }

  get group(): Object3D {
    return this.tiles.group;
  }

  get currentStatus(): TilesStatus {
    return this.status;
  }

  get progress(): number {
    return this.tiles.loadProgress;
  }

  private setStatus(status: TilesStatus, message: string): void {
    if (this.disposed || this.status === status) return;
    this.status = status;
    if (status === 'error') console.warn('[GoogleTiles] initialization failed:', message);
    this.onStatus({ status, message });
  }

  attachCamera(camera: Camera, renderer: WebGLRenderer): void {
    this.tiles.setCamera(camera);
    this.tiles.setResolutionFromRenderer(camera, renderer);
  }

  resize(camera: Camera, renderer: WebGLRenderer): void {
    this.tiles.setResolutionFromRenderer(camera, renderer);
  }

  setErrorTarget(value: number): void {
    this.tiles.errorTarget = value;
  }

  update(camera: Camera): void {
    if (this.disposed || this.status === 'error') return;
    camera.updateMatrixWorld();
    this.tiles.update();
  }

  /**
   * Vertical calibration: casts a ray down at the runway centre and returns how far the tile
   * surface is above (+) or below (−) the local y = 0 runway plane. Corrects residual geoid /
   * photogrammetry offsets. Returns null if no tile geometry is hit yet.
   */
  measureGroundOffset(x: number, z: number): number | null {
    const ray = new Raycaster(new Vector3(x, 400, z), new Vector3(0, -1, 0), 0, 1200);
    const hits = ray.intersectObject(this.tiles.group, true);
    const first = hits[0];
    return first ? first.point.y : null;
  }

  applyVerticalOffset(dy: number): void {
    this.tiles.group.position.y -= dy;
    this.tiles.group.updateMatrixWorld(true);
  }

  getAttributionText(): string {
    const list = this.tiles.getAttributions();
    return list.filter((a) => a.type === 'string').map((a) => String(a.value)).join(' · ');
  }

  dispose(): void {
    this.disposed = true;
    this.tiles.group.removeFromParent();
    this.tiles.dispose();
    this.draco.dispose();
  }
}

function describeError(error: Error): string {
  const text = String(error?.message ?? error);
  if (/40[13]|PERMISSION|API key|invalid/i.test(text)) return 'Google rejected the API key (check the key, Map Tiles API enablement, billing and referrer restrictions).';
  if (/Failed to fetch|NetworkError|network/i.test(text)) return 'Network error while contacting tile.googleapis.com.';
  return `3D Tiles failed to initialise: ${text.slice(0, 160)}`;
}
