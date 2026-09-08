import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { SurfaceAttachment } from './surface-attachment.ts';
import { SurfaceBVH } from './refractive-light.js';

/** Small raised cloth panels bound to the same visible skin as body picking. */
export class MascotClothes {
  revision=0;
  private lastSurface=-1;
  private readonly body:SoftBody;
  private readonly bindings:SurfaceAttachment[]=[];
  private readonly offsets:number[]=[];
  private readonly geometry=new THREE.BufferGeometry();
  private readonly positions:THREE.BufferAttribute;
  private readonly offset=new THREE.Vector3();
  constructor(body:SoftBody,group:THREE.Group) {
    this.body=body;
    const bvh=new SurfaceBVH(body.surface),points:number[]=[],colors:number[]=[],indices:number[]=[];
    const color=new THREE.Color();
    const panel=(outline:number[][],hex:string)=>{
      const start=points.length/3;color.set(hex);
      // A 2x2 patch follows the convex belly instead of cutting across it.
      for(let row=0;row<=2;row++)for(let col=0;col<=2;col++) {
        const u=col/2,v=row/2;
        const x=(1-v)*((1-u)*outline[0][0]+u*outline[1][0])+v*((1-u)*outline[3][0]+u*outline[2][0]);
        const y=(1-v)*((1-u)*outline[0][1]+u*outline[1][1])+v*((1-u)*outline[3][1]+u*outline[2][1]);
        const hit=bvh.hit([x,y,.1],[0,0,-1]);
        if(!hit)throw new Error('Workshirt panel misses the body surface');
        const target=new THREE.Vector3(x,y,.1-hit.distance);
        this.bindings.push(new SurfaceAttachment(body,target));points.push(...target.toArray());colors.push(color.r,color.g,color.b);
        this.offsets.push(hex==='#a4aaa6'?.00065:hex==='#4a6378'?.0005:.0003);
      }
      for(let row=0;row<2;row++)for(let col=0;col<2;col++) {
        const a=start+row*3+col;indices.push(a,a+1,a+4,a,a+4,a+3);
      }
    };
    // Split the placket into short panels so it follows belly curvature.
    for(let y=.026;y<.051;y+=.005)panel([[-.001,y],[.001,y],[.001,y+.005],[-.001,y+.005]],'#294762');
    // Pointed collar and pocket flaps provide garment structure, not new mass.
    panel([[-.0015,.0555],[-.009,.053],[-.006,.049],[-.002,.052]],'#45637c');
    panel([[.0015,.0555],[.002,.052],[.006,.049],[.009,.053]],'#45637c');
    for(const sign of [-1,1]) {
      const x=sign*.011;
      panel([[x-.004,.038],[x+.004,.038],[x+.004,.0445],[x-.004,.0445]],'#294861');
      panel([[x-.004,.045],[x+.004,.045],[x+.0035,.043],[x-.0035,.043]],'#4a6378');
    }
    // Tiny square buttons are geometry, so no canvas/font assets are required.
    for(const y of [.03,.037,.046,.052])panel([[-.00045,y-.00045],[.00045,y-.00045],[.00045,y+.00045],[-.00045,y+.00045]],'#a4aaa6');
    this.positions=new THREE.BufferAttribute(new Float32Array(points),3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position',this.positions);
    this.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.geometry.setIndex(indices);
    const mesh=new THREE.Mesh(this.geometry,new THREE.MeshStandardNodeMaterial({color:0xffffff,vertexColors:true,roughness:.96,side:THREE.DoubleSide}));
    mesh.raycast=()=>{};mesh.frustumCulled=false;group.add(mesh);this.update();
  }
  update() {
    if(this.lastSurface===this.body.surfaceRevision)return;
    this.lastSurface=this.body.surfaceRevision;
    for(let i=0;i<this.bindings.length;i++) {
      const a=this.bindings[i];a.update();
      this.offset.copy(a.normal).multiplyScalar(this.offsets[i]).add(a.point);
      this.positions.setXYZ(i,this.offset.x,this.offset.y,this.offset.z);
    }
    this.positions.needsUpdate=true;this.geometry.computeVertexNormals();this.revision++;
  }
  get debug(){return this.bindings.map(a=>a.debug);}
}
