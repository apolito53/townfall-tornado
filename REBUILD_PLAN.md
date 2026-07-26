# Townfall Tornado V2 Rebuild Plan

Status: approved direction, ready for implementation

## Goal

Rebuild Townfall Tornado around one strong fantasy: controlling a tornado that feels physically enormous, tears a readable town apart in satisfying stages, and can keep moving through an endless world without the renderer or simulation degrading over time.

The rebuild should feel like storm-chaser footage viewed from a playable elevated perspective:

- A broad storm base owns the sky.
- The funnel descends from that base instead of reading as a freestanding cone.
- Condensation, dust, rain, and debris create volume without hiding the town.
- Category growth changes the scale of the whole scene, not only one mesh.
- Buildings fail before contact and break according to size, material, and storm force.

This is a controlled v2 rebuild, not a framework migration. TypeScript, Vite, Three.js, Vercel, the diagnostic tooling, mobile input, quality detection, and the pooled debris concepts remain useful.

## Baseline And Branch Strategy

The current `master` build remains the playable v1 prototype until v2 reaches its replacement gate.

1. Tag commit `f5fca1d` as the v1 prototype baseline.
2. Create a long-lived `rebuild/v2` branch from that tag.
3. Let Vercel create preview deployments from the rebuild branch.
4. Keep production pointed at `master` until the vertical slice is approved.
5. Merge v2 only after the replacement gate near the end of this plan passes.

The old runtime is reference material, not an API compatibility target. Reuse isolated systems deliberately; do not preserve a bad boundary merely because existing code crosses it.

## Non-Goals

These are intentionally deferred until the rebuilt core proves itself:

- React or React Three Fiber.
- A switch to Babylon.js.
- A mandatory WebGPU-only renderer.
- Full rigid-body simulation for every building fragment.
- Multiplayer or server-authoritative simulation.
- A permanently persistent infinite world.
- Photorealism through a large third-party asset pack.
- Recreating all five current levels before one level is excellent.

## Architecture Rules

### Plain World Data

World generation and gameplay simulation must produce plain typed data. They must not construct `THREE.Mesh`, `THREE.Group`, materials, or geometries.

The renderer owns Three.js objects. This lets chunks unload cleanly, makes generation testable without WebGL, and prevents distant proxy items from secretly carrying complete detailed models.

### Explicit Ownership

Every long-lived resource must have one owner and one disposal path:

- `GameApp`: application lifecycle, renderer, mode transitions, and top-level services.
- `GameSession`: score, category progression, objectives, run state, and pause state.
- `WorldStreamer`: active district window, generation jobs, unloading, and compact visited-state records.
- `TerrainSystem`: continuous height field, terrain meshes, roads, and district blending.
- `TownRenderer`: instanced static town batches, detail promotion, and LOD transitions.
- `TornadoSystem`: storm influence field, movement, category profile, and gameplay queries.
- `TornadoRenderer`: funnel, wall cloud, ground circulation, rain, and storm lighting.
- `DestructionSystem`: structural damage, collapse events, hero debris, and absorption.
- `DebrisSystem`: GPU particulate effects and pooled readable chunks.
- `CameraRig`: category framing, perspective preference, shake, and collision-safe follow.
- `QualityManager`: hardware recommendation, presets, manual overrides, and runtime scaling.
- `Diagnostics`: frame timings, resource budgets, hitch capture, and test hooks.

### Typed Contracts

Enable strict TypeScript during the foundation phase. Avoid catch-all class index signatures.

Core contracts should include:

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

### Bounded Runtime State

Nothing may grow forever because the player keeps moving.

- Active districts have fixed near, detail, and far budgets.
- Unloaded districts retain only compact seed and destruction-state data.
- Particle and hero-debris pools have hard capacities.
- Render batches recycle slots.
- Ground damage is stored per active terrain tile and compacted when unloaded.
- Diagnostics expose every capacity, high-water mark, recycle count, and skipped emission.

## Target Module Layout

