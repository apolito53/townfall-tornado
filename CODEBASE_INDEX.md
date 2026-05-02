# Townfall Tornado Codebase Index

## Stack

- Vite app with Three.js.
- Entry point: `src/main.js`.
- Runtime surface: full-window WebGL canvas plus lightweight HTML HUD.
- Build config: `vite.config.js` keeps the expected Three.js bundle warning quiet.

## Main Files

- `src/game.js` owns scene setup, renderer, post-processing composer, pause state, perspective slider state, level progression, category-scaled lower oblique camera follow with adaptive fog, loop timing, score, timer, debris bursts, capped render quality, shadow refresh scheduling, and performance/render diagnostics.
- `src/categoryProgression.js` owns the very steep log-spaced tornado category mass requirements shared by gameplay and the HUD growth meter.
- `src/stormAtmosphereShader.js` owns the full-screen storm grading shader for humid haze, dark cloud shadowing, rain streaks, grain, vignette, and lightning wash.
- `src/tornado.js` owns tornado growth stats, category thresholds, dramatic diameter scaling, taller wiggly sky-connected funnel visuals, procedural smoky funnel/storm-sky textures, wall cloud curtains, dust, and airborne debris.
- `src/town.js` owns terrain, roads, more detailed low-poly building models, destructible town props, staged structural damage, pressure bursts, persistent ground scars, wider 5x5 procedural town chunk loading, spatial buckets for nearby destructible simulation, distance-based render LOD, lift thresholds, suction response, and destroyed ratio.
- `src/input.js` translates keyboard and pointer/touch steering into a normalized movement vector.
- `src/ui.js` updates the level tracker, HUD, growth bar, timer, and short storm messages.
- `scripts/verify-render.mjs` runs a Playwright smoke test against a live dev server, saves screenshots, and verifies high-category radius/camera scaling, level UI, level advancement, active post-processing diagnostics, capped pixel ratio, render LOD, and town simulation culling through the local `window.__townfallGame` hook.

## Common Change Targets

- Adjust tornado progression in `src/categoryProgression.js`; adjust tornado feel in `src/tornado.js`: diameter `radius`, `pullRadius`, `liftLimit`, `speed`, `pullStrength`, smoky funnel texture, and stacked funnel-section wobble.
- Add or tune destructible object types and building detail in `src/town.js`: creation helpers plus `massRequired`, `points`, `growth`, `radius`, staged damage roles, level density, loaded chunk radius, spatial simulation cell size, render LOD radii, and procedural chunk placement.
- Change levels, scoring, timer, combo, pause behavior, camera angle/zoom/fog composition, post-processing setup, or diagnostics in `src/game.js`.
- Tune screen-space storm realism in `src/stormAtmosphereShader.js`: color grade, haze, rain streaks, vignette, grain, and lightning response.
- Change visual layout and responsive HUD behavior in `src/styles.css`.
- Level tracker and pause menu markup live in `index.html`, with compact HUD, level tracker, and pause overlay styling in `src/styles.css`.

## Validation Commands

```powershell
npm.cmd run build
$env:TOWNFALL_URL='http://127.0.0.1:5174/'; npm.cmd run verify:render
```

`verify:render` expects the Vite dev server to be running. If Vite chooses a different port, point `TOWNFALL_URL` at that live local URL.

## Sharp Edges

- Automated tests sample WebGL pixels from the main canvas, so `preserveDrawingBuffer` is enabled in `src/game.js`; normal in-game diagnostics avoid recurring `readPixels` stalls.
- `src/main.js` exposes `window.__townfallGame` for local browser tuning and automated scaling checks.
- Category mass targets are shared from `src/categoryProgression.js`; keep the HUD and `src/tornado.js` using that source instead of duplicating thresholds. Current gates are intentionally steep: Cat 2 at 55, Cat 3 at 250, Cat 4 at 943, Cat 5 at 3404.
- The game renders through `EffectComposer`; resize, manually reset renderer info, on-change shadow refreshes, and shader diagnostics are wired from `src/game.js`.
- This first prototype uses simple custom suction and structural-stress physics rather than a full rigid-body engine.
- Procedural town chunks are generated near the current edge and stay loaded; town object updates are spatially culled and distant details/props are LOD culled, but full chunk unloading or instancing is still the next big lever if long runs get dense.
