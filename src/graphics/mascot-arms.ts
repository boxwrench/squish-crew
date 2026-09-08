import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { SurfaceAttachment } from './surface-attachment.ts';

export const ARM_TUNING=Object.freeze({spring:72,damping:9,inertia:1.2,rotationDrive:2.2,limit:Math.PI/6});

/** Tiny cosmetic arms; one restrained lag axis, no contacts or picking. */
export class MascotArms {
  revision=0;
  private readonly body:SoftBody;
  private readonly anchors:SurfaceAttachment[]=[];
  private readonly pivots:THREE.Group[]=[];
  private readonly angles=new Float64Array(2);
  private readonly velocities=new Float64Array(2);
  private readonly previousPoints=[new THREE.Vector3(),new THREE.Vector3()];
  private readonly previousVelocities=[new THREE.Vector3(),new THREE.Vector3()];
  private readonly previousFrames=[new THREE.Quaternion(),new THREE.Quaternion()];
  private readonly velocity=new THREE.Vector3();
  private readonly acceleration=new THREE.Vector3();
  private readonly front=new THREE.Vector3();
  private readonly delta=new THREE.Quaternion();
  private readonly swing=new THREE.Quaternion();
  private readonly euler=new THREE.Euler();
  private moving=false;
  private initialized=false;
  constructor(body:SoftBody,group:THREE.Group) {
    this.body=body;
    const shirt=new THREE.MeshStandardNodeMaterial({color:'#203d60',roughness:.86});
    const skin=new THREE.MeshStandardNodeMaterial({color:'#c58f69',roughness:.85});
    const sleeveGeometry=new THREE.CylinderGeometry(.0058,.0052,.009,10);
    const handGeometry=new THREE.CapsuleGeometry(.004,.004,3,8);
    for(const sign of [-1,1]) {
      this.anchors.push(new SurfaceAttachment(body,new THREE.Vector3(sign*.026,.041,.003)));
      const pivot=new THREE.Group(),sleeve=new THREE.Mesh(sleeveGeometry,shirt),hand=new THREE.Mesh(handGeometry,skin);
      sleeve.position.y=-.002;hand.position.y=-.008;
      sleeve.raycast=()=>{};hand.raycast=()=>{};
      pivot.add(sleeve,hand);group.add(pivot);this.pivots.push(pivot);
    }
    this.reset();
  }
  private pose() {
    for(let i=0;i<2;i++) {
      this.pivots[i].position.copy(this.anchors[i].point);
      this.euler.set(this.angles[i],0,(i===0?-1:1)*.42);
      this.swing.setFromEuler(this.euler);this.pivots[i].quaternion.copy(this.anchors[i].quaternion).multiply(this.swing);
    }
    this.revision++;
  }
  update(dt:number) {
    for(const a of this.anchors)a.update();
    if(!this.initialized||dt<=0) {
      for(let i=0;i<2;i++){this.previousPoints[i].copy(this.anchors[i].point);this.previousFrames[i].copy(this.anchors[i].quaternion);this.previousVelocities[i].set(0,0,0);}
      this.initialized=true;this.pose();return true;
    }
    const h=Math.min(dt,.05),steps=Math.ceil(h*120);
    let energy=0;
    for(let i=0;i<2;i++) {
      const a=this.anchors[i];
      this.velocity.subVectors(a.point,this.previousPoints[i]).multiplyScalar(1/dt);
      this.acceleration.subVectors(this.velocity,this.previousVelocities[i]).multiplyScalar(1/dt);
      this.delta.copy(this.previousFrames[i]).invert().multiply(a.quaternion);
      if(this.delta.w<0)this.delta.set(-this.delta.x,-this.delta.y,-this.delta.z,-this.delta.w);
      this.front.set(0,0,1).applyQuaternion(a.quaternion);
      const drive=THREE.MathUtils.clamp(-this.acceleration.dot(this.front)*ARM_TUNING.inertia-2*this.delta.x/dt*ARM_TUNING.rotationDrive,-35,35);
      this.previousPoints[i].copy(a.point);this.previousFrames[i].copy(a.quaternion);this.previousVelocities[i].copy(this.velocity);
      for(let j=0;j<steps;j++) {
        this.velocities[i]+=(-ARM_TUNING.spring*this.angles[i]-ARM_TUNING.damping*this.velocities[i]+drive)*h/steps;
        this.angles[i]+=this.velocities[i]*h/steps;
        if(Math.abs(this.angles[i])>ARM_TUNING.limit){this.angles[i]=Math.sign(this.angles[i])*ARM_TUNING.limit;this.velocities[i]*=-.1;}
      }
      energy+=Math.abs(this.angles[i])+Math.abs(this.velocities[i]);
    }
    const changed=this.moving||!this.body.sleeping||energy>.001;
    this.moving=energy>.001;
    if(this.body.sleeping&&!this.moving){this.angles.fill(0);this.velocities.fill(0);}
    if(changed)this.pose();return changed;
  }
  reset(){this.angles.fill(0);this.velocities.fill(0);this.moving=false;this.initialized=false;this.update(0);}
  get active(){return this.moving;}
  get debug(){return {active:this.moving,revision:this.revision,arms:this.anchors.map((a,i)=>({...a.debug,angle:this.angles[i],velocity:this.velocities[i]}))};}
  snapshot(){return this.debug;}
  restoreInspection(state:ReturnType<MascotArms['snapshot']>) {
    for(let i=0;i<2;i++){this.angles[i]=state.arms[i].angle;this.velocities[i]=state.arms[i].velocity;this.anchors[i].update();}
    this.moving=state.active;this.pose();this.initialized=false;
  }
}
