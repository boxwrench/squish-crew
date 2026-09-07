import assert from 'node:assert/strict';
import { Scene } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { SwingFacility } from '../src/game/swing-facility.ts';
import { SWING } from '../src/game/swing-physics.ts';
import { TrampolineFacility } from '../src/game/trampoline-facility.ts';
import { TRAMPOLINE } from '../src/game/trampoline-physics.ts';
import { FACILITY_COLLISION_MARGIN } from '../src/physics/facility-collision.ts';

function settle(body,rig) {
  for(let i=0;i<480;i++){rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();}
}

function boxPenetration(body,boxes) {
  const p=body.surface.positions;let maximum=0;
  for(let i=0;i<p.length;i+=3)for(const box of boxes) {
    const dx=p[i]-box.center.x,dy=p[i+1]-box.center.y,dz=p[i+2]-box.center.z;
    const qx=dx*box.xAxis.x+dy*box.xAxis.y+dz*box.xAxis.z;
    const qy=dx*box.yAxis.x+dy*box.yAxis.y+dz*box.yAxis.z;
    const qz=dx*box.zAxis.x+dy*box.zAxis.y+dz*box.zAxis.z;
    maximum=Math.max(maximum,Math.min(box.halfSize.x-Math.abs(qx),box.halfSize.y-Math.abs(qy),box.halfSize.z-Math.abs(qz)));
  }
  return maximum;
}

function cylinderPenetration(body) {
  const p=body.surface.positions,top=TRAMPOLINE.height+TRAMPOLINE.rimCenterOffset+TRAMPOLINE.rimHalfHeight;
  let maximum=0;
  for(let i=0;i<p.length;i+=3) {
    if(p[i+1]<=PHYS.floor||p[i+1]>=top)continue;
    maximum=Math.max(maximum,TRAMPOLINE.radius+FACILITY_COLLISION_MARGIN-
      Math.hypot(p[i]-TRAMPOLINE.x,p[i+2]-TRAMPOLINE.z));
  }
  return maximum;
}

function centerVelocity(body) {
  const velocity=[0,0,0];
  for(let i=0;i<body.mass.length;i++) {
    const weight=body.mass[i]/body.totalMass,j=i*3;
    velocity[0]+=body.velocity[j]*weight;velocity[1]+=body.velocity[j+1]*weight;velocity[2]+=body.velocity[j+2]*weight;
  }
  return velocity;
}

