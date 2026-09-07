# Droplet Project Plan

**Base technical reference:** [scottstts/Jelly-Baby](https://github.com/scottstts/Jelly-Baby)  
**Target adaptation:** A mobile-first, cute translucent blue water droplet on a warm hardwood floor, with satisfying soft-body stretch, squash, bounce, wobble, and throw interactions.

> **Visual direction:** Match the uploaded reference image: a glossy, translucent blue dewdrop-shaped character with a rounded belly, soft pointed top, simple happy face, realistic reflection/refraction, and a clean hardwood-only environment.

---

## 1. Starting Point

[Jelly-Baby](https://github.com/scottstts/Jelly-Baby) is already a strong technical foundation for this project.

The project is a **WebGPU-only Three.js playground** with:

- Real-time deformable soft-body physics
- XPBD-based constraints
- Stretching, grabbing, throwing, and bouncing
- Touch controls
- Orbit and zoom controls
- Refraction and transmission
- Optical thickness calculations
- Caustics
- HDR lighting
- WebAssembly-backed physics
- Worker-based optical calculations
- Idle/sleep behavior
- Procedural contact audio

### Primary references

- [Jelly-Baby repository](https://github.com/scottstts/Jelly-Baby)
- [README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)
- [Soft-body solver](https://github.com/scottstts/Jelly-Baby/blob/main/src/physics/soft-body.js)
- [Locomotion system](https://github.com/scottstts/Jelly-Baby/blob/main/src/game/locomotion.ts)

The goal is **not** to simply reskin Jelly-Baby. The goal is to use its physics, interaction, and rendering architecture as the basis for a simpler, more focused, mobile-friendly interactive water droplet.

---

# 2. Product Goal

Create a small, cute translucent blue water droplet that sits on a warm hardwood floor.

The user should be able to:

- Tap it
- Grab it
- Stretch it
- Pull the tip
- Squash it
- Throw it
- Bounce it
- Watch it wobble
- Watch it settle back into its original droplet shape

The experience should feel like a tiny interactive physics toy.

The visual design should remain extremely simple:

- One droplet
- One hardwood floor
- Warm natural lighting
- No furniture
- No clutter
- No visible room
- No unnecessary UI

The droplet itself should always be the focus.

---

# 3. Character Redesign

## Current Jelly-Baby approach

Jelly-Baby currently uses a very high-resolution deforming humanoid surface.

According to the project README, the visible body includes approximately:

- **72,234 indexed vertices**
- **144,464 triangles**
- **4,026 tetrahedra** in the soft-body simulation
- A separate **20,176-triangle optical proxy**

Reference:

- [Jelly-Baby README — Implementation](https://github.com/scottstts/Jelly-Baby/blob/main/README.md#implementation)

## Droplet adjustment

The new character geometry is much simpler.

Use a classic dewdrop silhouette:

- Wide rounded lower body
- Slightly flattened base
- Narrow taper
- Soft pointed top
- Mostly symmetrical front-to-back
- Slightly squashed resting shape

Because the droplet has much simpler geometry than the Jelly-Baby humanoid, the visible surface and physics cage can be significantly reduced.

### Suggested starting budgets

#### Mobile low

- Visible mesh: approximately **12k–20k triangles**
- Physics cage: approximately **500–900 tetrahedra**

#### Mobile high

- Visible mesh: approximately **25k–40k triangles**
- Physics cage: approximately **1k–1.5k tetrahedra**

#### Desktop

- Visible mesh: approximately **40k–60k+ triangles**
- Physics cage: approximately **2k–4k tetrahedra**

These are starting targets, not hard requirements. The final values should be determined through device testing.

The key idea is:

> Spend fewer resources on geometry and more resources on convincing soft-body behavior, refraction, lighting, and mobile responsiveness.

---

# 4. Character Appearance

The uploaded reference image should be treated as the primary visual target.

## Shape

The idle form should resemble a stereotypical water droplet:

- Rounded bottom
- Plump center
- Narrow top
- Soft point
- Very slight floor compression

The droplet should look soft rather than rigid.

## Face

Keep the face extremely simple:

- Two glossy black circular eyes
- Small curved black smile
- No nose
- No eyebrows initially
- No complex facial rig

The face should deform naturally with the droplet while remaining readable.

Jelly-Baby already contains a useful rendering principle here: its face follows the skin and is rendered in a way that avoids contaminating the transmission/refraction pass.

Reference:

- [Jelly-Baby README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

---

# 5. Physics Redesign

## Keep from Jelly-Baby

The existing project uses a physically based soft-body architecture that includes:

- Neo-Hookean energy
- XPBD constraints
- Orientation protection
- Viscosity
- Contact handling
- Force-limited barycentric grabbing
- Fixed-step simulation
- WebAssembly acceleration

Reference:

- [Soft-body solver](https://github.com/scottstts/Jelly-Baby/blob/main/src/physics/soft-body.js)
- [README implementation notes](https://github.com/scottstts/Jelly-Baby/blob/main/README.md#implementation)

This architecture should be retained as much as practical.

## Change the physical feel

The droplet should not behave like a humanoid jelly creature.

It should behave more like a cross between:

- Dense gelatin
- A water balloon
- A soft silicone toy
- A cohesive blob of water

### Desired physics characteristics

- Very high volume preservation
- Low-to-moderate shear stiffness
- Soft shape recovery
- Strong damping
- Satisfying elastic impacts
- Noticeable deformation when stretched
- Fast initial wobble
- Gradual settling
- Stable rest pose
- No uncontrolled oscillation

### Important visual behavior

#### Idle

The droplet returns to a clean iconic dewdrop shape.

#### Small tap

It gives a short:

> boing → wobble → settle

#### Grab and drag

The grabbed portion follows the user's finger while the rest of the droplet stretches behind it.

#### Pull the tip

The upper point should elongate dramatically while the body remains coherent.

#### Throw

The droplet should deform in flight, with the point lagging slightly behind the center of mass.

#### Landing

The bottom should briefly spread outward:

> impact → squash → ripple → rebound → wobble → reform

#### Settling

Oscillation should progressively disappear until the droplet sleeps.

---

# 6. Remove Walking as a Core Requirement

Jelly-Baby includes locomotion and powered posture behavior.

Reference:

- [src/game/locomotion.ts](https://github.com/scottstts/Jelly-Baby/blob/main/src/game/locomotion.ts)

For the first Droplet version, walking is unnecessary.

Remove or disable:

- Walking gait
- Powered humanoid posture
- Directional locomotion
- Standing-character recovery logic

Keep:

- Gravity
- Floor contact
- Hopping
- Throwing
- Stretching
- Wobble
- Bounce
- Shape recovery
- Sleep/wake behavior

This simplifies both the experience and the simulation workload.

---

# 7. Mobile-First Interaction

Jelly-Baby already supports:

- Touch interaction
- Pinch zoom
- Dragging
- A mobile joystick
- Hop controls

Reference:

- [Jelly-Baby README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

For Droplet, simplify the controls further.

## Primary touch controls

### Touch and drag the droplet

Grab and stretch it directly.

### Release

Throw or fling it based on release velocity.

### Tap droplet

Small hop or jiggle.

### Drag empty floor

Orbit the camera.

### Pinch

Zoom.

### Optional double tap

Trigger a playful squash or happy wobble.

## UI philosophy

Avoid permanently covering the screen with game controls.

The preferred interface is:

> Touch the object directly.

The droplet itself becomes the controller.

A joystick can remain available later if locomotion is added, but it should not be part of the first mobile experience.

---

# 8. Rendering Goal

The water effect is one of the most important parts of the project.

The droplet should not simply be blue transparent plastic.

It should look like a translucent blue liquid or dense watery gel.

## Material characteristics

Suggested conceptual values:

```text
IOR                 ≈ 1.333
Transmission        ≈ 1.0
Roughness           ≈ 0.03–0.08
Specular            high
Surface tint        very subtle
Volume absorption   blue/cyan
Thickness response  strong
```

These should be tuned visually rather than treated as fixed physical values.

## Thickness-based color

The blue color should come primarily from **optical thickness**, not surface paint.

Therefore:

- Thin top sections should appear nearly clear or pale cyan.
- The thick belly should become noticeably deeper blue.
- The floor should remain visible through the droplet.
- Wood grain should distort through refraction.
- Highlights should remain bright and nearly white.

This is critical to matching the uploaded reference.

---

# 9. Reuse the Existing Optical Architecture

Jelly-Baby already includes:

- Fresnel transmission
- Internal reflection
- Spectral absorption
- Optical thickness
- Optical proxy geometry
- Worker-based optical calculations
- Caustics
- HDR illumination

Reference:

- [README optical system](https://github.com/scottstts/Jelly-Baby/blob/main/README.md#implementation)

Rather than deleting this work, adapt it into quality tiers.

---

# 10. Rendering Quality Tiers

The project should automatically choose an appropriate rendering workload based on the device.

## Tier 1 — Mobile Low

Prioritize responsiveness.

Use:

- Simplified droplet mesh
- Reduced physics cage
- Reduced device-pixel ratio
- Approximate refraction
- Thickness-based absorption
- Strong specular highlights
- Reduced bloom
- Cheap floor reflection
- Simplified or disabled caustics
- Lower optical worker update rate

Suggested optical update target:

- Approximately **10–15 Hz**

Suggested DPR cap:

- Approximately **1.25**

---

## Tier 2 — Mobile High

For newer phones and tablets.

Use:

- Higher-resolution mesh
- More detailed physics cage
- Better optical thickness
- Better transmission
- Low-resolution caustics
- Higher optical update rate
- More detailed floor reflection

Suggested optical update target:

- Approximately **15–20 Hz**

Suggested DPR cap:

- Approximately **1.5**

---

## Tier 3 — Desktop

Preserve more of Jelly-Baby's advanced optical behavior.

Use:

- Higher-detail droplet mesh
- Larger physics cage
- More accurate refraction
- Better optical proxy
- Higher-resolution caustics
- Higher update frequency
- Stronger bloom/highlight quality

Suggested optical update target:

- Up to approximately **30 Hz**

Suggested DPR cap:

- Up to approximately **2**

---

# 11. Environment Redesign

The environment should be simpler than Jelly-Baby's.

## Visible environment

Only render:

- Hardwood floor
- Droplet
- Shadows
- Reflections
- Light

No visible:

- Furniture
- Walls
- Decorations
- Props
- Posters
- Windows
- Background objects

## Lighting

Use an HDR environment or equivalent lighting setup representing:

- Large warm window light
- Soft room fill
- Bright specular reflections
- Warm hardwood bounce

The environment itself does not need to be visible.

This approach is already compatible with Jelly-Baby's lighting philosophy.

Reference:

- [Jelly-Baby README lighting notes](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

---

# 12. Camera

The camera should be substantially closer and lower than the default Jelly-Baby framing.

The uploaded reference has a macro portrait feel.

## Camera goals

- Droplet fills approximately **40–55% of phone screen height**
- Slight downward viewing angle
- Floor extends beyond the frame
- Shallow sense of depth
- Hero-character framing
- No horizon line required

The default view should immediately make the droplet feel cute and tangible.

---

# 13. Floor Material

The hardwood is an important visual component.

Use:

- Realistic wood albedo
- Normal or bump map
- Roughness variation
- Slight gloss
- Long boards
- Warm brown tones
- Reflections strong enough to show the blue droplet

Avoid making the wood mirror-like.

The floor should help sell:

- Contact
- Weight
- Light
- Refraction
- Caustics
- Reflection

---

# 14. Caustics

Jelly-Baby already contains a sophisticated caustic system.

Reference:

- [Jelly-Baby README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

For Droplet:

## Mobile Low

Disable or use a very cheap fake.

## Mobile High

Use a low-resolution caustic texture.

Suggested starting resolution:

```text
128 × 128
```

## Desktop

Allow higher-quality caustics.

Suggested starting resolution:

```text
256 × 256
```

Caustics should be treated as a **progressive enhancement**, not a requirement for the base experience.

---

# 15. Performance Strategy

Mobile performance should be treated as a first-class design requirement rather than something added after desktop development.

## Preserve useful Jelly-Baby optimizations

Keep where possible:

- WebAssembly solver
- Worker-based optical processing
- Compact cage snapshots
- Bounded catch-up work
- Idle sleeping
- Limited optical request frequency
- Avoiding unnecessary optical work while static

Reference:

- [Jelly-Baby README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

## Add adaptive quality

Measure:

- Frame time
- GPU workload
- Optical worker latency
- Physics update cost
- Resolution
- Device performance

Then automatically reduce quality when required.

Possible dynamic reductions:

1. Lower DPR
2. Reduce caustic resolution
3. Lower optical update frequency
4. Reduce bloom
5. Reduce reflection quality
6. Fall back to simplified transmission

Physics quality should be reduced only after cheaper visual reductions have been exhausted.

The tactile interaction is more important than maximum graphical quality.

---

# 16. WebGPU Mobile Target

WebGPU is now a realistic mobile deployment target.

Safari 26 includes WebGPU support on:

- macOS
- iOS
- iPadOS
- visionOS

WebKit also explicitly recommends WebGPU for new applications and notes that Three.js works with Safari 26.

Reference:

- [WebKit Features in Safari 26.0 — WebGPU](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

WebGPU is also available in modern Chromium browsers, including Android.

## Initial platform target

### Apple

- Safari 26+
- iPhone
- iPad

### Android

- Modern Chrome / Chromium
- WebGPU-capable devices

### Desktop

- Chrome
- Edge
- Safari
- Other compatible WebGPU browsers

Use **feature detection**, not browser user-agent checks.

---

# 17. Home Screen / Web App Experience

Safari 26 changed Home Screen web-app behavior on iOS and iPadOS so normal websites can be added to the Home Screen and opened in an app-like experience.

Reference:

- [WebKit Features in Safari 26.0 — Web Apps](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

Droplet should therefore be designed so it can work well as:

- A normal website
- A fullscreen mobile web toy
- A Home Screen web app

Recommended additions:

- Web App Manifest
- App icon featuring the droplet face
- Portrait-first layout
- Fullscreen-safe UI
- Safe-area handling
- Touch-action handling
- Prevent accidental browser scrolling during interaction

---

# 18. Audio

Jelly-Baby already uses procedural contact audio.

Reference:

- [Jelly-Baby README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

For Droplet, keep audio minimal.

Possible sounds:

- Soft wet "boop" on tap
- Gentle rubbery plop on floor impact
- Stretchy wobble sound during major deformation
- Tiny squeak on extreme stretch

Audio should enhance physicality without becoming cartoonishly noisy.

Keep sound disabled until the first user interaction to satisfy browser autoplay policies.

---

# 19. Personality

The droplet should feel alive without turning into a fully animated character.

## Initial personality system

### Idle

Occasional tiny breathing-like wobble.

### Tap

Short happy bounce.

### Hard landing

Eyes compress slightly with the body.

### Extreme stretch

Optional temporary surprised expression later.

### Recovery

Smile returns to neutral happy state.

Avoid over-animating the face initially.

The physics itself should provide most of the personality.

---

# 20. Proposed Repository Structure

A possible organization after adaptation:

```text
src/
  character/
    droplet-mesh.ts
    droplet-face.ts
    droplet-material.ts
    droplet-state.ts

  physics/
    soft-body.js
    droplet-physics.ts
    droplet-presets.ts

  rendering/
    transmission.ts
    thickness.ts
    caustics.ts
    quality-tier.ts
    reflections.ts

  input/
    touch.ts
    grab.ts
    camera.ts

  scene/
    hardwood.ts
    lighting.ts
    camera.ts

  mobile/
    device-tier.ts
    performance-controller.ts
    safe-area.ts

  audio/
    contact.ts

  app/
    main.ts
```

The actual structure should preserve Jelly-Baby's existing architecture wherever doing so avoids unnecessary churn.

---

# 21. Development Phases

## Phase 1 — Core Droplet Prototype

### Goal

Get the physics toy working before worrying about perfect rendering.

### Tasks

- Fork or clone Jelly-Baby
- Confirm existing build
- Preserve original baseline
- Create a Droplet development branch
- Remove or disable walking
- Replace humanoid geometry with simple droplet
- Generate tetrahedral cage
- Bind surface mesh to cage
- Preserve grabbing
- Preserve throwing
- Preserve floor collision
- Add minimal eyes and smile
- Add simple hardwood plane
- Tune shape recovery

### Success criteria

On desktop and at least one mobile device:

- Droplet loads
- Droplet rests stably
- Tap works
- Grab works
- Stretch works
- Throw works
- Bounce works
- Droplet reforms
- Face stays attached correctly

---

# 22. Phase 2 — Visual Match

### Goal

Make the idle scene resemble the uploaded reference image.

### Tasks

- Tune droplet geometry
- Tune camera
- Add realistic hardwood textures
- Tune HDR lighting
- Implement blue thickness absorption
- Improve transmission
- Improve reflection
- Improve floor contact shadow
- Add glossy eye material
- Tune smile placement
- Add subtle bloom
- Adjust tone mapping

### Success criteria

A screenshot of the idle application should clearly resemble the reference:

> cute translucent blue droplet on warm hardwood

Even without motion, the visual should be appealing.

---

# 23. Phase 3 — Physics Feel

### Goal

Make touching the droplet satisfying.

### Tune:

- Volume preservation
- Shear stiffness
- Grab stiffness
- Grab force limit
- Damping
- Restitution
- Friction
- Contact response
- Tip flexibility
- Shape recovery
- Throw velocity
- Hop impulse

### Test interactions

- Gentle tap
- Fast tap
- Side pull
- Vertical pull
- Pull tip
- Pull body
- Short throw
- Long throw
- Hard landing
- Repeated bouncing
- Drag along floor
- Release from extreme stretch

### Success criteria

Users should want to keep touching it even if there is no game.

---

# 24. Phase 4 — Mobile Controls

### Goal

Make direct touch manipulation feel natural.

### Tasks

- Remove default joystick
- Detect direct droplet touch
- Distinguish object drag from camera drag
- Add pinch zoom
- Prevent accidental page scrolling
- Add touch release velocity
- Improve grab smoothing
- Handle finger occlusion
- Support portrait orientation
- Support landscape orientation

### Success criteria

A new user should understand how to interact without instructions.

---

# 25. Phase 5 — Mobile Performance

### Goal

Maintain responsive interaction on actual phones.

### Tasks

- Add device quality tiers
- Add frame-time instrumentation
- Cap DPR
- Lower optical update rate where necessary
- Add reduced-caustic mode
- Add caustic-off mode
- Reduce bloom on low tier
- Validate worker load
- Validate WASM performance
- Test thermal throttling
- Test sustained interaction

### Target

Prefer:

```text
60 FPS
```

If 60 FPS cannot be held, prioritize:

1. Input responsiveness
2. Physics stability
3. Smooth animation
4. Transmission appearance
5. Advanced caustics

---

# 26. Phase 6 — Progressive Visual Enhancements

Once the mobile baseline is stable:

- Better caustics
- Better absorption
- Better internal reflections
- Improved floor reflection
- More accurate shadows
- Better HDR response
- Higher optical update rate on capable devices

These should be enabled only when hardware performance allows.

---

# 27. Phase 7 — Polish

Optional additions:

- Happy idle wobble
- Double-tap reaction
- Tiny sound effects
- Different droplet colors
- Different hardwood choices
- Screenshot/share mode
- Fullscreen mode
- Home Screen icon
- Minimal loading animation
- Tiny reset button
- Accessibility options
- Reduced-motion option

---

# 28. Initial Technical Priorities

The implementation order should be:

```text
1. Preserve Jelly-Baby baseline
2. Replace body geometry
3. Make droplet physics stable
4. Make direct touch excellent
5. Reach mobile frame-rate target
6. Match reference rendering
7. Add advanced optical effects
8. Add personality/polish
```

Do **not** start by maximizing rendering quality.

The central requirement is:

> The droplet must feel good when touched.

---

# 29. What We Should Reuse

From Jelly-Baby, attempt to retain:

- Three.js/WebGPU architecture
- XPBD solver
- WebAssembly physics kernel
- Barycentric surface embedding
- Grab system
- Floor targeting
- Fixed-step physics
- Sleep/wake behavior
- Worker architecture
- Optical proxy approach
- Transmission/refraction pipeline
- HDR environment lighting
- Caustic system where appropriate
- Procedural audio concepts
- Testing methodology

---

# 30. What We Should Replace

Replace or significantly alter:

- Humanoid Jelly-Baby mesh
- Humanoid locomotion
- Walking controls
- Character proportions
- Existing facial design
- Existing camera composition
- Existing scene presentation
- Fixed desktop-focused quality assumptions
- Always-on mobile joystick

---

# 31. What We Should Add

Add:

- Droplet-specific mesh generation
- Droplet-specific physics presets
- Mobile quality tiers
- Dynamic performance controller
- Thickness-driven blue absorption
- Droplet face
- Macro camera setup
- Hardwood-only scene
- Direct-touch-first interaction
- PWA/Home Screen polish

---

# 32. Core MVP Definition

The minimum viable version should contain exactly:

- One blue droplet
- One hardwood floor
- Warm lighting
- Two eyes
- One smile
- Grab
- Stretch
- Throw
- Bounce
- Wobble
- Shape recovery
- Mobile touch support

Nothing else is required before testing whether the core idea works.

---

# 33. MVP Acceptance Criteria

The first build should pass all of the following.

## Visual

- Clearly reads as a water droplet
- Clearly translucent
- Thick areas appear more blue than thin areas
- Hardwood is visible through the body
- Highlights are bright and convincing
- Face remains readable

## Physics

- Stable at rest
- No inverted or exploding mesh
- Volume remains believable
- Can survive extreme stretching
- Can be thrown repeatedly
- Always returns close to intended droplet form

## Interaction

- Grab point tracks finger closely
- Throw velocity feels predictable
- Camera does not move while actively grabbing
- Empty-space drag controls camera
- Pinch zoom works

## Performance

- Desktop runs smoothly
- Mobile remains responsive
- No long main-thread stalls
- Optical calculations stay bounded
- Idle state performs almost no unnecessary work

---

# 34. Future Possibilities

Only after the core toy works well:

### Character reactions

- Blink
- Look toward touch point
- Surprised eyes during stretch
- Squint during impact

### Environmental interaction

- Tiny puddles
- Rain drops
- Multiple droplets
- Droplet merging
- Sloped surfaces
- Moving objects

### Game mechanics

- Small obstacle courses
- Bounce puzzles
- Stretch puzzles
- Collectibles
- Physics challenges

### AR

Potential future experiment:

- Place the droplet on a real-world surface using browser AR capabilities where practical.

None of these should influence the MVP architecture unless required.

---

# 35. Main Engineering Principle

The existing Jelly-Baby README contains an important philosophy that should carry over:

> Preserve the established look and feel; use bounded work and perceptually close approximations where full simulation causes lag.

Reference:

- [Jelly-Baby README](https://github.com/scottstts/Jelly-Baby/blob/main/README.md)

For Droplet, reinterpret that as:

> Preserve tactile responsiveness and convincing watery appearance. Spend computation where the user can see or feel the difference, and approximate everything else.

---

# 36. Recommended Final Direction

Use **Jelly-Baby as the technical foundation**, but deliberately simplify the character and experience.

The biggest adjustments are:

1. Replace the humanoid with a simple dewdrop body.
2. Remove walking and humanoid locomotion.
3. Make direct touch the main interaction.
4. Retune the solver for water-gel behavior.
5. Use thickness-based blue absorption.
6. Simplify the scene to hardwood and warm light.
7. Build explicit mobile quality tiers.
8. Preserve Jelly-Baby's WASM, worker, optical, and bounded-work ideas.
9. Make 60 FPS touch responsiveness more important than advanced caustics.
10. Add visual complexity only after the basic droplet is fun to touch.

The final result should feel less like a conventional game character and more like:

> **a tiny living water droplet you can physically play with on your phone.**

---

# Reference Links

## Jelly-Baby

- Repository: https://github.com/scottstts/Jelly-Baby
- README: https://github.com/scottstts/Jelly-Baby/blob/main/README.md
- Soft-body solver: https://github.com/scottstts/Jelly-Baby/blob/main/src/physics/soft-body.js
- Locomotion: https://github.com/scottstts/Jelly-Baby/blob/main/src/game/locomotion.ts

## Platform / Rendering

- Three.js: https://threejs.org/
- Safari 26 WebGPU / WebKit features: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- WebGPU implementation status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status

---

## Project Summary

**Working name:** Droplet  
**Technical base:** Jelly-Baby  
**Primary target:** Mobile WebGPU  
**Visual target:** Cute translucent blue dewdrop on hardwood  
**Core mechanic:** Direct-touch soft-body interaction  
**Primary performance goal:** Smooth, responsive physics on mobile  
**Primary design rule:** Keep the experience simple enough that the physics and material can be excellent.
