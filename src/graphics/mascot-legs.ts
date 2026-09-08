import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SoftBody } from '../physics/soft-body.js';

export const LEG_TUNING=Object.freeze({spring:48,damping:6,inertia:1.4,rotationDrive:3,impact:12,limit:Math.PI/3});
type Anchor={ids:number[];weights:number[];point:THREE.Vector3};
export type LegSnapshot={active:boolean;revision:number;frame:number[];legs:{angle:number;splay:number;velocity:number;splayVelocity:number;anchor:number[];triangle:number[];weights:number[]}[]};

/** Render-only appendages: all skin bindings are fixed once in rest space. */
export class MascotLegs {
  revision=0;
  private moving=false;
  private impactCooldown=0;
  private readonly body:SoftBody;
  private readonly anchors:Anchor[]=[];
  private readonly pivots:THREE.Group[]=[];
  private readonly angle=new Float64Array(2);
  private readonly splay=new Float64Array(2);
  private readonly velocity=new Float64Array(2);
  private readonly splayVelocity=new Float64Array(2);
  private readonly frame=new THREE.Quaternion();
  private readonly previousFrame=new THREE.Quaternion();
  private readonly delta=new THREE.Quaternion();
  private readonly swing=new THREE.Quaternion();
  private readonly euler=new THREE.Euler();
  private readonly matrix=new THREE.Matrix4();
  private readonly right=new THREE.Vector3();
  private readonly up=new THREE.Vector3();
  private readonly front=new THREE.Vector3();
  private readonly midpoint=new THREE.Vector3();
  private readonly previousMidpoint=new THREE.Vector3();
  private readonly linearVelocity=new THREE.Vector3();
  private readonly previousVelocity=new THREE.Vector3();
  private readonly acceleration=new THREE.Vector3();
  private initialized=false;
  constructor(body:SoftBody,group:THREE.Group) {
    this.body=body;
    const rest=new Float32Array(body.surface.positions.length);
    for(let i=0;i<rest.length/3;i++)for(let k=0;k<4;k++) {
      const id=body.surface.bindingIds[i*4+k]*3,w=body.surface.bindingWeights[i*4+k];
      for(let axis=0;axis<3;axis++)rest[i*3+axis]+=body.rest[id+axis]*w;
    }
    // Underside/front hip roots: short boots peek out beyond the broad belly.
    for(const sign of [-1,1])this.anchors.push(this.bind(new THREE.Vector3(sign*.013,.012,.020),rest));
    for(const p of [[-.024,.036,0],[.024,.036,0],[0,.073,0],[0,.003,0]])
      this.anchors.push(this.bind(new THREE.Vector3(...p),rest));
    const denim=new THREE.MeshStandardNodeMaterial({color:'#345775',roughness:.92});
    const leather=new THREE.MeshStandardNodeMaterial({color:'#794829',roughness:.87});
    const legGeometry=new THREE.CylinderGeometry(.0045,.004,.006,10);
    const bootGeometry=new RoundedBoxGeometry(.011,.008,.017,2,.002);
    for(let i=0;i<2;i++) {
      const pivot=new THREE.Group(),leg=new THREE.Mesh(legGeometry,denim),boot=new THREE.Mesh(bootGeometry,leather);
      leg.position.y=-.0025;boot.position.set(0,-.007,.004);
      leg.raycast=()=>{};boot.raycast=()=>{};
      pivot.add(leg,boot);group.add(pivot);this.pivots.push(pivot);
    }
    this.reset();
  }
  private bind(target:THREE.Vector3,p:Float32Array):Anchor {
    const ix=this.body.surface.indices;
    const triangle=new THREE.Triangle(),nearest=new THREE.Vector3(),bestPoint=new THREE.Vector3();
    let best=Infinity,offset=-1;
    for(let t=0;t<ix.length;t+=3) {
      triangle.a.fromArray(p,ix[t]*3);triangle.b.fromArray(p,ix[t+1]*3);triangle.c.fromArray(p,ix[t+2]*3);
      triangle.closestPointToPoint(target,nearest);const distance=nearest.distanceToSquared(target);
      if(distance<best){best=distance;offset=t;bestPoint.copy(nearest);}
    }
    if(offset<0)throw new Error('Mascot hip binding: no surface triangles');
    const ids=[ix[offset],ix[offset+1],ix[offset+2]];
    triangle.a.fromArray(p,ids[0]*3);triangle.b.fromArray(p,ids[1]*3);triangle.c.fromArray(p,ids[2]*3);
    triangle.getBarycoord(bestPoint,nearest);
    if(!Number.isFinite(nearest.x+nearest.y+nearest.z))throw new Error('Mascot hip binding: degenerate surface triangle');
    return {ids,weights:nearest.toArray(),point:bestPoint};
  }
  private sample() {
    const p=this.body.surface.positions;
    for(const a of this.anchors) {
      a.point.set(0,0,0);
      for(let i=0;i<3;i++) {const j=a.ids[i]*3,w=a.weights[i];a.point.x+=p[j]*w;a.point.y+=p[j+1]*w;a.point.z+=p[j+2]*w;}
    }
    this.right.subVectors(this.anchors[3].point,this.anchors[2].point);
    this.up.subVectors(this.anchors[4].point,this.anchors[5].point);
    this.front.crossVectors(this.right,this.up);
    // Severe flattening can briefly make a frame ambiguous; retain the last
    // valid orientation, while both hip positions continue to follow the skin.
    if(this.right.lengthSq()>1e-10&&this.front.lengthSq()>1e-12) {
      this.right.normalize();this.front.normalize();this.up.crossVectors(this.front,this.right).normalize();
      this.matrix.makeBasis(this.right,this.up,this.front);this.frame.setFromRotationMatrix(this.matrix);
    }
    this.midpoint.addVectors(this.anchors[0].point,this.anchors[1].point).multiplyScalar(.5);
  }
  private pose() {
    for(let i=0;i<2;i++) {
      this.pivots[i].position.copy(this.anchors[i].point);
      this.euler.set(this.angle[i],0,(i===0?-1:1)*(.12+this.splay[i]));
      this.swing.setFromEuler(this.euler);this.pivots[i].quaternion.copy(this.frame).multiply(this.swing);
    }
    this.revision++;
  }
  get active(){return this.moving;}
  impact(speed:number) {
    if(this.impactCooldown>0)return;
    const kick=Math.min(7.5,Math.max(0,speed-.12)*LEG_TUNING.impact);
    if(kick===0)return;
    this.impactCooldown=.1;
    for(let i=0;i<2;i++){this.velocity[i]-=kick*.55;this.splayVelocity[i]+=kick;}
    this.moving=true;
  }
  update(dt:number) {
    this.impactCooldown=Math.max(0,this.impactCooldown-dt);
    this.sample();
    if(!this.initialized||dt<=0) {
      this.previousFrame.copy(this.frame);this.previousMidpoint.copy(this.midpoint);this.previousVelocity.set(0,0,0);
      this.initialized=true;this.pose();return true;
    }
    const h=Math.min(dt,.05),steps=Math.ceil(h*120);
    this.linearVelocity.subVectors(this.midpoint,this.previousMidpoint).multiplyScalar(1/dt);
    this.acceleration.subVectors(this.linearVelocity,this.previousVelocity).multiplyScalar(1/dt);
    this.delta.copy(this.previousFrame).invert().multiply(this.frame);
    if(this.delta.w<0)this.delta.set(-this.delta.x,-this.delta.y,-this.delta.z,-this.delta.w);
    const rotationX=2*this.delta.x/dt,rotationZ=2*this.delta.z/dt;
    this.previousFrame.copy(this.frame);this.previousMidpoint.copy(this.midpoint);this.previousVelocity.copy(this.linearVelocity);
    const forceX=THREE.MathUtils.clamp(-this.acceleration.dot(this.front)*LEG_TUNING.inertia-rotationX*LEG_TUNING.rotationDrive,-45,45);
    const forceZ=THREE.MathUtils.clamp(this.acceleration.dot(this.right)*LEG_TUNING.inertia-rotationZ*LEG_TUNING.rotationDrive,-45,45);
    let energy=0;
    // At most six tiny scalar substeps preserve elapsed time on slower frames.
    for(let step=0;step<steps;step++)for(let i=0;i<2;i++) {
      const sign=i===0?-1:1,s=h/steps;
      this.velocity[i]+=(-LEG_TUNING.spring*this.angle[i]-LEG_TUNING.damping*this.velocity[i]+forceX)*s;
      this.splayVelocity[i]+=(-LEG_TUNING.spring*this.splay[i]-LEG_TUNING.damping*this.splayVelocity[i]+sign*forceZ)*s;
      this.angle[i]+=this.velocity[i]*s;this.splay[i]+=this.splayVelocity[i]*s;
      if(Math.abs(this.angle[i])>LEG_TUNING.limit){this.angle[i]=Math.sign(this.angle[i])*LEG_TUNING.limit;this.velocity[i]*=-.15;}
      if(this.splay[i]>.9){this.splay[i]=.9;this.splayVelocity[i]*=-.15;}
      if(this.splay[i]<-.38){this.splay[i]=-.38;this.splayVelocity[i]*=-.15;}
    }
    for(let i=0;i<2;i++)energy+=Math.abs(this.angle[i])+Math.abs(this.splay[i])+Math.abs(this.velocity[i])+Math.abs(this.splayVelocity[i]);
    const changed=this.moving||!this.body.sleeping||energy>.001;
    this.moving=energy>.001;
    if(this.body.sleeping&&!this.moving){this.angle.fill(0);this.splay.fill(0);this.velocity.fill(0);this.splayVelocity.fill(0);}
    if(changed)this.pose();
    return changed;
  }
  reset() {
    this.angle.fill(0);this.splay.fill(0);this.velocity.fill(0);this.splayVelocity.fill(0);this.moving=false;
    this.impactCooldown=0;
    this.initialized=false;this.update(0);
  }
  get debug():LegSnapshot {
    return {active:this.moving,revision:this.revision,frame:this.frame.toArray(),legs:this.anchors.slice(0,2).map((a,i)=>({angle:this.angle[i],splay:this.splay[i],velocity:this.velocity[i],splayVelocity:this.splayVelocity[i],anchor:a.point.toArray(),triangle:[...a.ids],weights:[...a.weights]}))};
  }
  snapshot(){return this.debug;}
  restoreInspection(state:LegSnapshot) {
    for(let i=0;i<2;i++) {
      const leg=state.legs[i];this.angle[i]=leg.angle;this.splay[i]=leg.splay;this.velocity[i]=leg.velocity;this.splayVelocity[i]=leg.splayVelocity;
    }
    this.moving=state.active;this.sample();this.pose();this.initialized=false;
  }
  restore(state:LegSnapshot){this.restoreInspection(state);}
}
