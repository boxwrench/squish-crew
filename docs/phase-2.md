# Phase 2 — soft mascot prototype

Starting point: `bdb3ad116885aa00f809733ec1f59a1f1b6b2d3f`.

`scripts/build-mascot.mjs` creates one closed, consistently wound positive-volume
surface from elliptical horizontal sections. A broad belly narrows into a rounded
upper/head mass. It uses the existing cut-cell cage and optical-proxy builders.
Two consecutive generations produced identical binary and manifest hashes.
The inherited generated filenames remain to avoid changing runtime asset loading.

Geometry: 6,050 visible vertices, 12,096 triangles, 632 particles, 2,442 tetrahedra,
1,490 optical vertices and 2,976 optical triangles. Proxy mapping error is at most
0.169 mm. The reference volume is 98.93 cm³.

## Bounded tuning sweep

| Shear | Shape memory | Shape damping | Settled height | Observation |
| --- | --- | --- | --- | --- |
| 700 | 80 | 2 | 56.11 mm | Tipped over during initial settling |
| 1200 | 150 | 3.5 | 73.45 mm | Selected: coherent recovery with visible deformation |
| 1800 | 250 | 5 | 74.21 mm | Stable, firmer recovery |

Bulk 65,000, density 1,050, damping 3, gravity 2.4, 240 Hz and three iterations
remain inherited. Rest dimensions are 58.82 × 73.45 × 48.41 mm (XYZ).

## Measured validation

`npm run test:mascot` uses the real surface BVH and barycentric grab binding for
belly, side and upper grabs. Opposed grips reach 2.267× resting width. A vertical
drop from 100 mm with 450 mm/s downward speed compresses to 0.694× resting height
and rebounds to 1.039×. The throw/tumble scenario translates the mass by 65.93 mm.
Recovered dimensions after the grab scenarios: 58.79 × 73.47 × 48.29 mm.
Across these scenarios volume ratios span 0.930–1.017, the minimum element
Jacobian is 0.12003, all states stay finite, and the body eventually sleeps.

Typecheck, lint, build, physics, mascot, swing, trampoline, facility collision,
facility shadows, facility sound, multitouch, deformation, orientation and
performance checks pass. Orientation uses `CLANG=clang-18`. The dormant swing-seat
overlap fixture now allows ten seconds rather than two for the broader body to
clear 6 mm slats; its original 1 mm clearance assertion remains unchanged.
The inherited legacy benchmark is already incompatible with the current GPU API
at the approved baseline and was not repaired as part of character work.

Chrome smoke passes desktop grab/stretch/release/orbit/reset/mute and mobile
tap/grab/release/pinch/landscape. Software WebGPU is used for reproducibility;
this is not a physical-phone frame-rate measurement.

To reproduce screenshot review, start Vite, run `npm run test:mascot`, then
`PREVIEW_URL=http://localhost:5173 node scripts/preview-mascot.mjs`.
It saves four `/tmp/squish-mascot-{rest,stretch,landing,rolled}.png` files from
actual measured solver states through a development-only inspection hook.
Reset exits inspection. Ordinary gameplay input is unchanged.

## Scope and limitations

The body is an opaque rough material with rest-space vertex colors that follow
deformation. The Droppie face is no longer instantiated. Character transmission,
thickness shading, attenuation and emission are absent; floor caustic contribution
is zero while the inherited optical infrastructure remains available.

The silhouette is deliberately crude and faceless. Extreme point grabs produce
thin stretched lobes. Shape recovery still favors the upright rest orientation,
so this is a tumbling toy rather than a freely resting rigid object. Inherited
sound and splash behavior remain as baseline behavior; no new reaction work was
added. Reference artwork is unchanged. No Phase 3 or later features are included.
