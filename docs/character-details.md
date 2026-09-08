# Attached character details

Starting commit: `bd27344dafbf95eed63bb49d4cedd2aa0446fd8a`.

This user-approved visual pass adds short arms, sunglasses, nose/cheeks,
mustache/goatee, a navy cap with cream `39`, and a more readable work shirt and
jeans. It does not add new audio, reactions, environment props, or physical limbs.

## Deforming attachments

`SurfaceAttachment` reuses the proven rest-triangle/barycentric approach. It
caches the body’s reconstructed rest surface and samples four nearby surface
points to form a stable deformation-relative local rotation. Accessories follow
local squash, stretch and rotation; ambiguous patches retain their last valid
rotation. A deformed normal supports thin raised clothing panels.

Head features have individual bindings. The cap crown, brim and geometry-only
`39` share an upper-head binding. All accessories disable raycasting so grabbing
continues to use the original main-body picking path.

The tiny arms each have one swing axis: spring 72, damping 9, translation drive
1.2, rotation drive 2.2, limit ±30°. They are deliberately quieter than the legs.
Sleeves and capsule-shaped hands are render-only. Reset zeroes velocities; idle
accessory revisions stop changing after secondary motion settles.

## Clothing

A shaped untucked hem and jeans center seam replace the straight painted band.
Collar, placket, two pocket panels/flaps and four buttons are small tessellated
surface-bound meshes merged into one draw. Each vertex follows its own binding
and normal offset, keeping the patches on a strongly curved belly.

## Validation and limits

`npm run test:character` verifies exact arm/head/clothing anchors, 90° head/cap
rotation, restrained arm lag, real throws, strong opposed stretching, finite
transforms, reset, no-drift sleep and non-pickability. Measured attachment error
is zero; controlled arm lag is 5.68°, actual throw lag 2.68°. Accessory CPU updates
measure roughly 0.025 ms on the development host, excluding GPU rendering.

All existing `test:*` regressions, typecheck, lint and build pass. Desktop and
mobile software-WebGPU Chrome smoke tests pass. This is not a hardware-phone
performance measurement. Main-body model, solver, constants, input, reference
artwork and preserved audio bytes remain unchanged.

Run `npm run test:character`, then `PREVIEW_URL=http://localhost:5173 node
scripts/preview-character.mjs` against Vite for rest, roll, stretch and settled
captures in `/tmp/squish-character-*.png`. Captures replay real solver states.

The look remains deliberately procedural: segmented cap numerals, blocky boots,
simple hands and rigid small face pieces. Extreme deformation may temporarily
separate adjacent face pieces or intersect accessories; each stays attached to
its own skin location. No new accessory collision system or dedicated shadows
were introduced.
