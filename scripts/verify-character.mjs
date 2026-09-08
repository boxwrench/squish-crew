import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Quaternion, Raycaster, Vector3 } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { Baby } from '../src/graphics/baby.ts';

const body=new SoftBody(loadModel()),rig=new Locomotion(body),baby=new Baby(body),dt=1/60;
const arms=baby.arms,head=baby.head,poses={};
let attachmentError=0,meshCount=0;
const raycaster=new Raycaster(),hits=[];
baby.group.traverse(object=>{
  if(!object.isMesh||object===baby.mesh)return;
  meshCount++;object.raycast(raycaster,hits);
});
assert.equal(hits.length,0,'all accessory meshes opt out of picking');
assert(meshCount>10,'character details instantiated');

function attachment(binding) {
  const point=binding.point??binding.anchor;
  assert(binding.weights.every(Number.isFinite));
  assert(Math.abs(binding.weights.reduce((a,b)=>a+b,0)-1)<1e-9);
  for(let axis=0;axis<3;axis++) {
    const expected=binding.triangle.reduce((sum,id,k)=>sum+body.surface.positions[id*3+axis]*binding.weights[k],0);
    const error=Math.abs(expected-point[axis]);attachmentError=Math.max(attachmentError,error);
    assert(error<1e-7,'accessory root follows its exact deformed triangle');
  }
}
function check() {
  assert(body.isFinite());
  for(const a of head.snapshot().attachments)attachment(a);
  for(const a of baby.clothes.debug)attachment(a);
  for(const a of arms.snapshot().arms) {
    attachment(a);
    assert([a.angle,a.velocity].every(Number.isFinite));
    assert(Math.abs(a.angle)<.8,'small arm motion stays bounded');
  }
  baby.group.updateMatrixWorld(true);
  baby.group.traverse(object=>assert(object.matrixWorld.elements.every(Number.isFinite),'finite accessory world transform'));
}
function step(n,observe=()=>{}) {
  for(let frame=0;frame<n;frame++) {
    for(let i=0;i<4;i++){rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();}
    if(body.surfaceDirty)body.updateSurface();baby.update(dt);check();observe(frame);
  }
}
const motion=()=>Math.max(...arms.snapshot().arms.map(a=>Math.abs(a.angle)));
const capture=name=>{poses[name]={positions:Array.from(body.x),legState:baby.legs.snapshot(),armState:arms.snapshot()};};
const reset=()=>{body.reset();rig.reset();body.updateSurface();baby.resetFace();baby.update(0);};

step(900);assert(body.sleeping);assert(!arms.active,'arms sleep after settling');
const rest=arms.snapshot(),restHead=head.snapshot(),revision=arms.revision,accessoryRevision=baby.accessoryRevision;
step(120);assert.equal(arms.revision,revision,'settled arms do not prolong rendering');
assert.equal(baby.accessoryRevision,accessoryRevision,'settled character details do not prolong rendering');
assert.deepEqual(arms.snapshot().arms,rest.arms,'no resting drift');capture('rest');

// Rigid roll isolates attachment orientation and secondary lag from solver contacts.
const original=body.surface.positions.slice(),pivot=body.center.clone();body.wake();let rollLag=0;
const rollAxis=new Vector3(1,0,1).normalize(),samplePoint=new Vector3(),rotation=new Quaternion();
for(let frame=0;frame<24;frame++) {
  rotation.setFromAxisAngle(rollAxis,(frame+1)/24*Math.PI/2);
  for(let i=0;i<original.length;i+=3)samplePoint.fromArray(original,i).sub(pivot).applyQuaternion(rotation).add(pivot).toArray(body.surface.positions,i);
  body.surfaceRevision++;
  baby.update(dt);check();rollLag=Math.max(rollLag,motion());
}
for(let i=0;i<restHead.attachments.length;i++) {
  const expected=rotation.clone().multiply(new Quaternion().fromArray(restHead.attachments[i].quaternion));
  assert(expected.angleTo(new Quaternion().fromArray(head.snapshot().attachments[i].quaternion))<1e-4,'face and cap rotate with the body');
}
assert(rollLag>.01,'body roll produces nonzero arm lag');

reset();step(900);const start=body.center.clone();body.wake();
for(let i=0;i<body.x.length;i+=3){body.velocity[i]=.32+9*(body.x[i+1]-body.center.y);body.velocity[i+1]=.42-9*(body.x[i]-body.center.x);}
let throwLag=0;step(180,()=>{if(motion()>throwLag){throwLag=motion();capture('roll');}});
assert(throwLag>.01,'real throw produces arm motion');assert(body.center.distanceTo(start)>.025,'main-body throw remains effective');
step(900);assert(body.sleeping);assert(!arms.active);assert(motion()<1e-5,'arms settle after throw');capture('settled');

// Opposed large grips deform shoulders and face independently of the body center.
const p=body.surface.positions,ids=[-1,1].map(sign=>{let best=0;for(let i=1;i<p.length/3;i++)if(sign*p[i*3]>sign*p[best*3])best=i;return best;});
body.grabs=ids.map(id=>{const point=new Vector3().fromArray(p,id*3);return {weights:body.surface.stencils[id],point:point.clone(),target:point.clone(),lambda:new Float64Array(3)};});
const starts=body.grabs.map(g=>g.target.clone());body.wake();
step(60,frame=>body.grabs.forEach((g,k)=>g.target.copy(starts[k]).add(new Vector3((k?1:-1)*.045*Math.min(1,frame/40),.018,0))));
capture('stretch');check();reset();
for(const a of arms.snapshot().arms)assert.deepEqual([a.angle,a.velocity],[0,0],'reset clears arm state');
check();
const timing=performance.now();body.sleeping=false;
// Force the moving-surface code path, including cloth vertex/normal updates.
for(let i=0;i<10000;i++){body.surfaceRevision++;baby.update(dt);}
const updateMs=(performance.now()-timing)/10000;
writeFileSync('/tmp/squish-character-poses.json',JSON.stringify(poses));
console.log(JSON.stringify({accessoryMeshes:meshCount,attachmentErrorMm:attachmentError*1000,restNoDrift:true,rollLagDegrees:rollLag*180/Math.PI,throwLagDegrees:throwLag*180/Math.PI,faceCapRoll:true,stretch:true,settling:true,reset:true,finite:true,nonPickable:true,accessoryUpdateMs:updateMs,poses:'/tmp/squish-character-poses.json'}));
baby.dispose();
