const coarse=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
const cores=typeof navigator==='undefined'?8:navigator.hardwareConcurrency||4;
export const quality={tier:coarse?(cores<=4?'mobile-low':'mobile-high'):'desktop',dpr:coarse?(cores<=4?1.25:1.5):2,opticalHz:coarse?(cores<=4?12:20):30};
let elapsed=0,frames=0,slow=0;
/** Change optical work before touching physics; one bounded decision per window. */
export function observeFrame(dt:number) {
  elapsed+=dt;frames++;if(dt>1/40)slow++;
  if(elapsed<4)return false;
  const overloaded=slow/frames>.35;elapsed=0;frames=0;slow=0;
  if(!overloaded||quality.dpr<=.8)return false;
  quality.dpr=Math.max(.8,quality.dpr-.2);quality.opticalHz=Math.max(10,quality.opticalHz-5);return true;
}
