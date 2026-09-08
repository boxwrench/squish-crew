import { Vector3 } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';

/**
 * A hard floor landing briefly relaxes shape memory so the body stays
 * flattened for a beat, while damping stays near full strength so it settles
 * instead of wobbling back. Transient only: PHYS is never mutated, and idle
 * behaviour with no recent impact is exactly as before.
 *
 * Peak squash on the impact frame is set by the FEM, not by shape memory, and
 * measured barely at all here (40.9mm before, 40.2mm after on a maximum drop).
 * What this buys is the beat afterwards: time spent below 85% of rest height
 * goes from 117ms to 317ms on a hard landing and from 92ms to 479ms on an
 * ordinary one. Suppressing memory harder or longer than this stops reading as
 * a squash and starts tipping him onto his back instead.
 */
export const PLOP = {
  /** Downward centre speed (m/s) at which a landing starts to plop. */
  speed: .28,
  /** Extra speed above that for a fully saturated plop. */
  range: .22,
  /** Shape-memory multiplier at full strength. */
  memory: .15,
  /** Damping is barely touched: it is what keeps the flattened body quiet. */
  damping: .85,
  /** Seconds held fully suppressed, so the flattened beat reads visually. */
  hold: .16,
  /** Seconds easing back to normal recovery afterwards. */
  release: .80,
};

/**
 * Experimental: a very short softening of the elastic shear response across the
 * impact frame itself, so the landing compresses further before the plop takes
 * over. Bulk is untouched, so this is shape deformation and not volume
 * collapse, and the window is far shorter than the plop's flattened beat.
 *
 * Shear is already a per-step argument of both the WebAssembly kernel and the
 * JavaScript fallback, so this rides the existing stepPhys override path and
 * needs no solver or kernel change.
 *
 * Measured against the plop alone on the hardest drop a pointer can produce:
 * peak height .590 -> .530 of rest and spread 1.297 -> 1.378, with minimum
 * Jacobian .1202 -> .1224 and volume floor .924 -> .920. It is not free -
 * softening the compression stores energy that comes back, so rebound rises
 * 38.0mm -> 49.7mm and the post-landing slide 56mm -> 69mm. That trade is the
 * reason this lives in its own commit.
 */
export const IMPACT_SOFTEN = {
  /** Shear multiplier at the peak of a fully saturated impact. */
  shear: .35,
  /** Seconds of softened response. Ends by returning shearScale to exactly 1. */
  window: .08,
};

