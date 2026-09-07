import { Vector2 } from 'three/webgpu';
import { uniform } from 'three/tsl';

/** One bounded impact cue. No mesh, mask texture, trail, or fluid simulation. */
export class Puddle {
  readonly center = uniform(new Vector2());
  readonly radius = uniform(.010);
  readonly strength = uniform(0);
  readonly age = uniform(0);
  readonly direction = uniform(new Vector2(1, 0));
  readonly aspect = uniform(1.06);
  private elapsed = 2;
  private lifetime = 1.45;
  private maxRadius = .045;

  get visible() { return this.strength.value > 0; }

  impact(origin: {x:number;z:number}, speed: number) {
    if (speed < .18 || this.elapsed < .25) return false;
    const power = Math.min(1, Math.max(0, (speed - .18) / .42));
    this.show(origin, .030 + .015 * power, 1.3 + .15 * power);
    return true;
  }

  show(origin: {x:number;z:number}, radius = .045, lifetime = 1.45) {
    this.center.value.set(origin.x, origin.z);
    this.maxRadius = radius;
    this.lifetime = lifetime;
    this.elapsed = 0;
    this.update(0);
  }

  hide() { this.strength.value = 0; this.elapsed = 2; }

  /** Return true through the final clear frame, even if the body is asleep. */
  update(dt: number) {
    if (this.elapsed >= this.lifetime) return false;
    this.elapsed += dt;
    if (this.elapsed >= this.lifetime) { this.hide(); return true; }
    const t = this.elapsed;
    this.age.value = t;
    // A quick spread, a small overshoot, then a settled footprint.
    const rise = Math.min(1, t / .18);
    const settle = Math.min(1, Math.max(0, (t - .18) / .05));
    const spread = .70 + .35 * (1 - (1 - rise) ** 3) - .05 * settle * settle * (3 - 2 * settle);
    const dry = Math.max(0, (t - .55) / (this.lifetime - .55));
    const fade = dry * dry * (3 - 2 * dry);
    this.radius.value = this.maxRadius * spread * (1 - .12 * fade);
    this.strength.value = 1 - fade;
    return true;
  }
}
