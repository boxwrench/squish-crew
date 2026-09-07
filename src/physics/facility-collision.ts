import type { SoftBody } from './soft-body.js';

type PointLike={x:number;y:number;z:number};

/** Optional finite-mass response for a moving collision volume. */
export interface CollisionMotion {
  velocityAt(x:number,y:number,z:number,out:PointLike):void;
  inverseMassAt(x:number,y:number,z:number,nx:number,ny:number,nz:number):number;
  applyImpulse(x:number,y:number,z:number,ix:number,iy:number,iz:number):void;
}

export interface CollisionBox {
  center:PointLike;
  xAxis:PointLike;
  yAxis:PointLike;
  zAxis:PointLike;
  halfSize:PointLike;
  motion?:CollisionMotion;
}

// The visible body is much denser than the mechanical cage. A single surface
// vertex per rest-space cell gives the collision pass enough shape information
// to keep the rendered skin out of a tight facility volume without scanning all
// 72k visible vertices at 240 Hz.
export const FACILITY_COLLISION_SAMPLE_SPACING=.003;
export const FACILITY_COLLISION_MARGIN=.002;
const COLLISION_ITERATIONS=2;

/** Lightweight narrow-phase contacts for authored facility volumes. */
export class FacilityCollision {
  readonly sampleCount:number;
  private readonly body:SoftBody;
  private readonly vertices:Int32Array;
  private readonly bindingIds:Uint32Array;
  private readonly bindingWeights:Float64Array;
  private readonly denominators:Float64Array;
  private readonly point=new Float64Array(3);
  private readonly motionVelocity:PointLike={x:0,y:0,z:0};

