import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';

const cage=loadModel(),body=new SoftBody(cage);
const rig=new Locomotion(body);
assert(body.kernel,'WASM physics remains active');
assert(cage.surface.positions.length/3<10000,'mobile surface budget');
assert(cage.opticalSurface.positions.length<cage.surface.positions.length,'lower resolution optical proxy');
assert(body.elements.length<4026,'cage simpler than baseline humanoid');
for(let i=0;i<cage.surface.stencils.length;i++) {
  const binding=cage.surface.stencils[i];
  assert(Math.abs(binding.reduce((s,[,w])=>s+w,0)-1)<1e-8);
  for(let axis=0;axis<3;axis++)assert(Math.abs(binding.reduce((s,[id,w])=>s+cage.pos[id*3+axis]*w,0)-cage.surface.positions[i*3+axis])<1e-8,'surface embeds exactly');
}
const step=count=>{for(let i=0;i<count;i++){rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();assert(body.isFinite());assert(body.minimumJacobian()>.1,'positive oriented cage');}body.updateSurface();};
step(720);
assert(body.sleeping,'idle droplet enters sleep');
const asleep=body.x.slice();step(120);assert.deepEqual(body.x,asleep,'sleeping droplet remains still');
assert(body.volumeRatio()>.8&&body.volumeRatio()<1.2,'rest volume retained');
const restHeight=body.surface.geometry.boundingBox.max.y;
let tip=0;for(let i=0;i<cage.surface.positions.length/3;i++)if(cage.surface.positions[i*3+1]>cage.surface.positions[tip*3+1])tip=i;
const weights=cage.surface.stencils[tip];
const point=new Vector3();for(const [id,w] of weights)point.addScaledVector(new Vector3(...body.x.slice(id*3,id*3+3)),w);
body.grab={weights,point:point.clone(),target:point.clone().add(new Vector3(.012,.025,0)),lambda:new Float64Array(3)};step(1);
assert(!body.sleeping,'grabbing wakes a sleeping droplet');step(179);
assert(body.surface.geometry.boundingBox.max.y>restHeight+.006,'tip pull stretches droplet');
body.grab=null;body.wake();for(let i=0;i<body.velocity.length;i+=3){body.velocity[i]+=.08;body.velocity[i+1]+=.2;}
step(960);
assert(body.volumeRatio()>.8&&body.volumeRatio()<1.2,'volume survives stretch, throw and impact');
assert(body.surface.geometry.boundingBox.min.y>=PHYS.floor-.0005,'surface stays above floor');
for(let trial=0;trial<3;trial++) {
  const at=new Vector3();for(const [id,w] of weights)at.addScaledVector(new Vector3(...body.x.slice(id*3,id*3+3)),w);
  body.grab={weights,point:at.clone(),target:at.clone().add(new Vector3((trial%2?-.05:.05),.09,.025)),lambda:new Float64Array(3)};
  step(120);body.grab=null;body.wake();
  for(let i=0;i<body.velocity.length;i+=3){body.velocity[i]+=(trial%2?-.15:.15);body.velocity[i+1]+=.35;}
  step(1440);
  assert(body.volumeRatio()>.8&&body.volumeRatio()<1.2,'volume recovers after extreme interaction');
}
step(2400);
console.log('recovery',{rms:Math.sqrt(2*body.energy()/body.totalMass),quiet:body.quietTime,grounded:body.grounded,fraction:body.stepFraction,height:body.surface.geometry.boundingBox.max.y-body.surface.geometry.boundingBox.min.y});
assert(body.sleeping,'droplet settles and sleeps after repeated extreme throws');
const recovered=body.surface.geometry.boundingBox;
assert(recovered.max.y-recovered.min.y>.045&&recovered.max.y-recovered.min.y<.085,'droplet recovers its upright silhouette');
console.log('Droplet physics passed',{vertices:cage.surface.positions.length/3,tets:body.elements.length,volumeRatio:body.volumeRatio(),height:body.surface.geometry.boundingBox.max.y,sleeping:body.sleeping});
