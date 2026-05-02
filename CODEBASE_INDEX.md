# Townfall Tornado Codebase Index

## Stack

- Vite app with Three.js.
- Entry point: `src/main.js`.
- Runtime surface: full-window WebGL canvas plus lightweight HTML HUD.
- Build config: `vite.config.js` keeps the expected Three.js bundle warning quiet.

## Main Files

- `src/game.js` owns scene setup, renderer, pause state, perspective slider state, category-scaled lower oblique camera follow with adaptive fog, loop timing, score, timer, debris bursts, and render diagnostics.
- `src/tornado.js` owns tornado growth stats, category thresholds, dramatic diameter scaling, taller wiggly sky-connected funnel visuals, procedural storm-sky textures, wall cloud curtains, dust, and airborne debris.
- `src/town.js` owns terrain, roads, destructible town props, staged structural damage, pressure bursts, persistent ground scars, procedural town chunks, lift thresholds, suction response, and destroyed ratio.
- `src/input.js` translates keyboard and pointer/touch steering into a normalized movement vector.
- `src/ui.js` updates the HUD, growth bar, timer, and short storm messages.
- `scripts/verify-render.mjs` runs a Playwright smoke test against a live dev server, saves screenshots, and verifies high-category radius/camera scaling through the local `window.__townfallGame` hook.

## Common Change Targets

- Adjust tornado feel in `src/tornado.js`: category thresholds, diameter `radius`, `pullRadius`, `liftLimit`, `speed`, and `pullStrength`.
- Add or tune destructible object types in `src/town.js`: creation helpers plus `massRequired`, `points`, `growth`, `radius`, staged damage roles, and procedural chunk placement.
- Change scoring, timer, combo, pause behavior, camera angle/zoom/fog composition, or diagnostics in `src/game.js`.
- Change visual layout and responsive HUD behavior in `src/styles.css`.
- Pause menu markup lives in `index.html`, with compact HUD and pause overlay styling in `src/styles.css`.

## Validation Commands

```powershell
npm.cmd run build
$env:TOWNFALL_URL='http://127.0.0.1:5174/'; npm.cmd run verify:render
```

`verify:render` expects the Vite dev server to be running. If Vite chooses a different port, point `TOWNFALL_URL` at that live local URL.

## Sharp Edges

- The render diagnostic samples WebGL pixels from the main canvas, so `preserveDrawingBuffer` is enabled in `src/game.js`.
- `src/main.js` exposes `window.__townfallGame` for local browser tuning and automated scaling checks.
- This first prototype uses simple custom suction and structural-stress physics rather than a full rigid-body engine.
- Procedural town chunks are generated near the current edge and stay loaded; introduce unloading or spatial partitioning if long runs get dense.
