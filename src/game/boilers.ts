/**
 * Boiler pressure gameplay, as pure state.
 *
 * Deliberately free of THREE, audio and particles so the rise rates, the
 * impact curve, the strike cooldown and the automatic relief can be tested
 * deterministically. The runtime feeds it strikes and reads snapshots back;
 * the room owns every mesh.
 */

export const BOILER = {
  /** Seconds of strike immunity, so one overlap cannot score repeatedly. */
  hitCooldown: .45,
  /**
   * Approach speed (m/s) below which a brush against the shell does nothing.
   *
   * These are calibrated to what a fling can actually produce, which is much
   * slower than a fall: the runtime feeds the mass-weighted body velocity, and
   * a body this soft moves its centre of mass far slower than the grabbed
   * surface. Measured in play, a drift is under .05, a lazy shove about .09,
   * and a committed sling into the shell reaches .16-.17.
   */
  minStrikeSpeed: .045,
  /** Approach speed at which a strike dumps everything it can. */
  fullStrikeSpeed: .22,
  /** The most pressure a single strike can vent. */
  maxDrop: .85,
  /** Where an automatic relief leaves the boiler. */
  reliefFloor: .66,
} as const;

export type BoilerSnapshot = {
  pressure: number;
  riseRate: number;
  lastHitStrength: number;
  lastPressureDrop: number;
  reliefCount: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
/** Smooth 0-1 ramp, so no single test velocity sits on a hard edge. */
const smooth = (value: number) => value * value * (3 - 2 * value);

/**
 * How much pressure a strike at this approach speed vents. Weak contact is
 * nearly free, a committed fling nearly empties an overheated boiler.
 */
export function strikeDrop(approachSpeed: number) {
  const span = BOILER.fullStrikeSpeed - BOILER.minStrikeSpeed;
  return smooth(clamp01((approachSpeed - BOILER.minStrikeSpeed) / span)) * BOILER.maxDrop;
}

export class Boiler {
  pressure: number;
  riseRate: number;
  hitCooldown = 0;
  lastHitStrength = 0;
  lastPressureDrop = 0;
  reliefCount = 0;
  private readonly startPressure: number;
  /** Latched so sitting at full pressure vents once, not once per frame. */
  private venting = false;

  constructor(startPressure: number, riseRate: number) {
    this.startPressure = startPressure;
    this.pressure = startPressure;
    this.riseRate = riseRate;
  }

  /** Advance one rendered frame. True on the frame an automatic relief fires. */
  advance(dt: number) {
    const step = Math.max(0, Math.min(.05, dt));
    this.hitCooldown = Math.max(0, this.hitCooldown - step);
    this.pressure = clamp01(this.pressure + this.riseRate * step);
    if (this.pressure < 1) { this.venting = false; return false; }
    if (this.venting) return false;
    this.venting = true;
    this.lastPressureDrop = this.pressure - BOILER.reliefFloor;
    this.pressure = BOILER.reliefFloor;
    this.reliefCount++;
    return true;
  }

  /**
   * A fling landed. `approachSpeed` is the mascot's speed along the direction
   * into the boiler, so a sideways skim scores far less than a direct slam.
   * Returns the pressure actually vented, which is 0 while cooling down.
   */
  strike(approachSpeed: number) {
    if (this.hitCooldown > 0) return 0;
    const drop = Math.min(strikeDrop(approachSpeed), this.pressure);
    // A brush that vents nothing must not start the cooldown, or drifting
    // against the shell would lock out the real hit that follows it.
    if (drop <= 0) return 0;
    this.hitCooldown = BOILER.hitCooldown;
    this.lastHitStrength = Math.max(0, approachSpeed);
    this.lastPressureDrop = drop;
    this.pressure = clamp01(this.pressure - drop);
    this.venting = false;
    return drop;
  }

  reset() {
    this.pressure = this.startPressure;
    this.hitCooldown = 0;
    this.lastHitStrength = 0;
    this.lastPressureDrop = 0;
    this.reliefCount = 0;
    this.venting = false;
  }

  get snapshot(): BoilerSnapshot {
    return {
      pressure: this.pressure, riseRate: this.riseRate,
      lastHitStrength: this.lastHitStrength, lastPressureDrop: this.lastPressureDrop,
      reliefCount: this.reliefCount,
    };
  }
}

/**
 * The two boilers of this prototype. They start at different pressures so one
 * is already interesting the moment the toy loads.
 */
export function makeBoilers() {
  return [new Boiler(.34, .050), new Boiler(.58, .038)];
}