  constructor(body:SoftBody,spacing=FACILITY_COLLISION_SAMPLE_SPACING) {
    this.body=body;
    const surface=body.surface as {
      positions:Float32Array;
      bindingIds:Uint32Array;
      bindingWeights:Float64Array;
    };
    this.bindingIds=surface.bindingIds;
    this.bindingWeights=surface.bindingWeights;
    const bins=new Map<string,number>();
    const inverseSpacing=1/spacing;
    for(let vertex=0;vertex<surface.positions.length/3;vertex++) {
      const offset=vertex*3;
      const key=`${Math.floor(surface.positions[offset]*inverseSpacing)},${Math.floor(surface.positions[offset+1]*inverseSpacing)},${Math.floor(surface.positions[offset+2]*inverseSpacing)}`;
      if(!bins.has(key))bins.set(key,vertex);
    }
    this.vertices=Int32Array.from(bins.values());
    this.sampleCount=this.vertices.length;
    this.denominators=new Float64Array(this.sampleCount);
    for(let sample=0;sample<this.sampleCount;sample++) {
      const offset=this.vertices[sample]*4;
      let denominator=0;
      for(let k=0;k<4;k++) {
        const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k];
        denominator+=body.inverseMass[id]*weight*weight;
      }
      this.denominators[sample]=denominator;
    }
  }

  /** Resolve tight oriented boxes, such as the swing's timber frame pieces. */
  resolveBoxes(boxes:readonly CollisionBox[],margin=FACILITY_COLLISION_MARGIN) {
    if(!boxes.length)return false;
    let changed=false;
    for(let iteration=0;iteration<COLLISION_ITERATIONS;iteration++)for(let sample=0;sample<this.sampleCount;sample++) {
      this.readSample(sample);
      for(const box of boxes) {
        const dx=this.point[0]-box.center.x,dy=this.point[1]-box.center.y,dz=this.point[2]-box.center.z;
        const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
        const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
        const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
        const hx=box.halfSize.x+margin,hy=box.halfSize.y+margin,hz=box.halfSize.z+margin;
        if(Math.abs(qx)>=hx||Math.abs(qy)>=hy||Math.abs(qz)>=hz)continue;
        const px=hx-Math.abs(qx),py=hy-Math.abs(qy),pz=hz-Math.abs(qz);
        let nx=box.xAxis.x,ny=box.xAxis.y,nz=box.xAxis.z,depth=px,side=qx;
        if(py<depth){depth=py;side=qy;nx=box.yAxis.x;ny=box.yAxis.y;nz=box.yAxis.z;}
        if(pz<depth){depth=pz;side=qz;nx=box.zAxis.x;ny=box.zAxis.y;nz=box.zAxis.z;}
        if(side<0){nx=-nx;ny=-ny;nz=-nz;}
        this.applyContact(sample,box,nx,ny,nz,depth);changed=true;
        this.readSample(sample);
      }
    }
    this.finish(changed);
    return changed;
  }

  /**
   * Keep the body outside the side of a vertical cylinder. This is deliberately
   * a one-sided boundary: inactive trampoline space is a keep-out disk, while
   * jumping above the cylinder remains possible.
   */
  resolveCylinderBarrier(centerX:number,centerZ:number,radius:number,minY:number,maxY:number,margin=FACILITY_COLLISION_MARGIN) {
    const boundary=radius+margin;
    let changed=false;
    for(let iteration=0;iteration<COLLISION_ITERATIONS;iteration++)for(let sample=0;sample<this.sampleCount;sample++) {
      this.readSample(sample);
      if(this.point[1]<=minY||this.point[1]>=maxY)continue;
      const x=this.point[0]-centerX,z=this.point[2]-centerZ,distance=Math.hypot(x,z);
      if(distance>=boundary)continue;
      const nx=distance<1e-9?1:x/distance,nz=distance<1e-9?0:z/distance;
      this.applyContact(sample,undefined,nx,0,nz,boundary-distance);changed=true;
      this.readSample(sample);
    }
    this.finish(changed);
    return changed;
  }

  private readSample(sample:number) {
    const offset=this.vertices[sample]*4,x=this.body.x;
    let px=0,py=0,pz=0;
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      px+=x[j]*weight;py+=x[j+1]*weight;pz+=x[j+2]*weight;
    }
    this.point[0]=px;this.point[1]=py;this.point[2]=pz;
  }

  private applyContact(sample:number,box:CollisionBox|undefined,nx:number,ny:number,nz:number,depth:number) {
    const offset=this.vertices[sample]*4,denominator=this.denominators[sample];
    if(denominator<1e-15)return;
    const x=this.body.x,inverseMass=this.body.inverseMass;
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      const amount=inverseMass[id]*weight*depth/denominator;
      x[j]+=amount*nx;x[j+1]+=amount*ny;x[j+2]+=amount*nz;
    }
    const velocity=this.body.velocity;
    let normalVelocity=0;
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      normalVelocity+=weight*(velocity[j]*nx+velocity[j+1]*ny+velocity[j+2]*nz);
    }
    const motion=box?.motion;
    let motionNormalVelocity=0,motionInverseMass=0;
    if(motion) {
      motion.velocityAt(this.point[0],this.point[1],this.point[2],this.motionVelocity);
      motionNormalVelocity=this.motionVelocity.x*nx+this.motionVelocity.y*ny+this.motionVelocity.z*nz;
      motionInverseMass=motion.inverseMassAt(this.point[0],this.point[1],this.point[2],nx,ny,nz);
    }
    const relativeVelocity=normalVelocity-motionNormalVelocity;
    if(relativeVelocity>=0)return;
    const impulse=-relativeVelocity/(denominator+Math.max(0,motionInverseMass));
    for(let k=0;k<4;k++) {
      const id=this.bindingIds[offset+k],weight=this.bindingWeights[offset+k],j=id*3;
      const amount=inverseMass[id]*weight*impulse;
      velocity[j]+=amount*nx;velocity[j+1]+=amount*ny;velocity[j+2]+=amount*nz;
    }
    if(motion)motion.applyImpulse(this.point[0],this.point[1],this.point[2],-impulse*nx,-impulse*ny,-impulse*nz);
  }

  private finish(changed:boolean) {
    if(!changed)return;
    this.body.stabilizeContacts();
    this.body.wake();this.body.updateCenter();this.body.surfaceDirty=true;
  }
}
