import type { PerspectiveCamera } from 'three/webgpu';
import { FacilityAudio, type FacilitySoundEvent } from './facility-sound.ts';
import { squealVoice } from './reactions.ts';

type AudioWindow=Window&{webkitAudioContext?:typeof AudioContext};
type ToneShape=OscillatorType;
const MUSIC_URL=new URL('../assets/music/Steam_Valve_Open_loop.mp3',import.meta.url).href;
/** Declined resume attempts before the context is rebuilt from scratch. */
const REBUILD_AFTER=3;
const HOP_SCALE=[261.63,293.66,329.63,392,440,523.25];

/** One shared Web Audio graph for physical contact, cartoon cues, and music. */
export class JellySound {
  private context:AudioContext|null=null;
  private master:GainNode|null=null;
  private sfxGain:GainNode|null=null;
  private musicGain:GainNode|null=null;
  private compressor:DynamicsCompressorNode|null=null;
  private resumePromise:Promise<void>|null=null;
  private outputPrimed=false;
  private facilities:FacilityAudio|null=null;
  private listener={x:0,y:.12,z:.19,rightX:1,rightZ:0};
  private abort=new AbortController();
  private gestureCount=0;
  private resumeCount=0;
  private rebuilds=0;
  private musicFetchOk:boolean|null=null;
  private humOscillator:OscillatorNode|null=null;
  private humGain:GainNode|null=null;
  private humFilter:BiquadFilterNode|null=null;
  private stretchOscillator:OscillatorNode|null=null;
  private stretchGain:GainNode|null=null;
  private stretchFilter:BiquadFilterNode|null=null;
  private musicTimer:number|null=null;
  private musicStarted=false;
  private musicEnabled=true;
  private musicSource:AudioBufferSourceNode|null=null;
  private musicBuffer:AudioBuffer|null=null;
  private musicFetchPromise:Promise<ArrayBuffer|null>|null=null;
  private musicDecodePromise:Promise<AudioBuffer|null>|null=null;
  private hopIndex=0;
  private musicStep=0;
  private musicNextTime=0;
  muted=false;

  constructor() {
    const signal=this.abort.signal;
    // The loop MP3 is small (~634 KB): start downloading it right away so the
    // network leg usually finishes while the game is still loading. Fetching
    // needs no AudioContext and never blocks startup; decoding and playback
    // still wait for the first unlock, so autoplay rules are unchanged.
    this.musicFetchPromise=fetch(MUSIC_URL).then(response=>{
      if(!response.ok)throw new Error(`Music request failed: ${response.status}`);
      return response.arrayBuffer();
    }).then(
      data=>{this.musicFetchOk=true;return data;},
      ()=>{this.musicFetchOk=false;return null;});
    for(const type of ['pointerdown','pointerup','touchstart','touchend','click','keydown'])
      window.addEventListener(type,this.unlockFromGesture,{passive:true,signal});
    document.addEventListener('visibilitychange',this.handleVisibility,{signal});
  }

  private unlockFromGesture=()=>{this.gestureCount++;void this.unlock().catch(()=>{});};

  /** Audio state for the DEV hook and the opt-in ?audio on-device readout. */
  debugAudio() {
    return {gestures:this.gestureCount,resumes:this.resumeCount,rebuilds:this.rebuilds,muted:this.muted,
      context:this.context?.state??'none',musicFetch:this.musicFetchOk,
      musicStarted:this.musicStarted,musicBuffered:!!this.musicBuffer,
      musicSource:!!this.musicSource};
  }

  private handleVisibility=()=>{
    if(document.hidden) {
      this.stopFacilities();
      this.stopMusicScheduler();
      if(this.context?.state==='running')void this.context.suspend().catch(()=>{});
    } else if(this.context&&!this.muted) {
      void this.unlock().catch(()=>{});
    }
  };

