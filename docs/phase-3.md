# Phase 3 — short flailing legs

Based on Phase 2 `63a041c257cb6a931fed3d60d391a574af490149`, with the user's
Pages fix pulled first (`d86b1c9`). No changes to the body cage, solver, tuning,
input, reference art, or audio.

## Attachments and geometry

`MascotLegs` reconstructs rest-space surface positions from the existing cage
embedding. Each hip target (±13, 12, 20 mm) binds to the closest surface triangle
with stored barycentric coordinates. These bindings reconstruct exact deformed
hip positions every update. Four other surface bindings provide a local
right/up/front frame; a near-degenerate frame retains its last valid orientation.

Each leg is a 6 mm denim cylinder with radius 4–4.5 mm. Each brown boot is an
11 × 8 × 17 mm rounded box. Four meshes share two geometries and two materials.
The leg roots remain on the skin. They do not participate in picking or contact
physics. Body floor contact still carries the mascot.

## Secondary motion

Two scalar damped springs per leg control fore/aft swing and outward splay.
Hip-midpoint acceleration and changes in the deforming local frame provide
inertial drive. Existing contact speed supplies a kick above 0.12 m/s, with a
100 ms cooldown. Integration uses at most six small scalar substeps per frame.
No vectors, meshes or arrays are allocated in the update loop.

| Parameter | First set | Selected second set |
| --- | --- | --- |
| Spring | 58 | 48 |
| Damping | 7.2 | 6 |
| Translation drive | 1.15 | 1.4 |
| Rotation drive | 1.05 | 3 |
| Impact multiplier | 8 | 12 |
| Maximum kick velocity | 5 | 7.5 |

Both sets use ±60° swing and −22°/+52° dynamic splay limits, with about 7°
resting outward splay. The selected set gives clearer flail while settling.
Geometry proportions were not retuned.

## Validation

`npm run test:legs` verifies exact barycentric attachments through stretch,
approximately symmetric rest, no drift, a local frame following a 90° body roll,
opposing swing/lag, actual throw and landing response, bounds, finite values,
exact reset and settled render inactivity.

Selected-set results:

- Controlled roll lag: 16.02°; actual throw peak: 34.84°.
- Small/hard isolated impact peaks: 1.11° / 34.59°.
- Actual hard landing kick: 26.08°.
- Measured attachment reconstruction error: 0 mm.
- Body throw translation: 65.93 mm, matching the unchanged Phase 2 trajectory.
- Secondary update alone: about 0.00037 ms on the development host, excluding
  rendering, solver and debug snapshots. This is not a phone performance claim.

Typecheck, lint, build and all `test:*` regressions pass. Orientation uses
`CLANG=clang-18`. Desktop/mobile Chrome smoke passes using the inherited software
WebGPU test setup. This does not resolve Linux hardware adapter configuration.
The known legacy optical benchmark is unchanged.

Run the leg test, then `PREVIEW_URL=http://localhost:5173 node scripts/preview-legs.mjs`
against Vite to capture rest, roll, impact and settled screenshots in
`/tmp/squish-legs-*.png`. The development-only inspection hook replays measured
body/leg states; reset restores live interaction.

## Known limitations

Boots are deliberately simple blocks; minor floor/body intersection during
motion is permitted. Boots do not cast dedicated new shadows. The main body
continues to favor its upright recovery pose. No arms, face work, cap,
environment changes or Phase 4 reactions are included.
