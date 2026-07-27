# Townfall Tornado Codebase Index

## Current State

- Active branch: `rebuild/v2`.
- Current milestone: Milestone 2 visual north-star candidate, awaiting visual
  approval before versioning or tagging.
- Public v1 production: `https://townfall-tornado.vercel.app/`.
- V2 branch preview:
  `https://townfall-tornado-git-rebuild-v2-anthony-polito-s-projects.vercel.app/`.
- Rebuild roadmap: `REBUILD_PLAN.md`.
- Milestone 2 candidate report: `docs/rebuild/MILESTONE_2_DIORAMA.md`.
- Milestone 1 report: `docs/rebuild/MILESTONE_1_FOUNDATION.md`.
- V1 comparison report: `docs/rebuild/V1_BASELINE.md`.
- Runtime entrypoint: `src/main.ts`.
- Dedicated ports: Vite `5175`, debug logs `5176`, preview `4175`.
- Review parameters: `?category=1|3|5&weather=storm|clear`.

## Active Runtime

- `src/main.ts` creates the logger and the single `GameApp` composition root.
- `src/app/GameApp.ts` owns renderer lifecycle, the animation loop, service
  composition, resize, mode transitions, quality application, and diagnostics
  publication.
- `src/app/GameSession.ts` owns mode, phase, pause, elapsed time, travel,
  objective progress, restart count, and deterministic session seed.
- `src/app/gameModes.ts` defines the Levels and Endless foundation shells.
- `src/app/reviewSettings.ts` parses deterministic category and weather review
  parameters.
- `src/core/types.ts` contains renderer-independent contracts for the storm,
  authored district, roads, lots, buildings, destruction, quality, sessions,
  input, weather, and schema 3 diagnostics.
- `src/core/clock.ts` provides the capped fixed 60 Hz simulation step.
- `src/core/random.ts` provides deterministic seed hashing and random streams.
- `src/core/math.ts` contains small shared numeric helpers.
- `src/world/TerrainField.ts` is the pure world-coordinate height and surface
  sampler. It owns authored ridges, swale, road stamps, lot pads, grades, and
  normals without importing Three.js.
- `src/world/northStarDistrict.ts` owns the fixed 3.2 km district coordinates,
  exact 20-building inventory, road and lot definitions, deterministic
  variants, and reserved prop placements.
- `src/storm/stormProfiles.ts` defines the Cat 1, Cat 3, and Cat 5 review
  profiles, including the exact one-mile Cat 5 diameter.
- `src/storm/TornadoSystem.ts` owns fixed-step movement, terrain following,
  bounds clamping, and the plain `StormSnapshot`.
- `src/camera/CameraRig.ts` owns category-specific distance envelopes,
  perspective preference, terrain-aware follow smoothing, twelve chase-line
  clearance samples, resize, and camera diagnostics.
- `src/input/InputController.ts` normalizes keyboard, pointer, and mobile
  joystick input into one plain movement command.
- `src/quality/platformQuality.ts` reads browser, WebGL, CPU, memory, DPR, and
  mobile hints.
- `src/quality/QualityManager.ts` owns Auto/preset/custom quality state,
  sanitization, persistence, and synchronized control values.
- `src/diagnostics/Diagnostics.ts` separates warmup from gameplay timings and
  owns the scrollable F3 overlay plus the browser test snapshot.
- `src/diagnostics/debugLogger.ts` owns optional local JSONL browser logging.
- `src/render/MaterialAtlas.ts` generates the deterministic 1024 px runtime
  material atlas and shared materials.
- `src/render/TerrainRenderer.ts` consumes `TerrainField` data to render one
  seamless 256-segment faceted terrain mesh, perimeter skirt, roads,
  driveways, lots, shoulders, and markings.
- `src/render/TownRenderer.ts` renders all buildings and props through bounded
  component-level `InstancedMesh` batches. Its stable building handles are the
  future destruction integration point.
- `src/render/StormAtmosphere.ts` owns the procedural sky dome, weather
  lighting, fog, directional shadows, and one bounded camera-relative rain
  batch.
- `src/render/StormSilhouette.ts` owns the temporary bounded condensation and
  ground-dust GPU batches used to review physical category scale.