The exact filenames may evolve, but ownership should remain close to this shape:

```text
src/
  app/
    GameApp.ts
    GameSession.ts
    gameModes.ts
  camera/
    CameraRig.ts
  core/
    clock.ts
    math.ts
    random.ts
    types.ts
  destruction/
    DestructionSystem.ts
    structuralDamage.ts
  diagnostics/
    Diagnostics.ts
    debugLogger.ts
  input/
    InputController.ts
  quality/
    QualityManager.ts
    platformQuality.ts
  render/
    DebrisSystem.ts
    StormAtmosphere.ts
    TornadoRenderer.ts
    TownRenderer.ts
  ui/
    Hud.ts
    menus.ts
  world/
    DistrictGenerator.ts
    TerrainSystem.ts
    WorldStreamer.ts
    districtTypes.ts
```

## Performance Budgets

Budgets are acceptance criteria, not aspirations. Measure after warmup and exclude initial shader compilation from steady-state frame metrics.

### Desktop High At 1920x1080

- Cat 1 steady-state p95 frame time: at most 16.7 ms.
- Cat 5 destruction p95 frame time: at most 20 ms.
- No gameplay hitch over 100 ms after warmup.
- Town and storm draw calls: at most 450 during Cat 5 stress.
- Live Three.js scene objects: at most 1,500.
- Detailed destructible buildings: at most 160.
- Particle systems: at most 6 draw calls total.
- Destruction simulation CPU time: at most 4 ms p95.

### Low-Power And Mobile

- Auto/Low target: at least 30 FPS during Cat 3 destruction.
- Render scale may fall to 0.65.
- Shadows, volumetric steps, debris density, rain, and detail distance scale independently.
- Touch controls and HUD must not cover the storm contact area.
- A 390x844 viewport must remain playable without clipped menus.

### Endless Stability

After a 20-minute automated traversal:

- Loaded district, scene object, geometry, material, and draw-call counts plateau.
- JavaScript heap growth after warmup remains bounded.
- No growing queue of simulation candidates or absorption rewards.
- Returning to a previously visited district restores its compact destruction state.

## Milestones

### Milestone 0: Preserve And Measure V1

Purpose: establish a safe baseline and make regression targets explicit.

Work:

- Tag the current prototype and create `rebuild/v2`.
- Capture Cat 1, Cat 3, and Cat 5 desktop/mobile reference screenshots.
- Record current frame, draw-call, scene-object, geometry, particle, and chunk metrics.
- Add a rebuild comparison report under `docs/rebuild/`.
- Separate page-load shader compilation hitches from gameplay hitch statistics.

Exit criteria:

- V1 remains available on production.
- V2 has an independent preview deployment.
- Baseline captures and metrics are reproducible with one command.

### Milestone 1: Strict Foundation And Empty Playfield

Purpose: establish clean ownership before rebuilding visible systems.

Work:

- Enable strict TypeScript and define core contracts.
- Create `GameApp`, `GameSession`, fixed-step simulation timing, `CameraRig`, and `Diagnostics`.
- Port input, mobile joystick behavior, quality detection, and debug logging behind typed interfaces.
- Create a minimal flat test world with a movable storm marker.
- Add deterministic seeded random helpers.

Exit criteria:

- The app boots, pauses, restarts, and switches between Levels and Endless shells.
- Keyboard, pointer, and mobile controls drive the same normalized movement command.
- No old `Game`, `Town`, or `Tornado` class is imported into the new runtime.
- Typecheck, build, desktop smoke, and mobile smoke pass.

### Milestone 2: Visual North-Star Diorama

Purpose: prove the game can look right before procedural complexity returns.

Build one deterministic suburban district with approximately 20 buildings, several roads, trees, fences, parked cars, and readable elevation.

Work:

- Create a continuous terrain surface sampled in world coordinates.
- Build one authored road and lot layout rather than a repeated chunk cross.
- Create instanced environment batches with a coherent material palette.
- Implement the first `CameraRig` pass at low, default, and high perspectives.
- Replace the old post-process grade with restrained exposure, fog, rain, and contrast controls.
- Produce Cat 1, Cat 3, and Cat 5 visual states for review.

