import type { PerspectiveCamera } from 'three/webgpu';
import { FacilityAudio, type FacilitySoundEvent } from './facility-sound.ts';
import { squealVoice } from './reactions.ts';

type AudioWindow=Window&{webkitAudioContext?:typeof AudioContext};
type ToneShape=OscillatorType;
const MUSIC_URL=new URL('../assets/music/Steam_Valve_Open_loop.mp3',import.meta.url).href;
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
  private stretchOscillator:OscillatorNode|null=null;
  private stretchGain:GainNode|null=null;
  private stretchFilter:BiquadFilterNode|null=null;
  private musicTimer:number|null=null;
  private musicStarted=false;
  private musicEnabled=true;
  private musicSource:AudioBufferSourceNode|null=null;
  private musicBuffer:AudioBuffer|null=null;
  private musicLoadPromise:Promise<AudioBuffer|null>|null=null;
  private hopIndex=0;
  private musicStep=0;
  private musicNextTime=0;
  muted=false;

  constructor() {
    const signal=this.abort.signal;
    window.addEventListener('pointerdown',this.unlockFromGesture,{signal});
    window.addEventListener('touchstart',this.unlockFromGesture,{passive:true,signal});
    window.addEventListener('keydown',this.unlockFromGesture,{signal});
    document.addEventListener('visibilitychange',this.handleVisibility,{signal});
  }

  private unlockFromGesture=()=>{void this.unlock().catch(()=>{});};

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

  unlock() {
    const context=this.context??this.createContext();
    if(!context||context.state==='closed')return Promise.resolve();
    this.primeOutput(context);
    if(context.state==='running') {this.startMusic();return Promise.resolve();}
    if(this.resumePromise)return this.resumePromise;
    try {
      this.resumePromise=context.resume().then(()=>this.startMusic()).catch(()=>{}).finally(()=>{this.resumePromise=null;});
    } catch {this.resumePromise=null;return Promise.resolve();}
    return this.resumePromise;
  }

  toggle() {
    this.muted=!this.muted;
    if(this.muted) {
      this.stopFacilities();this.stopStretch();this.stopMusicScheduler();this.stopMusicTrack();this.musicStarted=false;
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
    if(!ctx||!out||ctx.state==='closed'||this.muted)return;
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
    for(const [[from,to],q,share] of [[f1,7,1],[f2,9,.55]] as const) {
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
    this.voice(t,base,.58,.20,.11+.24*amount,[700,470],[1240,880],.03+.045*amount);
  }

  /** A small amused "heh-heh-heh" for being poked once too often. */
  giggle() {
    const ctx=this.context;if(!ctx||this.muted)return;
    // A poke also fires the hop boing, so the chuckle waits for its attack to
    // pass rather than competing with it: boing first, then he finds it funny.
    const t=ctx.currentTime+.10,base=158+Math.random()*20;
    // Three descending voiced pulses, low enough to belong to a squat worker.
    const bends=[.93,.9,.88],steps=[1,.94,.87],levels=[.20,.18,.135];
    for(let i=0;i<3;i++) {
      const at=t+i*.115+(i?Math.random()*.012:0);
      this.voice(at,base*steps[i],bends[i],.085,levels[i],[610,540],[1180,1020],.028);
    }
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
    if(this.musicLoadPromise===null) {
      this.musicLoadPromise=fetch(MUSIC_URL).then(response=>{
        if(!response.ok)throw new Error(`Music request failed: ${response.status}`);
        return response.arrayBuffer();
      }).then(data=>ctx.decodeAudioData(data)).catch(()=>null);
    }
    void this.musicLoadPromise.then(buffer=>{
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
    this.stopMusicScheduler();this.stopMusicTrack();this.stopStretch();this.facilities?.dispose();this.facilities=null;
    this.abort.abort();this.master?.disconnect();this.sfxGain?.disconnect();this.musicGain?.disconnect();this.compressor?.disconnect();
    const context=this.context;this.context=null;this.master=null;this.sfxGain=null;this.musicGain=null;this.compressor=null;this.resumePromise=null;
    if(context&&context.state!=='closed')void context.close().catch(()=>{});
  }
}