- `src/render/DioramaWorld.ts` composes terrain, town, atmosphere, and the
  temporary storm renderer and exposes the world lifecycle API.
- `src/ui/Hud.ts` projects session state into the HUD and objective tracker.
- `src/ui/menus.ts` binds mode, pause, restart, perspective, and quality
  controls through narrow action callbacks.
- `src/ui/dom.ts` provides strict required-element lookup.
- `src/styles.css` owns the shared full-screen, menu, HUD, mobile, pause, and
  diagnostics presentation.

## Preserved V1

- `src/legacy/v1/` contains the complete prototype source and is excluded from
  strict compilation.
- `legacy-v1.html` is a local-only baseline capture entrypoint.
- The active `src/main.ts` does not import the v1 `Game`, `Town`, or `Tornado`.
- Tag `v0.1.0.0` remains the historical prototype boundary.

## Scripts

- `scripts/verify-foundation-architecture.mjs` rejects legacy imports, explicit
  `any` escapes, disabled strict mode, or missing v2 core contracts.
- `scripts/verify-render.mjs` runs the desktop High and mobile Low review
  matrix, captures ignored candidate frames, and checks lifecycle, normalized
  input, pause/restart, modes, quality, perspective, diagnostics scrolling,
  camera clearance, exact category scale, steady-state timing, canvas output,
  console health, and resource budgets.
- `scripts/capture-rebuild-baseline.mjs` captures the v1 reference through
  `legacy-v1.html` and writes under `docs/rebuild/baseline/`.
- `scripts/debug-log-server.mjs` runs the optional port 5176 JSONL receiver.

## Common Change Targets

- Change lifecycle or composition in `src/app/GameApp.ts`.
- Change session semantics in `src/app/GameSession.ts` or
  `src/app/gameModes.ts`.
- Change review URL behavior in `src/app/reviewSettings.ts`.
- Change deterministic terrain shape, grades, or surface sampling in
  `src/world/TerrainField.ts`.
- Change authored district coordinates or deterministic variation in
  `src/world/northStarDistrict.ts`.
- Change tornado movement or physical profiles in `src/storm/`.
- Change movement normalization or mobile detection in
  `src/input/InputController.ts`.
- Change camera framing in `src/camera/CameraRig.ts`.
- Change presets or platform recommendation in `src/quality/`.
- Change timing, budgets, or the F3 surface in
  `src/diagnostics/Diagnostics.ts`.
- Change terrain presentation in `src/render/TerrainRenderer.ts`.
- Change building or prop geometry in `src/render/TownRenderer.ts`.
- Change atlas palette and texture accents in `src/render/MaterialAtlas.ts`.
- Change temporary storm scale presentation in
  `src/render/StormSilhouette.ts`; do final funnel and wall-cloud work in
  Milestone 3 rather than expanding this placeholder indefinitely.
- Change sky, fog, rain, and weather lighting in
  `src/render/StormAtmosphere.ts`.
- Change HUD/menu projection in `src/ui/` and layout in `src/styles.css`.

## Validation

```powershell
npm.cmd run test:unit
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:architecture
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
npm.cmd run baseline:v1
```

## Sharp Edges

- `preserveDrawingBuffer` remains enabled so browser smoke tests can sample the
  WebGL canvas. Revisit this after a replacement screenshot strategy exists.
- Browser comparison FPS is meaningful only on the same machine and browser.
- The quality profile stores Bloom, but Milestone 2 intentionally has no
  `EffectComposer` or post-processing owner.
- The active Levels mode is a lifecycle/objective shell, not a completed level.
- `StormSilhouette` is a temporary scale and atmosphere aid, not the final
  tornado. Funnel centerline deformation, wall cloud, inflow tails, lightning,
  and carried debris remain Milestone 3.
- The district is authored and finite. Destruction, score progression, debris,
  and procedural world streaming remain deferred.
- Low quality preserves the major silhouettes while suppressing optional
  instance prefixes and rain density. Future destruction must retain those
  bounded instance contracts.
- V1 baseline capture intentionally compiles excluded legacy TypeScript through
  Vite's transpiler; the strict active compiler never imports it.
