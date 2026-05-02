# Townfall Tornado Codebase Index

## Stack

- Vite app with Three.js.
- Entry point: `src/main.js`.
- Runtime surface: full-window WebGL canvas plus lightweight HTML HUD.
- Build config: `vite.config.js` keeps the expected Three.js bundle warning quiet.

## Main Files

- `src/game.js` owns scene setup, renderer, camera follow, loop timing, score, timer, debris bursts, and render diagnostics.
- `src/tornado.js` owns tornado growth stats, category thresholds, movement, and funnel/dust visuals.
- `src/town.js` owns terrain, roads, destructible town props, lift thresholds, suction response, and destroyed ratio.
- `src/input.js` translates keyboard and pointer/touch steering into a normalized movement vector.
- `src/ui.js` updates the HUD, growth bar, timer, and short storm messages.
- `scripts/verify-render.mjs` runs a Playwright smoke test against a live dev server and saves screenshots.

## Common Change Targets

- Adjust tornado feel in `src/tornado.js`: category thresholds, `pullRadius`, `liftLimit`, `speed`, and `pullStrength`.
- Add or tune destructible object types in `src/town.js`: creation helpers plus `massRequired`, `points`, `growth`, and `radius`.
- Change scoring, timer, combo, camera, or diagnostics in `src/game.js`.
- Change visual layout and responsive HUD behavior in `src/styles.css`.

## Validation Commands

```powershell
npm.cmd run build
$env:TOWNFALL_URL='http://127.0.0.1:5173/'; npm.cmd run verify:render
```

`verify:render` expects the Vite dev server to be running.

## Sharp Edges

- The render diagnostic samples WebGL pixels from the main canvas, so `preserveDrawingBuffer` is enabled in `src/game.js`.
- This first prototype uses simple custom suction physics rather than a full rigid-body engine.
- Town object counts are still small enough for direct per-frame iteration; introduce spatial partitioning only if the town gets much denser.
