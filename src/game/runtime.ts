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
import { SplashParticles } from '../water/splash-particles.ts';
import { FacilityCollision, type CollisionBox } from '../physics/facility-collision.ts';
import { ReactionGate, REACTION, hardImpact, gruntStrength } from './reactions.ts';
import { makeBoilers, BOILER } from './boilers.ts';
import { Pump } from './pump.ts';
import { RoomMood } from './room-mood.ts';
const BOILER_FULL_VENT=BOILER.maxDrop;
const BOILER_REACH=.008;
const PUMP_REACH=.016;
import { quality, observeFrame } from '../graphics/quality.ts';
import type { LegSnapshot } from '../graphics/mascot-legs.ts';

export async function startGame(stage:(s:string)=>void,fail:(e:unknown)=>void) {
  stage('Opening the boiler room…');
  const renderer=await createRenderer(fail);
  document.querySelector('#viewport')!.appendChild(renderer.domElement);
  // Construct audio before the remaining async scene work so the first mobile
  // gesture can unlock Web Audio even while assets and shaders are settling.
  const sound=new JellySound();
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#e8d9c3');scene.fog=new THREE.Fog('#e8d9c3',2,12);
  const camera=new THREE.PerspectiveCamera(36,1,.001,40);
  camera.position.set(.015,.115,.175);
  stage('Turning on the lights…');
  const environment=await loadEnvironment(renderer,scene);
  stage('Finding the engineer…');
  const body=new SoftBody(await loadBabyCage());
  const baby=new Baby(body);scene.add(baby.group);
  const optics=new RefractiveLightField(body.cage.opticalSurface,environment.incoming,ABSORPTION);
  const splash=new SplashParticles();scene.add(splash.mesh);
  // Steam reuses the same pooled, instanced, allocation-free particle system,
  // configured to rise and fade instead of falling and wetting the floor.
  const steam=new SplashParticles({color:'#e8eeec',gravity:-.22,life:1.1,
    radius:[.004,.005],vapour:true,retireOnFloor:false});
  scene.add(steam.mesh);
  const floor=makeBoilerFloor(optics,environment);scene.add(floor.mesh);
  const boilerRoom=await makeBoilerRoom(scene);
  // --- Boiler pressure loop -------------------------------------------------
  // State lives in boilers.ts, meshes in the room; this only wires them up.
  const boilers=makeBoilers();
  const inside=boilers.map(()=>false);
  // A short decaying peak of approach speed. Entry alone under-reads a fling
  // that is still accelerating as it crosses the boundary; this reads the
  // impact rather than the exact frame the boundary was crossed.
  const approaching=boilers.map(()=>0);
  const toBoiler=new THREE.Vector3();
  let hissTimer=0;
  const ventSteam=(index:number,strength:number,count:number)=>{
    steam.burst(boilerRoom.boilers[index].vent,.10+.20*strength,count,undefined);
    boilerRoom.boilers[index].jolt(strength);
  };
  // --- Circulation pump and the room's mood ---------------------------------
  const pump=new Pump(Math.floor(Math.random()*1e6)+1);
  const mood=new RoomMood();
  let pumpInside=false,pumpApproach=0,moodClock=0;
  /** One frame of pump state, its bonk volume and the room beacon. */
  const stepPump=(dt:number)=>{
    const event=pump.advance(dt);
    if(event==='fault')sound.sputter(.5);
    if(event==='sputter') {
      // Nobody came: it coughs, catches, and limps on. That counts as drama.
      sound.sputter(1);steam.burst(boilerRoom.pump.vent,.09,5,undefined);
      boilerRoom.pump.jolt(.8);mood.mishap();
    }
    boilerRoom.pump.update(pump.speed,pump.faulted,dt);
    sound.pumpHum(pump.speed);
    const c=boilerRoom.pump.centre,h=boilerRoom.pump.half,b=body.center;
    toBoiler.copy(c).sub(b);
    const distance=toBoiler.length();
    const approach=distance>1e-6?rig.velocity.dot(toBoiler)/distance:0;
    pumpApproach=Math.max(approach,pumpApproach*.82);
    // The pump is a smaller target than a boiler and stands well clear of the
    // mascot's resting spot, so it can afford a slightly more forgiving skin.
    const overlapping=Math.abs(b.x-c.x)<h.x+PUMP_REACH&&Math.abs(b.y-c.y)<h.y+PUMP_REACH
      &&Math.abs(b.z-c.z)<h.z+PUMP_REACH;
    if(overlapping&&!pumpInside&&pumpApproach>0) {
      const caught=pump.bonk(pumpApproach);
      if(caught>0) {
        sound.thunk(caught);
        boilerRoom.pump.jolt(1);
        steam.burst(boilerRoom.pump.vent,.07,3,undefined);
      }
    }
    pumpInside=overlapping;
    // The room's own read on all of it, shown on one beacon.
    moodClock+=dt;
    let worst=0;for(const boiler of boilers)worst=Math.max(worst,boiler.pressure);
    mood.update(dt,{maxPressure:worst,pumpFaulted:pump.faulted});
    boilerRoom.beacon.update(mood.mood,moodClock);
  };

  /** One frame of pressure, hit detection and feedback. */
  const stepBoilers=(dt:number)=>{
    hissTimer-=dt;
    for(let i=0;i<boilers.length;i++) {
      const boiler=boilers[i],visual=boilerRoom.boilers[i];
      if(boiler.advance(dt)) {
        // Automatic relief: the strongest vent, the loudest, and a mishap.
        sound.steam(1,.9);ventSteam(i,1,10);mood.mishap();
      }
      visual.update(boiler.pressure,dt);
      // A gameplay-only volume. The soft body never collides with a boiler.
      // The margin is deliberately small: the mascot's resting spot is only
      // ~41mm from the near boiler's centre, and a generous skin would leave
      // him permanently inside it so no entry edge could ever fire.
      const c=visual.centre,h=visual.half,b=body.center;
      const overlapping=Math.abs(b.x-c.x)<h.x+BOILER_REACH&&Math.abs(b.y-c.y)<h.y+BOILER_REACH
        &&Math.abs(b.z-c.z)<h.z+BOILER_REACH;
      // Speed along the line into the boiler, so a sideways skim scores less.
      toBoiler.copy(c).sub(b);
      const distance=toBoiler.length();
      const approach=distance>1e-6?rig.velocity.dot(toBoiler)/distance:0;
      approaching[i]=Math.max(approach,approaching[i]*.82);
      if(overlapping&&!inside[i]) {
        // Only a body actually travelling into the boiler counts, so resting
        // against a shell never registers however long he leans on it.
        const drop=approaching[i]>0?boiler.strike(approaching[i]):0;
        if(drop>0) {
          sound.clang(Math.min(1,approaching[i]/BOILER.fullStrikeSpeed));
          sound.steam(Math.min(1,drop/BOILER_FULL_VENT),.42);
          ventSteam(i,Math.min(1,drop/BOILER_FULL_VENT),4+Math.round(drop*6));
        }
      }
      inside[i]=overlapping;
      // An angry boiler hisses to itself between events.
      if(boiler.pressure>.62&&hissTimer<=0) {
        sound.steam((boiler.pressure-.62)/.38*.55,.30);
        steam.burst(visual.vent,.055,1+Math.round(boiler.pressure*2),undefined);
        hissTimer=1.6-boiler.pressure;
      }
    }
  };
  // The room's walls are solid, through the same narrow-phase the swing and
  // trampoline use. A centre-distance broad phase keeps the 1.4k-sample pass
  // off the substep entirely until he is actually near a wall.
  const walls=new FacilityCollision(body);
  const nearbyWalls:CollisionBox[]=[];
  const WALL_REACH=.07;
  const wallsNearBody=()=>{
    nearbyWalls.length=0;
    for(const wall of boilerRoom.collisionBoxes) {
      const dx=body.center.x-wall.center.x,dy=body.center.y-wall.center.y,dz=body.center.z-wall.center.z;
      const qx=Math.abs(dx*wall.xAxis.x+dy*wall.xAxis.y+dz*wall.xAxis.z)-wall.halfSize.x;
      const qy=Math.abs(dx*wall.yAxis.x+dy*wall.yAxis.y+dz*wall.yAxis.z)-wall.halfSize.y;
      const qz=Math.abs(dx*wall.zAxis.x+dy*wall.zAxis.y+dz*wall.zAxis.z)-wall.halfSize.z;
      if(Math.max(qx,qy,qz)<WALL_REACH)nearbyWalls.push(wall);
    }
    return nearbyWalls;
  };
  const composite=createComposite(renderer,scene,camera);
  const rig=new Locomotion(body);
  const reactions=new ReactionGate();
  // Cartoon sweat, not water: a couple of drops flicked off by the effort.
  const sweatBurst=(count:number,speed:number,strength:number)=>{
    splash.burst(body.center,speed,count,rig.velocity);
    sound.sweat(strength);
  };
  // Last landing and what it triggered, for the dev debug hook below.
  let lastLanding={speed:0,grunt:0,drops:0};
  rig.onContact=(speed,foot)=>{
    baby.legs.impact(speed);
    sound.contact(speed,foot);
    const hardness=hardImpact(speed);
    const grunted=reactions.grunt(speed);
    if(grunted)sound.grunt(gruntStrength(speed));
    const drops=reactions.impactSweat(speed);
    if(drops)sweatBurst(drops,Math.min(speed,.9)*.5,hardness);
    lastLanding={speed,grunt:grunted?gruntStrength(speed):0,drops};
  };
  const physicsClock=new FixedStepper(PHYS.step);
  let lastTime=0,disposed=false,inspectionPaused=false,inspectionAccessories=false;
  const reset=()=>{inspectionPaused=false;sound.stopFacilities();sound.reset();input.clear();rig.reset();body.reset();input.recenter();baby.resetFace();physicsClock.reset();reactions.reset();splash.clear();steam.clear();for(const boiler of boilers)boiler.reset();hissTimer=0;inside.fill(false);approaching.fill(0);pump.reset();mood.reset();pumpInside=false;pumpApproach=0;sound.stopHum();};
  const input=new Input(camera,renderer.domElement,body,baby.mesh,rig,sound,reset);
  // A grip pulled to its limit breaks a single small sweat burst, then re-arms.
  input.onStretch=amount=>{if(reactions.stretchSweat(amount))sweatBurst(REACTION.stretchDrops,.34,.55);};
  // Being poked once is a hop; being poked three times quickly is funny.
  let pokes=0,giggles=0;
  input.onPoke=()=>{pokes++;if(reactions.poke()){giggles++;sound.giggle();}};
  if(import.meta.env.DEV)Object.defineProperty(window,'dropletDebug',{configurable:true,get:()=>({
    center:body.center.toArray(),velocity:rig.velocity.toArray(),sleeping:body.sleeping,grabs:body.grabs.length,volume:body.volumeRatio(),
    camera:camera.position.toArray(),finite:body.isFinite(),quality:{...quality},
    legs:baby.legs.debug,squirmTime:baby.squirm.time,lastLanding,pokes,giggles,
    pump:{...pump.snapshot,centre:boilerRoom.pump.centre.toArray(),
      half:boilerRoom.pump.half.toArray(),inside:pumpInside},
    mood:mood.mood,
    faultPump:()=>{pump.faulted=true;pump.unattendedTime=0;pump.faultCount++;},
    boilers:boilers.map((b,i)=>({...b.snapshot,
      centre:boilerRoom.boilers[i].centre.toArray(),
      half:boilerRoom.boilers[i].half.toArray(),inside:inside[i]})),
    setBoilerPressure:(index:number,pressure:number)=>{boilers[index].pressure=Math.max(0,Math.min(1,pressure));},
    walls:boilerRoom.collisionBoxes.map(w=>({center:[w.center.x,w.center.y,w.center.z],
      half:[w.halfSize.x,w.halfSize.y,w.halfSize.z],
      axes:[[w.xAxis.x,w.xAxis.y,w.xAxis.z],[w.yAxis.x,w.yAxis.y,w.yAxis.z],[w.zAxis.x,w.zAxis.y,w.zAxis.z]]})),
    inspectLegPose:(pose:{positions:number[];legState:LegSnapshot;armState?:ReturnType<typeof baby.arms.snapshot>;view?:[number,number,number];animateAccessories?:boolean})=>{
      const positions=pose.positions;
      if(positions.length!==body.x.length||positions.some(v=>!Number.isFinite(v)))throw new Error('Invalid inspection pose');
      reset();inspectionPaused=true;inspectionAccessories=!!pose.animateAccessories;body.x.set(positions);body.previous.set(positions);body.velocity.fill(0);body.updateSurface();
      baby.resetFace();baby.legs.restoreInspection(pose.legState);if(pose.armState)baby.arms.restoreInspection(pose.armState);input.recenter();input.update(10);
      camera.position.copy(input.controls.target).add(new THREE.Vector3(...(pose.view??[.025,.11,.23] as const)));input.controls.update();
    },
    // Replay measured physics states for repeatable prototype screenshot review.
    inspectPose:(positions:number[])=>{
      if(positions.length!==body.x.length||positions.some(v=>!Number.isFinite(v)))throw new Error('Invalid inspection pose');
      reset();inspectionPaused=true;inspectionAccessories=false;body.x.set(positions);body.previous.set(positions);body.velocity.fill(0);body.updateSurface();baby.resetFace();input.recenter();input.update(10);
      camera.position.copy(input.controls.target).add(new THREE.Vector3(.025,.13,.27));input.controls.update();
    },
    thickness:[Math.min(...body.surface.geometry.attributes.opticalThickness.array),Math.max(...body.surface.geometry.attributes.opticalThickness.array)],
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
  stage('Letting the pressure settle…');
  // Let contact establish itself before displaying the first frame.
  for(let i=0;i<80;i++){rig.step(PHYS.step);body.step(PHYS.step);}
  body.updateSurface();baby.update();input.update(1);
  optics.update(renderer,body,true);
  await transport.update();
  stage('Stoking the boiler…');
  await renderer.compileAsync(scene,camera);
  stage('Starting the shift…');
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
      const dt=Math.min(.05,Math.max(0,(time-lastTime)/1000));lastTime=time;
      if(document.hidden){physicsClock.reset();return;}
      const steps=physicsClock.advance(inspectionPaused?0:dt,()=>{
        input.step(PHYS.step);rig.step(PHYS.step);
        body.step(PHYS.step);walls.resolveBoxes(wallsNearBody());input.afterPhysicsStep();rig.afterStep();
      });
      if(steps&&body.surfaceDirty) {
        if(!body.isFinite())throw new Error('The soft-body simulation produced an invalid state');
        body.updateSurface();
      }
      if(!inspectionPaused||inspectionAccessories)baby.update(dt);
      if(observeFrame(dt))resize();
      transport.rate=quality.opticalHz;
      reactions.advance(dt);
      stepBoilers(dt);
      stepPump(dt);
      splash.update(dt);
      steam.update(dt);
      input.update(dt);
      sound.listen(camera);
      transport.follow();
      optics.update(renderer,body);
      floor.mesh.position.x=body.center.x;floor.mesh.position.z=body.center.z;
      void transport.update().catch(fail);
      const faceVersion=baby.group.children.reduce((sum,child)=>sum+(((child as THREE.Mesh).geometry?.attributes.position as THREE.BufferAttribute|undefined)?.version??0),0);
      const thicknessVersion=body.surface.geometry.attributes.opticalThickness.version;
      const size=renderer.domElement.width+','+renderer.domElement.height;
      if(!body.sleeping||splash.active||steam.active||renderedLegs!==baby.accessoryRevision||renderedSurface!==body.surfaceRevision||renderedFace!==faceVersion||
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
    composite.dispose();baby.dispose();floor.dispose();boilerRoom.dispose();splash.dispose();steam.dispose();environment.dispose();optics.dispose();renderer.dispose();
  };
  window.addEventListener('pagehide',event=>{if(!event.persisted)dispose();});
  if(import.meta.hot)import.meta.hot.dispose(dispose);
  return {stop:dispose};
}