/** Soft recovery around the mass center, with no directional locomotion. */
export class Locomotion {
  readonly move=new Vector3();
  readonly velocity=new Vector3();
  readonly center=new Vector3();
  yaw=0;
  phase=0;
  grounded=false;
  private jumpQueued=false;
  private jumpCooldown=0;
  private releasedFor=1;
  private restCenter=new Vector3();
  private elapsed=0;
  private lastImpact=-1;
  private plopStrength=0;
  private plopTime=0;
  private softenStrength=0;
  private softenTime=-1;
  onContact:(speed:number,foot:boolean)=>void=()=>{};
  readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    for(let i=0;i<body.mass.length;i++) this.restCenter.addScaledVector(new Vector3().fromArray(body.rest,i*3),body.mass[i]/body.totalMass);
  }
  jump() { this.jumpQueued=true;this.body.wake(); }
  reset() { this.yaw=0;this.phase=0;this.jumpCooldown=0;this.jumpQueued=false;this.releasedFor=1;this.move.set(0,0,0);this.plopStrength=0;this.plopTime=0;this.clearSoften(); }
  private clearSoften(){this.softenStrength=0;this.softenTime=-1;this.body.shearScale=1;}
  /** 0 when fully recovered, up to plopStrength during the flattened beat. */
  private plopEnvelope() {
    if(this.plopStrength<=0)return 0;
    const past=this.plopTime-PLOP.hold;
    if(past<=0)return this.plopStrength;
    const u=Math.min(1,past/PLOP.release);
    return this.plopStrength*(1-u*u*(3-2*u));
  }
  step(h:number) {
    const b=this.body, x=b.x, v=b.velocity;
    this.elapsed+=h; this.jumpCooldown-=h; this.plopTime+=h;
    // Applied before body.step() consumes it, and always released back to
    // exactly 1 so no later step sees a softened element.
    if(this.softenTime>=0) {
      this.softenTime+=h;
      if(this.softenTime>=IMPACT_SOFTEN.window)this.clearSoften();
      else {
        const u=this.softenTime/IMPACT_SOFTEN.window;
        const amount=this.softenStrength*(1-u*u*(3-2*u));
        b.shearScale=1-amount*(1-IMPACT_SOFTEN.shear);
      }
    }
    if(this.plopStrength>0&&this.plopTime>PLOP.hold+PLOP.release){this.plopStrength=0;this.plopTime=0;}
    this.center.set(0,0,0); this.velocity.set(0,0,0);
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3, w=b.mass[i]/b.totalMass;
      this.center.x+=x[j]*w; this.center.y+=x[j+1]*w; this.center.z+=x[j+2]*w;
      this.velocity.x+=v[j]*w; this.velocity.y+=v[j+1]*w; this.velocity.z+=v[j+2]*w;
    }
    this.grounded=b.grounded;
    b.canSleep=!this.jumpQueued;
    if(!b.canSleep)b.wake();
    if(b.sleeping)return;
    if(b.grab) { this.releasedFor=0; this.jumpQueued=false; this.plopStrength=0; this.plopTime=0; this.clearSoften(); return; }
    this.releasedFor+=h;
    const recovery=Math.min(1,this.releasedFor/.65)*(this.grounded?1:.15);
    // Memory is what un-squashes him, so only it is suppressed; scaling damping
    // down by the same amount would leave the flattened body oscillating.
    const plop=this.plopEnvelope();
    const k=PHYS.shapeMemory*recovery*(1-plop*(1-PLOP.memory));
    const damping=PHYS.shapeDamping*recovery*(1-plop*(1-PLOP.damping));
    for(let i=0;i<b.mass.length;i++) {
      const j=i*3;
      // Relative targets preserve translation; airborne softness lets the tip lag.
      v[j]+=(k*(this.center.x+b.rest[j]-this.restCenter.x-x[j])-damping*(v[j]-this.velocity.x))*h;
      v[j+1]+=(k*(this.center.y+b.rest[j+1]-this.restCenter.y-x[j+1])-damping*(v[j+1]-this.velocity.y))*h;
      v[j+2]+=(k*(this.center.z+b.rest[j+2]-this.restCenter.z-x[j+2])-damping*(v[j+2]-this.velocity.z))*h;
    }
    if(this.jumpQueued && this.grounded && this.jumpCooldown<=0) {
      for(let i=0;i<b.mass.length;i++) {
        const lower=Math.max(0,1-b.rest[i*3+1]/.055);
        v[i*3+1]+=.28+lower*.08;
      }
      this.jumpCooldown=.28;this.onContact(.12,false);
    }
    this.jumpQueued=false;
  }
  afterStep() {
    let contact=0;
    for(let i=0;i<this.body.contact.length;i++) contact+=this.body.contact[i]*this.body.mass[i];
    if(contact>0 && this.velocity.y<-.13 && this.elapsed-this.lastImpact>.11) {
      const speed=-this.velocity.y;
      this.onContact(speed,false); this.lastImpact=this.elapsed;
      // Floor landings only. A harder landing may deepen a plop already in
      // progress, but a softer one never cuts the current beat short.
      const strength=Math.min(1,(speed-PLOP.speed)/PLOP.range);
      if(strength>0&&strength>this.plopEnvelope()){this.plopStrength=strength;this.plopTime=0;}
      if(strength>0){this.softenStrength=strength;this.softenTime=0;}
    }
  }
}
