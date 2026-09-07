import { Vector3 } from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';

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
  onContact:(speed:number,foot:boolean)=>void=()=>{};
  readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    for(let i=0;i<body.mass.length;i++) this.restCenter.addScaledVector(new Vector3().fromArray(body.rest,i*3),body.mass[i]/body.totalMass);
  }
  jump() { this.jumpQueued=true;this.body.wake(); }
  reset() { this.yaw=0;this.phase=0;this.jumpCooldown=0;this.jumpQueued=false;this.releasedFor=1;this.move.set(0,0,0); }
  step(h:number) {
    const b=this.body, x=b.x, v=b.velocity;
    this.elapsed+=h; this.jumpCooldown-=h;
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
    if(b.grab) { this.releasedFor=0; this.jumpQueued=false; return; }
    this.releasedFor+=h;
    const recovery=Math.min(1,this.releasedFor/.65)*(this.grounded?1:.15);
    const k=PHYS.shapeMemory*recovery,damping=PHYS.shapeDamping*recovery;
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
      this.onContact(-this.velocity.y,false); this.lastImpact=this.elapsed;
    }
  }
}
