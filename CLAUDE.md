# CLAUDE.md — Atlas Flight Simulator

Commands: `npm run dev` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run deploy` (Cloudflare Workers static assets via wrangler.jsonc).

Conventions (do not break):
- Scene frame: X = East, Y = Up, Z = South (North = −Z). Aircraft body: forward −Z, up +Y, right +X.
- Heading conversion lives ONLY in `src/geo/Geodesy.ts` (`headingToDirection`, `directionToHeading`, `headingToQuaternion`).
- SI units internally; knots/feet/fpm only in `src/ui/FlightDataFormatter.ts`.
- Body angular velocity: x + = nose up, y + = nose left, z + = roll left.
- Physics state is canonical in `AircraftState`; visuals read it, never write it.
- 3D Tiles: import `TilesRenderer` from `3d-tiles-renderer`, plugins from `3d-tiles-renderer/plugins` (GoogleCloudAuthPlugin lives in core plugins; the `/three/plugins` re-export is deprecated). Place tiles only via the group matrix from `LocalTangentPlane.getEcefToLocalMatrix()`.
- One render loop (`renderer.setAnimationLoop` in `Application`). Every flight-scoped object is owned by `FlightSession` and disposed there.
- Strict TS; no `any`, no `@ts-ignore`. Keep modules small.