  private createContext() {
    const Context=window.AudioContext??(window as AudioWindow).webkitAudioContext;
    if(!Context)return null;
    let context:AudioContext|null=null;
    try {
      context=new Context();
      const master=context.createGain();master.gain.value=this.muted?0:.62;
      const sfx=context.createGain();sfx.gain.value=1;
      const music=context.createGain();music.gain.value=0;
      const compressor=context.createDynamicsCompressor();
      compressor.threshold.value=-14;compressor.ratio.value=5;
      sfx.connect(master);music.connect(master);master.connect(compressor).connect(context.destination);
      this.context=context;this.master=master;this.sfxGain=sfx;this.musicGain=music;this.compressor=compressor;
      this.facilities=new FacilityAudio(context,sfx);
      return context;
    } catch {
      if(context&&context.state!=='closed')void context.close().catch(()=>{});
      return null;
    }
  }

  private primeOutput(context:AudioContext) {
    if(this.outputPrimed)return;
    const source=context.createBufferSource();
    source.buffer=context.createBuffer(1,1,context.sampleRate);source.connect(context.destination);source.start();
    source.onended=()=>source.disconnect();this.outputPrimed=true;
  }

  /**
   * Tear down a context that will not start and build a fresh one. Chrome can
   * wedge a context created at an unlucky moment so that every resume() is
   * declined; a new one made inside a real gesture normally starts straight up.
   */
  private rebuildContext() {
    const dead=this.context;
    this.stopMusicScheduler();this.musicSource=null;this.musicStarted=false;
    this.musicBuffer=null;this.musicDecodePromise=null;
    this.facilities?.dispose();this.facilities=null;
    this.context=null;this.master=null;this.sfxGain=null;this.musicGain=null;this.compressor=null;
    this.humOscillator=null;this.humGain=null;this.humFilter=null;
    this.stretchOscillator=null;this.stretchGain=null;this.stretchFilter=null;
    this.outputPrimed=false;this.resumePromise=null;this.resumeCount=0;this.rebuilds++;
    if(dead&&dead.state!=='closed')void dead.close().catch(()=>{});
    // The old fetch body was consumed by the dead context's decode, so ask again.
    this.musicFetchPromise=fetch(MUSIC_URL).then(response=>{
      if(!response.ok)throw new Error(`Music request failed: ${response.status}`);
      return response.arrayBuffer();
    }).then(data=>{this.musicFetchOk=true;return data;},()=>{this.musicFetchOk=false;return null;});
    return this.createContext();
  }

  unlock() {
    let context=this.context??this.createContext();
    if(!context||context.state==='closed')return Promise.resolve();
    if(context.state==='suspended'&&this.resumeCount>=REBUILD_AFTER) {
      const fresh=this.rebuildContext();
      if(!fresh)return Promise.resolve();
      context=fresh;
      if(context.state==='running') {this.primeOutput(context);this.startMusic();return Promise.resolve();}
    }
    this.primeOutput(context);
    if(context.state==='running') {this.startMusic();return Promise.resolve();}
    // Chrome leaves resume() *pending* rather than rejecting when it declines
    // to start a context, so caching that promise and returning it on later
    // gestures means one declined attempt blocks every retry and audio never
    // arrives. Each gesture gets its own attempt; resume() on an already
    // running context resolves immediately, so retrying costs nothing.
    let attempt:Promise<void>;
    try {
      this.resumeCount++;
      attempt=context.resume().then(()=>this.startMusic()).catch(()=>{});
    } catch {return Promise.resolve();}
    this.resumePromise=attempt;
    void attempt.then(()=>{if(this.resumePromise===attempt)this.resumePromise=null;});
    return attempt;
  }

