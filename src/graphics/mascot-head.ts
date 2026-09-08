import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SoftBody } from '../physics/soft-body.js';
import { SurfaceAttachment } from './surface-attachment.ts';

/** Small render-only features, each pinned to the deforming skin in rest space. */
export class MascotHead {
  revision=0;
  private readonly pieces:{anchor:SurfaceAttachment;group:THREE.Group}[]=[];
  constructor(body:SoftBody,parent:THREE.Group) {
    const material=(color:string,roughness=.8)=>new THREE.MeshStandardNodeMaterial({color,roughness});
    const skin=material('#d49a76'),cheek=material('#ce8868'),hair=material('#35281f');
    const navy=material('#182d49'),navyEdge=material('#233d5b');
    const frame=material('#252a2d',.45),lens=material('#101c24',.2),cream=material('#efcc92');
    const sphere=new THREE.SphereGeometry(1,16,10);
    const add=(group:THREE.Group,geometry:THREE.BufferGeometry,mat:THREE.Material,
      position:number[],scale?:number[])=>{
      const mesh=new THREE.Mesh(geometry,mat);
      mesh.position.fromArray(position);if(scale)mesh.scale.fromArray(scale);
      mesh.raycast=()=>{};group.add(mesh);return mesh;
    };
    const piece=(target:number[])=>{
      const anchor=new SurfaceAttachment(body,new THREE.Vector3(...target)),group=new THREE.Group();
      parent.add(group);this.pieces.push({anchor,group});return group;
    };

    for(const sign of [-1,1]) {
      // Separate lens bindings keep both sides on the face during wide pulls.
      const glasses=piece([sign*.0065,.0675,.018]);
      add(glasses,new RoundedBoxGeometry(.0118,.0079,.002,2,.0016),frame,[0,0,.0018]);
      add(glasses,new RoundedBoxGeometry(.0101,.0062,.0008,2,.0015),lens,[0,0,.003]);
      const temple=piece([sign*.013,.0675,.011]);
      add(temple,new RoundedBoxGeometry(.0011,.0011,.008,1,.0004),frame,[sign*.0008,0,-.001]);
      const blush=piece([sign*.0085,.062,.017]);
      add(blush,sphere,cheek,[0,0,.0001],[.0034,.0025,.0014]);
      const mustache=piece([sign*.0026,.0616,.02]);
      const whisker=add(mustache,sphere,hair,[0,0,.0011],[.0035,.0014,.0016]);
      whisker.rotation.z=-sign*.17;
    }
    const bridge=piece([0,.068,.02]);
    add(bridge,new RoundedBoxGeometry(.0035,.0011,.001,1,.0003),frame,[0,0,.0019]);
    const nose=piece([0,.0642,.02]);
    add(nose,sphere,skin,[0,0,.0013],[.0028,.0023,.0032]);
    const chin=piece([0,.0594,.018]);
    add(chin,sphere,hair,[0,0,.0008],[.0038,.0027,.0015]);
    // Small lower lip separates the mustache and goatee into a friendly face.
    const mouth=piece([0,.0598,.022]);
    add(mouth,sphere,skin,[0,0,.0013],[.0025,.00065,.0012]);

    const cap=piece([0,.078,0]);
    cap.name='mascot-cap-39';
    // A shallow baseball-cap crown overlaps the upper skin, rather than sitting
    // on an independent head mass. It follows the same local skin frame.
    add(cap,new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),navy,
      [0,-.006,0],[.0165,.010,.0145]);
    const band=new THREE.TorusGeometry(1,.045,6,32);
    const bandMesh=add(cap,band,navyEdge,[0,-.006,0],[.016,.014,.012]);
    bandMesh.rotation.x=Math.PI/2;
    add(cap,sphere,navy,[0,-.0063,.012],[.017,.0012,.011]);
    add(cap,sphere,navyEdge,[0,.0042,0],[.0015,.0007,.0015]);

    // Simple cream "39": seven-segment geometry remains crisp without fonts,
    // network assets, DOM/canvas, or reusing the full IUOE logo.
    const digits=new THREE.Group();digits.position.set(0,-.0009,.0134);cap.add(digits);
    // Horizontal segments are located explicitly in cap-local XY.
    const segments=[[0,1,0],[1,.5,1],[1,-.5,1],[0,-1,0],[-1,-.5,1],[-1,.5,1],[0,0,0]];
    const barGeometry=new RoundedBoxGeometry(.0026,.0007,.00045,1,.00015);
    for(const [digit,offset] of [['3',-.0025],['9',.0025]] as const) {
      const enabled=digit==='3'?[0,1,2,3,6]:[0,1,2,3,5,6];
      for(const index of enabled) {
        const [x,y,vertical]=segments[index];
        const bar=add(digits,barGeometry,cream,[offset+x*.0013,y*.0021,0]);
        if(vertical){bar.rotation.z=Math.PI/2;bar.scale.x=.79;}
      }
    }
    this.update();
  }
  update() {
    let changed=false;
    for(const {anchor,group} of this.pieces) {
      anchor.update();
      if(group.position.distanceToSquared(anchor.point)>1e-20||
        1-Math.abs(group.quaternion.dot(anchor.quaternion))>1e-12) {
        group.position.copy(anchor.point);group.quaternion.copy(anchor.quaternion);changed=true;
      }
    }
    if(changed)this.revision++;
  }
  reset(){this.update();}
  snapshot(){return {revision:this.revision,attachments:this.pieces.map(({anchor})=>anchor.debug)};}
  get debug(){return this.snapshot();}
}
