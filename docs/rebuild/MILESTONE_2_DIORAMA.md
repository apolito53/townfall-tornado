# Milestone 2: Visual North-Star Diorama

Status: implementation candidate awaiting visual approval

Branch: `rebuild/v2`

Version: remains `0.2.0`; `0.2.1` and tag `v0.2.1.0` are approval-gated

Milestone 2 replaces the foundation test field with one deterministic graphic
low-poly Plains town edge. It is a visual north-star, not the returned game
loop: terrain, town composition, physical storm scale, weather, camera, and
bounded rendering are active; destruction, scoring, progression, procedural
streaming, and the final tornado renderer remain deliberately absent.

## Authored World

The diorama spans 3,200 x 3,200 meters and keeps movement inside a 2,900-meter
playable square. A pure `TerrainField` supplies continuous world-coordinate
height, normal, and surface samples to simulation, tests, and rendering.

The field combines broad authored ridges, a drainage swale, about 99 meters of
measured elevation range, road stamps, and flattened building pads. The
renderer consumes it as one 256-segment faceted terrain mesh with a
fog-concealed perimeter skirt. There are no runtime terrain tiles.

The authored district contains:

| Content | Count |
| --- | ---: |
| Structures | 20 |
| Trees | 80 |
| Parked cars | 14 |
| Fence segments | 220 |
| Utility poles | 28 |
| Minor props | 32 |
| All props | 374 |

The structure inventory is exactly nine detached homes, one duplex, one
manufactured home, one school, one fire station, one convenience store, one
strip shop, one feed/repair warehouse, two barns, and two utility buildings.
Layout coordinates are authored; the fixed district seed controls variants,
palette choices, vegetation, and props.

## Render Architecture

`DioramaWorld` is the single world composition owner. It combines:

- `TerrainRenderer` for the continuous land, roads, gravel spur, pads,
  sidewalks, shoulders, driveways, and markings.
- `TownRenderer` for component-level instanced foundations, walls, roofs,
  doors, windows, trim, roof details, vegetation, vehicles, fences, utilities,
  and small props.
- `MaterialAtlas` for one deterministic 1024 px atlas and shared materials.
- `StormAtmosphere` for sky, lighting, fog, shadows, and bounded
  camera-relative rain.
- `StormSilhouette` for the explicitly temporary condensation and ground-dust
  review batches.

Building component handles retain stable building IDs and instance indices so
Milestone 4 destruction can mutate bounded batches instead of searching a
mesh-per-part scene graph.

Low quality preserves all major terrain and building silhouettes while
reducing optional instance prefixes and rain. No `EffectComposer`, bloom,
outline pass, mesh debris, or unbounded particle creation exists in this
milestone.

## Storm And Camera

The renderer-independent `TornadoSystem` owns fixed-step movement, terrain
following, category profile selection, and bounds clamping. Render code
receives only its plain `StormSnapshot`.

| Profile | Physical diameter | Movement speed | Camera range |
| --- | ---: | ---: | ---: |
| Cat 1 | 80 m | 24 m/s | 120-260 m |
| Cat 3 | 420 m | 18 m/s | 220-520 m |
| Cat 5 | 1,609.344 m | 12 m/s | 360-850 m |

Cat 5 remains physically one mile wide and intentionally extends beyond the
normal viewport. The high-perspective review frame shows more of its footprint
without reducing that physical scale.

`CameraRig` samples terrain at twelve points along its chase line, maintains
at least 12 meters of clearance, follows terrain-aware targets, and uses a
6 km far plane. The pause-menu perspective control interpolates within each
category envelope.

Review URLs accept:

```text
?category=1|3|5
?weather=storm|clear
```

Defaults are Cat 1 and storm. Clear QA mode disables rain, extends visibility,
and neutralizes the storm lighting.

## Contracts And Diagnostics

The plain v2 boundary now includes `DioramaDistrictData`, `RoadDefinition`,
`LotDefinition`, `BuildingRecord`, `StormSnapshot`, and `WeatherMode`.
`BuildingDefinition` includes archetype, stories, roof shape, and roof
material; terrain supports gravel; world items include utility and minor-prop
kinds.

Runtime diagnostics are schema 3 and identify the runtime as `v2-diorama`.
They report category, physical diameter, weather, terrain range, buildings,
props, instance batches, active instances, camera clearance, and Three.js
resource counts in addition to the existing lifecycle, input, quality, and
timing data.

## Validation

The WebGL-free suite contains 14 tests across six files. It verifies:

- Stable district signatures and exact authored inventories.
- Finite continuous terrain with unit normals.
- At least 75 meters of relief.
- Roads at or below 8 percent grade and pads at or below 2 percent.
- Grounded placements and landscape reservation clearance.
- Fixed-step tornado movement, bounds, and terrain following.
- Camera category envelopes and twelve-sample clearance.
- Review query parsing.
- A Cat 5 diameter of exactly 1,609.344 meters.

The browser verifier preserves the Milestone 1 lifecycle, input, pause,
restart, mode, quality, diagnostics-scroll, and mobile-control checks while
adding the full Milestone 2 category, weather, perspective, and resource
matrix.

Review frames are generated locally under the ignored directory:

```text
artifacts/rebuild/milestone-2/
```

The acceptance budgets are:

| Target | Draw calls | Triangles | Scene objects | Geometries | Textures | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop High | 90 | 350,000 | 180 | 40 | 6 | 16.7 ms |
| Mobile Low | 60 | 220,000 | 140 | 40 | 6 | 33.3 ms |

The final local matrix passed:

| Target | Draw calls | Triangles | p95 | Result |
| --- | ---: | ---: | ---: | --- |
| Desktop High | 59 | 180,342 | 6.2 ms | Pass |
| Mobile Low | 49 | 154,262 | 6.1 ms | Pass |

All sampled frames also remained at or below 68 scene objects, 40 geometries,
and 3 textures. The verifier found no browser console errors, blank frames,
terrain-edge samples, camera-clearance failures, or HUD overlap.

The nine visual-review captures are:

- Desktop High storm Cat 1, Cat 3, and Cat 5.
- Desktop High Cat 3 clear QA.
- Desktop High Cat 1 low, default, and high perspective.
- Mobile Low storm Cat 1 and Cat 5.

## Delivery Chain

Milestone 2 is split into four reviewable pushed commits:

1. `1cb2d51` - deterministic terrain, district data, contracts, and pure tests.
2. `7d34f68` - runtime atlas plus instanced terrain and town rendering.
3. `fd2a408` - storm-scale runtime, atmosphere, camera, and diagnostics.
4. Verification, review frames, and documentation, including this report.

## Approval Gates

Two reviews remain intentionally human:

1. Clear-weather terrain and town composition.
2. Storm atmosphere plus Cat 1, Cat 3, and Cat 5 framing across desktop and
   mobile.

Candidate screenshots are evidence, not approved references. After both gates
pass, the package can move to `0.2.1`, receive tag `v0.2.1.0`, and mark
Milestone 2 complete. Until then, production remains on `master`.

## Deferred

- Final deforming tornado and condensation shader.
- Storm deck, wall cloud, inflow tails, lightning, and carried debris.
- Building damage, collapse, debris, terrain scarring, and scoring.
- Category progression and level completion.
- Procedural district generation and world streaming.

Those systems belong to Milestones 3 through 6. The temporary silhouette should
not become an accidental permanent tornado by accumulating one more patch at a
time.