  toggle() {
    this.muted=!this.muted;
    if(this.muted) {
      this.stopFacilities();this.stopStretch();this.stopHum();this.stopMusicScheduler();this.stopMusicTrack();this.musicStarted=false;
    }
    if(this.context&&this.master) {
      const t=this.context.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted?0:.62,t,.025);
      if(!this.muted)this.startMusic();
    }
    return this.muted;
  }

  listen(camera:PerspectiveCamera) {
    const {x,y,z}=camera.position,e=camera.matrixWorld.elements;
    this.listener={x,y,z,rightX:e[0],rightZ:e[2]};
  }

  facility=(event:FacilitySoundEvent)=>{
    if(this.muted||document.hidden)return;
    const l=this.listener,dx=event.x-l.x,dy=event.y-l.y,dz=event.z-l.z,distance=Math.hypot(dx,dy,dz);
    this.facilities?.play(event,distance,(dx*l.rightX+dz*l.rightZ)/Math.max(.12,distance));
  };

  stopFacilities() {this.facilities?.stop();}

  private tone(start:number,from:number,to:number,duration:number,level:number,shape:ToneShape='triangle',output=this.sfxGain) {
    const ctx=this.context;
    if(!ctx||!output||ctx.state!=='running'||this.muted)return;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=shape;osc.frequency.setValueAtTime(Math.max(20,from),start);
    if(Math.abs(to-from)>1)osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),start+duration*.82);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),start+Math.min(.018,duration*.15));
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    osc.connect(gain).connect(output);osc.start(start);osc.stop(start+duration+.015);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }

  private noise(start:number,duration:number,level:number,frequency:number,q:number=1,output=this.sfxGain) {
    const ctx=this.context;
    if(!ctx||!output||ctx.state!=='running'||this.muted)return;
    const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*Math.min(.045,duration*.28)));
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=q;
    gain.gain.setValueAtTime(level,start);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    source.connect(filter).connect(gain).connect(output);source.start(start);source.stop(start+duration+.01);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }

  hop() {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime,note=HOP_SCALE[this.hopIndex++%HOP_SCALE.length];
    // The boing rises into a note from the music's C-major palette instead of
    // ending as an unrelated cartoon pitch.
    this.tone(t,note*.58,note,.24,.22,'triangle');this.tone(t+.015,note*1.5,note*1.5,.19,.08,'sine');
  }

  grab() {
    const ctx=this.context;if(!ctx||this.muted)return;
    this.tone(ctx.currentTime,560,860,.075,.09,'sine');
  }

  /** A single oscillator voice whose pitch follows stretch amount. */
  stretch(amount:number) {
    const ctx=this.context,output=this.sfxGain;
    if(!ctx||!output||ctx.state!=='running'||this.muted)return;
    const value=Math.max(0,Math.min(1,amount));
    if(value<.025) {this.stopStretch();return;}
    const t=ctx.currentTime;
    if(!this.stretchOscillator) {
      const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      osc.type='sine';filter.type='bandpass';filter.Q.value=6;filter.frequency.value=700;
      gain.gain.value=.0001;osc.connect(filter).connect(gain).connect(output);osc.start();
      osc.onended=()=>{osc.disconnect();gain.disconnect();filter.disconnect();if(this.stretchOscillator===osc)this.stretchOscillator=null;};
      this.stretchOscillator=osc;this.stretchGain=gain;this.stretchFilter=filter;
    }
    const osc=this.stretchOscillator,gain=this.stretchGain,filter=this.stretchFilter;
    if(!osc||!gain||!filter)return;
    // One voice for the whole grab: only its parameters move, so a light drag
    // stays silent and only an extreme pull becomes a comic squeal.
    const voice=squealVoice(value);
    osc.frequency.setTargetAtTime(voice.frequency,t,.025);
    filter.frequency.setTargetAtTime(voice.filter,t,.03);
    gain.gain.setTargetAtTime(Math.max(.0001,voice.gain),t,.025);
  }

  stopStretch() {
    const ctx=this.context,osc=this.stretchOscillator,gain=this.stretchGain;
    if(!ctx||!osc||!gain)return;
    const t=ctx.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(.0001,t,.035);
    // Letting go drops the squeal's pitch as it fades, instead of cutting it.
    osc.frequency.cancelScheduledValues(t);osc.frequency.setTargetAtTime(240,t,.05);
    osc.stop(t+.16);this.stretchOscillator=null;this.stretchGain=null;this.stretchFilter=null;
  }

  release(speed:number) {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,speed));
    this.tone(t,430+amount*110,155,.20,.12+.05*amount,'triangle');
  }

  contact(speed:number,foot:boolean) {
    const ctx=this.context, out=this.sfxGain;
    // Contact is called from the fixed-step loop, which can run before the
    // first user gesture unlocks Web Audio. Do not queue a stale landing while
    // the context is suspended; all other SFX follow this same rule.
    if(!ctx||!out||ctx.state!=='running'||this.muted)return;
    const t=ctx.currentTime,strength=Math.min(1,speed/.8);
    // Damped membrane modes remain the physical base, with a rounder cartoon plup.
    const base=(foot?185:118)+Math.random()*16;
    for(const [ratio,level,decay] of [[1,.34,.16],[1.63,.15,.10],[2.7,.055,.045]]) {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(base*ratio*(1+strength*.9),t);
      osc.frequency.exponentialRampToValueAtTime(base*ratio*.62,t+.075);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(level*(.16+strength),t+.004);
      gain.gain.exponentialRampToValueAtTime(.0001,t+decay*(1+strength));
      osc.connect(gain).connect(out);osc.start(t);osc.stop(t+.35);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
    this.noise(t,.065,.12*strength,foot?900:570,1.4,out);
  }

  /**
   * A short vocal "oof" for a hard landing: a low formant-shaped voice sliding
   * downward with a breath of noise. Layered over contact(), never replacing it.
   */
  /**
   * One short voiced pulse through a two-formant vowel filter. The pair of
   * band-passes is what makes a sawtooth read as a voice rather than a buzz,
   * and it puts the energy well above the contact thud's own low band.
   */
  private voice(start:number,base:number,bend:number,duration:number,level:number,
    f1:[number,number],f2:[number,number],breath:number) {
    const ctx=this.context,out=this.sfxGain;
    if(!ctx||!out||ctx.state!=='running'||this.muted)return;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='sawtooth';
    osc.frequency.setValueAtTime(base,start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20,base*bend),start+duration*.78);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,level),start+Math.min(.026,duration*.22));
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    const nodes=[osc,gain];
    // The source is a low cartoon voice (roughly 150–180 Hz), so its audible
    // harmonics are sparse. Narrow filters (Q7/Q9) throw most of that energy
    // away and let the contact thud/music mask the reaction. Wider formants
    // preserve the vowel colour while keeping this voice short and contained.
    for(const [[from,to],q,share] of [[f1,4.5,1],[f2,5.5,.62]] as const) {
      const formant=ctx.createBiquadFilter(),tap=ctx.createGain();
      formant.type='bandpass';formant.Q.value=q;
      formant.frequency.setValueAtTime(from,start);
      formant.frequency.exponentialRampToValueAtTime(Math.max(40,to),start+duration*.78);
      tap.gain.value=share;
      gain.connect(formant).connect(tap).connect(out);
      nodes.push(formant,tap);
    }
    osc.connect(gain);osc.start(start);osc.stop(start+duration+.02);
    osc.onended=()=>{for(const node of nodes)node.disconnect();};
    if(breath>0)this.noise(start,Math.min(.05,duration*.6),breath,f2[0]*.9,1.1,out);
  }

  /**
   * A short vocal "oof" for a hard landing. It starts a beat after the physical
   * contact so the two transients do not fight: the floor lands, then he reacts.
   */
  grunt(strength:number) {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime+.028,amount=Math.max(0,Math.min(1,strength));
    const base=150+Math.random()*22;
    // An "uh" that falls away, the vowel a winded person actually makes.
    this.voice(t,base,.58,.20,.16+.28*amount,[650,450],[1120,820],.035+.05*amount);
  }

  /** A tiny delighted "hee-hee-hee" for being poked once too often. */
  giggle() {
    const ctx=this.context;if(!ctx||this.muted)return;
    // A poke also fires the hop boing, so the giggle waits for its attack to
    // pass rather than competing with it: boing first, then he laughs.
    const t=ctx.currentTime+.10,base=232+Math.random()*26;
    // Three very short bright pulses: the first two lift a little, the last
    // settles. A light "ee" vowel and a breath of air keep it cute, well
    // above the grunt's low "uh" and nothing like the continuous squeal.
    const bends=[1.07,1.04,.9],levels=[.24,.22,.18];
    for(let i=0;i<3;i++) {
      const at=t+i*.095+(i?Math.random()*.014:0);
      this.voice(at,base*(1+Math.random()*.03-.015),bends[i],.07,levels[i],[450,400],[2200,1900],.02);
    }
  }

  /**
   * The circulation pump's continuous note. One voice for the whole session,
   * exactly like the stretch squeal: `speed` 1 is a calm hum, 0 is a stalled
   * motor groaning at the bottom of its range.
   */
  pumpHum(speed:number) {
    const ctx=this.context,output=this.sfxGain;
    if(!ctx||!output||ctx.state!=='running'||this.muted){this.stopHum();return;}
    const t=ctx.currentTime,value=Math.max(0,Math.min(1,speed));
    if(!this.humOscillator) {
      const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
      osc.type='sawtooth';filter.type='lowpass';filter.Q.value=3;filter.frequency.value=220;
      gain.gain.value=.0001;osc.connect(filter).connect(gain).connect(output);osc.start();
      osc.onended=()=>{osc.disconnect();gain.disconnect();filter.disconnect();
        if(this.humOscillator===osc)this.humOscillator=null;};
      this.humOscillator=osc;this.humGain=gain;this.humFilter=filter;
    }
    const osc=this.humOscillator,gain=this.humGain,filter=this.humFilter;
    if(!osc||!gain||!filter)return;
    osc.frequency.setTargetAtTime(46+value*28,t,.12);
    filter.frequency.setTargetAtTime(140+value*260,t,.15);
    // A stalled motor is quieter but not silent: it is still trying.
    gain.gain.setTargetAtTime(.014+value*.020,t,.12);
  }

  stopHum() {
    const ctx=this.context,osc=this.humOscillator,gain=this.humGain;
    if(!ctx||!osc||!gain)return;
    const t=ctx.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(.0001,t,.05);
    osc.stop(t+.2);this.humOscillator=null;this.humGain=null;this.humFilter=null;
  }

  /** A stalled pump coughing: a low irregular chug rather than a clean tone. */
  sputter(strength:number) {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,strength));
    for(let i=0;i<3;i++) {
      const at=t+i*(.055+Math.random()*.045);
      this.tone(at,120+Math.random()*40,64,.06,.03+.045*amount,'square');
      this.noise(at,.045,.02+.03*amount,420+Math.random()*260,1.2);
    }
  }

  /** A solid mechanical hit on the pump housing: a thump, not a bell. */
  thunk(strength:number) {
    const ctx=this.context,out=this.sfxGain;
    if(!ctx||!out||ctx.state!=='running'||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,strength));
    for(const [from,to,level,decay] of [[210,86,.26,.16],[128,58,.16,.24]]) {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(from,t);
      osc.frequency.exponentialRampToValueAtTime(to,t+decay*.7);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(level*(.4+.6*amount),t+.005);
      gain.gain.exponentialRampToValueAtTime(.0001,t+decay);
      osc.connect(gain).connect(out);osc.start(t);osc.stop(t+decay+.05);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
    this.noise(t,.055,.07+.09*amount,760,1.6,out);
  }

  /** Struck boiler plate: inharmonic metal partials over a short bright hit. */
  clang(strength:number) {
    const ctx=this.context,out=this.sfxGain;
    if(!ctx||!out||ctx.state!=='running'||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,strength));
    const base=470+Math.random()*90;
    // Deliberately non-integer ratios: a tuned stack would read as a bell.
    for(const [ratio,level,decay] of [[1,.10,.55],[2.37,.062,.40],[3.81,.038,.26],[5.43,.022,.16]]) {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(base*ratio,t);
      osc.frequency.exponentialRampToValueAtTime(base*ratio*.985,t+decay);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(level*(.35+.65*amount),t+.004);
      gain.gain.exponentialRampToValueAtTime(.0001,t+decay);
      osc.connect(gain).connect(out);osc.start(t);osc.stop(t+decay+.05);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
    this.noise(t,.09,.10+.12*amount,2400,.8,out);
  }

  /**
   * Escaping steam: filtered noise with a swelling body, long for a relief
   * vent and short for the puff a strike knocks loose.
   */
  steam(strength:number,duration=.55) {
    const ctx=this.context,out=this.sfxGain;
    if(!ctx||!out||ctx.state!=='running'||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,strength));
    const length=Math.max(.12,duration);
    const buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*length),ctx.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    source.buffer=buffer;
    filter.type='bandpass';filter.Q.value=.7;
    filter.frequency.setValueAtTime(1500,t);
    filter.frequency.linearRampToValueAtTime(3800,t+length*.35);
    filter.frequency.linearRampToValueAtTime(2200,t+length);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.linearRampToValueAtTime(.045+.13*amount,t+Math.min(.09,length*.22));
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    source.connect(filter).connect(gain).connect(out);source.start(t);source.stop(t+length+.02);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }

  /** One tiny "pfft/plink" per sweat burst, never per droplet. */
  sweat(strength:number) {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,strength));
    this.noise(t,.045,.018+.022*amount,2600,1.7);
    this.tone(t+.012,1250,1850,.038,.014+.012*amount,'sine');
  }

  splash(strength:number) {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime,amount=Math.max(0,Math.min(1,strength));
    this.noise(t,.11,.08+.12*amount,1550,1.1);
    for(let i=0;i<3;i++)this.tone(t+.018+i*.025,900+i*180,1450+i*230,.055,.035+.025*amount,'sine');
  }

  reset() {
    const ctx=this.context;if(!ctx||this.muted)return;
    const t=ctx.currentTime;this.tone(t,330,330,.10,.075,'sine');this.tone(t+.09,495,495,.13,.065,'sine');
  }

  private startMusic() {
    const ctx=this.context,music=this.musicGain;
    if(!ctx||!music||ctx.state!=='running'||this.muted||document.hidden||!this.musicEnabled)return;
    const t=ctx.currentTime;
    if(!this.musicStarted) {
      this.musicStarted=true;this.musicStep=0;this.musicNextTime=t+.08;
      music.gain.cancelScheduledValues(t);music.gain.setValueAtTime(0,t);music.gain.linearRampToValueAtTime(.15,t+1.5);
    } else {
      music.gain.setTargetAtTime(.15,t,.06);
      // Visibility suspension can leave the old audio-clock deadline behind.
      if(this.musicNextTime<t-.1)this.musicNextTime=t+.08;
    }
    if(this.musicSource)return;
    if(this.musicDecodePromise===null) {
      const fetchPromise=this.musicFetchPromise;
      this.musicDecodePromise=(fetchPromise?fetchPromise.then(data=>{
        if(!data)throw new Error('Music fetch failed');
        return ctx.decodeAudioData(data);
      }):Promise.resolve(null)).catch(()=>null);
    }
    void this.musicDecodePromise.then(buffer=>{
      if(buffer)this.musicBuffer=buffer;
      if(this.musicBuffer&&this.context===ctx&&this.musicEnabled&&!this.muted&&!document.hidden) {
        this.startMusicTrack(ctx,this.musicBuffer);
      } else if(!this.musicBuffer&&this.context===ctx&&this.musicEnabled&&!this.muted&&!document.hidden&&this.musicTimer===null) {
        // Keep the old synthesized loop as a graceful offline/decode fallback.
        this.scheduleMusic();
      }
    });
  }

  private startMusicTrack(context:AudioContext,buffer:AudioBuffer) {
    if(this.musicSource||!this.musicGain||context.state!=='running')return;
    const source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.musicGain);
    source.onended=()=>{source.disconnect();if(this.musicSource===source)this.musicSource=null;};
    source.start(context.currentTime+.03);this.musicSource=source;
    this.stopMusicScheduler();
  }

  private stopMusicTrack() {
    const source=this.musicSource;this.musicSource=null;
    if(!source)return;
    try {source.stop();} catch { /* The source may already have ended. */ }
    source.disconnect();
  }

  private stopMusicScheduler() {
    if(this.musicTimer!==null) {window.clearTimeout(this.musicTimer);this.musicTimer=null;}
  }

  private scheduleMusic=()=>{
    this.musicTimer=null;
    const ctx=this.context,music=this.musicGain;
    if(!ctx||!music||ctx.state!=='running'||this.muted||document.hidden||!this.musicEnabled)return;
    const beat=60/95,lookAhead=.22,horizon=ctx.currentTime+lookAhead;
    while(this.musicNextTime<horizon) {
      this.scheduleMusicStep(this.musicStep,this.musicNextTime,beat);
      this.musicStep=(this.musicStep+1)%64;this.musicNextTime+=beat/2;
    }
    this.musicTimer=window.setTimeout(this.scheduleMusic,50);
  };

  private scheduleMusicStep(step:number,time:number,beat:number) {
    const melody:[number|null,number][]=[
      [0,1],[null,0],[4,1],[null,0],[7,1],[null,0],[4,1],[null,0],
      [2,1],[null,0],[4,1],[null,0],[7,1],[null,0],[9,1],[null,0],
      [7,1],[null,0],[4,1],[null,0],[2,1],[null,0],[4,1],[null,0],
      [0,1],[null,0],[4,1],[null,0],[7,1],[9,1],[7,1],[null,0],
      [0,1],[null,0],[2,1],[null,0],[4,1],[null,0],[7,1],[null,0],
      [9,1],[null,0],[7,1],[null,0],[4,1],[null,0],[2,1],[null,0],
      [0,1],[null,0],[4,1],[null,0],[7,1],[null,0],[9,1],[null,0],
      [7,1],[null,0],[4,1],[null,0],[2,1],[4,1],[0,1],[null,0],
    ];
    const note=melody[step];
    if(note[0]!==null) {
      const scale=[261.63,293.66,329.63,349.23,392,440,493.88,523.25,587.33,659.25];
      this.tone(time,scale[note[0]],scale[note[0]]*.98,.22,.045,'triangle',this.musicGain);
    }
    if(step%8===0) {
      const roots=[130.81,110,87.31,98,130.81,110,87.31,98];
      this.tone(time,roots[Math.floor(step/8)],roots[Math.floor(step/8)]*.99,beat*1.45,.025,'sine',this.musicGain);
    }
  }

  musicOn() {this.musicEnabled=true;void this.unlock().catch(()=>{});}
  musicOff() {
    this.musicEnabled=false;this.stopMusicScheduler();this.stopMusicTrack();this.musicStarted=false;
    if(this.context&&this.musicGain)this.musicGain.gain.setTargetAtTime(0,this.context.currentTime,.04);
  }

  dispose() {
    this.stopMusicScheduler();this.stopMusicTrack();this.stopStretch();this.stopHum();this.facilities?.dispose();this.facilities=null;
    this.abort.abort();this.master?.disconnect();this.sfxGain?.disconnect();this.musicGain?.disconnect();this.compressor?.disconnect();
    const context=this.context;this.context=null;this.master=null;this.sfxGain=null;this.musicGain=null;this.compressor=null;this.resumePromise=null;
    if(context&&context.state!=='closed')void context.close().catch(()=>{});
  }
}
