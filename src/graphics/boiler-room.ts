import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { float, positionWorld, vec3 } from 'three/tsl';
import type { CollisionBox } from '../physics/facility-collision.ts';

// The visible walls are only a few millimetres thick. Collision uses a slab
// whose inner face sits exactly on the visible face and which extends this far
// outward, so a hard throw cannot pass through between two physics substeps.
const WALL_SLAB_DEPTH=.3;

/**
 * Derive a world-space collision slab from a wall mesh's own transform, so the
 * volume follows the authored geometry and the room group's scale/offset
 * instead of repeating coordinates that can drift away from the visuals.
 */
function wallSlab(object:THREE.Object3D):CollisionBox {
  const geometry=(object as THREE.Mesh).geometry;
  geometry.computeBoundingBox();
  const bounds=geometry.boundingBox!;
  const center=bounds.getCenter(new THREE.Vector3()).applyMatrix4(object.matrixWorld);
  const size=bounds.getSize(new THREE.Vector3());
  const axes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(object.matrixWorld,i));
  const half=[size.x,size.y,size.z].map((value,i)=>value*axes[i].length()/2);
  for(const axis of axes)axis.normalize();
  // The thin axis is the wall's face normal; thicken along it, away from the
  // room's interior, which leaves the inner face exactly where it is drawn.
  const thin=half.indexOf(Math.min(...half));
  const outward=axes[thin].dot(center)<0?-1:1;
  axes[thin].multiplyScalar(outward);
  center.addScaledVector(axes[thin],WALL_SLAB_DEPTH/2-half[thin]);
  half[thin]=WALL_SLAB_DEPTH/2;
  return {center,xAxis:axes[0],yAxis:axes[1],zAxis:axes[2],
    halfSize:new THREE.Vector3(half[0],half[1],half[2])};
}

