import * as THREE from 'three/webgpu';
import { PHYS } from '../physics/constants.js';

const MAX_DROPS = 32;

type SplashDrop = {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
};

/**
 * Droplets thrown off by a hard landing, and later by a burst.
 *
 * One InstancedMesh and simple ballistics: no collision beyond the floor, no
 * soft bodies, no allocation per frame. Drops retire on contact with the floor; the landing circle carries the effect.
 */
export class SplashParticles {
  readonly mesh: THREE.InstancedMesh;
  private readonly drops: SplashDrop[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3();
  private readonly hidden = new THREE.Vector3(0, 0, 0);

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 8, 6);
    const material = new THREE.MeshPhysicalMaterial({
      color: '#61ccff', roughness: .04, metalness: 0,
      transmission: .9, ior: 1.333, thickness: .004,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_DROPS);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = MAX_DROPS;
    for (let i = 0; i < MAX_DROPS; i++) {
      this.drops.push({ active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: .002 });
    }
    this.hide();
  }

  /** True while any drop is in the air, so the render loop keeps running. */
  get active() { return this.drops.some(drop => drop.active); }

  /**
   * Throw `count` drops outward from a landing or a burst. `speed` sets how far
   * they fly; `carry` is the body's own motion, so a sideways landing sprays
   * downrange instead of straight up.
   */
  burst(origin: THREE.Vector3, speed: number, count: number, carry?: THREE.Vector3) {
    let spawned = 0;
    for (const drop of this.drops) {
      if (spawned >= count) break;
      if (drop.active) continue;
      const angle = Math.random() * Math.PI * 2;
      const out = speed * (.35 + Math.random() * .55);
      const up = speed * (.55 + Math.random() * .75);
      drop.position.set(origin.x + Math.cos(angle) * .012, PHYS.floor + .004 + Math.random() * .01, origin.z + Math.sin(angle) * .012);
      drop.velocity.set(Math.cos(angle) * out, up, Math.sin(angle) * out);
      if (carry) drop.velocity.addScaledVector(carry, .35);
      drop.radius = .0013 + Math.random() * .0022;
      drop.active = true;
      spawned++;
    }
  }

  update(dt: number) {
    for (const drop of this.drops) {
      if (!drop.active) continue;
      drop.velocity.y -= PHYS.gravity * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      if (drop.position.y <= PHYS.floor + drop.radius) {
        drop.active = false;
      }
    }
    this.write();
  }

  clear() { for (const drop of this.drops) drop.active = false; this.hide(); }

  private hide() { for (const drop of this.drops) drop.active = false; this.write(); }

  private write() {
    for (let i = 0; i < this.drops.length; i++) {
      const drop = this.drops[i];
      if (drop.active) this.scale.setScalar(drop.radius);
      else this.scale.copy(this.hidden);
      this.matrix.compose(drop.position, ZERO_ROTATION, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

const ZERO_ROTATION = new THREE.Quaternion();
