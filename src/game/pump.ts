/**
 * The circulation pump, as pure state.
 *
 * Like the boilers, this holds no THREE, audio or particles so the fault
 * schedule, the bonk curve, the cooldown and the unattended self-recovery are
 * all testable. Fault intervals vary, but from a seeded generator, so a test
 * can run a whole shift and know exactly what it should see.
 */

export const PUMP = {
  /** Seconds between faults, sampled from this range. Long enough to just play. */
  faultInterval: [16, 30] as const,
  /** Seconds of strike immunity, so one bonk cannot restart it repeatedly. */
  hitCooldown: .45,
  /**
   * Approach speed band, calibrated the same way as the boilers: a fling moves
   * this body's centre of mass far slower than the grabbed surface.
   */
  minStrikeSpeed: .045,
  fullStrikeSpeed: .22,
  /** A bonk this weak rattles the housing but does not catch the motor. */
  restartStrength: .18,
  /** Seconds a fault survives before the pump coughs itself back to life. */
  selfRecover: 13,
  /** Seconds the flywheel takes to spin up or coast down. */
  spinTime: .9,
} as const;

export type PumpEvent = 'fault' | 'sputter' | null;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => value * value * (3 - 2 * value);

/** 0-1 measure of how well a bonk caught the motor. */
export function bonkStrength(approachSpeed: number) {
  const span = PUMP.fullStrikeSpeed - PUMP.minStrikeSpeed;
  return smooth(clamp01((approachSpeed - PUMP.minStrikeSpeed) / span));
}

export class Pump {
  faulted = false;
  timeUntilFault: number;
  unattendedTime = 0;
  hitCooldown = 0;
  lastHitStrength = 0;
  restartCount = 0;
  faultCount = 0;
  /** 0-1 rotation rate, eased so the flywheel coasts rather than snapping. */
  speed = 1;
  private seed: number;
  private readonly startSeed: number;

  constructor(seed = 1) {
    this.startSeed = seed;
    this.seed = seed;
    this.timeUntilFault = this.nextInterval();
  }

  /** Deterministic 0-1 from a small LCG, so a seeded run is reproducible. */
  private random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  private nextInterval() {
    const [low, high] = PUMP.faultInterval;
    return low + this.random() * (high - low);
  }

  /**
   * One rendered frame. Returns 'fault' on the frame it breaks down and
   * 'sputter' on the frame an ignored fault coughs itself back to life.
   */
  advance(dt: number): PumpEvent {
    const step = Math.max(0, Math.min(.05, dt));
    this.hitCooldown = Math.max(0, this.hitCooldown - step);
    const target = this.faulted ? 0 : 1;
    const ease = Math.min(1, step / PUMP.spinTime);
    this.speed += (target - this.speed) * ease * 3;
    this.speed = clamp01(this.speed);
    if (!this.faulted) {
      this.timeUntilFault -= step;
      if (this.timeUntilFault > 0) return null;
      this.faulted = true;
      this.unattendedTime = 0;
      this.faultCount++;
      return 'fault';
    }
    this.unattendedTime += step;
    if (this.unattendedTime < PUMP.selfRecover) return null;
    // Nobody came. It coughs, catches, and limps on by itself.
    this.faulted = false;
    this.unattendedTime = 0;
    this.timeUntilFault = this.nextInterval();
    return 'sputter';
  }

  /**
   * The mascot arrived. `approachSpeed` is his speed along the line into the
   * pump. Returns the bonk strength when it restarts, 0 otherwise.
   */
  bonk(approachSpeed: number) {
    if (!this.faulted || this.hitCooldown > 0) return 0;
    const strength = bonkStrength(approachSpeed);
    // A weak brush rattles the housing without catching the motor, and must
    // not start the cooldown or it would block the proper bonk behind it.
    if (strength < PUMP.restartStrength) return 0;
    this.hitCooldown = PUMP.hitCooldown;
    this.lastHitStrength = Math.max(0, approachSpeed);
    this.faulted = false;
    this.unattendedTime = 0;
    this.restartCount++;
    this.timeUntilFault = this.nextInterval();
    return strength;
  }

  reset() {
    this.seed = this.startSeed;
    this.faulted = false;
    this.timeUntilFault = this.nextInterval();
    this.unattendedTime = 0;
    this.hitCooldown = 0;
    this.lastHitStrength = 0;
    this.restartCount = 0;
    this.faultCount = 0;
    this.speed = 1;
  }

  get snapshot() {
    return {
      faulted: this.faulted, speed: this.speed,
      timeUntilFault: this.faulted ? 0 : this.timeUntilFault,
      unattendedTime: this.unattendedTime,
      lastHitStrength: this.lastHitStrength,
      restartCount: this.restartCount, faultCount: this.faultCount,
    };
  }
}
