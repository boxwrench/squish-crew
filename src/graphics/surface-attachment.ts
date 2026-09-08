import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';

type Binding={ids:number[];weights:number[];point:THREE.Vector3};
const restSurfaces=new WeakMap<SoftBody,Float32Array>();

/** A persistent skin point and local deformation-relative orientation. */
export class SurfaceAttachment {
  readonly point=new THREE.Vector3();
  readonly position=this.point;
  readonly restPoint=new THREE.Vector3();
  readonly restNormal=new THREE.Vector3();
  readonly normal=new THREE.Vector3();
  readonly quaternion=new THREE.Quaternion();
  private readonly body:SoftBody;
  private readonly bindings:Binding[]=[];
  private readonly restInverse=new THREE.Quaternion();
  private readonly right=new THREE.Vector3();
  private readonly up=new THREE.Vector3();
  private readonly cross=new THREE.Vector3();
  private readonly matrix=new THREE.Matrix4();
  constructor(body:SoftBody,target:THREE.Vector3) {
    this.body=body;
    let rest=restSurfaces.get(body);
    if(!rest) {
      rest=new Float32Array(body.surface.positions.length);
      for(let i=0;i<rest.length/3;i++)for(let k=0;k<4;k++) {
        const id=body.surface.bindingIds[i*4+k]*3,w=body.surface.bindingWeights[i*4+k];
        for(let axis=0;axis<3;axis++)rest[i*3+axis]+=body.rest[id+axis]*w;
      }
      restSurfaces.set(body,rest);
    }
    const main=this.bind(target,rest);this.bindings.push(main);this.restPoint.copy(main.point);
    const triangle=new THREE.Triangle();
    triangle.a.fromArray(rest,main.ids[0]*3);triangle.b.fromArray(rest,main.ids[1]*3);triangle.c.fromArray(rest,main.ids[2]*3);
    triangle.getNormal(this.normal);
    this.right.set(Math.abs(this.normal.x)<.8?1:0,0,Math.abs(this.normal.x)<.8?0:1);
    this.right.addScaledVector(this.normal,-this.right.dot(this.normal)).normalize();
    this.up.crossVectors(this.normal,this.right).normalize();
    for(const direction of [this.right,this.up])for(const sign of [-1,1])
      this.bindings.push(this.bind(this.restPoint.clone().addScaledVector(direction,sign*.0045),rest));
    this.sample(rest);this.orient();this.restNormal.copy(this.normal);this.restInverse.copy(this.quaternion).invert();this.update();
  }
  private bind(target:THREE.Vector3,p:Float32Array):Binding {
    const ix=this.body.surface.indices,triangle=new THREE.Triangle(),nearest=new THREE.Vector3(),point=new THREE.Vector3();
    let best=Infinity,offset=-1;
    for(let t=0;t<ix.length;t+=3) {
      triangle.a.fromArray(p,ix[t]*3);triangle.b.fromArray(p,ix[t+1]*3);triangle.c.fromArray(p,ix[t+2]*3);
      triangle.closestPointToPoint(target,nearest);const distance=nearest.distanceToSquared(target);
      if(distance<best){best=distance;offset=t;point.copy(nearest);}
    }
    if(offset<0)throw new Error('Surface attachment: no triangles');
    const ids=[ix[offset],ix[offset+1],ix[offset+2]];
    triangle.a.fromArray(p,ids[0]*3);triangle.b.fromArray(p,ids[1]*3);triangle.c.fromArray(p,ids[2]*3);
    triangle.getBarycoord(point,nearest);
    if(!Number.isFinite(nearest.x+nearest.y+nearest.z))throw new Error('Surface attachment: degenerate triangle');
    return {ids,weights:nearest.toArray(),point};
  }
  private sample(p:ArrayLike<number>) {
    for(const a of this.bindings) {
      a.point.set(0,0,0);
      for(let i=0;i<3;i++){const j=a.ids[i]*3,w=a.weights[i];a.point.x+=p[j]*w;a.point.y+=p[j+1]*w;a.point.z+=p[j+2]*w;}
    }
    this.point.copy(this.bindings[0].point);
  }
  private orient() {
    this.right.subVectors(this.bindings[2].point,this.bindings[1].point);
    this.up.subVectors(this.bindings[4].point,this.bindings[3].point);
    this.cross.crossVectors(this.right,this.up);
    if(this.right.lengthSq()<1e-12||this.cross.lengthSq()<1e-14)return;
    this.right.normalize();this.normal.copy(this.cross).normalize();this.up.crossVectors(this.normal,this.right).normalize();
    this.matrix.makeBasis(this.right,this.up,this.normal);
    this.quaternion.setFromRotationMatrix(this.matrix).multiply(this.restInverse);
  }
  update(){this.sample(this.body.surface.positions);this.orient();}
  get debug(){const a=this.bindings[0];return {point:this.point.toArray(),quaternion:this.quaternion.toArray(),triangle:[...a.ids],weights:[...a.weights]};}
}
