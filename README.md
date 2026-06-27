# Townfall Tornado

A tiny 3D arcade destruction prototype where you steer a tornado through a town, absorb lighter objects, grow into higher categories, and work your way up to larger buildings. The current pass uses staged structural damage, visible ground scarring, pooled GPU debris particles, instanced larger chunks, phase-blended far-town proxies, a sky-connected funnel descending from a wall cloud, procedural town chunks with varied terrain/city profiles, and dramatic category-based scale changes for both tornado diameter and camera distance.

## Play

Live demo: [https://townfall-tornado.vercel.app/](https://townfall-tornado.vercel.app/)

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Then open `http://127.0.0.1:5175/`.

Optional live browser log capture:

```powershell
npm.cmd run debug:logs
```

Open the game with `?debugLogs` once to enable browser log capture. The page then connects to `127.0.0.1:5176` and streams console warnings/errors, uncaught errors, frame hitches, and town simulation pressure events into `logs/townfall-debug-YYYY-MM-DD.jsonl`. Use `?noDebugLogs` to turn the browser capture back off.

## Local Ports

This Vite project has a dedicated strict port assignment so it can run beside the other browser prototypes:

- Base Vite server: `5175`
- Browser logging/debug receiver: `5176`
- Preview server: `4175`

## Controls

- `WASD` or arrow keys move the tornado.
- Pointer drag steers from the screen center on desktop/non-mobile browsers.
- Mobile/coarse-pointer devices use an on-screen joystick instead of canvas-wide touch steering.
- `Pause` opens the storm control menu.
- The start and pause menus include `Auto`, `Low`, `Medium`, and `High` quality presets plus manual sliders for render scale, effects density, town detail distance, and storm FX. `Auto` uses browser/WebGL hints to avoid punishing machines that are running through software rendering or weak integrated/mobile GPUs.
- The pause menu contains `Resume`, `Restart`, and a perspective slider for low-to-high camera angle.
- `F3` toggles the debug overlay with FPS, frame hitches, object counts, town budgets, and render counters.

## Validation

```powershell
npm.cmd run build
npm.cmd run typecheck
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
```

The render verification captures desktop and mobile screenshots under `artifacts/` and checks that the WebGL canvas is nonblank, keyboard/mobile input moves the storm, terrain profiles are varied, and generated props stay out of road/intersection/center-town reserve zones.
