import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Vector3 } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { SurfaceBVH } from '../src/graphics/refractive-light.js';
import { surfaceGrab } from '../src/physics/grab.ts';

const candidates=process.argv.includes('--sweep')?[[700,80,2],[1200,150,3.5],[1800,250,5]]:[[PHYS.shear,PHYS.shapeMemory,PHYS.shapeDamping]];
for(const [shear,shapeMemory,shapeDamping] of candidates) {
  Object.assign(PHYS,{shear,shapeMemory,shapeDamping});
  const body=new SoftBody(loadModel()),rig=new Locomotion(body);
  const dims=()=>{body.updateSurface();const b=body.surface.geometry.boundingBox;return b.max.clone().sub(b.min).toArray();};
  let minJ=1,minVolume=1,maxVolume=1;
  const step=(n,observe=()=>{})=>{for(let i=0;i<n;i++) {
    rig.step(PHYS.step);body.step(PHYS.step);rig.afterStep();
    assert(body.isFinite());minJ=Math.min(minJ,body.lastMinJacobian);
    if(i%8===0){const v=body.volumeRatio();minVolume=Math.min(minVolume,v);maxVolume=Math.max(maxVolume,v);}
    observe(i);
  }};
  step(3600);const rest=dims();assert(body.sleeping);
  const poses={rest:Array.from(body.x)};
  const grabs=[];
  for(const [name,direction] of [['belly',new Vector3(0,0,1)],['side',new Vector3(1,0,0)],['upper',new Vector3(0,1,0)]]) {
    body.reset();rig.reset();step(720);body.updateSurface();
    let vertex=0,score=-Infinity;const p=body.surface.positions;
    for(let i=0;i<p.length;i+=3){const s=direction.dot(new Vector3().fromArray(p,i));if(s>score){score=s;vertex=i/3;}}
    const origin=new Vector3().fromArray(p,vertex*3).addScaledVector(direction,.10),ray=direction.clone().negate();
    const hit=new SurfaceBVH(body.surface).hit(origin.toArray(),ray.toArray());assert(hit,`${name} surface ray hits`);
    const ix=body.surface.indices,offset=hit.t*3,point=origin.clone().addScaledVector(ray,hit.distance);
    body.grab=surfaceGrab(body,{a:ix[offset],b:ix[offset+1],c:ix[offset+2]},point);assert(body.grab,`${name} visible hit binds`);
    step(180,i=>body.grab.target.copy(point).addScaledVector(direction,.09*Math.min(1,i/120)).add(new Vector3(0,.025,0)));
    const stretched=dims(),extension=body.grab.point.distanceTo(point);
    assert(extension>.025,`${name} grab moves surface`);grabs.push({name,extensionMm:extension*1000,dimensionsMm:stretched.map(x=>x*1000)});
    body.grab=null;body.wake();step(2400);
    assert(body.volumeRatio()>.9&&body.volumeRatio()<1.1);
  }
  const recovery=dims();
  // Opposed surface grips measure deformation separately from whole-body drag.
  body.reset();rig.reset();step(3600);body.updateSurface();
  const p=body.surface.positions;
  const ids=[-1,1].map(sign=>{let best=0;for(let i=1;i<p.length/3;i++)if(sign*p[i*3]>sign*p[best*3])best=i;return best;});
  body.grabs=ids.map(id=>{const point=new Vector3().fromArray(p,id*3);return {weights:body.surface.stencils[id],point:point.clone(),target:point.clone(),lambda:new Float64Array(3)};});
  const starts=body.grabs.map(g=>g.target.clone());
  step(180,i=>body.grabs.forEach((g,k)=>g.target.copy(starts[k]).add(new Vector3((k?1:-1)*.045*Math.min(1,i/120),.018,0))));
  const stretchRatio=dims()[0]/rest[0];assert(stretchRatio>1.2);poses.stretch=Array.from(body.x);
  body.grab=null;body.reset();rig.reset();step(3600);
  body.wake();for(let i=1;i<body.x.length;i+=3){body.x[i]+=.10;body.velocity[i]=-.45;}
  body.previous.set(body.x);
  let landingSquash=Infinity,landingRebound=0;
  step(480,i=>{const h=dims()[1];if(body.grounded&&h<landingSquash){landingSquash=h;poses.landing=Array.from(body.x);}if(i>100)landingRebound=Math.max(landingRebound,h);});
  body.reset();rig.reset();step(720);const start=body.center.clone();
  body.wake();for(let i=0;i<body.x.length;i+=3){body.velocity[i]=.32+9*(body.x[i+1]-body.center.y);body.velocity[i+1]=.42-9*(body.x[i]-body.center.x);}
  let squash=Infinity,rebound=0;
  step(720,i=>{if(i>50&&i%4===0){const h=dims()[1];if(h<squash){squash=h;poses.rolled=Array.from(body.x);}if(i>120)rebound=Math.max(rebound,h);}});
  const translation=body.center.distanceTo(start);assert(translation>.025);step(1800);
  assert(minJ>=.12&&minVolume>.7&&maxVolume<1.3);
  console.log(JSON.stringify({shear,shapeMemory,shapeDamping,restMm:rest.map(x=>x*1000),grabs,stretchRatio,recoveryMm:recovery.map(x=>x*1000),translationMm:translation*1000,landingSquashRatio:landingSquash/rest[1],landingReboundRatio:landingRebound/rest[1],tumbleHeightRatio:squash/rest[1],reboundRatio:rebound/rest[1],minJ,minVolume,maxVolume,sleeping:body.sleeping}));
  if(!process.argv.includes('--sweep'))writeFileSync('/tmp/squish-mascot-poses.json',JSON.stringify(poses));
}