Exit criteria:

- Terrain has no visible tile seams or checkerboard material changes.
- Roads, lots, buildings, and props have believable placement relationships.
- The town remains readable beneath the storm atmosphere.
- Cat 1 and Cat 5 are unmistakably different at a glance.
- The visual review passes at 1440x900 and 390x844.

### Milestone 3: Tornado And Storm Renderer

Purpose: make the tornado the strongest visual object in the game without building it from transparent cones.

Approach:

- Represent the funnel with a deforming centerline and camera-facing particle or ribbon layers.
- Use shader noise for condensation density, rotation, breakup, and vertical flow.
- Anchor the storm deck and wall cloud in world space.
- Add a descending wall cloud, inflow tails, rain curtains, and localized lightning.
- Separate condensation, ground dust, and carried debris so each scales independently.
- Give each category a shape profile, not only a diameter multiplier.
- Provide cheaper Low/Medium paths with fewer layers and shader samples.

Exit criteria:

- No visible cylinder rims, concentric rings, glued-on cloud spheres, or rectangular sky planes.
- The funnel visually connects to the wall cloud at every camera perspective.
- Motion reads as turbulent and asymmetrical rather than uniformly rotating.
- Cat 5 can extend off-screen while its ground contact remains readable.
- Storm rendering stays within its draw-call and frame-time budgets.

### Milestone 4: Hybrid Destruction

Purpose: make approaching the tornado dangerous before direct contact while keeping destruction bounded.

Model:

- Buildings are lightweight structural records composed of roof, facade, frame, and foundation zones.
- The storm influence field applies pressure, suction, and tangential force to nearby structures.
- Damage progresses through authored stages and emits typed destruction events.
- A small pool of readable hero chunks handles beams, roof slabs, car bodies, and siding.
- Tiny material fragments, glass, leaves, dust, and dirt remain GPU particles.
- Full rigid-body physics is optional for the hero pool and must earn its cost in a benchmark before adoption.

Work:

- Define material-specific resistance and debris responses.
- Add directional roof loss, facade peeling, frame failure, collapse, and absorption.
- Make cars, trees, fences, houses, shops, and offices fail differently.
- Add terrain decals or tile damage for scouring, mud, impact, and rubble.
- Keep scoring and growth driven by destruction events, not visual particles.

Exit criteria:

- A building visibly starts failing as the storm approaches.
- Collapse direction responds to the storm position and motion.
- No independent mesh is created for tiny fragments.
- Hero and particle capacities remain bounded during repeated Cat 5 passes.
- Destroying the full diorama remains playable on High and Low.

### Milestone 5: District World Streaming

Purpose: turn the diorama into a varied world without bringing back infinite accumulation.

Work:

- Generate a road graph before placing lots and props.
- Add district generators for farmland, suburb, main street, industrial, and downtown.
- Blend terrain and district types across broad transition zones.
- Generate terrain from global coordinates so neighboring tiles share heights and normals.
- Reserve roads, sidewalks, driveways, building footprints, utility space, and vegetation zones before prop placement.
- Stream near-detail districts, far impostor districts, and unloaded compact state.
- Pool and recycle terrain meshes and render-batch slots.
- Add deterministic generation tests and placement-invariant tests.

Exit criteria:

- No cars, trees, fences, or buildings intersect roads or one another.
- Heights, roads, and materials transition continuously between districts.
- Driving in one direction for 20 minutes does not increase active resource counts.
- Returning to a location reproduces the same district and remembered destruction.

### Milestone 6: Gameplay, Levels, And Progression

Purpose: turn the systems into a game rather than a renderer showcase.

Work:

