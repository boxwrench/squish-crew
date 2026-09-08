import * as THREE from 'three/webgpu';
import { texture, positionWorld, float, vec3, mix } from 'three/tsl';
import type { RefractiveLightField } from './refractive-light.js';

/** Sealed facility concrete; procedural wear retains the existing mascot shadow. */
export function makeBoilerFloor(optics:RefractiveLightField,light:{windowFraction:number}) {
  const uv=positionWorld.xz.sub(optics.shadowOriginNode).div(optics.shadowSpanNode);
  const inside=float(uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1)));
  const shadow=texture(optics.shadowTexture,uv).r.mul(inside);
  const contactUV=positionWorld.xz.sub(optics.contactOriginNode).div(optics.shadowSpanNode);
  const contactInside=float(contactUV.x.greaterThan(0).and(contactUV.x.lessThan(1)).and(contactUV.y.greaterThan(0)).and(contactUV.y.lessThan(1)));
  const contact=texture(optics.shadowTexture,contactUV).g.mul(contactInside);
  const slab=positionWorld.xz.add(.12).div(.28);
  const edge=slab.fract().sub(.5).abs();
  const seam=edge.x.max(edge.y).smoothstep(.498,.4997);
  const material=new THREE.MeshStandardNodeMaterial({roughness:.91,metalness:0});
  const concrete=new THREE.Color('#918b80');
  // Several low-cost, skewed waves break up the uniform slab without a texture
  // map, high-frequency sparkle, or a bright pool underneath the character.
  const x=positionWorld.x,z=positionWorld.z;
  const broad=x.mul(37).add(z.mul(19)).sin().mul(z.mul(43).sub(x.mul(13)).sin());
  const mottling=x.mul(113).sub(z.mul(71)).sin().mul(z.mul(157).add(x.mul(89)).sin());
  const worn=x.mul(229).add(z.mul(131)).sin().mul(z.mul(193).sub(x.mul(61)).sin()).smoothstep(.55,.9);
  const variation=broad.mul(.07).add(mottling.mul(.038)).add(worn.mul(.035)).add(1);
  // A small flush service grate: visual only, with a muted frame and slots.
  const dx=x.sub(.06),dz=z.add(.012);
  const drain=float(1).sub(dx.abs().smoothstep(.0107,.011))
    .mul(float(1).sub(dz.abs().smoothstep(.0077,.008)));
  const inner=float(1).sub(dx.abs().smoothstep(.0088,.0092))
    .mul(float(1).sub(dz.abs().smoothstep(.0057,.0061)));
  const slots=dx.mul(2100).sin().smoothstep(-.15,.25).mul(inner);
  const grate=new THREE.Color('#75756d');
  const grateColor=vec3(grate.r,grate.g,grate.b).mul(float(1).sub(slots.mul(.30)));
  material.colorNode=mix(vec3(concrete.r,concrete.g,concrete.b)
    .mul(variation)
    .mul(float(1).sub(seam.mul(.14))),grateColor,drain)
    .mul(float(1).sub(shadow.mul(light.windowFraction)))
    .mul(float(1).sub(contact.mul(.4)));
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-.00005;
  return {mesh,dispose:()=>{mesh.geometry.dispose();material.dispose();}};
}
