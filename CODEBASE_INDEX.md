# Townfall Tornado Codebase Index

## Current State

- Active branch: `rebuild/v2`.
- Current milestone: Milestone 1 strict foundation complete.
- Public v1 production: `https://townfall-tornado.vercel.app/`.
- V2 branch preview:
  `https://townfall-tornado-git-rebuild-v2-anthony-polito-s-projects.vercel.app/`.
- Rebuild roadmap: `REBUILD_PLAN.md`.
- Milestone 1 report: `docs/rebuild/MILESTONE_1_FOUNDATION.md`.
- V1 comparison report: `docs/rebuild/V1_BASELINE.md`.
- Runtime entrypoint: `src/main.ts`.
- Dedicated ports: Vite `5175`, debug logs `5176`, preview `4175`.

## Active Runtime

- `src/main.ts` creates the logger and the single `GameApp` composition root.
- `src/app/GameApp.ts` owns renderer lifecycle, the animation loop, service
  composition, resize, mode transitions, quality application, and diagnostics
  publication.
- `src/app/GameSession.ts` owns mode, phase, pause, elapsed time, travel,
  objective progress, restart count, and deterministic session seed.
- `src/app/gameModes.ts` defines the Levels and Endless foundation shells.
- `src/core/types.ts` contains renderer-independent contracts for the storm,
  world, buildings, destruction, quality, sessions, input, and diagnostics.
- `src/core/clock.ts` provides the capped fixed 60 Hz simulation step.
- `src/core/random.ts` provides deterministic seed hashing and random streams.
- `src/core/math.ts` contains small shared numeric helpers.
- `src/camera/CameraRig.ts` owns perspective preference, framing, follow
  smoothing, resize, and camera diagnostics.
- `src/input/InputController.ts` normalizes keyboard, pointer, and mobile
  joystick input into one plain movement command.
- `src/quality/platformQuality.ts` reads browser, WebGL, CPU, memory, DPR, and
  mobile hints.
- `src/quality/QualityManager.ts` owns Auto/preset/custom quality state,
  sanitization, persistence, and synchronized control values.
- `src/diagnostics/Diagnostics.ts` separates warmup from gameplay timings and
  owns the F3 overlay plus the browser test snapshot.
- `src/diagnostics/debugLogger.ts` owns optional local JSONL browser logging.
- `src/render/FoundationWorld.ts` owns the flat coordinate field, two reference
  roads, instanced markers, and the storm marker.
- `src/render/StormMarker.ts` owns the small deterministic particle marker used
  only for foundation movement testing.
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
  `any` escapes, disabled strict mode, or missing core contracts.
- `scripts/verify-render.mjs` runs desktop and mobile browser smoke tests,
  captures ignored menu/play screenshots, and checks lifecycle, normalized
  input, pause/restart, modes, quality, perspective, diagnostics scrolling,
  steady-state timing, canvas output, and resource budgets.
- `scripts/capture-rebuild-baseline.mjs` captures the v1 reference through
  `legacy-v1.html` and writes under `docs/rebuild/baseline/`.
- `scripts/debug-log-server.mjs` runs the optional port 5176 JSONL receiver.

## Common Change Targets

- Change lifecycle or composition in `src/app/GameApp.ts`.
- Change session semantics in `src/app/GameSession.ts` or
  `src/app/gameModes.ts`.
- Change movement normalization or mobile detection in
  `src/input/InputController.ts`.
- Change camera framing in `src/camera/CameraRig.ts`.
- Change presets or platform recommendation in `src/quality/`.
- Change timing, budgets, or the F3 surface in
  `src/diagnostics/Diagnostics.ts`.
- Change the temporary test field in `src/render/FoundationWorld.ts`.
- Change the temporary storm marker in `src/render/StormMarker.ts`.
- Change HUD/menu projection in `src/ui/` and layout in `src/styles.css`.

## Validation

```powershell
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
- The foundation quality profile stores Bloom, but no post-processing owner
  exists yet.
- The active Levels mode is a lifecycle/objective shell, not a completed level.
- The flat world and particle marker are disposable scaffolding for Milestone
  2, not visual targets.
- V1 baseline capture intentionally compiles excluded legacy TypeScript through
  Vite's transpiler; the strict active compiler never imports it.
