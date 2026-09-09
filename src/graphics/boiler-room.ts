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
  const plane=(w:number,h:number,mat:THREE.Material,x:number,y:number,z:number,yaw=0)=>{
    const m=mesh(new THREE.PlaneGeometry(w,h),mat,x,y,z);m.rotation.y=yaw;return m;
  };
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
    return {hand,radius:r,x,y};
  };

  // The outer shell exceeds the maximum .42m camera orbit in every horizontal
  // direction. Machinery keeps its close composition inside this larger room.
  const roomWidth=3.2,roomHeight=1.4,back=-1.0,front=1.2,roomDepth=front-back;
  solid(box(roomWidth,roomHeight,.012,wall,0,roomHeight/2,back,.001));
  plane(roomWidth,.065,lowerWall,0,.034,back+.008);
  plane(roomWidth,.018,trim,0,.009,back+.01);
  solid(box(roomWidth,roomHeight,.012,wall,0,roomHeight/2,front,.001));
  plane(roomWidth,.018,trim,0,.009,front-.01,Math.PI);
  // A broad single-sided service wall preserves the close mounted-machinery
  // composition; from behind it vanishes so an orbit still sees the mascot.
  solid(mesh(new THREE.PlaneGeometry(roomWidth,roomHeight),wall,0,roomHeight/2,-.196));
  mesh(new THREE.PlaneGeometry(roomWidth,.065),lowerWall,0,.0325,-.195);
  mesh(new THREE.PlaneGeometry(roomWidth,.012),trim,0,.006,-.194);
  for(const sign of [-1,1]) {
    solid(box(.012,roomHeight,roomDepth,wall,sign*roomWidth/2,roomHeight/2,(front+back)/2,.001));
    plane(roomDepth,.065,lowerWall,sign*(roomWidth/2-.008),.034,(front+back)/2,-sign*Math.PI/2);
    plane(roomDepth,.018,trim,sign*(roomWidth/2-.015),.009,(front+back)/2,-sign*Math.PI/2);
    // Small conduit/junction silhouettes continue the room without competing
    // with the boiler, mascot, or the single union sign.
    pipe([[sign*.35,.014,-.181],[sign*.35,.204,-.181],[sign*.374,.222,-.24],[sign*1.55,.222,-.96],[sign*1.57,.222,.96]],.0026,trim);
    box(.021,.029,.011,steel,sign*.35,.114,-.179,.002);
    box(.013,.020,.002,trim,sign*.35,.114,-.1725,.001);
  }
  // Quiet wall seams keep the machinery readable without a busy brick pattern.
  for(const x of [-1.2,-.6,0,.6,1.2])plane(.002,roomHeight,lowerWall,x,roomHeight/2,back+.008);
  plane(roomWidth,.004,trim,0,.231,back+.011);
  plane(roomWidth,.003,trim,0,.067,back+.012);
  pipe([[-1.56,.36,.90],[-1.56,.36,-.91],[-1.48,.36,-.96],[1.48,.36,-.96],[1.56,.36,-.91],[1.56,.36,.90]],.008,dark);

  // Small distinct service clusters make each orbit direction recognizable.
  // Helpers author in a local front-facing frame, then rotate onto each wall.
  const cluster=(x:number,z:number,yaw:number,build:()=>void)=>{
    const first=room.children.length;build();const parts=room.children.slice(first),group=new THREE.Group();
    group.name='perimeter-service-details';group.add(...parts);group.position.set(x,0,z);group.rotation.y=yaw;room.add(group);
  };
  cluster(-.85,back+.028,0,()=>{
    pipe([[-.045,.025,0],[-.045,.28,0],[-.026,.30,0],[.15,.30,0]],.004,copper);
    box(.059,.077,.012,steel,.025,.145,.002,.004);
    box(.044,.061,.002,trim,.025,.145,.009,.002);
    box(.009,.003,.002,dark,.040,.145,.011,.0005);
  });
  cluster(-roomWidth/2+.027,.38,Math.PI/2,()=>{
    pipe([[-.12,.035,0],[-.12,.19,0],[-.095,.21,0],[.085,.21,0],[.11,.24,0],[.11,.42,0]],.005,steel);
    box(.028,.044,.012,trim,.11,.30,.004,.002);
    pipe([[-.095,.022,0],[-.095,.17,0],[-.07,.185,0],[.025,.185,0]],.0025,copper);
  });
  cluster(roomWidth/2-.027,.61,-Math.PI/2,()=>{
    pipe([[0,.025,0],[0,.32,0],[.02,.34,0],[.17,.34,0]],.006,copper);
    pipe([[0,.17,0],[-.04,.17,.007],[-.055,.193,.007]],.0025,dark);
    gauge(-.055,.211,.008,.013);
  });
  cluster(.53,front-.026,Math.PI,()=>{
    pipe([[-.15,.30,0],[.09,.30,0],[.115,.276,0],[.115,.022,0]],.0065,steel);
    wheel(.115,.135,.014,.016);
    box(.011,.024,.009,trim,-.09,.30,-.004,.001);
  });
  // A second pass of the same kit fills the sparse spans, so the room reads as
  // a larger plant rather than one dressed corner repeated.
  cluster(.95,back+.028,0,()=>{
    pipe([[-.06,.02,0],[-.06,.35,0],[-.035,.375,0],[.19,.375,0]],.0055,steel);
    pipe([[.06,.02,0],[.06,.24,0],[.082,.262,0],[.19,.262,0]],.0035,copper);
    box(.034,.05,.012,trim,-.06,.19,.004,.002);
    wheel(.06,.135,.013,.013);
  });
  cluster(-.55,front-.026,Math.PI,()=>{
    pipe([[-.13,.34,0],[.05,.34,0],[.072,.316,0],[.072,.02,0]],.005,copper);
    gauge(.072,.215,.012,.011);
    box(.026,.04,.011,steel,-.11,.28,.004,.002);
    box(.018,.028,.002,trim,-.11,.28,.010,.001);
  });
  cluster(-roomWidth/2+.027,-.62,Math.PI/2,()=>{
    pipe([[-.14,.03,0],[-.14,.22,0],[-.115,.245,0],[.10,.245,0],[.125,.27,0],[.125,.44,0]],.0045,steel);
    wheel(-.14,.135,.012,.014);
    pipe([[.02,.03,0],[.02,.155,0],[.045,.18,0],[.125,.18,0]],.0025,copper);
  });
  cluster(roomWidth/2-.027,-.45,-Math.PI/2,()=>{
    pipe([[0,.02,0],[0,.29,0],[.024,.315,0],[.20,.315,0]],.006,dark);
    gauge(-.05,.20,.010,.012);
    pipe([[0,.165,0],[-.032,.165,.006],[-.05,.185,.006]],.0022,copper);
    box(.03,.042,.011,trim,.14,.20,.004,.002);
  });
  // Two long runs tie the far spans together instead of leaving bare wall.
  pipe([[-1.55,.50,-.94],[1.55,.50,-.94]],.0045,copper);
  pipe([[-1.55,.22,1.14],[-.30,.22,1.14],[-.26,.26,1.14],[1.55,.26,1.14]],.0038,trim);

  // --- A third layer: headers, risers and the brackets that carry them -------
  // Authored through the same cluster frame, so each piece is placed once in a
  // local front-facing space and turned onto whichever wall it belongs to.
  /** A pipe clamp and its wall pad, the detail that sells a run as mounted. */
  const bracket=(x:number,y:number,radius:number)=>{
    box(.010,.014,.008,trim,x,y,-.006,.001);
    const clamp=cylinder(radius+.0022,.004,dark,x,y,.001);clamp.rotation.x=Math.PI/2;
  };
  /**
   * A horizontal header with its carriers, and optional branch lines dropping
   * off it. Heights and spacings vary per call so no two walls read alike.
   */
  const header=(y:number,fromX:number,toX:number,radius:number,mat:THREE.Material,
    carriers:number[],branches:[number,number][]=[])=>{
    pipe([[fromX,y,0],[toX,y,0]],radius,mat);
    for(const x of carriers)bracket(x,y,radius);
    for(const [x,drop] of branches) {
      pipe([[x,y,0],[x,drop+.02,0],[x+.018,drop,0],[x+.055,drop,0]],radius*.55,mat);
      bracket(x+.05,drop,radius*.55);
    }
  };
  /** A vertical riser from the floor, elbowed into a short spur at the top. */
  const riser=(x:number,top:number,radius:number,mat:THREE.Material,reach=.12)=>{
    pipe([[x,.018,0],[x,top-.026,0],[x+.02*Math.sign(reach),top,0],[x+reach,top,0]],radius,mat);
    bracket(x,.09,radius);bracket(x,top*.62,radius);
  };

  cluster(-1.34,back+.028,0,()=>{
    riser(0,.42,.0055,steel,.15);
    header(.30,-.10,.20,.0032,copper,[-.06,.12],[[.05,.17]]);
    box(.040,.055,.012,trim,-.09,.17,.004,.002);
    gauge(.155,.245,.011,.010);
  });
  cluster(-.18,back+.028,0,()=>{
    header(.47,-.24,.30,.0042,dark,[-.16,.02,.20],[[-.08,.33],[.14,.36]]);
    box(.052,.068,.013,steel,.06,.20,.005,.003);
    box(.038,.050,.002,trim,.06,.20,.012,.002);
    for(const dy of [-.012,.012])box(.020,.003,.002,dark,.06,.20+dy,.014,.0005);
    wheel(-.16,.145,.014,.012);
  });
  cluster(1.38,back+.028,0,()=>{
    riser(.02,.56,.0048,copper,-.16);
    header(.24,-.20,.16,.0030,trim,[-.12,.08]);
    gauge(-.19,.30,.011,.012);
    box(.028,.038,.010,steel,.12,.155,.004,.002);
  });

  cluster(-1.26,front-.026,Math.PI,()=>{
    riser(-.04,.38,.0050,copper,.14);
    header(.20,-.16,.22,.0028,trim,[-.08,.14]);
    box(.034,.046,.011,steel,.15,.145,.004,.002);
  });
  cluster(.02,front-.026,Math.PI,()=>{
    header(.42,-.28,.26,.0046,steel,[-.20,-.02,.18],[[-.12,.28],[.10,.31]]);
    wheel(.20,.155,.014,.015);
    box(.046,.060,.012,trim,-.16,.16,.004,.003);
    gauge(.02,.24,.010,.009);
  });
  cluster(1.30,front-.026,Math.PI,()=>{
    riser(.05,.50,.0044,dark,-.14);
    header(.27,-.18,.14,.0030,copper,[-.10,.06],[[-.02,.20]]);
    box(.026,.036,.010,trim,-.16,.15,.004,.002);
  });

  cluster(-roomWidth/2+.027,-.05,Math.PI/2,()=>{
    header(.36,-.30,.28,.0040,copper,[-.22,-.02,.20],[[-.14,.25],[.12,.22]]);
    riser(.24,.55,.0050,steel,-.13);
    box(.048,.062,.012,steel,-.10,.17,.005,.003);
    gauge(.10,.16,.011,.010);
  });
  cluster(-roomWidth/2+.027,.92,Math.PI/2,()=>{
    riser(-.06,.44,.0046,trim,.16);
    header(.19,-.20,.18,.0026,copper,[-.12,.10]);
    wheel(.14,.135,.013,.012);
  });
  cluster(roomWidth/2-.027,.10,-Math.PI/2,()=>{
    header(.31,-.26,.30,.0044,steel,[-.18,.04,.24],[[-.10,.23],[.16,.20]]);
    box(.054,.070,.013,trim,-.04,.185,.005,.003);
    box(.040,.052,.002,dark,-.04,.185,.012,.002);
    riser(.26,.48,.0042,copper,-.12);
  });
  cluster(roomWidth/2-.027,-.98,-Math.PI/2,()=>{
    riser(0,.40,.0052,dark,.15);
    header(.22,-.16,.20,.0030,trim,[-.08,.12],[[.04,.16]]);
    gauge(-.14,.29,.011,.011);
    box(.030,.040,.010,steel,.16,.15,.004,.002);
  });

  // Long headers at three different heights, each carried by its own brackets.
  for(const [z,y,radius,mat,sign] of [
    [back+.020,.66,.0034,trim,1],[front-.020,.58,.0030,copper,-1]] as const) {
    pipe([[-1.5,y,z],[1.5,y,z]],radius,mat);
    for(const x of [-1.15,-.45,.25,.95])box(.010,.013,.010,trim,x,y-.013*sign,z+.004*sign,.001);
  }
  pipe([[-1.594+.012,.78,-.92],[-1.594+.012,.78,1.10]],.0032,steel);
  pipe([[1.594-.012,.71,-.92],[1.594-.012,.71,1.10]],.0032,dark);
  for(const z of [-.62,-.02,.58])for(const sign of [-1,1])
    box(.008,.012,.010,trim,sign*(roomWidth/2-.014),sign>0?.71:.78,z,.001);

  /**
   * One rounded, squat boiler with a furnace window and its own gauge. Each
   * gets its own shell material and its own group, so pressure can redden and
   * shake exactly one of them without touching the rest of the room.
   */
  const makeBoiler=(x:number,y:number,z:number,scale:number)=>{
    const first=room.children.length;
    const skin=material('#3e5558',.64,.25);skin.emissive.set('#ff5312');skin.emissiveIntensity=0;
    box(.09,.012,.076,dark,0,-.062,0);
    box(.083,.112,.066,skin,0,0,0,.013);
    box(.049,.041,.008,dark,0,-.029,.037,.009);
    box(.036,.026,.002,glow,0,-.029,.042,.006);
    for(const dx of [-.010,0,.010])box(.002,.025,.002,dark,dx,-.029,.044,.0005);
    box(.028,.006,.004,copper,0,.003,.036,.001);
    const dial=gauge(0,.028,.037,.010);
    for(const dx of [-.031,.031])for(const dy of [-.037,-.003,.030])disc(.0016,.0018,copper,dx,dy,.034);
    // A relief stack for the steam to leave through.
    const stack=cylinder(.006,.030,copper,.026,.071,-.004);
    pipe([[.026,.056,-.004],[.026,.030,-.004],[.014,.020,.010]],.0035,copper);
    const group=new THREE.Group();group.name='boiler';
    group.add(...room.children.slice(first));
    group.position.set(x,y,z);group.scale.setScalar(scale);room.add(group);
    return {group,skin,needle:dial.hand,dialCentre:new THREE.Vector3(dial.x,dial.y,0),
      stackTop:new THREE.Vector3(stack.position.x,stack.position.y+.020,stack.position.z),
      base:group.position.clone(),scale};
  };
  // The original boiler keeps its authored spot; the second stands clear of it
  // and of the play centre, an easy fling to the mascot's right.
  const boilerVisuals=[makeBoiler(-.083,.070,-.112,1),makeBoiler(.152,.061,-.120,.86)];

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

  // The service wall is the one the play camera looks at, so it carries a last
  // layer of small gear in the spans either side of the sign. Everything sits
  // above the mascot's own height or outboard of him, so nothing is obscured.
  pipe([[-.46,.245,-.170],[-.10,.245,-.170]],.0028,copper);
  for(const x of [-.38,-.18])box(.009,.012,.008,trim,x,.232,-.174,.001);
  pipe([[-.28,.245,-.170],[-.28,.205,-.170],[-.262,.19,-.170],[-.20,.19,-.170]],.0018,copper);
  box(.040,.052,.011,steel,-.44,.175,-.172,.003);
  box(.028,.038,.002,trim,-.44,.175,-.166,.002);
  for(const dy of [-.010,.010])box(.014,.002,.002,dark,-.44,.175+dy,-.164,.0004);
  gauge(-.30,.205,-.167,.009);
  pipe([[.26,.015,-.170],[.26,.196,-.170],[.278,.214,-.170],[.40,.214,-.170]],.0040,steel);
  for(const y of [.075,.155])box(.009,.012,.008,trim,.26,y,-.174,.001);
  gauge(.435,.248,-.167,.008);
  box(.026,.034,.010,trim,.46,.165,-.172,.002);
  for(const x of [-.52,.54])for(const y of [.10,.20])box(.017,.023,.009,dark,x,y,-.173,.0015);

  // One loaded logo image, shared by every sign in the room.
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../../art/main-nav-logo-2025-04-17-193A053A06.webp',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;
  const logoMaterial=new THREE.MeshBasicNodeMaterial({map:texture,transparent:true,depthWrite:false});materials.push(logoMaterial);
  /**
   * One enamel Local 39 sign, authored face-on around its own centre and then
   * placed, turned onto its wall and scaled as a unit. Depth offsets scale with
   * everything else, so an enlarged enamel face cannot intersect the logo plane
   * and shimmer.
   */
  const sign=(x:number,y:number,z:number,scale:number,yaw=0)=>{
    const first=room.children.length;
    box(.137,.045,.005,dark,0,0,0,.003);
    box(.132,.040,.002,cream,0,0,.0035,.002);
    mesh(new THREE.PlaneGeometry(.119,.0353),logoMaterial,0,0,.0052);
    for(const dx of [-.061,.061])for(const dy of [-.015,.015])disc(.0012,.0006,dark,dx,dy,.005);
    const group=new THREE.Group();group.name='local-39-sign';
    group.add(...room.children.slice(first));
    group.position.set(x,y,z);group.rotation.y=yaw;group.scale.setScalar(scale);
    room.add(group);
  };
  // The main sign keeps its position and 1.25 scale on the service wall.
  sign(.040,.130,-.177,1.25);
  // Two smaller repeats on the side walls, well clear of the play area and of
  // the service clusters already mounted there.
  sign(-roomWidth/2+.022,.31,-.42,.85,Math.PI/2);
  sign(roomWidth/2-.022,.27,.02,.72,-Math.PI/2);
  // One each on the rear and front walls, in the spans the headers leave clear.
  sign(.52,.40,back+.020,.62);
  sign(-.86,.34,front-.020,.55,Math.PI);

  room.updateMatrixWorld(true);
  const collisionBoxes:CollisionBox[]=solidWalls.map(wallSlab);
  // Gameplay handles for the boilers, in world space. Purely presentation: the
  // pressure itself lives in game/boilers.ts and is pushed in each frame.
  const boilers=boilerVisuals.map(visual=>{
    const shellHalf=new THREE.Vector3(.083,.112,.066).multiplyScalar(visual.scale/2);
    const worldScale=room.scale;
    const centre=visual.base.clone().applyMatrix4(room.matrixWorld);
    const half=new THREE.Vector3(shellHalf.x*worldScale.x,shellHalf.y*worldScale.y,shellHalf.z*worldScale.z);
    const vent=visual.stackTop.clone().multiplyScalar(visual.scale).add(visual.base).applyMatrix4(room.matrixWorld);
    let shake=0;
    return {
      /** Axis-aligned gameplay volume; never moved by the shake below. */
      centre,half,vent,
      /**
       * Push one frame of pressure. Needle sweeps the dial, the shell glows and
       * near the peg it rattles. Shake is a transform only.
       */
      update(pressure:number,dt:number) {
        const p=Math.max(0,Math.min(1,pressure));
        // Sweeps the authored tick arc, -0.65 rad at rest to +1.35 at the peg.
        visual.needle.rotation.z=-.65+p*2.0;
        const heat=Math.max(0,Math.min(1,(p-.60)/.40));
        visual.skin.emissiveIntensity=heat*heat*.85;
        const rattle=Math.max(0,Math.min(1,(p-.80)/.20));
        shake=Math.min(1,shake+dt*4)*rattle;
        const amount=rattle*rattle*.0026;
        visual.group.position.set(
          visual.base.x+(Math.random()-.5)*amount,
          visual.base.y+(Math.random()-.5)*amount,
          visual.base.z+(Math.random()-.5)*amount*.6);
      },
      /** A struck or venting boiler kicks its needle and jolts once. */
      jolt(strength:number) {
        visual.group.position.x=visual.base.x+(Math.random()-.5)*.006*strength;
        visual.group.position.y=visual.base.y+(Math.random()-.5)*.006*strength;
      },
    };
  });
  // Keep collision source geometry/transforms exactly as authored. Drawing
  // only its inner face makes the room disappear correctly from outside.
  for(const object of solidWalls) {
    const source=object as THREE.Mesh;
    // Computed here rather than relying on wallSlab having run first.
    source.geometry.computeBoundingBox();
    const bounds=source.geometry.boundingBox!;
    const size=bounds.getSize(new THREE.Vector3()),localCenter=bounds.getCenter(new THREE.Vector3());
    const dimensions=[size.x,size.y,size.z],thin=dimensions.indexOf(Math.min(...dimensions));
    // A wall authored as a plane is already the single-sided face we would
    // build, so it is kept and drawn as-is instead of being hidden behind a copy.
    if(dimensions[thin]<1e-9)continue;
    const axis=new THREE.Vector3().setFromMatrixColumn(source.matrixWorld,thin).normalize();
    const worldCenter=localCenter.clone().applyMatrix4(source.matrixWorld);
    const inward=axis.dot(worldCenter)<0?1:-1;
    const normal=new THREE.Vector3().setComponent(thin,inward);
    localCenter.addScaledVector(normal,dimensions[thin]/2).applyMatrix4(source.matrix);
    const face=mesh(new THREE.PlaneGeometry(thin===0?size.z:size.x,size.y),source.material as THREE.Material,localCenter.x,localCenter.y,localCenter.z);
    face.name='wall-inner-face';face.quaternion.copy(source.quaternion).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal));
    face.scale.copy(source.scale);source.visible=false;
  }

  return {collisionBoxes,boilers,
    dispose(){scene.remove(room);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();texture.dispose();}};
}
