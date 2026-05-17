# Townfall Tornado Codebase Index

## Stack

- Vite app with Three.js.
- Public Vercel deployment: `https://townfall-tornado.vercel.app/`.
- Entry point: `src/main.ts`.
- Runtime surface: full-window WebGL canvas plus lightweight HTML HUD.
- Build config: `vite.config.js` keeps the expected Three.js bundle warning quiet and pins strict local ports.
- Dedicated ports: Vite server `5175`, reserved logging/debug receiver `5176`, preview `4175`.

## Main Files

- `src/game.ts` owns scene setup, renderer, post-processing composer, persisted auto/preset/custom quality controls, pause state, perspective slider state, level progression, category-scaled objective targets, minimum level duration pacing, queued absorption rewards, category-scaled lower oblique camera follow with adaptive fog, loop timing, score, timer, capped scene debris bursts, capped render quality, shadow refresh scheduling, `F3` debug overlay state, and performance/render diagnostics.
- `src/categoryProgression.ts` owns the very steep log-spaced tornado category mass requirements shared by gameplay and the HUD growth meter.
- `src/debugLogger.ts` connects to the optional local debug receiver after `?debugLogs`/`localStorage` opt-in and streams console warnings/errors, uncaught errors, frame hitches, and town simulation pressure breadcrumbs when it is running.
- `src/debrisParticles.ts` owns the pooled GPU debris layer: shader-driven dust/fleck particles plus strict-capacity instanced chunk debris and quality-scaled emission density.
- `src/platformQuality.ts` probes browser/WebGL renderer details, hardware concurrency, memory hints, DPR, and mobile signals to choose the `Auto` quality recommendation.
- `src/stormAtmosphereShader.ts` owns the full-screen storm grading shader for humid haze, dark cloud shadowing, rain streaks, grain, vignette, and lightning wash.
- `src/townInstancing.ts` owns the instanced far-town proxy renderer for simple house/shop LODs, trees, fences, cars, and road stripes, including proxy visibility scaling used by distance phase-in.
- `src/tornado.ts` owns tornado growth stats, category thresholds, dramatic diameter scaling, taller wiggly sky-connected funnel visuals, procedural smoky funnel/storm-sky textures, wall cloud curtains, dust, and airborne debris.
- `src/town.ts` owns terrain, roads, a large low-cost base ground plane, more detailed low-poly building models, destructible town props, staged structural damage, pressure bursts, rotating per-frame simulation budgets, frame-budgeted debris particle/chunk emissions, persistent capped ground scars, continuous 5x5 procedural town chunk loading around the tornado, spatial buckets for nearby destructible simulation, quality-scaled full-model promotion near storm interaction, phase-blended distance render LOD, lift thresholds, suction response, and destroyed ratio.
- `src/input.ts` translates keyboard and pointer/touch steering into a normalized movement vector.
- `src/ui.ts` updates the level tracker, HUD, growth bar, timer, and short storm messages.
- `src/globals.d.ts` declares local browser diagnostics hooks used by the smoke tests.
- `scripts/debug-log-server.mjs` runs the optional `127.0.0.1:5176` JSONL log receiver and exposes `/health`, `/log`, and `/recent` for live debugging.
- `scripts/verify-render.mjs` runs a Playwright smoke test against a live dev server, saves screenshots, and verifies high-category radius/camera scaling, level UI, minimum-duration level pacing, level advancement, active post-processing diagnostics, capped pixel ratio, capped debris/effects, render LOD, and town simulation culling through the local `window.__townfallGame` hook.

## Common Change Targets

- Adjust tornado progression in `src/categoryProgression.ts`; adjust tornado feel in `src/tornado.ts`: diameter `radius`, `pullRadius`, `liftLimit`, `speed`, `pullStrength`, smoky funnel texture, and stacked funnel-section wobble.
- Add or tune destructible object types and building detail in `src/town.ts`: creation helpers plus `massRequired`, `points`, `growth`, `radius`, staged damage roles, level density, loaded chunk radius, world base ground size, spatial simulation cell size, render LOD radii, and procedural chunk placement.
- Tune far-town proxy capacities, simple LOD shapes, proxy phase-in scaling, and instanced road stripe behavior in `src/townInstancing.ts`.
- Change levels, category-scaled score/damage targets, queued absorption pacing, timer, combo, pause behavior, quality presets/manual sliders, camera angle/zoom/fog composition, post-processing setup, scene debris caps, minimum level duration, or diagnostics in `src/game.ts`.
- Tune visual debris capacity, shader motion, particle colors, and instanced chunk behavior in `src/debrisParticles.ts`.
- Tune screen-space storm realism in `src/stormAtmosphereShader.ts`: color grade, haze, rain streaks, vignette, grain, and lightning response.
- Change visual layout and responsive HUD behavior in `src/styles.css`.
- Level tracker, quality controls, pause menu, and hidden diagnostics root markup live in `index.html`, with compact HUD, level tracker, quality controls, pause overlay, and debug overlay styling in `src/styles.css`.

## Validation Commands

```powershell
npm.cmd run build
npm.cmd run typecheck
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
```

`verify:render` expects the Vite dev server to be running on `http://127.0.0.1:5175/`.
`npm.cmd run debug:logs` is optional during normal play; open the app with `?debugLogs` to opt the browser into appending events under ignored `logs/` JSONL files.

## Sharp Edges

- Automated tests sample WebGL pixels from the main canvas, so `preserveDrawingBuffer` is enabled in `src/game.ts`; normal in-game diagnostics avoid recurring `readPixels` stalls.
- `src/main.ts` exposes `window.__townfallGame` for local browser tuning and automated scaling checks.
- Press `F3` or add `?debug` to the local URL to show the diagnostics overlay; it reuses `#diagnostics` while preserving the dataset fields used by smoke tests.
- Run `npm.cmd run debug:logs` beside the Vite server, then open the app with `?debugLogs`, to capture browser-side warnings/errors, uncaught errors, frame hitches, and town simulation pressure events as JSONL on port `5176`.
- Category mass targets are shared from `src/categoryProgression.ts`; keep the HUD and `src/tornado.ts` using that source instead of duplicating thresholds. Current gates are intentionally steep: Cat 2 at 55, Cat 3 at 250, Cat 4 at 943, Cat 5 at 3404.
- The game renders through `EffectComposer`; resize, manually reset renderer info, on-change shadow refreshes, and shader diagnostics are wired from `src/game.ts`.
- This first prototype uses simple custom suction and structural-stress physics rather than a full rigid-body engine.
- Tiny debris particles are visual only and intentionally have no collision; they are GPU-shader points and pooled instanced chunks so long Cat 4/Cat 5 runs do not create thousands of short-lived scene objects.
- Procedural town chunks are generated around the tornado's current chunk and stay loaded; distant houses/shops/trees/fences/cars/road stripes render through fog-aware instanced proxy materials, while full destructible models are promoted inside the interaction/detail bubble. The proxy/detail handoff uses a quality-scaled overlap band and far proxy fade so Low/Auto modes degrade gradually instead of popping black silhouettes. Full chunk unloading is still the next big lever if long runs get dense.
- Large storms can have more destructible candidates than the per-frame budget can process; `src/town.ts` caps active carryover work so fresh nearby candidates continue receiving interaction updates instead of being starved by already-damaged items.
