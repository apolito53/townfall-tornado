# Townfall Tornado

A tiny 3D arcade destruction prototype where you steer a tornado through a town, absorb lighter objects, grow into higher categories, and work your way up to larger buildings. The current pass uses staged structural damage, visible ground scarring, a sky-connected funnel, procedural town chunks that appear near the map edge, and dramatic category-based scale changes for both tornado diameter and camera distance.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Then open the local Vite URL shown in the terminal.

## Controls

- `WASD` or arrow keys move the tornado.
- Pointer/touch drag steers from the screen center.
- `Restart` resets the current run.

## Validation

```powershell
npm.cmd run build
$env:TOWNFALL_URL='http://127.0.0.1:5173/'; npm.cmd run verify:render
```

The render verification captures desktop and mobile screenshots under `artifacts/` and checks that the WebGL canvas is nonblank and keyboard input moves the storm.
