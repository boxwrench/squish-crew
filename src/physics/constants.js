export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const PHYS = {
  // Plush/rubber prototype: stronger shear, with inherited volume preservation.
  density: 1050, shear: 1200, bulk: 65000, damping: 3,
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
  shapeMemory: 150, shapeDamping: 3.5,
};
