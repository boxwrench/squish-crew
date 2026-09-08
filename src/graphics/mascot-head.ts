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
    const skin=material('#d49a76'),cheek=material('#cf9471'),hair=material('#151513');
    const navy=material('#13233c'),navyEdge=material('#1b304a');
    const frame=material('#252a2d',.4),lens=material('#081219',.22),white=material('#f6f5ed');
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
      // Broad brow and a rounded descending lobe give each lens an aviator
      // silhouette. Mirroring the outline keeps the narrow corners by the nose.
      const aviator=new THREE.Shape();
      aviator.moveTo(-sign*.88,.52);
      aviator.bezierCurveTo(-sign*.55,.88,sign*.66,.88,sign*.96,.38);
      aviator.bezierCurveTo(sign*1.1,-.18,sign*.72,-.93,sign*.15,-.98);
      aviator.bezierCurveTo(-sign*.4,-1,-sign*.96,-.21,-sign*.88,.52);
      const lensGeometry=new THREE.ExtrudeGeometry(aviator,{depth:.12,bevelEnabled:false,curveSegments:10});
      add(glasses,lensGeometry,frame,[0,0,.002],[.0061,.0046,.006]);
      add(glasses,lensGeometry,lens,[0,0,.0029],[.00555,.004,.002]);
      const temple=piece([sign*.013,.0675,.011]);
      add(temple,new RoundedBoxGeometry(.0011,.0011,.008,1,.0004),frame,[sign*.0008,0,-.001]);
      const blush=piece([sign*.0085,.062,.017]);
      add(blush,sphere,cheek,[0,0,.0001],[.0034,.0023,.001]);
      const mustache=piece([sign*.0026,.0616,.02]);
      const whisker=add(mustache,sphere,hair,[0,0,.0013],[.0037,.00145,.00155]);
      whisker.rotation.z=-sign*.22;
    }
    const bridge=piece([0,.068,.02]);
    add(bridge,new RoundedBoxGeometry(.0035,.0011,.001,1,.0003),frame,[0,0,.0019]);
    const nose=piece([0,.0642,.02]);
    add(nose,sphere,skin,[0,0,.0013],[.0028,.0023,.0032]);
    const chin=piece([0,.0601,.022]);
    const beard=new THREE.Shape();
    beard.moveTo(-.0042,.0012);beard.quadraticCurveTo(0,.002,.0042,.0012);
    beard.bezierCurveTo(.0046,-.0015,.0022,-.0042,0,-.0044);
    beard.bezierCurveTo(-.0022,-.0042,-.0046,-.0015,-.0042,.0012);
    // Clear the belly's increasing radius beneath the chin so the rounded tip
    // stays continuous instead of intersecting the shirt at its lower edge.
    add(chin,new THREE.ExtrudeGeometry(beard,{depth:.0009,bevelEnabled:true,bevelThickness:.00035,bevelSize:.0003,bevelSegments:2,steps:1,curveSegments:10}),hair,[0,0,.0025]);
    // Small lower lip separates the mustache and goatee into a friendly face.
    add(chin,sphere,skin,[0,-.0001,.0036],[.0025,.0006,.00065]);

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

    // Rounded white numeral strokes read as stitched cap lettering. These are
    // local procedural curves, with no fonts, canvas, or full IUOE logo.
    const digits=new THREE.Group();digits.position.set(0,-.0009,.0134);cap.add(digits);
    const stroke=(points:number[][],offset:number)=>{
      const path=new THREE.CatmullRomCurve3(points.map(([x,y])=>new THREE.Vector3(x*.0014,y*.0022,0)));
      add(digits,new THREE.TubeGeometry(path,28,.00042,6,false),white,[offset,0,0]);
    };
    stroke([[-.9,.86],[.4,1],[.95,.58],[.45,.08],[-.2,0],[.5,-.1],[.98,-.61],[.35,-1],[-.94,-.86]],-.0025);
    stroke([[.9,.38],[.5,1],[-.6,.92],[-.95,.4],[-.45,0],[.6,.08],[.9,.38],[.8,-.5],[.3,-.94],[-.75,-.92]],.0025);
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
