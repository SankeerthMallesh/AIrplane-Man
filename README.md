# Atlas Flight Simulator

Browser-based 3D airliner simulator: procedural twin-jet (no model files), six original fictional airlines, five real airports (JFK, LAX, HND, LHR, SXM) with runway geometry from OurAirports open data, a 6-DOF arcade-sim flight model, three cameras, a glass-cockpit HUD, procedural Web Audio, and optional **Google Photorealistic 3D Tiles** with a fully playable procedural fallback.

## Requirements
- Node.js 20+ and npm
- Desktop browser with WebGL 2
- Optional: Google Maps Platform API key with the **Map Tiles API** enabled (billing on)

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run test       # vitest (30 tests)
npm run build && npm run preview
```

## Deploy to Cloudflare (terminal)
Uses Cloudflare Workers static assets via Wrangler (config in `wrangler.jsonc`, output `dist/`).
```bash
npx wrangler login      # opens the browser once to authorise your Cloudflare account
npm run deploy          # builds with Vite, then uploads dist/ with `wrangler deploy`
```
Wrangler prints the live URL, e.g. `https://atlas-flight-simulator.<your-subdomain>.workers.dev`.
- To ship with Google 3D Tiles, put `VITE_GOOGLE_MAPS_API_KEY` in `.env.local` **before** `npm run deploy` (Vite bakes it into the bundle at build time) and add your `*.workers.dev` / custom domain to the key's HTTP-referrer restrictions.
- Change the worker name / URL by editing `"name"` in `wrangler.jsonc`.
- Check config without deploying: `npx wrangler deploy --dry-run`.

## Google 3D Tiles key
1. Create `.env.local` in the project root: `VITE_GOOGLE_MAPS_API_KEY=your_key`
2. In Google Cloud: enable Map Tiles API, enable billing, restrict the key by HTTP referrer (e.g. `http://localhost:5173/*`) and to the Map Tiles API.
3. Restart `npm run dev` (Vite reads env vars at startup only).

`VITE_` variables are embedded in the client bundle — this key is **public**; protect it with Google Cloud restrictions and quotas. Without a key (or if the key is rejected / network fails) the app shows a notice and flies in the procedural world.

Integration: `TilesRenderer` from `3d-tiles-renderer` (NASA-AMMOS) with `GoogleCloudAuthPlugin` and `GLTFExtensionsPlugin` (+ Draco decoder served from `public/draco`). Google data attributions from `getAttributions()` are shown bottom-right. **Live Google tile loading has not been verified by the author (no key was available during development).** Google's policies also require displaying the Google Maps logo; this build shows a text "Google" label — add the official logo asset per Google's branding guidelines before publishing.

## Controls
| Key | Action |
|---|---|
| W / S | Pitch up / down |
| A / D | Roll left / right |
| Q / E | Yaw (nose-wheel steering on ground) |
| Shift or = | Increase thrust |
| Ctrl or - | Decrease thrust (on Windows/Linux Ctrl+W closes the tab — use `-`) |
| G | Landing gear |
| F | Flaps UP → TAKEOFF → LANDING |
| C | Camera: chase / cockpit / orbit |
| Space | Brakes on/off |
| Esc | Pause menu |
| R | Restart on runway |
| F3 | Debug panel |

Takeoff: Space (release brakes), hold Shift to 100 %, at ~140 kt hold W, then G (gear up) and F (flaps up).

## Geography
- WGS84 (a = 6378137 m, f = 1/298.257223563); geodetic↔ECEF in `src/geo/Geodesy.ts` (Bowring iteration, pole-stable height).
- Local tangent plane per flight: **X = East, Y = Up, Z = South (North = −Z)**. Heading h (true, clockwise from north) → direction (sin h, 0, −cos h); quaternion = rotation −h about +Y.
- **Floating origin:** each flight builds a new frame at the selected runway centre/elevation, so coordinates stay small. No dynamic re-basing; supported radius ≈ 80 km. Ground collision is a flat plane at runway elevation (photogrammetry is not collidable).
- 3D Tiles are placed by setting the tiles group to the ECEF→local matrix (rows E, U, −N); a raycast at the runway centre then corrects residual vertical offset (approximate EGM96 geoid values are in the airport data).
- Runway true headings are derived from threshold coordinates, not designators.

## Flight model (arcade-sim hybrid, not certified data)
Fixed 120 Hz step, semi-implicit Euler, quaternion attitude, render interpolation. Forces: lift q·S·CL(α, flaps) with stall break, drag (parasite + induced + flaps + gear + spoilers + stall + Mach rise), sideslip side force, thrust with spool lag and density lapse, gravity (−Y), spring-damper gear contacts with rolling/brake/lateral friction and nose-wheel steering. Moments are a simplified model (authority scaled by dynamic pressure, damping, static stability, dihedral, stall nose-down) plus real contact torques ÷ inertia. Configurable flight assist (rate hold, auto-trim, soft bank limit). ISA atmosphere.

## Airlines (fictional)
Aurora Pacific Air (AURORA) · Skyforge Airways (FORGE) · Celestial Global (CELESTIAL) · Pacific Crown (PACIFIC CROWN) · Nova Atlantic (NOVA) · Solstice Air (SOLSTICE). Codes are fictional, not IATA assignments. Logos are procedural Canvas drawings.

## Troubleshooting
- **Missing/invalid key:** check `.env.local`, restart dev server, check API enablement, billing, referrer restriction.
- **Tiles not loading:** see console `[GoogleTiles]` messages; app falls back automatically after 15 s.
- **Black screen / WebGL error:** enable hardware acceleration; use current Chrome/Edge/Firefox/Safari.
- **No sound:** click once in the page (autoplay policy); check Settings → Audio.
- **Keys not responding:** click the 3D view; keys are ignored while a form control has focus.
- **Slow:** Settings → Graphics quality Low, disable shadows.

## Known limitations
- Live Google 3D Tiles path untested without a key; no collision with photogrammetry terrain/buildings.
- Single aircraft type; cockpit view has a simple frame (glareshield/pillars), not a modelled instrument panel.
- Geoid undulations are approximate; magnetic heading not modelled (HUD shows true heading).
