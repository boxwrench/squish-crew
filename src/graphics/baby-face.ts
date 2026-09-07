import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { FaceSkin } from './face-skin.ts';
import { FaceExpression } from './face-expression.ts';

type Feature='eye'|'mouth';
type Detail={mesh:THREE.Mesh;rest:Float32Array;cx:number;cy:number;depth:number;kind:Feature};

export class BabyFace {
  private readonly details:Detail[]=[];
  private readonly skin:FaceSkin;
  private readonly expression=new FaceExpression();
  private readonly sample=new Float64Array(6);
  private surfaceVersion=-1;
  private lastBlink=-1;
  private lastSob=-1;
  private lastLaugh=-1;
  private readonly body:SoftBody;
  constructor(body:SoftBody,group:THREE.Group) {
    this.body=body;
    this.skin=new FaceSkin(body);
    const eye=new THREE.MeshPhysicalNodeMaterial({color:'#030609',roughness:.09,clearcoat:1,clearcoatRoughness:.04});
    const mouth=new THREE.MeshPhysicalNodeMaterial({color:'#05090c',roughness:.24,clearcoat:.6});
    const add=(geometry:THREE.BufferGeometry,mat:THREE.Material,cx:number,cy:number,depth:number,kind:Feature)=>{
      const rest=new Float32Array(geometry.getAttribute('position').array);
      geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(rest.length),3).setUsage(THREE.DynamicDrawUsage));
      const mesh=new THREE.Mesh(geometry,mat);mesh.frustumCulled=false;
      // Surface ink must render after transmission to avoid a refracted duplicate.
      mat.transparent=true;mesh.renderOrder=2;
      group.add(mesh);this.details.push({mesh,rest,cx,cy,depth,kind});
    };
    const oval=(x:number,y:number,z:number)=>new THREE.SphereGeometry(1,40,24,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI/2).scale(x,y,z);
    for(const sign of [-1,1]) {
      add(oval(.0028,.0028,.0011),eye,sign*.008,.032,.00010,'eye');
    }
    const smile=new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.0043,.0009,0),new THREE.Vector3(-.0023,-.0015,0),
      new THREE.Vector3(0,-.0021,0),new THREE.Vector3(.0023,-.0015,0),new THREE.Vector3(.0043,.0009,0),
    ]);
    add(new THREE.TubeGeometry(smile,32,.00048,8,false),mouth,0,.026,.0005,'mouth');
  }
  reset() { this.expression.reset(); }
  update(dt:number,playing=false) {
    this.expression.update(dt,this.body.grabs.length>0,playing);
    const {sob,laugh,blink,time}=this.expression;
    const version=this.body.surface.geometry.attributes.position.version;
    if(version===this.surfaceVersion&&blink===this.lastBlink&&sob===this.lastSob&&laugh===this.lastLaugh&&sob===0&&laugh===0)return;
    this.surfaceVersion=version;this.lastBlink=blink;this.lastSob=sob;this.lastLaugh=laugh;
    const quiver=Math.sin(time*33)*.00022*sob;
    const chuckle=(.5+.5*Math.sin(time*19))*laugh;
    for(const {mesh,rest,cx,cy,depth,kind} of this.details) {
      const positions=mesh.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++) {
        let x=rest[i*3],y=rest[i*3+1],z=rest[i*3+2];
        if(kind==='eye') {
          // Fold each eye into a small chevron while grabbed.
          const squeezedX=x*.38+Math.sign(cx)*(.0036*Math.abs(y/.0028)-.0018);
          const squeezedY=y*.67+quiver*.35;
          const squeezedZ=z*.20;
          const close=Math.max(blink,laugh*.90);
          y*=1-close*.94;z*=1-close*.88;
          // Idle blinks and giggles blend into the grabbed > < silhouette.
          y+=(1-Math.min(1,(x/.0028)**2))*laugh*.00075;
          x+=(squeezedX-x)*sob;
          y+=(squeezedY-y)*sob;
          z+=(squeezedZ-z)*sob;
        } else if(kind==='mouth') {
          x*=1-sob*.22+laugh*.18;
          y*=1-sob*.48+chuckle*.32;
          y+=sob*(.0011-.0030*(x/.0046)**2)+quiver;
          y-=laugh*.0003;
        }
        this.skin.sample(x+cx,y+cy,Math.max(.00008,z+depth),this.sample);
        positions.setXYZ(i,this.sample[0],this.sample[1],this.sample[2]);
      }
      positions.needsUpdate=true;mesh.geometry.computeVertexNormals();
    }
  }
}
