/**
 * Gating for the mascot's cartoon reactions.
 *
 * Pure state and pure curves, deliberately free of audio and rendering, so the
 * thresholds and cooldowns that decide *whether* a reaction fires can be tested
 * deterministically. The runtime owns the actual sound and particle calls.
 */

export const REACTION = {
  /**
   * Contact speed (m/s) below which a landing is an ordinary bounce.
   *
   * This toy runs at PHYS.gravity 2.4 over a ~70mm body, so measured landings
   * span roughly 0.12 m/s for a settle, 0.22 for an ordinary hop, 0.49 for an
   * ordinary drop and 0.81 for the hardest a pointer can produce. This matches
   * PLOP.speed, so anything that visibly plops is also heard, while every
   * ordinary hop stays silent.
   */
  gruntSpeed: .28,
  /**
   * Speed above the threshold for a fully saturated grunt. Deliberately wider
   * than the plop's own saturation so an ordinary drop reads as a small oof and
   * only a real pancake gets the full one.
   */
  gruntRange: .45,
  /** Seconds of silence enforced between grunts so bouncing cannot spam them. */
  gruntCooldown: .38,
  /** Contact speed (m/s) at or above which a landing may break a sweat. */
  sweatSpeed: .32,
  /** Speed above the threshold that counts as a maximally hard landing. */
  hardRange: .1,
  /** Independent cooldown so one landing emits at most one sweat burst. */
  sweatCooldown: .6,
  minDrops: 2,
  maxDrops: 6,
  /** Normalized stretch that arms one extreme-stretch sweat burst. */
  stretchArm: .78,
  /** Stretch must fall back below this before another burst can fire. */
  stretchRearm: .55,
  stretchDrops: 3,
  /** Below this, the strain squeal is silent. */
  squealFloor: .30,
} as const;

/** 0-1 measure of how hard a landing was, above the sweat threshold. */
export function hardImpact(speed: number) {
  return Math.max(0, Math.min(1, (speed - REACTION.sweatSpeed) / REACTION.hardRange));
}

/** 0-1 grunt loudness: silent below the plop threshold, full at a pancake. */
export function gruntStrength(speed: number) {
  return Math.max(0, Math.min(1, (speed - REACTION.gruntSpeed) / REACTION.gruntRange));
}

/** 2-6 sweat drops, scaled by how hard the landing was. */
export function sweatDrops(speed: number) {
  const hardness = hardImpact(speed);
  return REACTION.minDrops + Math.round(hardness * (REACTION.maxDrops - REACTION.minDrops));
}

/** Frequency, band-pass centre and gain for the single strain-squeal voice. */
export function squealVoice(amount: number) {
  const value = Math.max(0, Math.min(1, amount));
  // One shaping term: zero at the floor, quadratic so the comic squeal only
  // arrives near the top and ordinary dragging stays unobtrusive.
  const strain = Math.max(0, (value - REACTION.squealFloor) / (1 - REACTION.squealFloor));
  const shaped = strain * strain;
  return {
    frequency: 480 + shaped * 1900,
    filter: 700 + strain * 1800,
    gain: strain > 0 ? Math.min(.075, .006 + shaped * .085) : 0,
  };
}

export class ReactionGate {
  private gruntTimer = 0;
  private sweatTimer = 0;
  private stretchArmed = true;

  /** Run the cooldown clocks forward one rendered frame. */
  advance(dt: number) {
    this.gruntTimer = Math.max(0, this.gruntTimer - dt);
    this.sweatTimer = Math.max(0, this.sweatTimer - dt);
  }

  /** True when this contact is hard enough, and recent enough, to grunt at. */
  grunt(speed: number) {
    if (speed < REACTION.gruntSpeed || this.gruntTimer > 0) return false;
    this.gruntTimer = REACTION.gruntCooldown;
    return true;
  }

  /** Drop count for a landing, or 0 when the landing raises no sweat. */
  impactSweat(speed: number) {
    if (speed < REACTION.sweatSpeed || this.sweatTimer > 0) return 0;
    this.sweatTimer = REACTION.sweatCooldown;
    return sweatDrops(speed);
  }

  /**
   * Rising-edge trigger for extreme stretch. Fires once when the grip passes
   * the arm threshold and stays quiet until stretch relaxes or the grab ends.
   */
  stretchSweat(amount: number) {
    if (amount < REACTION.stretchRearm) this.stretchArmed = true;
    if (amount < REACTION.stretchArm || !this.stretchArmed) return false;
    this.stretchArmed = false;
    return true;
  }

  /** A finished grab re-arms the extreme-stretch burst for the next one. */
  releaseGrab() { this.stretchArmed = true; }

  reset() { this.gruntTimer = 0; this.sweatTimer = 0; this.stretchArmed = true; }
}
