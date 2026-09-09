/**
 * How much trouble the room is in, derived from the machinery that already
 * exists. Pure state: the runtime feeds it conditions and discrete mishap
 * events, and the room lights and sounds read the mood back.
 *
 * There is no failure here. The worst the room does is complain loudly for a
 * couple of seconds, then get on with it, so the toy underneath stays playable
 * no matter how long every job is ignored.
 */

export type Mood = 'smooth' | 'warning' | 'mishap';

export const MOOD = {
  /** Boiler pressure at which the room starts looking worried. */
  hotPressure: .78,
  /** Seconds a mishap holds the room before it settles back. */
  mishapHold: 2.4,
} as const;

export type RoomConditions = {
  /** Highest pressure across the boilers. */
  maxPressure: number;
  pumpFaulted: boolean;
};

export class RoomMood {
  mood: Mood = 'smooth';
  /** True only on the frame the mood changed, so cues fire once. */
  entered = false;
  private mishapTimer = 0;

  /** A discrete piece of drama: an automatic relief, or a pump coughing. */
  mishap() { this.mishapTimer = MOOD.mishapHold; }

  update(dt: number, conditions: RoomConditions) {
    const step = Math.max(0, Math.min(.05, dt));
    this.mishapTimer = Math.max(0, this.mishapTimer - step);
    const troubled = conditions.maxPressure >= MOOD.hotPressure || conditions.pumpFaulted;
    const next: Mood = this.mishapTimer > 0 ? 'mishap' : troubled ? 'warning' : 'smooth';
    this.entered = next !== this.mood;
    this.mood = next;
    return this.mood;
  }

  reset() { this.mood = 'smooth'; this.entered = false; this.mishapTimer = 0; }
}