// The droplet has no directional locomotion — Locomotion is pure soft recovery
// around the mass center, and rig.move drives nothing — so an approach cannot be
// walked. Sweep it geometrically instead: slide the settled body toward the
// facility and record how far out the proximity hint and the first overlap each
// begin. Clearance is then checked from an overlapping start, which exercises the
// same resolver the stopped walk used to.
{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}});
  const rest=body.x.slice();
  let hintReach=-1,contactReach=-1;
  for(let sample=0;sample<=250;sample++) {
    for(let i=0;i<body.x.length;i+=3)body.x[i]=rest[i]-sample*.001;
    body.updateCenter();body.updateSurface();body.grounded=true;
    const reach=Math.hypot(body.center.x-SWING.x,body.center.z-SWING.z);
    if(hintReach<0&&facility.physics.nearby)hintReach=reach;
    if(contactReach<0&&boxPenetration(body,facility.visual.collisionBoxes)>1e-7)contactReach=reach;
  }
  assert(hintReach>=0&&contactReach>=0&&hintReach>contactReach,'swing hint appears before frame contact');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}});
  for(let i=0;i<body.x.length;i+=3)body.x[i]-=.125;
  body.updateCenter();body.updateSurface();body.grounded=true;
  assert(boxPenetration(body,facility.visual.collisionBoxes)>.001,'swing clearance setup overlaps the frame');
  let resolved=0;
  for(let i=0;i<480;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);facility.afterStep();rig.afterStep();
    if(i>60&&i%12===0){if(body.surfaceDirty)body.updateSurface();resolved=Math.max(resolved,boxPenetration(body,facility.visual.collisionBoxes));}
  }
  assert(resolved<.001,'swing frame boxes keep the visible surface out');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}}),low=Math.min(...Array.from({length:body.x.length/3},(_,i)=>body.x[i*3+1]));
  for(let i=0;i<body.x.length;i+=3){body.x[i]+=SWING.x;body.x[i+2]+=SWING.z+.035;body.x[i+1]+=PHYS.floor+.003-low;}
  body.updateCenter();body.updateSurface();body.grounded=true;
  facility.physics.angle=0;facility.physics.speed=2.5;
  const speedBefore=facility.physics.speed,velocityBefore=centerVelocity(body);
  facility.afterStep();
  const velocityAfter=centerVelocity(body);
  assert(facility.physics.speed<speedBefore-.05,'moving swing seat loses speed on body contact');
  assert(velocityAfter[2]>velocityBefore[2]+.001,'moving swing seat transfers momentum into the body');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new SwingFacility(new Scene(),body,{add(){}}),low=Math.min(...Array.from({length:body.x.length/3},(_,i)=>body.x[i*3+1]));
  for(let i=0;i<body.x.length;i+=3){body.x[i]+=SWING.x;body.x[i+2]+=SWING.z;body.x[i+1]+=PHYS.floor+.003-low;}
  body.updateCenter();body.updateSurface();body.grounded=true;
  assert(facility.visual.seatBoxes.length===5,'swing seat exposes three slats and two supports');
  const before=boxPenetration(body,facility.visual.seatBoxes);
  const beforeCenter=body.center.toArray();
  assert(before>.001,'seat collision setup overlaps the seat');
  // The droplet straddles the 6 mm slats instead of resting on them, so the
  // solver needs more than one 1/240 s step to lift the surface clear, and a
  // deformable body can deepen the measured maximum on the very first one.
  // Assert that the contact converges rather than that it improves instantly.
  body.wake();
  for(let i=0;i<480;i++){rig.step(PHYS.step);body.step(PHYS.step);facility.afterStep();rig.afterStep();}
  body.updateSurface();
  const after=boxPenetration(body,facility.visual.seatBoxes);
  assert(after<.001,'swing seat slats resolve the body back out');
  assert(Math.hypot(...body.center.toArray().map((value,i)=>value-beforeCenter[i]))>1e-6,'seat contact resolves through the deformed body');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new TrampolineFacility(new Scene(),body,{add(){}});
  const rest=body.x.slice();
  let hintReach=-1,contactReach=-1;
  for(let sample=0;sample<=250;sample++) {
    for(let i=0;i<body.x.length;i+=3)body.x[i]=rest[i]+sample*.001;
    body.updateCenter();body.updateSurface();body.grounded=true;
    const reach=Math.hypot(body.center.x-TRAMPOLINE.x,body.center.z-TRAMPOLINE.z);
    if(hintReach<0&&facility.physics.nearby)hintReach=reach;
    if(contactReach<0&&cylinderPenetration(body)>1e-7)contactReach=reach;
  }
  assert(hintReach>=0&&contactReach>=0&&hintReach>contactReach,'trampoline hint appears before cylinder contact');
  facility.dispose();
}

{
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);settle(body,rig);
  const facility=new TrampolineFacility(new Scene(),body,{add(){}});
  for(let i=0;i<body.x.length;i+=3)body.x[i]+=.045;
  body.updateCenter();body.updateSurface();body.grounded=true;
  assert(cylinderPenetration(body)>.001,'trampoline clearance setup overlaps the cylinder');
  let resolved=0;
  for(let i=0;i<480;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);facility.afterStep();rig.afterStep();
    if(i>60&&i%12===0){if(body.surfaceDirty)body.updateSurface();resolved=Math.max(resolved,cylinderPenetration(body));}
  }
  assert(resolved<.001,'trampoline cylinder keeps the visible surface outside');
  assert(Math.hypot(body.center.x-TRAMPOLINE.x,body.center.z-TRAMPOLINE.z)>TRAMPOLINE.radius+.01,'the resolved body does not rest inside the trampoline disk');
  facility.dispose();
}

console.log('Facility collision volumes, deformed-surface clearance and pre-contact hints verified');
