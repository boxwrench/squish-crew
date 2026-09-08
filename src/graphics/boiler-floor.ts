import * as THREE from 'three/webgpu';
import { texture, positionWorld, float, vec3 } from 'three/tsl';
import type { RefractiveLightField } from './refractive-light.js';

/** Painted concrete; uses the existing mascot shadow, without floor textures. */
export function makeBoilerFloor(optics:RefractiveLightField,light:{windowFraction:number}) {
  const uv=positionWorld.xz.sub(optics.shadowOriginNode).div(optics.shadowSpanNode);
  const inside=float(uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1)));
  const shadow=texture(optics.shadowTexture,uv).r.mul(inside);
  const contactUV=positionWorld.xz.sub(optics.contactOriginNode).div(optics.shadowSpanNode);
  const contactInside=float(contactUV.x.greaterThan(0).and(contactUV.x.lessThan(1)).and(contactUV.y.greaterThan(0)).and(contactUV.y.lessThan(1)));
  const contact=texture(optics.shadowTexture,contactUV).g.mul(contactInside);
  const slab=positionWorld.xz.add(.075).div(.15);
  const edge=slab.fract().sub(.5).abs();
  const seam=edge.x.max(edge.y).smoothstep(.494,.499);
  const material=new THREE.MeshStandardNodeMaterial({roughness:.88,metalness:0});
  const concrete=new THREE.Color('#85877c');
  material.colorNode=vec3(concrete.r,concrete.g,concrete.b)
    .mul(float(1).sub(seam.mul(.16)))
    .mul(float(1).sub(shadow.mul(light.windowFraction)))
    .mul(float(1).sub(contact.mul(.4)));
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-.00005;
  return {mesh,dispose:()=>{mesh.geometry.dispose();material.dispose();}};
}
