import './ui/styles.css';
import './ui/hud.css';
import { Application } from './app/Application';

function fatal(title: string, text: string): void {
  document.body.innerHTML = `<div class="fatal"><div><h1>${title}</h1><p>${text}</p></div></div>`;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch (err) {
    console.error('[Boot] WebGL probe failed', err);
    return false;
  }
}

const canvas = document.getElementById('scene');
const ui = document.getElementById('ui');
if (!(canvas instanceof HTMLCanvasElement) || !ui) {
  fatal('Startup error', 'Required page elements are missing.');
} else if (!webglAvailable()) {
  fatal('WebGL 2 required', 'Atlas Flight Simulator needs a WebGL 2 capable browser and GPU. Please update your browser or enable hardware acceleration.');
} else {
  try {
    const app = new Application(canvas, ui);
    // Console handle used by tools/admin-panel.js (single-player game, so exposing it is harmless).
    Object.assign(window, { atlas: app });
  } catch (err) {
    console.error('[Boot] application failed to start', err);
    fatal('Could not start the simulator', 'The 3D renderer failed to initialise. Check that hardware acceleration is enabled.');
  }
}
