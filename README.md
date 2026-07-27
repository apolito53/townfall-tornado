# Townfall Tornado

Townfall Tornado is a 3D browser game about steering a growing tornado through
a destructible town. The `rebuild/v2` branch is rebuilding that fantasy on a
strict, bounded Three.js runtime while the original prototype remains on
production.

Milestone 2 is now a visual-review candidate: one deterministic 3.2 km Plains
town edge with continuous rolling terrain, an authored 20-building settlement,
instanced town details, storm and clear weather, and physically scaled Cat 1,
Cat 3, and Cat 5 review states. The current condensation silhouette is
deliberately temporary. The final tornado, wall cloud, debris, destruction,
scoring, progression, and procedural streaming arrive in later milestones.

The full rebuild direction and acceptance gates live in
[REBUILD_PLAN.md](./REBUILD_PLAN.md). Milestone reports live under
[docs/rebuild/](./docs/rebuild/).

## Play

V1 production: [https://townfall-tornado.vercel.app/](https://townfall-tornado.vercel.app/)

V2 rebuild preview: [https://townfall-tornado-git-rebuild-v2-anthony-polito-s-projects.vercel.app/](https://townfall-tornado-git-rebuild-v2-anthony-polito-s-projects.vercel.app/)

Production stays on `master` until the v2 replacement gate passes. The Vercel
preview follows `rebuild/v2`.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5175/`.

## Controls

- `WASD` or arrow keys move the tornado.
- Pointer drag steers on desktop.
- Mobile and coarse-pointer devices use the on-screen joystick.
- `Pause` opens session, camera, and quality controls.
- `F3` toggles the runtime diagnostics panel.

The start and pause menus retain `Auto`, `Low`, `Medium`, and `High` quality
presets plus synchronized manual controls. `Auto` uses browser and WebGL hints
to choose a conservative renderer class.

## Visual Review

The review build accepts query parameters without changing gameplay state:

- `?category=1`, `?category=3`, or `?category=5` selects the review profile.
- `?weather=storm` or `?weather=clear` selects the presentation.
- Parameters combine, for example `?category=3&weather=clear`.

Defaults are Cat 1 and storm weather. Review diameters and movement speeds are:

| Profile | Diameter | Speed |
| --- | ---: | ---: |
| Cat 1 | 80 m | 24 m/s |
| Cat 3 | 420 m | 18 m/s |
| Cat 5 | 1,609.344 m | 12 m/s |

Use the pause-menu perspective slider to inspect each category's low, default,
and high camera envelopes. Cat 5 intentionally extends beyond the viewport;
its physical footprint is not shrunk into a tidy little product shot.

## Validation

```powershell
npm.cmd run test:unit
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:architecture
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
npm.cmd run baseline:v1
```

`test:unit` covers deterministic terrain, district data, placement invariants,
surface grades, normals, and exact storm profiles without WebGL.
`verify:architecture` protects the strict v2 ownership boundary.
`verify:render` exercises desktop and mobile lifecycle, input, quality,
diagnostics, category framing, renderer budgets, and canvas output. It writes
ignored review frames under `artifacts/rebuild/milestone-2/`.

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

Milestone 2 remains an unversioned review candidate. Package `0.2.1` and tag
`v0.2.1.0` are reserved for visual approval.
