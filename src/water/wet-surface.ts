import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/** Metres covered by the mask, centred on Droppie. */
export const WET_SPAN = .6;
const WET_SIZE = 256;
const WET_HZ = 15;
const MAX_SPLATS = 96;

export type WetSplat = {
  x: number;
  z: number;
  radius: number;
  strength: number;
  age: number;
  lifetime: number;
};

/**
 * Wetness Droppie leaves on the table, as a mask the floor material reads.
 *
 * Splats are held in world coordinates and redrawn each update, so the window
 * can follow him without the marks sliding along with it. The floor shows this
 * as darker wood with a smooth coat and a simple rounded boundary.
 */
export class WetSurface {
  readonly span = WET_SPAN;
  readonly origin = new THREE.Vector2();
  readonly texture: THREE.CanvasTexture;
  readonly originNode = uniform(this.origin);
  readonly spanNode = uniform(this.span);
  private readonly splats: WetSplat[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private since = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = WET_SIZE;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Wetness mask needs a 2D canvas context');
    this.ctx = ctx;
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, WET_SIZE, WET_SIZE);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.needsUpdate = true;
  }

  /** True while any mark remains, so the render loop keeps drawing as it dries. */
  get drying() { return this.splats.length > 0; }

  add(splat: Omit<WetSplat, 'age'>) {
    // Oldest first, so a burst of marks never starves the trail of slots.
    if (this.splats.length >= MAX_SPLATS) this.splats.shift();
    this.splats.push({ ...splat, age: 0 });
  }

  /** A landing spreads a wider mark the harder it hits. */
  impact(center: THREE.Vector3, speed: number) {
    this.add({
      x: center.x, z: center.z,
      radius: .010 + Math.min(speed, .6) * .016,
      strength: .8, lifetime: 5,
    });
  }

  clear() { this.splats.length = 0; this.redraw(); }

  update(dt: number, center: THREE.Vector3) {
    for (let i = this.splats.length - 1; i >= 0; i--) {
      const splat = this.splats[i];
      splat.age += dt;
      if (splat.age >= splat.lifetime) this.splats.splice(i, 1);
    }
    this.since += dt;
    if (this.since < 1 / WET_HZ) return;
    this.since = 0;
    // Move the sampling origin only when its world-space mask is redrawn.
    this.origin.set(center.x, center.z);
    this.redraw();
  }

  private redraw() {
    const ctx = this.ctx, scale = WET_SIZE / this.span;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WET_SIZE, WET_SIZE);
    // Overlapping marks take the strongest value rather than summing to white.
    ctx.globalCompositeOperation = 'lighten';
    for (const splat of this.splats) {
      const remaining = Math.min(1, (1 - splat.age / splat.lifetime) / .65);
      const fade = remaining * remaining * (3 - 2 * remaining);
      const strength = splat.strength * fade;
      if (strength <= .004) continue;
      const px = (splat.x - this.origin.x) * scale + WET_SIZE / 2;
      const py = (splat.z - this.origin.y) * scale + WET_SIZE / 2;
      const pr = splat.radius * scale;
      if (px + pr < 0 || px - pr > WET_SIZE || py + pr < 0 || py - pr > WET_SIZE) continue;
      const grad = ctx.createRadialGradient(px, py, 0, px, py, pr);
      const level = Math.round(strength * 255);
      grad.addColorStop(0, `rgb(${level},${level},${level})`);
      grad.addColorStop(.82, `rgb(${level},${level},${level})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}