/** Decorative workshop scenery, plus solid collision slabs for the walls. */
export async function makeBoilerRoom(scene:THREE.Scene) {
  const room=new THREE.Group();room.name='decorative-boiler-room';scene.add(room);
  // A compact set fits the close, downward-looking gameplay camera.
  room.scale.set(.5,.5,.6);room.position.z=.035;
  const materials:THREE.Material[]=[],geometries:THREE.BufferGeometry[]=[];
  // Perimeter and service walls only: pipes, valves, gauges and trim stay
  // purely decorative so the mascot never snags on scenery detail.
  const solidWalls:THREE.Object3D[]=[];
  const solid=<T extends THREE.Object3D>(object:T)=>{solidWalls.push(object);return object;};
  const material=(color:string,roughness=.8,metalness=0)=>{
    const m=new THREE.MeshStandardNodeMaterial({color,roughness,metalness});
    // Broad finish variation, not grime or a high-frequency noise texture.
    const finish=positionWorld.x.mul(45).sin().mul(positionWorld.y.add(positionWorld.z).mul(59).sin());
    m.roughnessNode=float(roughness).add(finish.mul(.025)).clamp(.1,1);
    m.colorNode=vec3(m.color.r,m.color.g,m.color.b).mul(finish.mul(.012).add(1));
    materials.push(m);return m;
  };
  const wall=material('#aaa18e'),lowerWall=material('#969584'),trim=material('#77796c'),steel=material('#3e5558',.64,.25);
  const dark=material('#263638',.65,.3),copper=material('#a46e47',.62,.35);
  const red=material('#9d3e2e'),cream=material('#e6ddc3'),black=material('#35413d');
  const glow=material('#bb621d');glow.emissive.set('#ef7314');glow.emissiveIntensity=.5;
  const mesh=(geometry:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{
    geometries.push(geometry);const object=new THREE.Mesh(geometry,mat);object.position.set(x,y,z);
    object.raycast=()=>{};room.add(object);return object;
  };
  const box=(w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number,r=.003)=>
    mesh(new RoundedBoxGeometry(w,h,d,2,r),mat,x,y,z);
  const cylinder=(radius:number,length:number,mat:THREE.Material,x:number,y:number,z:number)=>
    mesh(new THREE.CylinderGeometry(radius,radius,length,16),mat,x,y,z);
  const disc=(radius:number,depth:number,mat:THREE.Material,x:number,y:number,z:number)=>{
    const m=cylinder(radius,depth,mat,x,y,z);m.rotation.x=Math.PI/2;return m;
  };
  const pipe=(points:number[][],radius:number,mat:THREE.Material)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
    return mesh(new THREE.TubeGeometry(curve,36,radius,10,false),mat,0,0,0);
  };
  const wheel=(x:number,y:number,z:number,r=.011)=>{
    disc(r*.38,.008,dark,x,y,z-.005);
    mesh(new THREE.TorusGeometry(r,.0018,8,24),red,x,y,z);
    for(const angle of [0,Math.PI/3,-Math.PI/3]) {
      const spoke=cylinder(.0012,r*1.75,red,x,y,z);spoke.rotation.z=angle;
    }
    disc(.0025,.003,copper,x,y,z+.002);
  };
  const gauge=(x:number,y:number,z:number,r=.009)=>{
    disc(r,.004,dark,x,y,z);disc(r*.83,.001,cream,x,y,z+.0027);
    for(let i=0;i<7;i++) {
      const angle=-Math.PI*.78+i*Math.PI*1.56/6;
      const tick=box(.00055,.0016,.0004,black,x+Math.sin(angle)*r*.65,y+Math.cos(angle)*r*.65,z+.0035,.0001);
      tick.rotation.z=-angle;
    }
    const hand=box(.00065,r*.64,.0005,red,x+r*.14,y+r*.17,z+.004,.0001);hand.rotation.z=-.65;
    disc(.0012,.0007,black,x,y,z+.0045);
  };

  // The outer shell exceeds the maximum .42m camera orbit in every horizontal
  // direction. Machinery keeps its close composition inside this larger room.
  const roomWidth=3.2,roomHeight=1.4,back=-1.0,front=1.2,roomDepth=front-back;
  solid(box(roomWidth,roomHeight,.012,wall,0,roomHeight/2,back,.001));
  box(roomWidth,.065,.003,lowerWall,0,.034,back+.008,.001);
  box(roomWidth,.018,.017,trim,0,.009,back+.01,.001);
  solid(box(roomWidth,roomHeight,.012,wall,0,roomHeight/2,front,.001));
  box(roomWidth,.018,.017,trim,0,.009,front-.01,.001);
  // A broad single-sided service wall preserves the close mounted-machinery
  // composition; from behind it vanishes so an orbit still sees the mascot.
  solid(mesh(new THREE.PlaneGeometry(roomWidth,roomHeight),wall,0,roomHeight/2,-.196));
  mesh(new THREE.PlaneGeometry(roomWidth,.065),lowerWall,0,.0325,-.195);
  mesh(new THREE.PlaneGeometry(roomWidth,.012),trim,0,.006,-.194);
  for(const sign of [-1,1]) {
    solid(box(.012,roomHeight,roomDepth,wall,sign*roomWidth/2,roomHeight/2,(front+back)/2,.001));
    box(.003,.065,roomDepth,lowerWall,sign*(roomWidth/2-.008),.034,(front+back)/2,.001);
    box(.016,.018,roomDepth,trim,sign*(roomWidth/2-.015),.009,(front+back)/2,.001);
    // Small conduit/junction silhouettes continue the room without competing
    // with the boiler, mascot, or the single union sign.
    pipe([[sign*.35,.014,-.181],[sign*.35,.204,-.181],[sign*.374,.222,-.24],[sign*1.55,.222,-.96],[sign*1.57,.222,.96]],.0026,trim);
    box(.021,.029,.011,steel,sign*.35,.114,-.179,.002);
    box(.013,.020,.002,trim,sign*.35,.114,-.1725,.001);
  }
  // Quiet wall seams keep the machinery readable without a busy brick pattern.
  for(const x of [-1.2,-.6,0,.6,1.2])box(.002,roomHeight,.002,lowerWall,x,roomHeight/2,back+.008,.0004);
  box(roomWidth,.004,.004,trim,0,.231,back+.011,.001);
  box(roomWidth,.003,.004,trim,0,.067,back+.012,.001);
  pipe([[-1.56,.36,.90],[-1.56,.36,-.91],[-1.48,.36,-.96],[1.48,.36,-.96],[1.56,.36,-.91],[1.56,.36,.90]],.008,dark);

  // Rounded, squat boiler with a warm, contained furnace window.
  const boilerStart=room.children.length;
  box(.09,.012,.076,dark,-.105,.008,-.112);
  box(.083,.112,.066,steel,-.105,.070,-.112,.013);
  box(.049,.041,.008,dark,-.105,.041,-.075,.009);
  box(.036,.026,.002,glow,-.105,.041,-.070,.006);
  for(const x of [-.115,-.105,-.095])box(.002,.025,.002,dark,x,.041,-.068,.0005);
  box(.028,.006,.004,copper,-.105,.073,-.076,.001);
  gauge(-.105,.098,-.075,.010);
  for(const x of [-.136,-.074])for(const y of [.033,.067,.10])disc(.0016,.0018,copper,x,y,-.078);
  for(const part of room.children.slice(boilerStart))part.position.x+=.022;

  // Broad bent runs and simple flange collars suggest a real plant room.
  pipe([[-.083,.126,-.115],[-.083,.157,-.115],[-.127,.173,-.148],[-.23,.173,-.163]],.010,dark);
  pipe([[-.24,.012,-.162],[-.24,.145,-.162],[-.219,.163,-.162],[.19,.163,-.162],[.213,.142,-.162],[.213,.018,-.162]],.0065,copper);
  pipe([[.166,.012,-.17],[.166,.060,-.17],[.145,.077,-.17],[.043,.077,-.17],[.022,.054,-.15],[.022,.023,-.15]],.005,steel);
  for(const x of [-.19,-.028,.11]) {
    const flange=cylinder(.009,.006,dark,x,.163,-.162);flange.rotation.z=Math.PI/2;
    box(.007,.022,.017,trim,x,.163,-.18,.001);
  }
  for(const y of [.04,.113])cylinder(.009,.005,dark,.213,y,-.162);
  wheel(-.185,.163,-.149,.010);wheel(.213,.102,-.147,.012);wheel(.070,.077,-.157,.009);
  gauge(.192,.133,-.15,.007);
  pipe([[.192,.127,-.155],[.192,.117,-.155],[.208,.111,-.165]],.0018,copper);

  // The supplied logo is used once, unchanged, on one cream enamel wall sign.
  const signStart=room.children.length;
  box(.137,.045,.005,dark,.101,.125,-.177,.003);
  box(.132,.040,.002,cream,.101,.125,-.1735,.002);
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../../art/main-nav-logo-2025-04-17-193A053A06.webp',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;
  const logoMaterial=new THREE.MeshBasicNodeMaterial({map:texture,transparent:true,depthWrite:false});materials.push(logoMaterial);
  mesh(new THREE.PlaneGeometry(.119,.0353),logoMaterial,.101,.125,-.1718);
  for(const x of [.04,.162])for(const y of [.110,.140])disc(.0012,.0006,dark,x,y,-.172);
  // Larger and left of the original position to keep the complete "39" in
  // the default camera. Scale depth positions too: otherwise the enlarged
  // enamel face intersects the logo plane and causes shimmering lettering.
  const signScale=1.25;
  for(const part of room.children.slice(signStart)) {
    part.position.x=.040+(part.position.x-.101)*signScale;
    part.position.y=.130+(part.position.y-.125)*signScale;
    part.position.z=-.177+(part.position.z+.177)*signScale;
    part.scale.multiplyScalar(signScale);
  }

  room.updateMatrixWorld(true);
  const collisionBoxes:CollisionBox[]=solidWalls.map(wallSlab);

  return {collisionBoxes,
    dispose(){scene.remove(room);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();texture.dispose();}};
}
