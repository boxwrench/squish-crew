import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SoftBody } from '../physics/soft-body.js';
import type { Locomotion } from './locomotion.ts';
import type { JellySound } from './sound.ts';
import { surfaceGrab, projectGrabTarget, advanceGrabTarget } from '../physics/grab.ts';
import { MAX_GRABS } from '../physics/soft-body-kernel.js';
import { SurfaceBVH } from '../graphics/refractive-light.js';

type PointerGrab={
  grab:NonNullable<ReturnType<typeof surfaceGrab>>;
  pointerType:string;
  plane:THREE.Plane;
  rawTarget:THREE.Vector3;
  releasePending:boolean;
  releaseStepsRemaining:number;
  physicsSteps:number;
  commandVersion:number;
  consumedVersion:number;
  downX:number;
  downY:number;
  downTime:number;
  moved:boolean;
  tap:boolean;
};

export class Input {
  /** Facilities temporarily own the body while orbit controls remain available. */
  bodyControlled:()=>boolean=()=>false;
  /**
   * Normalized grip stretch, reported to the runtime so it can drive character
   * reactions. Input stays unaware of how any reaction is produced.
   */
  onStretch:(amount:number)=>void=()=>{};
  /** A qualifying tap on the mascot, for the runtime's own reaction gating. */
  onPoke:()=>void=()=>{};
  facilityCameraDistance:()=>number|undefined=()=>undefined;
  readonly controls:OrbitControls;
  private touchKeys=new Map<number,string>();
  private grabs=new Map<number,PointerGrab>();
  private raycaster=new THREE.Raycaster();
  private grabBVH:SurfaceBVH;
  private pointer=new THREE.Vector2();
  private temp=new THREE.Vector3();
  private follow=new THREE.Vector3();
  private abort=new AbortController();
  private canvas:HTMLCanvasElement;
  readonly camera:THREE.PerspectiveCamera;
  readonly body:SoftBody;
  readonly mesh:THREE.Mesh;
  readonly rig:Locomotion;
  readonly sound:JellySound;
  readonly reset:()=>void;
  constructor(camera:THREE.PerspectiveCamera,canvas:HTMLCanvasElement,
    body:SoftBody,mesh:THREE.Mesh,rig:Locomotion,sound:JellySound,
    reset:()=>void) {
    this.camera=camera;this.body=body;this.mesh=mesh;this.rig=rig;this.sound=sound;this.reset=reset;
    this.canvas=canvas;this.grabBVH=new SurfaceBVH(body.surface);
    this.controls=new OrbitControls(camera,canvas);
    const c=this.controls;
    c.target.copy(body.center);this.follow.copy(c.target);
    c.enablePan=false;c.enableDamping=true;c.dampingFactor=.07;
    c.minDistance=.135;c.maxDistance=.42;c.minPolarAngle=.22;c.maxPolarAngle=1.10;
    c.rotateSpeed=.65;c.zoomSpeed=.65;c.update();
    c.touches.ONE=THREE.TOUCH.ROTATE;c.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
    const signal=this.abort.signal;
    canvas.addEventListener('pointerdown',this.begin,{capture:true,signal});
    canvas.addEventListener('pointermove',this.pointerMove,{capture:true,passive:false,signal});
    // Window-level release is deliberate. Pointer capture should deliver these
    // through the canvas, but this closes the failure mode where a browser/OS
    // transition loses that path and leaves a grip wedged forever.
    window.addEventListener('pointerup',this.end,{capture:true,signal});
    window.addEventListener('pointercancel',this.end,{capture:true,signal});
    canvas.addEventListener('lostpointercapture',this.end,{signal});
    window.addEventListener('keydown',this.keyDown,{signal});
    window.addEventListener('blur',this.clear,{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden) this.clear();},{signal});
    for(const button of document.querySelectorAll<HTMLButtonElement>('[data-control]')) {
      button.addEventListener('pointerdown',e=>{
        e.preventDefault();void sound.unlock().catch(()=>{});button.setPointerCapture(e.pointerId);
        const code=button.dataset.control!;
        this.touchKeys.set(e.pointerId,code);button.classList.add('held');
        if(code==='Space'&&!this.bodyControlled()) {this.sound.hop();rig.jump();}
      },{signal});
      const release=(e:PointerEvent)=>{
        this.touchKeys.delete(e.pointerId);button.classList.remove('held');
      };
      button.addEventListener('pointerup',release,{signal});
      button.addEventListener('pointercancel',release,{signal});
      button.addEventListener('lostpointercapture',release,{signal});
    }
  }
  private eventRay(e:PointerEvent) {
    const rect=this.canvas.getBoundingClientRect();
    this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    this.camera.updateMatrixWorld();this.raycaster.setFromCamera(this.pointer,this.camera);
  }
  private captureDragTarget(e:PointerEvent,state:PointerGrab) {
    // The final coalesced sample is the newest physical pointer position. Using
    // it also makes very fast high-polling-rate mouse motion deterministic.
    const samples=e.getCoalescedEvents?.()??[];
    const sample=samples.length?samples[samples.length-1]:e;
    if(Math.hypot(sample.clientX-state.downX,sample.clientY-state.downY)>8)state.moved=true;
    this.eventRay(sample);
    if(projectGrabTarget(this.raycaster.ray,state.plane,this.temp)) {
      state.rawTarget.copy(this.temp);state.commandVersion++;
      const stretch=Math.min(1,state.rawTarget.distanceTo(state.grab.point)/.08);
      this.sound.stretch(stretch);this.onStretch(stretch);
      return true;
    }
    return false;
  }
  private begin=(e:PointerEvent)=>{
    if(this.bodyControlled())return;
    if(e.button!==0)return;
    // At low frame rates a tap's release can still be waiting for its final
    // physics sample when the next pointerdown arrives. Finish only a release
    // already classified as an unmoved tap, so rapid same-pointer pokes are
    // counted; never flush a drag, whose pending sample carries its throw.
    const prior=this.grabs.get(e.pointerId);
    if(prior) {
      if(!prior.releasePending||!prior.tap)return;
      this.finishRelease(e.pointerId);
    }
    if(this.body.grabs.length>=MAX_GRABS)return;
    // Only touch can add simultaneous grips; desktop mouse/pen keep one grip.
    if(this.body.grab&&(e.pointerType!=='touch'||[...this.grabs.values()].some(state=>state.pointerType!=='touch')))return;
    this.eventRay(e);
    // Exact picking against the same full-resolution deformed surface that is
    // rendered, but through its refittable BVH instead of Three's linear
    // triangle scan. This changes no grip position or binding semantics.
    this.grabBVH.refit();
    const ray=this.raycaster.ray,o=[ray.origin.x,ray.origin.y,ray.origin.z],d=[ray.direction.x,ray.direction.y,ray.direction.z];
    const hit=this.grabBVH.hit(o,d);if(!hit)return;
    const ix=this.body.surface.indices,offset=hit.t*3;
    const face={a:ix[offset],b:ix[offset+1],c:ix[offset+2]};
    const point=ray.at(hit.distance,new THREE.Vector3());
    void this.sound.unlock().catch(()=>{});
    e.preventDefault();e.stopImmediatePropagation();
    const grab=surfaceGrab(this.body,face,point);if(!grab)return;
    this.body.grabs.push(grab);this.body.wake();
    void this.sound.unlock().then(()=>this.sound.grab()).catch(()=>{});
    this.camera.getWorldDirection(this.temp);
    this.grabs.set(e.pointerId,{
      grab,pointerType:e.pointerType,
      plane:new THREE.Plane().setFromNormalAndCoplanarPoint(this.temp,point),rawTarget:point.clone(),
      releasePending:false,releaseStepsRemaining:0,physicsSteps:0,commandVersion:0,consumedVersion:0,
      downX:e.clientX,downY:e.clientY,downTime:performance.now(),moved:false,tap:false,
    });
    this.controls.enabled=false;
    this.canvas.setPointerCapture(e.pointerId);this.canvas.classList.add('grabbing');
  };
  private pointerMove=(e:PointerEvent)=>{
    const state=this.grabs.get(e.pointerId);
    if(state&&!state.releasePending) {
      if(e.pointerType==='mouse'&&(e.buttons&1)===0) {
        // Recover even if pointerup/lostpointercapture was swallowed externally.
        this.end(e);return;
      }
      e.preventDefault();e.stopImmediatePropagation();this.captureDragTarget(e,state);
    } else if(!this.body.grab&&e.pointerType==='mouse') {
      this.eventRay(e);
      // Hover is only a cursor hint. Pointer-down resolves the exact visible
      // triangle through the refittable BVH, not a linear triangle scan.
      this.canvas.style.cursor=this.mesh.geometry.boundingBox&&this.raycaster.ray.intersectsBox(this.mesh.geometry.boundingBox)?'grab':'default';
    }
  };
  private end=(e:PointerEvent)=>{
    const state=this.grabs.get(e.pointerId);
    if(!state||state.releasePending)return;
    // pointerup itself may be the only event carrying an abrupt drag endpoint.
    if(e.type==='pointerup')this.captureDragTarget(e,state);
    e.preventDefault();e.stopImmediatePropagation();
    // Mark released before releasing capture, which may itself dispatch an event.
    state.releasePending=true;
    state.tap=e.type==='pointerup'&&!state.moved&&performance.now()-state.downTime<280&&this.grabs.size===1;
    if(e.type==='pointerup')this.sound.release(Math.min(1,state.rawTarget.distanceTo(state.grab.point)/.08));
    this.sound.stopStretch();this.onStretch(0);
    state.releaseStepsRemaining=state.physicsSteps===0?2:1;
    if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    this.syncGrabControls();
    // Retain each released grip until physics consumes its final target sample.
  };
  private syncGrabControls() {
    this.controls.enabled=this.body.grabs.length===0;
    this.canvas.classList.toggle('grabbing',[...this.grabs.values()].some(state=>!state.releasePending));
  }
  private finishRelease=(id?:number)=>{
    const ids=id===undefined?[...this.grabs.keys()]:[id];
    for(const pointerId of ids) {
      const state=this.grabs.get(pointerId);if(!state)continue;
      this.grabs.delete(pointerId);
      const index=this.body.grabs.indexOf(state.grab);
      if(index!==-1)this.body.grabs.splice(index,1);
      if(!this.body.grabs.length)this.body.grabSliding=false;// normal floor friction returns at once
      if(id!==undefined&&state.tap&&this.body.grabs.length===0&&!this.bodyControlled()) {
        this.sound.hop();this.rig.jump();this.onPoke();
      }
      if(this.canvas.hasPointerCapture(pointerId))this.canvas.releasePointerCapture(pointerId);
    }
    if(id===undefined)this.body.grab=null;
    this.body.wake();this.syncGrabControls();
  };
  private keyDown=(e:KeyboardEvent)=>{
    if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(e.code==='Space'&&(e.target as HTMLElement)?.closest('button'))return;
    if(e.code==='Space') {e.preventDefault();void this.sound.unlock().catch(()=>{});}
    if(e.code==='Space'&&!e.repeat&&!this.bodyControlled()) {this.sound.hop();this.rig.jump();}
    if(e.code==='KeyR'&&!e.repeat)this.reset();
    if(e.code==='Escape')this.finishRelease();
  };
  clear=()=>{
    this.touchKeys.clear();
    this.sound.stopStretch();this.onStretch(0);
    this.finishRelease();this.rig.move.set(0,0,0);
    document.querySelectorAll('.held').forEach(el=>el.classList.remove('held'));
  };
  step(h:number) {
    if(this.bodyControlled()){this.rig.move.set(0,0,0);return;}
    this.rig.move.set(0,0,0);
    for(const state of this.grabs.values()) {
      const grab=state.grab;
      advanceGrabTarget(grab.target,state.rawTarget,h,grab.point);
      state.consumedVersion=state.commandVersion;state.physicsSteps++;
    }
  }
  /** Called immediately after body.step() for the same fixed substep. */
  afterPhysicsStep() {
    for(const [id,state] of this.grabs) {
      if(state.releasePending&&state.consumedVersion===state.commandVersion) {
        state.releaseStepsRemaining--;
        if(state.releaseStepsRemaining<=0)this.finishRelease(id);
      }
    }
  }
  update(dt:number) {
    this.controls.minDistance=this.facilityCameraDistance()??.135;
    // External resets must never leave pointer capture or orbit state wedged.
    for(const [id,state] of this.grabs)if(!this.body.grabs.includes(state.grab))this.finishRelease(id);
    if(this.body.grab)return; // Freeze both orbit and translation for the entire grab.
    const target=this.temp.copy(this.body.center);target.y=Math.max(.025,target.y);
    this.follow.lerp(target,1-Math.exp(-4.5*dt));
    this.temp.copy(this.follow).sub(this.controls.target);
    this.camera.position.add(this.temp);this.controls.target.copy(this.follow);
    this.controls.update();
  }
  recenter() {this.clear();this.rig.reset();}
  dispose() {this.clear();this.abort.abort();this.controls.dispose();}
}
