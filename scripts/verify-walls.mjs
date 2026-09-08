import assert from 'node:assert/strict';
import { Scene, Texture, TextureLoader } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { FacilityCollision, FACILITY_COLLISION_MARGIN } from '../src/physics/facility-collision.ts';

// The room's own construction is what we want to test, including the group
// scale and offset, so the only thing stubbed is the browser image decode.
TextureLoader.prototype.loadAsync=async()=>new Texture();
const { makeBoilerRoom }=await import('../src/graphics/boiler-room.ts');

const room=await makeBoilerRoom(new Scene());
const boxes=room.collisionBoxes;

function penetration(body,list=boxes) {
  const p=body.surface.positions;let maximum=0;
  for(let i=0;i<p.length;i+=3)for(const box of list) {
    const dx=p[i]-box.center.x,dy=p[i+1]-box.center.y,dz=p[i+2]-box.center.z;
    const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
    const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
    const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
    maximum=Math.max(maximum,Math.min(box.halfSize.x-Math.abs(qx),box.halfSize.y-Math.abs(qy),box.halfSize.z-Math.abs(qz)));
  }
  return maximum;
}

/** The inner face of a slab: the plane the visible wall is drawn on. */
function innerFace(box) {
  const half=[box.halfSize.x,box.halfSize.y,box.halfSize.z];
  const axes=[box.xAxis,box.yAxis,box.zAxis];
  const thin=half.indexOf(Math.min(...half));
  const normal=axes[thin].clone().negate();          // slabs point outward
  return {normal,point:box.center.clone().addScaledVector(axes[thin],-half[thin])};
}

// --- The five authored walls, in world space ---------------------------------
assert.equal(boxes.length,5,'left, right, front, rear and service walls only');
const faces=boxes.map(innerFace);
const normals=faces.map(f=>f.normal.toArray().map(v=>+v.toFixed(3)).join(','));
assert.deepEqual([...normals].sort(),
  ['-1,0,0','1,0,0','0,0,-1','0,0,1','0,0,1'].sort(),
  'inward normals: two side walls, the front wall, and the rear and service walls');
for(const box of boxes) {
  for(const value of [box.center,box.halfSize,box.xAxis,box.yAxis,box.zAxis])
    assert(Number.isFinite(value.x+value.y+value.z),'finite wall volume');
  assert(Math.min(box.halfSize.x,box.halfSize.y,box.halfSize.z)>=.14,
    'every wall is a thick slab, so a fast body cannot step across it');
  assert(box.center.y-box.halfSize.y<=PHYS.floor+1e-6,'walls reach the floor');
}
// The room group is scale (.5,.5,.6) with a +.035 z offset, so a collision
// volume built from raw local coordinates would sit in the wrong place.
const service=faces.find(f=>Math.abs(f.point.z+.0826)<.002);
assert(service,'service wall lands at its rendered world depth, not its local one');
const sides=faces.filter(f=>Math.abs(f.normal.x)>.5).map(f=>+f.point.x.toFixed(4));
assert.deepEqual(sides.sort((a,b)=>a-b),[-.797,.797],'side walls sit at the scaled room half-width');

// --- Overlapping start is pushed back into the room --------------------------
function fresh() {
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);
  for(let i=0;i<720;i++){rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();}
  return {body,rig,collision:new FacilityCollision(body)};
}
{
  const {body,rig,collision}=fresh();
  const wall=service.point.z;
  // Start the mascot straddling the service wall.
  for(let i=0;i<body.x.length;i+=3)body.x[i+2]+=wall-body.center.z;
  body.previous.set(body.x);body.velocity.fill(0);
  body.updateCenter();body.updateSurface();
  const before=penetration(body);
  assert(before>.02,`setup overlaps the wall, got ${before}`);
  for(let i=0;i<720;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);collision.resolveBoxes(boxes);rig.afterStep();
    assert(body.isFinite(),'stays finite while being pushed out');
  }
  body.updateSurface();
  const after=penetration(body);
  assert(after<FACILITY_COLLISION_MARGIN,`resolution clears the wall: ${after}`);
  assert(body.center.z>wall,'the body ends up on the room side of the wall');
  assert(body.volumeRatio()>.7&&body.volumeRatio()<1.3,'no volume blow-up during resolution');
  console.log('overlap start:',{beforeMm:+(before*1000).toFixed(2),afterMm:+(after*1000).toFixed(3)});
}

