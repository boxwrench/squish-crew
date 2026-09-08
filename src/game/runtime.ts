import * as THREE from 'three/webgpu';
import { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';
import { loadBabyCage } from '../physics/baby-cage.ts';
import { RefractiveLightField } from '../graphics/refractive-light.js';
import { Baby, ABSORPTION } from '../graphics/baby.ts';
import { loadEnvironment } from '../graphics/environment.ts';
import { makeBoilerFloor } from '../graphics/boiler-floor.ts';
import { makeBoilerRoom } from '../graphics/boiler-room.ts';
import { Locomotion } from './locomotion.ts';
import { Input } from './input.ts';
import { JellySound } from './sound.ts';
import { createRenderer, resizeView } from '../graphics/renderer.ts';
import { OpticalTransport } from '../graphics/transport.ts';
import { createComposite } from '../graphics/composite.ts';
import { FixedStepper } from './fixed-step.ts';
import { FacilityShadows } from '../graphics/facility-shadows.ts';
import { SplashParticles } from '../water/splash-particles.ts';
import { ReactionGate, REACTION, hardImpact } from './reactions.ts';
import { Puddle } from '../water/puddle.ts';
import { quality, observeFrame } from '../graphics/quality.ts';
import type { LegSnapshot } from '../graphics/mascot-legs.ts';

export async function startGame(stage:(s:string)=>void,fail:(e:unknown)=>void) {
  stage('Starting WebGPU');
  const renderer=await createRenderer(fail);
  document.querySelector('#viewport')!.appendChild(renderer.domElement);
  // Construct audio before the remaining async scene work so the first mobile
  // gesture can unlock Web Audio even while assets and shaders are settling.
  const sound=new JellySound();
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#e8d9c3');scene.fog=new THREE.Fog('#e8d9c3',2,12);
  const camera=new THREE.PerspectiveCamera(36,1,.001,40);
  camera.position.set(.015,.115,.175);
  stage('Reading the light');
  const environment=await loadEnvironment(renderer,scene);
  stage('Preparing the mascot');
  const body=new SoftBody(await loadBabyCage());
  const baby=new Baby(body);scene.add(baby.group);
  const optics=new RefractiveLightField(body.cage.opticalSurface,environment.incoming,ABSORPTION);
  const facilityShadows=new FacilityShadows(environment.incoming);
  const splash=new SplashParticles();scene.add(splash.mesh);
  const puddle=new Puddle();
  const table=makeBoilerFloor(optics,environment);scene.add(table.mesh);
  const boilerRoom=await makeBoilerRoom(scene);
  const composite=createComposite(renderer,scene,camera);
  const rig=new Locomotion(body);
  const reactions=new ReactionGate();
  // Cartoon sweat, not water: a couple of drops flicked off by the effort.
  const sweatBurst=(count:number,speed:number,strength:number)=>{
    splash.burst(body.center,speed,count,rig.velocity);
    sound.sweat(strength);
  };
  rig.onContact=(speed,foot)=>{
    baby.legs.impact(speed);
    sound.contact(speed,foot);
    const hardness=hardImpact(speed);
    if(reactions.grunt(speed))sound.grunt(hardness);
    const drops=reactions.impactSweat(speed);
    if(drops)sweatBurst(drops,Math.min(speed,.9)*.5,hardness);
  };
  const physicsClock=new FixedStepper(PHYS.step);
  let lastTime=0,disposed=false,inspectionPaused=false;
  const reset=()=>{inspectionPaused=false;sound.stopFacilities();sound.reset();input.clear();rig.reset();body.reset();input.recenter();baby.resetFace();physicsClock.reset();reactions.reset();splash.clear();puddle.hide();};
  const input=new Input(camera,renderer.domElement,body,baby.mesh,rig,sound,reset);
  // A grip pulled to its limit breaks a single small sweat burst, then re-arms.
  input.onStretch=amount=>{if(reactions.stretchSweat(amount))sweatBurst(REACTION.stretchDrops,.34,.55);};
  if(import.meta.env.DEV)Object.defineProperty(window,'dropletDebug',{configurable:true,get:()=>({
    center:body.center.toArray(),sleeping:body.sleeping,grabs:body.grabs.length,volume:body.volumeRatio(),
    camera:camera.position.toArray(),finite:body.isFinite(),quality:{...quality},
    legs:baby.legs.debug,
    inspectLegPose:(pose:{positions:number[];legState:LegSnapshot;armState?:ReturnType<typeof baby.arms.snapshot>;view?:[number,number,number]})=>{
      const positions=pose.positions;
      if(positions.length!==body.x.length||positions.some(v=>!Number.isFinite(v)))throw new Error('Invalid inspection pose');
      reset();inspectionPaused=true;body.x.set(positions);body.previous.set(positions);body.velocity.fill(0);body.updateSurface();
      baby.resetFace();baby.legs.restoreInspection(pose.legState);if(pose.armState)baby.arms.restoreInspection(pose.armState);input.recenter();input.update(10);
      camera.position.copy(input.controls.target).add(new THREE.Vector3(...(pose.view??[.025,.11,.23] as const)));input.controls.update();
    },
    // Replay measured physics states for repeatable prototype screenshot review.
    inspectPose:(positions:number[])=>{
      if(positions.length!==body.x.length||positions.some(v=>!Number.isFinite(v)))throw new Error('Invalid inspection pose');
      reset();inspectionPaused=true;body.x.set(positions);body.previous.set(positions);body.velocity.fill(0);body.updateSurface();baby.resetFace();input.recenter();input.update(10);
      camera.position.copy(input.controls.target).add(new THREE.Vector3(.025,.13,.27));input.controls.update();
    },
    thickness:[Math.min(...body.surface.geometry.attributes.opticalThickness.array),Math.max(...body.surface.geometry.attributes.opticalThickness.array)],
    showPuddle:(radius?:number,lifetime?:number)=>puddle.show(body.center,radius??.045,lifetime??1),
    puddleState:{visible:puddle.visible,radius:puddle.radius.value,strength:puddle.strength.value},
    hidePuddle:()=>puddle.hide(),
    splash:(count?:number,speed?:number)=>splash.burst(body.center,speed??.55,count??24,rig.velocity),
    sweatDrops:splash.airborne,
    soundHop:()=>sound.hop(),soundSplash:()=>sound.splash(.8),
    musicOn:()=>sound.musicOn(),musicOff:()=>sound.musicOff(),
  })});
  const transport=new OpticalTransport(optics,body,camera,environment.incoming,fail);
  const resize=()=>resizeView(renderer,camera,input.controls);
  let resizeFrame=0;
  const resizeObserver=new ResizeObserver(()=>{
    cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(resize);
  });
  resizeObserver.observe(document.querySelector('#viewport')!);resize();
  document.querySelector('#reset')!.addEventListener('click',event=>{
    reset();if((event as MouseEvent).detail>0)(event.currentTarget as HTMLButtonElement).blur();
  });
  document.querySelector('#sound')!.addEventListener('click',event=>{
    const muted=sound.toggle(),button=document.querySelector('#sound')!;
    button.setAttribute('aria-pressed',String(muted));button.setAttribute('aria-label',muted?'Enable sound':'Mute sound');
    button.classList.toggle('muted',muted);void sound.unlock().catch(()=>{});
    if((event as MouseEvent).detail>0)(event.currentTarget as HTMLButtonElement).blur();
  });
  stage('Settling in');
  // Let contact establish itself before displaying the first frame.
  for(let i=0;i<80;i++){rig.step(PHYS.step);body.step(PHYS.step);}
  body.updateSurface();baby.update();input.update(1);
  facilityShadows.update(renderer);
  optics.update(renderer,body,true);
  await transport.update();
  stage('Compiling the material');
  await renderer.compileAsync(scene,camera);
  stage('Drawing the first frame');
  composite.render();
  // Fence first-frame GPU work so validation/OOM cannot masquerade as a successful boot.
  const backend=renderer.backend as unknown as {device:GPUDevice};
  await backend.device.queue.onSubmittedWorkDone();
  lastTime=performance.now();
  const renderedCamera=new THREE.Vector3(Infinity,Infinity,Infinity);
  const renderedRotation=new THREE.Quaternion();
  let renderedSurface=-1,renderedFace=-1,renderedThickness=-1,renderedDpr=-1,renderedLegs=-1;
  let renderedSize='';
  const frame=(time:number)=>{
    if(disposed)return;
    try {
      const effectDt=Math.max(0,(time-lastTime)/1000);
      const dt=Math.min(.05,effectDt);lastTime=time;
      if(document.hidden){physicsClock.reset();return;}
      const steps=physicsClock.advance(inspectionPaused?0:dt,()=>{
        input.step(PHYS.step);rig.step(PHYS.step);
        body.step(PHYS.step);input.afterPhysicsStep();rig.afterStep();
      });
      if(steps&&body.surfaceDirty) {
        if(!body.isFinite())throw new Error('The soft-body simulation produced an invalid state');
        body.updateSurface();
      }
      if(!inspectionPaused)baby.update(dt);
      if(observeFrame(dt))resize();
      transport.rate=quality.opticalHz;
      reactions.advance(dt);
      splash.update(dt);
      const puddleChanged=puddle.update(effectDt);
      input.update(dt);
      sound.listen(camera);
      transport.follow();
      optics.update(renderer,body);
      table.mesh.position.x=body.center.x;table.mesh.position.z=body.center.z;
      void transport.update().catch(fail);
      const faceVersion=baby.group.children.reduce((sum,child)=>sum+(((child as THREE.Mesh).geometry?.attributes.position as THREE.BufferAttribute|undefined)?.version??0),0);
      const thicknessVersion=body.surface.geometry.attributes.opticalThickness.version;
      const size=renderer.domElement.width+','+renderer.domElement.height;
      if(!body.sleeping||splash.active||puddleChanged||renderedLegs!==baby.accessoryRevision||renderedSurface!==body.surfaceRevision||renderedFace!==faceVersion||
        renderedThickness!==thicknessVersion||renderedDpr!==renderer.getPixelRatio()||renderedSize!==size||
        renderedCamera.distanceToSquared(camera.position)>1e-12||renderedRotation.angleTo(camera.quaternion)>1e-6) {
        composite.render();renderedSurface=body.surfaceRevision;renderedFace=faceVersion;renderedLegs=baby.accessoryRevision;
        renderedThickness=thicknessVersion;renderedDpr=renderer.getPixelRatio();renderedSize=size;
        renderedCamera.copy(camera.position);renderedRotation.copy(camera.quaternion);
      }
    }catch(error){fail(error);}
  };
  await renderer.setAnimationLoop(frame);
  const dispose=()=>{
    if(disposed)return;disposed=true;
    void renderer.setAnimationLoop(null);input.dispose();sound.dispose();transport.dispose();resizeObserver.disconnect();cancelAnimationFrame(resizeFrame);
    facilityShadows.dispose();composite.dispose();baby.dispose();table.dispose();boilerRoom.dispose();splash.dispose();environment.dispose();optics.dispose();renderer.dispose();
  };
  window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
  if(import.meta.hot)import.meta.hot.dispose(dispose);
  return {stop:dispose};
}
