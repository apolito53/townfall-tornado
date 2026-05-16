# Townfall Tornado Codebase Index

## Stack

- Vite app with Three.js.
- Entry point: `src/main.ts`.
- Runtime surface: full-window WebGL canvas plus lightweight HTML HUD.
- Build config: `vite.config.js` keeps the expected Three.js bundle warning quiet and pins strict local ports.
- Dedicated ports: Vite server `5175`, reserved logging/debug receiver `5176`, preview `4175`.

## Main Files

- `src/game.ts` owns scene setup, renderer, post-processing composer, pause state, perspective slider state, level progression, category-scaled objective targets, minimum level duration pacing, queued absorption rewards, category-scaled lower oblique camera follow with adaptive fog, loop timing, score, timer, capped scene debris bursts, capped render quality, shadow refresh scheduling, `F3` debug overlay state, and performance/render diagnostics.
- `src/categoryProgression.ts` owns the very steep log-spaced tornado category mass requirements shared by gameplay and the HUD growth meter.
- `src/stormAtmosphereShader.ts` owns the full-screen storm grading shader for humid haze, dark cloud shadowing, rain streaks, grain, vignette, and lightning wash.
- `src/tornado.ts` owns tornado growth stats, category thresholds, dramatic diameter scaling, taller wiggly sky-connected funnel visuals, procedural smoky funnel/storm-sky textures, wall cloud curtains, dust, and airborne debris.
- `src/town.ts` owns terrain, roads, a large low-cost base ground plane, more detailed low-poly building models, destructible town props, staged structural damage, pressure bursts, rotating per-frame simulation budgets, frame-budgeted rubble/effect spawning, persistent capped ground scars, continuous 5x5 procedural town chunk loading around the tornado, spatial buckets for nearby destructible simulation, distance-based render LOD, lift thresholds, suction response, and destroyed ratio.
- `src/input.ts` translates keyboard and pointer/touch steering into a normalized movement vector.
- `src/ui.ts` updates the level tracker, HUD, growth bar, timer, and short storm messages.
- `src/globals.d.ts` declares local browser diagnostics hooks used by the smoke tests.
- `scripts/verify-render.mjs` runs a Playwright smoke test against a live dev server, saves screenshots, and verifies high-category radius/camera scaling, level UI, minimum-duration level pacing, level advancement, active post-processing diagnostics, capped pixel ratio, capped debris/effects, render LOD, and town simulation culling through the local `window.__townfallGame` hook.

## Common Change Targets

- Adjust tornado progression in `src/categoryProgression.ts`; adjust tornado feel in `src/tornado.ts`: diameter `radius`, `pullRadius`, `liftLimit`, `speed`, `pullStrength`, smoky funnel texture, and stacked funnel-section wobble.
- Add or tune destructible object types and building detail in `src/town.ts`: creation helpers plus `massRequired`, `points`, `growth`, `radius`, staged damage roles, level density, loaded chunk radius, world base ground size, spatial simulation cell size, render LOD radii, and procedural chunk placement.
- Change levels, category-scaled score/damage targets, queued absorption pacing, timer, combo, pause behavior, camera angle/zoom/fog composition, post-processing setup, scene debris caps, minimum level duration, or diagnostics in `src/game.ts`.
- Tune screen-space storm realism in `src/stormAtmosphereShader.ts`: color grade, haze, rain streaks, vignette, grain, and lightning response.
- Change visual layout and responsive HUD behavior in `src/styles.css`.
- Level tracker, pause menu, and hidden diagnostics root markup live in `index.html`, with compact HUD, level tracker, pause overlay, and debug overlay styling in `src/styles.css`.

## Validation Commands

```powershell
npm.cmd run build
npm.cmd run typecheck
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
```

`verify:render` expects the Vite dev server to be running on `http://127.0.0.1:5175/`.

## Sharp Edges

- Automated tests sample WebGL pixels from the main canvas, so `preserveDrawingBuffer` is enabled in `src/game.ts`; normal in-game diagnostics avoid recurring `readPixels` stalls.
- `src/main.ts` exposes `window.__townfallGame` for local browser tuning and automated scaling checks.
- Press `F3` or add `?debug` to the local URL to show the diagnostics overlay; it reuses `#diagnostics` while preserving the dataset fields used by smoke tests.
- Category mass targets are shared from `src/categoryProgression.ts`; keep the HUD and `src/tornado.ts` using that source instead of duplicating thresholds. Current gates are intentionally steep: Cat 2 at 55, Cat 3 at 250, Cat 4 at 943, Cat 5 at 3404.
- The game renders through `EffectComposer`; resize, manually reset renderer info, on-change shadow refreshes, and shader diagnostics are wired from `src/game.ts`.
- This first prototype uses simple custom suction and structural-stress physics rather than a full rigid-body engine.
- Procedural town chunks are generated around the tornado's current chunk and stay loaded; town object updates, huge-radius candidate simulation, rubble effects, scene debris, and distant details/props are budgeted/capped, but full chunk unloading or instancing is still the next big lever if long runs get dense.
