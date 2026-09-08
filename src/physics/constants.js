export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const PHYS = {
  // Heavy plush: low shear so a landing spreads and squashes, high bulk so it
  // is shape deformation rather than volume collapse, and enough damping that
  // he plops instead of bouncing.
  density: 1050, shear: 420, bulk: 65000, damping: 4.3,
  gravity: 2.4, step: 1 / 240, iterations: 3,
  staticFriction: .65, dynamicFriction: .42, restitution: .065,
  floor: .00015, maxGrabForce: 4,
  // Dragging should stick, strain, then slip. Below grabSlipDistance of
  // horizontal grab extension he stays pinned and only deforms; past it the
  // grip beats adhesion and contact friction drops to grabSlipFrictionScale so
  // his whole body slides after the pointer. grabSlipRelease is the hysteresis
  // back to sticky. Idle and landing friction are untouched.
  grabSlipDistance: .018, grabSlipRelease: .010, grabSlipFrictionScale: .25,
  sleepSpeed: .015,
  // Shape memory: how hard the body is pulled back onto its rest silhouette
  // around the moving mass center. This sits on top of the FEM and dominates
  // how solid the droplet feels, so it is the main knob for wet versus rubbery.
  // It is also the only thing keeping him upright: measured at 100 or below he
  // settles onto his back, so ploppiness comes from shear and damping instead,
  // and shapeDamping carries the lazy, slow recovery.
  shapeMemory: 140, shapeDamping: 5.4,
};
