# Townfall Tornado

A tiny 3D arcade destruction prototype where you steer a tornado through a town, absorb lighter objects, grow into higher categories, and work your way up to larger buildings. The current pass uses staged structural damage, visible ground scarring, a sky-connected funnel descending from a wall cloud, procedural town chunks that appear near the map edge, and dramatic category-based scale changes for both tornado diameter and camera distance.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Then open `http://127.0.0.1:5175/`.

## Local Ports

This Vite project has a dedicated strict port assignment so it can run beside the other browser prototypes:

- Base Vite server: `5175`
- Reserved logging/debug receiver: `5176`
- Preview server: `4175`

No logging server is currently wired here; keep `5176` reserved for one if it gets added.

## Controls

- `WASD` or arrow keys move the tornado.
- Pointer/touch drag steers from the screen center.
- `Pause` opens the storm control menu.
- The pause menu contains `Resume`, `Restart`, and a perspective slider for low-to-high camera angle.

## Validation

```powershell
npm.cmd run build
npm.cmd run typecheck
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
```

The render verification captures desktop and mobile screenshots under `artifacts/` and checks that the WebGL canvas is nonblank and keyboard input moves the storm.