// --- Slow push and hard throw both stop at the wall --------------------------
// MAX_RAW_GRAB_LEAD and the 1.8 m/s target-speed cap in advanceGrabTarget bound
// how fast a pointer can drive the body, so 1.8 is the in-game ceiling and 9 is
// far past anything reachable. Peak is the transient during the impact frame;
// settled is what remains once the squash has resolved.
// crossLimit is how far the mass centre may sink past the wall plane while the
// body is squashed against it; the slab itself is 300mm deep, so staying inside
// that is what rules out tunnelling.
for(const [label,speed,peakLimit,crossLimit] of [
  ['slow push',.35,FACILITY_COLLISION_MARGIN,0],
  ['hard throw',1.0,FACILITY_COLLISION_MARGIN,0],
  ['fastest a pointer can drive him',1.8,.010,.005],
  ['far beyond any reachable speed',9,.070,.040],
]) {
  const {body,rig,collision}=fresh();
  const wall=service.point.z;
  assert(body.center.z-wall>.03,'the mascot starts clear of the service wall');
  body.wake();
  for(let i=2;i<body.velocity.length;i+=3)body.velocity[i]=-speed;
  body.previous.set(body.x);
  let peak=0,settled=0,minDepth=Infinity;
  for(let i=0;i<1440;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);collision.resolveBoxes(boxes);rig.afterStep();
    assert(body.isFinite(),label+' stays finite');
    assert(body.center.z>wall-crossLimit,`${label} never crosses the slab: centre ${body.center.z} vs wall ${wall}`);
    if(i%2===0) {
      body.updateSurface();
      const depth=penetration(body);
      peak=Math.max(peak,depth);
      if(i>600)settled=Math.max(settled,depth);
      const bounds=body.surface.geometry.boundingBox;
      minDepth=Math.min(minDepth,bounds.max.z-bounds.min.z);
    }
  }
  assert(peak<=peakLimit,`${label} transient stays bounded: ${peak}`);
  assert(body.center.z>wall,`${label} comes to rest on the room side: ${body.center.z}`);
  assert(settled<FACILITY_COLLISION_MARGIN,`${label} settles clear of the wall: ${settled}`);
  assert(body.volumeRatio()>.7&&body.volumeRatio()<1.3,label+' preserves volume');
  console.log(`${label} (${speed} m/s):`,{peakMm:+(peak*1000).toFixed(2),settledMm:+(settled*1000).toFixed(3),
    minBodyDepthMm:+(minDepth*1000).toFixed(2),restCentreZmm:+(body.center.z*1000).toFixed(2)});
}

// --- Untouched physics away from the walls -----------------------------------
{
  const {body,rig,collision}=fresh();
  const reference=new SoftBody(loadModel()),referenceRig=new Locomotion(reference);
  for(let i=0;i<720;i++){referenceRig.step(PHYS.step);reference.step(PHYS.step);referenceRig.afterStep();}
  for(let i=0;i<480;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);collision.resolveBoxes(boxes);rig.afterStep();
    referenceRig.step(PHYS.step);reference.step(PHYS.step);referenceRig.afterStep();
  }
  let difference=0;
  for(let i=0;i<body.x.length;i++)difference=Math.max(difference,Math.abs(body.x[i]-reference.x[i]));
  assert(difference<1e-12,`resting far from any wall is bit-identical: ${difference}`);
  console.log('idle away from walls: unchanged');
}

room.dispose();
console.log('walls: derived world volumes, overlap recovery, slow push, hard throw and tunnelling verified');
