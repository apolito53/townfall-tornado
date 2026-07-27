# Milestone 1: Strict Foundation

Status: complete on 2026-07-26

Version: `v0.2.0.0`

Milestone 1 replaces the v1 boot path with a strict, explicitly owned runtime.
The visible world is deliberately small: one flat coordinate field, two roads,
reference posts, and a particle storm marker. It exists to prove lifecycle,
input, timing, quality, diagnostics, and browser behavior before the visual
world is rebuilt.

## Active Runtime

```text
main.ts
  GameApp
    GameSession
    FixedStepClock
    CameraRig
    InputController
    QualityManager
    Diagnostics
    FoundationWorld
      StormMarker
    Hud
    Menus
```

`GameApp` is the only active composition root. World movement passes through a
plain `MovementCommand`; the simulation runs at a fixed 60 Hz; rendering and
camera smoothing remain frame-rate independent.

The active compiler scope is strict and contains no explicit `any` escape
hatches. `scripts/verify-foundation-architecture.mjs` checks the boot import,
strict compiler setting, required core contracts, and absence of v1 runtime
imports.

## Core Contracts

The new typed boundary includes:

- `StormProfile`
- `WorldSeed`
- `DistrictDescriptor`
- `TerrainSample`
- `WorldItemRecord`
- `BuildingDefinition`
- `StructuralState`
- `DestructionEvent`
- `RenderQualityProfile`
- `RuntimeDiagnostics`

Most world and destruction contracts are intentionally unused until their
owners arrive in later milestones. Defining them now prevents those systems
from returning as renderer-owned mesh state.

## Preserved Behavior

- Levels and Endless boot as separate session shells.
- Pause, resume, restart, and mode select use one session lifecycle.
- Keyboard, pointer drag, and mobile joystick produce the same bounded movement
  command.
- Mobile controls retain query overrides and coarse-pointer detection.
- Auto, Low, Medium, High, and synchronized manual quality controls remain.
- Platform quality detection still distinguishes software, low-power,
  integrated, discrete, and unknown renderer classes.
- The F3 overlay reports startup versus gameplay timing, average and p95 frame
  and work time, hitches, fixed-step pressure, scene resources, input, camera,
  and quality state.
- Optional browser logging on port 5176 remains available through
  `?debugLogs`.

## V1 Isolation

The complete prototype source now lives under `src/legacy/v1/` and is excluded
from strict compilation. The active app does not import `Game`, `Town`, or
`Tornado`.

`legacy-v1.html` is a local capture entrypoint only. It keeps the committed v1
baseline reproducible:

```powershell
npm.cmd run baseline:v1
```

The production build still enters through `index.html`; the v1 page is not an
active v2 runtime dependency.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run verify:architecture
$env:TOWNFALL_URL='http://127.0.0.1:5175/'; npm.cmd run verify:render
```

The final local render verification passed:

| Viewport | Canvas | Draw calls | Scene objects | Geometries | Comparison FPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Desktop 1280x800 | 5 / 5 samples | 8 | 13 | 7 | ~119 |
| Mobile 390x844 | 5 / 5 samples | 8 | 13 | 7 | ~128 |

Headless FPS is a same-machine comparison signal, not a hardware benchmark.
The smoke test also verifies:

- Levels and Endless switching.
- Keyboard plus desktop pointer movement.
- Keyboard plus mobile joystick movement.
- Normalized input magnitude.
- No movement while paused.
- Restart position and session reset.
- Perspective and quality updates.
- Warmup-separated steady-state timing.
- Scrollable mobile and desktop diagnostics.
- Nonblank menu and playfield screenshots.
- Zero browser console errors.

## Deliberate Deferrals

- The particle marker is not the final tornado renderer.
- The flat grid is not the terrain or district system.
- The Levels shell has no completion flow yet.
- Bloom remains a stored quality capability but has no post-process owner in
  the foundation renderer.
- There is no town, destruction, score economy, debris system, or category
  growth in the active runtime.

Milestone 2 can now build the visual north-star diorama without inheriting v1
ownership or resource growth.
