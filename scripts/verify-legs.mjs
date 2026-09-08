import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Group, Quaternion, Vector3 } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { MascotLegs } from '../src/graphics/mascot-legs.ts';

const body=new SoftBody(loadModel()), rig=new Locomotion(body), group=new Group();
const legs=new MascotLegs(body,group), dt=1/60, poses={};
rig.onContact=speed=>legs.impact(speed);
const motion=()=>Math.max(...legs.debug.legs.flatMap(l=>[Math.abs(l.angle),Math.abs(l.splay)]));
let maxAttachmentError=0;
function check() {
  assert(body.isFinite(),'body remains finite');
  for(const l of legs.debug.legs) {
    assert([l.angle,l.splay,l.velocity,l.splayVelocity,...l.anchor,...l.weights].every(Number.isFinite),'finite secondary state');
    assert(Math.abs(l.angle)<=1.06&&Math.abs(l.splay)<=1.06,'bounded secondary angles');
    assert(Math.abs(l.weights.reduce((a,b)=>a+b,0)-1)<1e-9,'barycentric sum');
    for(let axis=0;axis<3;axis++) {
      const expected=l.triangle.reduce((sum,id,k)=>sum+body.surface.positions[id*3+axis]*l.weights[k],0);
      const error=Math.abs(expected-l.anchor[axis]);
      maxAttachmentError=Math.max(maxAttachmentError,error);
      assert(error<1e-7,'hip is exactly on its deforming surface triangle');
    }
  }
}
function step(n,observe=()=>{}) {
  for(let frame=0;frame<n;frame++) {
    for(let i=0;i<4;i++){rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();}
    body.updateSurface();legs.update(dt);check();observe(frame);
  }
}
function capture(name) { poses[name]={positions:Array.from(body.x),legState:legs.snapshot()}; }
function reset() {body.reset();rig.reset();body.updateSurface();legs.reset();}

step(900);assert(body.sleeping);assert(!legs.active,'sleeping legs become inactive');
const rest=legs.debug;
assert(Math.abs(rest.legs[0].anchor[0]+rest.legs[1].anchor[0]-2*body.center.x)<.002,'left/right rest symmetry');
const before=JSON.stringify(rest.legs),restRevision=legs.revision;
step(120);assert.equal(JSON.stringify(legs.debug.legs),before,'no rest drift');
assert.equal(legs.revision,restRevision,'settled legs do not request more rendering');capture('rest');

// A controlled surface rotation isolates orientation inertia from contact kicks.
const original=body.surface.positions.slice(), pivot=body.center.clone();
const initialFrame=new Quaternion().fromArray(legs.debug.frame);body.wake();
let syntheticRoll=0;
for(let frame=0;frame<24;frame++) {
  const angle=(frame+1)/24*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  for(let i=0;i<original.length;i+=3) {
    const x=original[i]-pivot.x,y=original[i+1]-pivot.y;
    body.surface.positions[i]=pivot.x+c*x-s*y;body.surface.positions[i+1]=pivot.y+s*x+c*y;
  }
  legs.update(dt);check();syntheticRoll=Math.max(syntheticRoll,motion());
}
assert(syntheticRoll>.05,'orientation changes drive visible secondary lag');
const expectedFrame=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI/2).multiply(initialFrame);
assert(expectedFrame.angleTo(new Quaternion().fromArray(legs.debug.frame))<1e-5,'attachment frame follows 90-degree body roll');
assert(legs.debug.legs[1].splay<0,'leg swing opposes body rotation: visible lag, not rigid tracking');

reset();step(900);const start=body.center.clone();body.wake();
for(let i=0;i<body.x.length;i+=3) {
  body.velocity[i]=.32+9*(body.x[i+1]-body.center.y);
  body.velocity[i+1]=.42-9*(body.x[i]-body.center.x);
}
let rollPeak=0;
step(180,()=>{if(motion()>rollPeak){rollPeak=motion();capture('roll');}});
const throwTranslation=body.center.distanceTo(start);assert(throwTranslation>.025);assert(rollPeak>.1,'actual thrown body flails');

// Identical stationary body isolates impact-strength response.
reset();step(900);legs.reset();legs.impact(.14);let smallKick=0;
for(let i=0;i<90;i++){legs.update(dt);check();smallKick=Math.max(smallKick,motion());}
legs.reset();legs.impact(.8);let hardKick=0;
for(let i=0;i<90;i++){legs.update(dt);check();hardKick=Math.max(hardKick,motion());}
assert(hardKick>.1&&hardKick>smallKick*2,'hard contact gives much more kick than small contact');

reset();step(900);body.wake();
for(let i=1;i<body.x.length;i+=3){body.x[i]+=.10;body.velocity[i]=-.45;}
body.previous.set(body.x);let landingKick=0;
step(180,()=>{if(body.grounded&&motion()>landingKick){landingKick=motion();capture('impact');}});
assert(landingKick>.1,'real landing signal kicks legs');
step(900);assert(body.sleeping);assert(!legs.active);assert(motion()<1e-5,'motion decays to rest');capture('settled');

// Real opposed soft-body grips exercise anchors during a large deformation.
const p=body.surface.positions,ids=[-1,1].map(sign=>{let best=0;for(let i=1;i<p.length/3;i++)if(sign*p[i*3]>sign*p[best*3])best=i;return best;});
body.grabs=ids.map(id=>{const point=new Vector3().fromArray(p,id*3);return {weights:body.surface.stencils[id],point:point.clone(),target:point.clone(),lambda:new Float64Array(3)};});
const starts=body.grabs.map(g=>g.target.clone());body.wake();
step(60,frame=>body.grabs.forEach((g,k)=>g.target.copy(starts[k]).add(new Vector3((k?1:-1)*.045*Math.min(1,frame/40),.018,0))));
check();reset();
for(const l of legs.debug.legs)assert.deepEqual([l.angle,l.splay,l.velocity,l.splayVelocity],[0,0,0,0],'reset clears secondary state');

// Secondary update only: excludes solver, rendering, snapshots and assertions.
body.sleeping=false;legs.reset();const timing=performance.now();
for(let i=0;i<20000;i++)legs.update(dt);
const updateMs=(performance.now()-timing)/20000;
assert(updateMs<1,'secondary update stays far below a mobile frame budget on this host');
writeFileSync('/tmp/squish-legs-poses.json',JSON.stringify(poses));
console.log(JSON.stringify({restSymmetric:true,noDrift:true,maxAttachmentErrorMm:maxAttachmentError*1000,syntheticRollDegrees:syntheticRoll*180/Math.PI,actualRollDegrees:rollPeak*180/Math.PI,throwTranslationMm:throwTranslation*1000,smallKickDegrees:smallKick*180/Math.PI,hardKickDegrees:hardKick*180/Math.PI,landingKickDegrees:landingKick*180/Math.PI,settles:true,reset:true,finite:true,updateMs,poses:'/tmp/squish-legs-poses.json'}));
