import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { SurfaceAttachment } from './surface-attachment.ts';

// A rocking body drops out of eligibility for a few frames at a time. Once a
// burst has started, keep it running through gaps this short so brief rocking
// cannot cut the panic off mid-beat.
const EXIT_GRACE=.3;

/** Cosmetic effort only. Never wakes, pushes, or writes to the physical body. */
export class BackSquirm {
  time=-1;
  private quietTime=0;
  private ineligibleTime=0;
  private readonly anchor:SurfaceAttachment;
  private readonly front=new THREE.Vector3();
  private readonly body:SoftBody;
  constructor(body:SoftBody) {
    this.body=body;
    this.anchor=new SurfaceAttachment(body,new THREE.Vector3(0,.04,.025));
  }
  update(dt:number) {
    this.anchor.update();this.front.set(0,0,1).applyQuaternion(this.anchor.quaternion);
    let floor=Infinity,speedSquared=0;
    for(let i=0;i<this.body.x.length;i+=3) {
      floor=Math.min(floor,this.body.x[i+1]);
      for(let k=0;k<3;k++)speedSquared+=this.body.velocity[i+k]**2;
    }
    const speed=Math.sqrt(speedSquared/(this.body.x.length/3));
    // Allow a rocking, partly rolled-back body to panic before it settles.
    // Hysteresis prevents small orientation changes from restarting the beat.
    const held=this.body.grabs.length>0;
    const eligible=!held&&floor<.012&&floor>-.012&&speed<.38&&
      this.front.y>(this.time>=0?.28:.45);
    // Being picked up ends the burst at once; nothing else does.
    if(held){this.reset();return;}
    const h=Math.min(Math.max(dt,0),.05);
    if(!eligible) {
      if(this.time<0){this.reset();return;}
      this.ineligibleTime+=h;
      if(this.ineligibleTime>EXIT_GRACE){this.reset();return;}
      this.time+=h;
      return;
    }
    this.ineligibleTime=0;
    this.quietTime+=h;
    if(this.quietTime>.08)this.time=this.time<0?0:this.time+h;
  }
  reset(){this.time=-1;this.quietTime=0;this.ineligibleTime=0;}
}
