# Squish Crew

A mobile-first soft mascot physics toy with one round, deformable bean-person
body, built on the inherited Droppie WebGPU engine and interaction architecture.

The opaque skin/navy/denim prototype now has two tiny spring-driven legs and
chunky brown boots, short lagging arms, sunglasses, facial hair, and a navy `39`
cap. Surface-bound collar, pockets and buttons define the work shirt above the
jeans. The settled body measures about 73 × 59 × 48 mm (height ×
width × depth). See [Phase 2 measurements](docs/phase-2.md) and
[Phase 3 legs](docs/phase-3.md) for tuning, validation and limitations.
The [attached character details](docs/character-details.md) extend that same
surface-binding approach without changing the physical body.
The inherited Droppie tutorials below describe the technical lineage; their
water-material discussion is historical, not the current character material.

## Play with Squish Crew

**[boxwrench.github.io/squish-crew](https://boxwrench.github.io/squish-crew/)**

Tap the body to hop. Grab the belly, side or upper section to stretch it, then release to throw
it. Drag empty floor to orbit, pinch or scroll to zoom, press Space to hop, R
to reset, and Escape to release. Sound unlocks after interaction; the buttons
in the top-right mute sound and reset the toy.

The demo needs a WebGPU-capable recent browser and a secure context (HTTPS or
localhost). The first visit downloads roughly 12 MB of textures and an HDR
environment; later visits use the browser cache.

## What this project teaches

Droppie is useful because its systems are small enough to read end to end. The
same scene connects a tetrahedral mechanics model, a deformed render surface,
transmission and refraction, pointer interaction, mobile quality control, and
procedural Web Audio. Some parts are physical approximations; others are
deliberate visual or audio cheats designed to communicate the right sensation
at low cost.

## Mental model: how Droppie works

```text
input
  ↓
grab target
  ↓
XPBD tetrahedral body
  ↓
deformed visible surface
  ↓
optical thickness / transmission
  ↓
WebGPU render
```

The game advances mechanics at a fixed 240 Hz step when possible. Rendering,
input, sound, and the optical worker run around that simulation rather than
changing the solver's time step whenever a frame is late.

## Tutorial 1 — The soft body

Droppie is simulated as a cage made from tetrahedra. Each tetrahedron stores a
rest volume and a rest-space gradient. The cage is the economical physics
representation; it does not need to have the same triangle count as the pretty
surface you see.

At each XPBD step, the solver predicts positions, projects elastic constraints,
keeps tetrahedra from inverting, resolves floor contacts, and updates velocity.
The elastic solve separates two useful ideas:

* shear/deviatoric stiffness resists changes in shape, such as turning a round
  drop into a pancake;
* bulk stiffness resists changes in volume, such as squeezing the drop smaller.

The current values are `shear: 1200`, `bulk: 65000`, `density: 1050`, gravity
`2.4`, three solver iterations, and a fixed step of `1 / 240` seconds in
[`src/physics/constants.js`](src/physics/constants.js). The numbers are in SI
units as far as this toy's scale permits. XPBD adds compliance to the
constraints, so stiffness remains usable when the frame rate varies instead of
requiring an impossibly small time step.

## Tutorial 2 — From jelly to water

Water-like behavior comes from the combination rather than one magic setting.
Droppie has high bulk stiffness, low shear stiffness, damping, and a separate
shape-memory force. The shape memory follows the moving mass center and pulls
the relaxed silhouette back toward its rest shape; its current values are
`shapeMemory: 30` and `shapeDamping: 1.5`.

High bulk plus low shear lets the body keep roughly the same amount of water
while spreading sideways. Shape memory keeps it from remaining a puddle after a
stretch. Lower `shear` and it becomes floppier; lower `bulk` and it becomes
compressible. Those are physical-feeling controls, not a full fluid solver.

## Tutorial 3 — Grabbing and throwing

The visible surface is embedded in the tetrahedral cage. A pointer hit first
finds a triangle, computes its barycentric coordinates, then expands those
weights through the surface's four-node stencil into cage-node weights. The
grab constraint follows that weighted point, so the triangle stays attached as
the body deforms instead of becoming a floating cursor decal.

The grab is force-limited (`maxGrabForce: 4`). Dragging therefore has a useful
sequence: the body sticks while it strains, then slips when the horizontal lead
passes `grabSlipDistance: .018` metres. Contact friction is reduced to `.25`
of its normal value while sliding, and hysteresis returns it to the sticky
state at `.010` metres. On release, the stored velocity makes the throw feel
continuous with the stretch.

## Tutorial 4 — Rendering translucent water

The visible mesh uses a `MeshPhysicalNodeMaterial` with water's refractive index,
`ior: 1.333`, transmission, clearcoat, and a small amount of dispersion. A
per-vertex `opticalThickness` attribute records how much material a ray crosses.
Thickness drives absorption so the edge, thin tip, and fat body do not all
turn the same opaque blue. See [`src/graphics/baby.ts`](src/graphics/baby.ts)
and [`src/physics/deform-surface.js`](src/physics/deform-surface.js).

The optical pipeline builds a smaller proxy and light/shadow textures for
refraction, contact, and caustic-like illumination. [`src/graphics/transport.ts`](src/graphics/transport.ts)
updates that work on a slower cadence than the main render, while the floor and
Droppie share the scene environment. These are approximations: a complete
screen-space or path-traced solution would cost too much on a phone, and the
proxy keeps the important cues—thickness, bending, bright edges, and contact—at
bounded resolution.

## Tutorial 5 — Splash and puddle effects

Landing effects are intentionally perceptual cheats, not a fluid simulation.
Hard contact spawns a bounded set of small ballistic spheres in
[`src/water/splash-particles.ts`](src/water/splash-particles.ts). They fly for a
short time and retire when they meet the floor.

The puddle is even cheaper: [`src/water/puddle.ts`](src/water/puddle.ts) exposes
uniforms for one transient impact, and [`src/graphics/table.ts`](src/graphics/table.ts)
reads them in the hardwood shader. The shader makes an irregular footprint,
adds a glossy wet core and softer damp halo, perturbs highlights with tiny
waves, and fades the effect after roughly 1.3–1.45 seconds. This is an example
of a useful graphics decision: when the viewer needs “plop, wet wood, gone,” a
small radial mask communicates it better than a real puddle solver.

## Tutorial 6 — Making it work on a phone

The renderer chooses a quality tier from pointer type and hardware concurrency.
Current defaults are DPR `1.25` and 12 optical updates per second for a coarse
pointer with four or fewer reported cores, DPR `1.5` and 20 optical updates for
other coarse devices, and DPR `2` and 30 optical updates on desktop. The
values live in [`src/graphics/quality.ts`](src/graphics/quality.ts).

The physics keeps its fixed step, while optical work is allowed to update less
often. If a rolling four-second window detects sustained slow frames, the
renderer lowers DPR and optical frequency in bounded increments. Sleeping
Droppie also stops unnecessary simulation and render work. The goal is graceful
degradation: fewer expensive pixels and optical refreshes before sacrificing
the feel of the mechanics.

## Tutorial 7 — Procedural sound

[`src/game/sound.ts`](src/game/sound.ts) creates one shared `AudioContext` only
after a pointer, touch, or keyboard gesture. It primes the output for mobile
browser policies, routes procedural oscillators and short noise buffers through
a master gain and compressor, and fades the master to zero when muted. Landing
sound is built from damped sine modes plus a filtered noise transient. The
background music is the looped `Button_Nose_Parade.mp3` asset at a quiet `.15`
music gain; if it cannot be fetched or decoded, the small synthesized melody
remains as a fallback. Facility audio uses the same context, and no audio
package dependency is required.

This is deliberately event-driven. Contact calls create a short sound at the
impact strength; the fixed physics loop does not emit a sound every frame.

## Experiments to try

Make one change at a time, rebuild, and predict the result before playing:

* Change `shear` in [`src/physics/constants.js`](src/physics/constants.js) from
  `240` to `600`. Droppie should resist sideways deformation and feel more like
  rubber or soft gel.
* Change `bulk` from `65000` to `20000`. The same grab should compress the body
  more, because volume preservation is weaker.
* Change `shapeMemory` from `30` to `8`. The stretched silhouette should recover
  slowly and remain floppy for longer after release.
* Change `ior` in [`src/graphics/baby.ts`](src/graphics/baby.ts) from `1.333` to
  `1.45`. Refraction and edge bending should become more pronounced.
* Change the default flavor absorption in
  [`src/graphics/jelly-flavors.ts`](src/graphics/jelly-flavors.ts). Higher
  absorption should make thicker parts darker and more saturated.
* Change `maxGrabForce` from `4` to `1.5`. A fast pointer should slip or lag
  sooner instead of dragging the cage as firmly.
* Change the puddle lifetime passed by the impact in
  [`src/water/puddle.ts`](src/water/puddle.ts) from about `1.3` seconds to `.5`.
  The landing cue should evaporate before the viewer has time to study it.

## Run locally

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the printed localhost URL in a recent WebGPU-capable browser. Phones
normally need HTTPS; an ordinary LAN HTTP address is not enough for WebGPU.
The static production output is written to `dist/` by `npm run build`.

`.github/workflows/pages.yml` rebuilds and redeploys the site on every push to
`main`.

## Verify

The core checks are:

```sh
npm run test:physics
npm run typecheck
npm run lint
npm run build
```

The other verification scripts cover the retained reference facilities and
specific invariants:

```sh
npm run test:swing
npm run test:trampoline
npm run test:facility-collision
npm run test:facility-shadows
npm run test:facility-sound
npm run test:multitouch
npm run test:orientation
npm run test:deformation
npm run test:performance
npm run benchmark
```

For browser checks, start the dev server and run:

```sh
node scripts/preview-check.mjs
```

That check expects Chrome at `/usr/bin/google-chrome`, exercises desktop
grab/release/reset/mute and mobile touch loading, and writes screenshots to
`/tmp/droplet-*.png`.

## Project map

* [`src/game/runtime.ts`](src/game/runtime.ts) assembles the scene and frame
  loop.
* [`src/game/input.ts`](src/game/input.ts) maps pointer and keyboard actions to
  grabs, orbit, zoom, hop, and reset.
* [`src/physics/soft-body.js`](src/physics/soft-body.js) is the readable XPBD
  solver; [`src/physics/soft-body-kernel.js`](src/physics/soft-body-kernel.js)
  is the optional compiled fast path.
* [`src/physics/baby-cage.ts`](src/physics/baby-cage.ts) loads the generated
  tetrahedral cage and surface embedding.
* [`src/physics/grab.ts`](src/physics/grab.ts) contains barycentric surface
  attachment and target motion.
* [`src/graphics/baby.ts`](src/graphics/baby.ts) owns translucent water material
  settings and thickness absorption.
* [`src/graphics/refractive-light.js`](src/graphics/refractive-light.js) and
  [`src/graphics/transport.ts`](src/graphics/transport.ts) update optical
  proxies and textures.
* [`src/graphics/table.ts`](src/graphics/table.ts) shades the hardwood, including
  the transient puddle.
* [`src/water/splash-particles.ts`](src/water/splash-particles.ts) and
  [`src/water/puddle.ts`](src/water/puddle.ts) implement the bounded landing
  cheats.
* [`src/graphics/quality.ts`](src/graphics/quality.ts) contains mobile quality
  tiers and adaptive workload reduction.
* [`src/game/sound.ts`](src/game/sound.ts) owns gesture unlocking, procedural
  contact audio, compression, and mute behavior.

`npm run build:model` regenerates the deterministic mascot mesh, tetrahedral
cage, surface embeddings, and optical proxy. `npm run build:kernel` rebuilds the
optional kernel source.

## Foundation and credits

Squish Crew is derived from
[boxwrench/Droppie](https://github.com/boxwrench/Droppie), which was adapted from
[scottstts/Jelly-Baby](https://github.com/scottstts/Jelly-Baby), baseline commit
`528e15bb9248f1f15eaaa838fd260860d0d2825c`. The original source was inspected
and its build architecture retained. The upstream repository remains the
reference for the solver, WebAssembly kernel, optical worker, caustic pipeline,
HDR environment, and wood assets. Droppie replaces the generated humanoid with
a droplet and leaves the upstream facility modules available as reference.

Original Droppie contributions are released under the [MIT License](LICENSE).
When redistributing them, retain the copyright and permission notice. The
Jelly-Baby-derived portions and upstream assets remain subject to their own
terms. `Button_Nose_Parade.mp3` is a project-supplied music asset and should be
redistributed only with the creator's permission and attribution.

## Further reading

* [XPBD: Position-Based Simulation of Compliant Constrained Dynamics](https://matthias-research.github.io/pages/publications/XPBD.pdf)
* [Position Based Dynamics](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf)
* [Three.js WebGPU renderer documentation](https://threejs.org/docs/#manual/en/introduction/Installation)
* [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
* [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API)
