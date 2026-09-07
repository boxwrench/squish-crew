import { RenderPipeline } from 'three/webgpu';
import type { WebGPURenderer, Scene, PerspectiveCamera } from 'three/webgpu';
import { pass, screenUV, float, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { quality } from './quality.ts';

/** Linear HDR scene → restrained lens glow → grade → one AgX/output transform. */
export function createComposite(renderer:WebGPURenderer,scene:Scene,camera:PerspectiveCamera) {
  const scenePass=pass(scene,camera);
  const color=scenePass.getTextureNode('output');
  const glow=bloom(color,.075,.18,1.6);
  const vignette=screenUV.sub(.5).length().smoothstep(.24,.73).mul(.065);
  const lit=quality.tier==='mobile-low'?color.rgb:color.rgb.add(glow.rgb);
  const graded=lit.mul(vec3(.985,1.01,1.015)).mul(float(1).sub(vignette));
  const pipeline=new RenderPipeline(renderer,vec4(graded,color.a));
  return {render:()=>pipeline.render(),dispose:()=>{glow.dispose();scenePass.dispose();pipeline.dispose();}};
}
