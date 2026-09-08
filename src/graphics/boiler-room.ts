import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Decorative workshop scenery only: no contacts, updates, or extra solver. */
export async function makeBoilerRoom(scene:THREE.Scene) {
  const room=new THREE.Group();room.name='decorative-boiler-room';scene.add(room);
  // A compact set fits the close, downward-looking gameplay camera.
  room.scale.set(.5,.5,.6);room.position.z=.035;
  const materials:THREE.Material[]=[],geometries:THREE.BufferGeometry[]=[];
  const material=(color:string,roughness=.8,metalness=0)=>{
    const m=new THREE.MeshStandardNodeMaterial({color,roughness,metalness});materials.push(m);return m;
  };
  const wall=material('#a89d87'),trim=material('#777363'),steel=material('#3e5558',.64,.25);
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

  box(.9,.27,.012,wall,0,.135,-.196,.001);
  box(.9,.018,.017,trim,0,.009,-.186,.001);
  // Quiet wall seams keep the machinery readable without a busy brick pattern.
  for(const x of [-.23,-.035,.20])box(.002,.245,.002,trim,x,.138,-.188,.0004);
  box(.9,.005,.006,trim,0,.231,-.185,.001);

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
  pipe([[.166,.012,-.17],[.166,.077,-.17],[.145,.094,-.17],[.043,.094,-.17],[.022,.071,-.15],[.022,.023,-.15]],.005,steel);
  for(const x of [-.19,-.028,.11]) {
    const flange=cylinder(.009,.006,dark,x,.163,-.162);flange.rotation.z=Math.PI/2;
    box(.007,.022,.017,trim,x,.163,-.18,.001);
  }
  for(const y of [.04,.113])cylinder(.009,.005,dark,.213,y,-.162);
  wheel(-.185,.163,-.149,.010);wheel(.213,.102,-.147,.012);wheel(.070,.094,-.157,.009);
  gauge(.025,.143,-.15,.007);
  pipe([[.025,.137,-.155],[.025,.119,-.155],[.025,.111,-.165]],.0018,copper);

  // The supplied logo is used once, unchanged, on one cream enamel wall sign.
  const signStart=room.children.length;
  box(.137,.045,.005,dark,.101,.125,-.177,.003);
  box(.132,.040,.002,cream,.101,.125,-.1735,.002);
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../../art/main-nav-logo-2025-04-17-193A053A06.webp',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;
  const logoMaterial=new THREE.MeshBasicNodeMaterial({map:texture,transparent:true,depthWrite:false});materials.push(logoMaterial);
  mesh(new THREE.PlaneGeometry(.119,.0353),logoMaterial,.101,.125,-.1723);
  for(const x of [.04,.162])for(const y of [.110,.140])disc(.0012,.0006,dark,x,y,-.172);
  for(const part of room.children.slice(signStart)) {
    part.position.x=.078+(part.position.x-.101)*.8;
    part.position.y=.109+(part.position.y-.125)*.8;
    part.scale.multiplyScalar(.8);
  }

  return {dispose(){scene.remove(room);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();texture.dispose();}};
}
