# Townfall Tornado

Townfall Tornado is a 3D browser game about steering a growing tornado through
a destructible town. The project is currently on the `rebuild/v2` branch,
where Milestone 1 has replaced the prototype runtime with a strict typed
foundation.

The active build is intentionally a clean test field rather than the finished
game: choose Levels or Endless, move a particle storm marker across the field,
pause or restart the session, change camera perspective, and inspect the
runtime through F3.

The full rebuild direction and acceptance gates live in
[REBUILD_PLAN.md](./REBUILD_PLAN.md). The completed foundation is documented in
[docs/rebuild/MILESTONE_1_FOUNDATION.md](./docs/rebuild/MILESTONE_1_FOUNDATION.md).

## Play

V1 production: [https://townfall-tornado.vercel.app/](https://townfall-tornado.vercel.app/)

V2 rebuild preview: [https://townfall-tornado-git-rebuild-v2-anthony-polito-s-projects.vercel.app/](https://townfall-tornado-git-rebuild-v2-anthony-polito-s-projects.vercel.app/)

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5175/`.

## Controls

- `WASD` or arrow keys move the storm marker.
- Pointer drag steers on desktop.
- Mobile and coarse-pointer devices use the on-screen joystick.
- `Pause` opens session, camera, and quality controls.
- `F3` toggles the runtime diagnostics panel.

The start and pause menus retain `Auto`, `Low`, `Medium`, and `High` quality
presets plus synchronized manual controls. `Auto` uses browser and WebGL hints
to choose a conservative renderer class.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:architecture
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
npm.cmd run baseline:v1
```

`verify:architecture` protects the strict v2 ownership boundary.
`verify:render` exercises desktop and mobile lifecycle, input, quality,
diagnostics, renderer budgets, and canvas output. It writes ignored screenshots
under `artifacts/`.

`baseline:v1` starts Vite when necessary and captures the frozen prototype
through the local-only `legacy-v1.html` entrypoint. Its committed report and
reference set live in
[docs/rebuild/V1_BASELINE.md](./docs/rebuild/V1_BASELINE.md).

## Local Diagnostics

```powershell
npm.cmd run debug:logs
```

Open the game with `?debugLogs` to stream browser warnings, errors, hitches, and
runtime events to the JSONL receiver on `127.0.0.1:5176`. Use `?noDebugLogs` to
disable capture.

Dedicated local ports:

- Vite: `5175`
- Debug log receiver: `5176`
- Vite preview: `4175`

## Version History

- `v0.1.0.0`: preserved v1 prototype.
- `v0.2.0.0`: strict v2 foundation and empty playfield.