- Keep Endless as the systems playground.
- Rebuild Levels as distinct scenarios using authored seeds, district combinations, weather, starting category, time pressure, and objectives.
- Give levels scenario-specific objectives such as damage value, target structures, path survival, or category growth.
- Retune category mass gates and absorption pacing against the rebuilt destruction economy.
- Prevent late-category chain reactions from completing objectives instantly.
- Add clear category transitions, score feedback, combo feedback, and level completion states.
- Tune camera scale and movement speed by category without making large storms feel detached.

Exit criteria:

- At least three levels feel meaningfully different before expanding to five.
- Endless cannot enter a forced completion state.
- Cat 4 and Cat 5 progression remains earned rather than explosive.
- Large storms continue affecting fresh structures across their whole influence area.

### Milestone 7: Quality, UI, And Mobile Pass

Purpose: make the rebuilt game understandable and usable across hardware tiers.

Work:

- Keep `Auto`, `Low`, `Medium`, and `High`.
- Hide manual controls under an Advanced section instead of showing every slider immediately.
- Add runtime frame-pressure sampling that can recommend or apply conservative reductions in Auto mode.
- Scale terrain detail, town detail, shadows, storm layers, particles, rain, post-processing, and render resolution separately.
- Redesign start, pause, HUD, level, and diagnostics layouts around the rebuilt information hierarchy.
- Keep the joystick, safe-area support, and coarse-pointer detection.

Exit criteria:

- No overlapping pseudo-labels, clipped diagnostics, or unscrollable menus.
- Auto chooses a conservative usable preset on software, integrated, discrete, and mobile renderer classes.
- Manual controls stay synchronized between start and pause surfaces.
- Mobile remains playable in portrait and landscape.

### Milestone 8: Replacement Gate

V2 may replace production only when all of the following are true:

- Cat 1 through Cat 5 are playable.
- The tornado, wall cloud, terrain, and destruction pass visual review.
- Endless survives the 20-minute traversal soak.
- Desktop High and mobile Low meet their frame budgets.
- At least three distinct levels are complete.
- Mode selection, pause, restart, quality controls, diagnostics, and mobile input pass automation.
- No legacy runtime modules are imported.
- README and `CODEBASE_INDEX.md` describe v2 rather than the prototype.

After the gate passes:

1. Merge `rebuild/v2` to `master`.
2. Verify the Vercel production deployment.
3. Keep the v1 tag for historical comparison.
4. Remove temporary comparison assets that are not useful project documentation.

## Validation Strategy

### Unit And Data Tests

- Category progression and score pacing.
- Deterministic district generation from seeds.
- Continuous terrain samples across tile boundaries.
- Placement reservations and collision-free prop generation.
- Chunk load/unload and compact state restoration.
- Structural damage thresholds and destruction-event ordering.
- Quality-profile sanitization and Auto recommendations.

### Render Verification

Capture stable review images for:

- Cat 1, Cat 3, and Cat 5.
- Low, Medium, and High quality.
- Desktop and mobile.
- Suburb, farmland, main street, industrial, and downtown districts.
- Intact, approaching failure, collapsing, and destroyed structures.

Render verification should fail on:

- Blank or crushed frames.
- Visible LOD silhouettes or zero-scale proxy artifacts.
- Tornado rims, rings, detached storm bases, or sky-plane edges.
- Terrain seams.
- HUD overlap or clipping.
- Draw calls, scene objects, particles, or loaded districts above budget.

### Runtime Soaks

- Five-minute stationary Cat 5 destruction stress.
- Twenty-minute straight-line Endless traversal.
- Ten-minute repeated revisit loop across the same district boundary.
- Repeated restart, mode-select, level-transition, and quality-switch cycles.

## Immediate Execution Order

The first implementation pass should stop after Milestone 1:

1. Tag and branch.
2. Add baseline captures and metric reporting.
3. Establish the strict typed runtime shell.
4. Port input, quality, logging, and diagnostics.
5. Boot a flat empty playfield with a movable storm marker.
6. Validate and deploy the first v2 preview.

Only then begin the visual diorama. This gives the rebuild a clean spine while keeping the first coding pass small enough to review properly.
