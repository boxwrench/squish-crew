# Squish Crew — Implementation Plan

Repository: `boxwrench/squish-crew`  
Technical base: current `boxwrench/Droppie` codebase  
Primary target: mobile-first WebGPU physics toy  
Character direction: soft mascot blob, based on the supplied cartoon turnaround  
Environment: decorative cartoon boiler room  
Branding: IUOE 39 logo as a single wall sign; simple `39` on the cap

## 1. Product Goal

Build a second standalone Droppie-style toy featuring a short, round cartoon union worker.

The character should feel like:

- a heavy plush mascot
- a soft beanbag person
- a rubbery little worker
- funny when rolled, thrown, stretched, and bounced

The player should be able to:

- tap him
- grab him
- stretch him
- throw him
- roll him
- watch his body squash and recover
- watch his little legs flail
- trigger cartoon sweat droplets on hard impacts or extreme stretching
- hear small grunts on impacts and a squeal on large stretches

The experience should remain a physics toy, not a walking game.

## 2. Visual Target

Use the supplied character turnaround/reference as the design source.

Important traits:

- very short
- very round / fat
- large belly
- blue short-sleeve work shirt
- blue cap with `39`
- jeans
- brown work boots
- sunglasses
- mustache / goatee
- friendly cartoon expression
- chibi / mascot proportions

The character must remain readable while rolling, upside down, sideways, squashed, stretched, and airborne.

Do not pursue photorealism or realistic anatomy.

## 3. Core Technical Strategy

Reuse the Droppie engine wherever practical.

Keep:

- Three.js / WebGPU renderer
- mobile pointer input
- grab / stretch / throw interaction
- fixed-step physics loop
- surface picking
- quality scaling
- GitHub Pages deployment
- audio unlock / mute architecture
- dev/debug hook pattern
- build and verification structure

Change:

- character geometry
- physics tuning
- character material
- secondary limb motion
- background scene
- sound personality
- branding / page identity

Avoid rewriting working systems unless there is a demonstrated need.

## 4. Physics Model

### Main body

Use one primary soft-body mass for the torso/belly/hips.

Do not build a realistic articulated human and do not make each limb an independent soft body.

Desired feel compared with Droppie:

- higher shear stiffness
- stronger shape memory
- more damping
- heavier / less liquid response
- still visibly squashy and stretchable
- rolls cleanly
- recovers its recognizable silhouette

The exact constants should be tuned experimentally after a stable prototype exists.

Qualitative target:

`plush mascot + beanbag + rubber toy`

The character should deform under a pull but should not smear across the floor like water.

## 5. Character Construction

Use a hybrid approach.

### Soft-body core

The deformable core should carry:

- belly
- torso
- hips
- most of the visible mass

A simple rounded mascot silhouette is preferred over anatomically detailed topology.

### Secondary parts

Use separate lightweight parts for:

- short legs
- work boots
- optional arms
- cap
- sunglasses / face details if needed

Secondary parts should follow anchors on the deforming body rather than becoming separate expensive physics simulations.

## 6. Leg Motion

Legs are required for the first polished version.

Implement them as secondary spring/damper motion.

Desired behavior:

```text
body rolls
→ legs lag behind
→ swing outward
→ overshoot a little
→ settle
```

On a hard landing:

```text
body squashes
→ legs kick/flop
→ body rebounds
→ legs settle
```

Requirements:

- motion should be clearly visible
- motion should remain bounded
- legs must not spin indefinitely
- negligible performance cost
- no independent ragdoll solver required

Arms may later reuse the same mechanism.

## 7. Sweat Droplets

Reuse the lightweight splash-particle concept from Droppie, but reinterpret the particles as cartoon sweat.

Triggers:

- hard impact
- extreme stretch
- violent throw

Typical burst:

```text
2–6 blue/cyan droplets
→ pop away from character
→ short ballistic arc
→ disappear
```

Rules:

- no puddles
- no wet floor
- no fluid simulation
- clearly a cartoon reaction effect

Sweat should be occasional enough to stay funny.

## 8. Sound Design

Reuse the Web Audio architecture.

### Impact grunt

Hard impacts may create a short procedural comic grunt.

Target character:

```text
oof / uh / hnng
```

It should be suggestive rather than intelligible recorded speech.

Possible synthesis:

- low oscillator
- fast pitch drop
- bandpass/formant shaping
- tiny noise transient

Do not grunt on every small bounce.

### Stretch squeal

Large stretches should produce one continuous squeaky voice.

Behavior:

```text
small stretch  → silent
medium stretch → quiet strain
large stretch  → rising squeal
release        → quick pitch drop + fade
```

Important:

- use one sustained voice
- do not spawn a new oscillator every frame
- pitch follows normalized stretch
- keep maximum pitch tolerable

### Sweat SFX

Optional subtle:

```text
plink / pfft / fwip
```

### Music

Music comes after the core toy works.

Preferred direction:

- light procedural loop
- playful / cartoony
- soft marimba or woodblock
- tiny metallic percussion
- gentle bass
- low in the mix
- begins only after user audio unlock

No downloaded music assets in the first pass.

## 9. Boiler Room Environment

The environment is decorative.

Required cues:

- large pipes
- elbows / flanges
- a few valves
- round gauges
- one boiler or furnace body
- warm industrial lighting
- simple floor

Possible later additions:

- subtle steam puffs
- small ambient gauge movement
- quiet boiler-room ambience

Do not build interactive plant equipment or a dense industrial simulation.

Visual style:

```text
warm
cartoon
clean
slightly exaggerated
```

Avoid gritty realism.

## 10. IUOE 39 Branding

The full IUOE 39 logo should appear as one decorative wall sign.

Good:

- enamel sign
- painted placard
- mounted shop sign

Do not:

- repeat the full logo across the room
- use it as UI chrome
- cover props with branding

The cap may display the simple number:

`39`

Treat the supplied logo art as a source asset; do not redraw or alter it unless necessary for technical display.

## 11. Rendering Strategy

The mascot does not need Droppie's water optics.

Prefer ordinary stylized materials for:

- skin
- blue work shirt
- denim
- boots
- cap
- sunglasses

Disable or remove Droppie-specific character features when they are no longer needed:

- water transmission
- optical-thickness character rendering
- water caustics
- puddle effects
- water trail effects

Do this carefully so working renderer/input architecture is preserved.

The background can use simple stylized PBR materials.

## 12. Camera and Input

Keep the successful Droppie interaction model.

Required:

- direct touch grab
- drag/stretch
- release/throw
- tap/hop
- empty-space orbit
- pinch/scroll zoom
- pointer capture and lost-pointer recovery
- camera follows character
- mobile-first behavior

Do not add joystick walking.

# Development Phases

## Phase 0 — Baseline

Goal: prove the copied repository is healthy before modifying it.

Tasks:

- confirm all source and art files are present
- run install/build/typecheck/lint/tests available in the copied repo
- run the current app
- record the starting commit
- update repository identity and GitHub Pages base path only if required

Acceptance:

- app builds
- app runs
- current controls still work
- baseline commit exists

Stop before character changes if baseline is not healthy.

## Phase 1 — Variant Scaffold

Goal: turn the copied Droppie repository into the Squish Crew project without redesigning the engine.

Tasks:

- rename visible project identity to `Squish Crew`
- preserve source attribution / lineage in README
- identify the supplied turnaround and IUOE 39 logo assets
- create a clear place for variant-specific character code
- disable Droppie-only puddle/trail effects in the running experience
- do not build the boiler room yet

Acceptance:

- Squish Crew boots from its own repo
- no dependency on the Droppie deployment
- existing grab/throw/mobile controls remain working
- art references are preserved

Stop and report.

## Phase 2 — Soft Mascot Prototype

Goal: replace the droplet with a crude but functional soft union mascot.

Tasks:

- create a simple rounded mascot body based on the turnaround proportions
- generate a suitable tetrahedral cage
- bind visible surface to the cage
- preserve surface picking
- add simple shirt/jeans/skin/boot color blocking
- tune physics away from water and toward plush/rubbery mascot

Do not attempt final face detail or boiler room art yet.

Acceptance:

- character reads as a short fat little worker
- grab works
- stretch works
- throw works
- roll works
- landing squash works
- body returns close to intended silhouette
- no topology explosions
- mobile performance remains healthy

Stop and report.

## Phase 3 — Flailing Legs

Goal: make rolling funny.

Tasks:

- add short legs and boots
- anchor them to the deforming body
- implement spring/damper secondary motion
- respond to body translation, rotation, and impact
- add motion clamps

Acceptance:

- rolling causes visible leg flail
- hard impacts produce a brief kick
- legs settle
- no runaway oscillation
- low performance cost

Stop and report.

## Phase 4 — Character Reactions

Goal: establish personality.

Add:

- hard-impact grunt
- continuous stretch squeal
- sweat droplets
- optional subtle sweat sound

Acceptance:

- small interactions remain relatively quiet
- big interactions are funny
- sounds do not spam
- stretch voice is continuous
- sweat is clearly a cartoon effect
- mute/audio unlock still work on mobile

Stop and report.

## Phase 5 — Decorative Boiler Room

Goal: establish the theme after the character is already fun.

Add:

- boiler/furnace
- pipes
- valves
- gauges
- warm industrial lighting
- IUOE 39 logo as a single wall sign

Acceptance:

- immediately reads as a cartoon boiler room
- character remains visual focus
- logo reads as background decor
- performance remains healthy

Stop and report.

## Phase 6 — Polish

Only after the previous phases pass.

Possible work:

- arm secondary motion
- hat wobble
- improved face treatment
- procedural music
- steam puffs
- better environment materials
- expressions
- loading / page polish

Do not let polish block a working MVP.

# Explicit Non-Goals

Do not implement for the initial version:

- walking
- realistic anatomy
- full articulated ragdoll
- separate soft-body limbs
- interactive boiler controls
- real fluid simulation
- sweat puddles
- pop/reform
- complex levels
- photorealistic environment
- gameplay objectives

# First Milestone

The first important milestone is:

> A crude, fat little union mascot running in the copied Droppie engine, able to be grabbed, stretched, thrown and rolled while remaining stable and recognizable.

Do not spend significant time on the boiler-room background until this milestone is fun.

# Agent Rules

Work one phase at a time.

Do not silently begin future phases.

Do not chase visual tuning indefinitely.

If a phase meets its acceptance criteria with imperfections:

- report the imperfections
- stop
- wait for approval

Do not replace a working Droppie subsystem with a new architecture unless there is a concrete demonstrated limitation.

Preserve the supplied art assets unchanged.

At the end of every phase report:

```text
RESULT: PASS / FAIL

Files changed:
...

What works:
...

Known imperfections:
...

Performance:
...

Tests:
...

Commit:
...
```

# Project Lineage

Squish Crew is a separate standalone project derived from the working Droppie codebase.

Droppie itself was adapted from:

- `scottstts/Jelly-Baby`

Preserve appropriate attribution and technical lineage in project documentation.

# Final Target

The finished experience should feel like:

> A tiny chunky union mascot you can grab and roll around a warm cartoon boiler room while his boots kick helplessly, he gives a little "oof" when he hits the floor, squeals when stretched too far, and occasionally throws off a few cartoon sweat drops.
