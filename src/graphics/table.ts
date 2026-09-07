import * as THREE from 'three/webgpu';
import { texture, positionWorld, float, vec2, vec3, normalMap, mix, atan } from 'three/tsl';
import type { RefractiveLightField } from './refractive-light.js';
import type { Puddle } from '../water/puddle.ts';
import type { FacilityShadows } from './facility-shadows.ts';

export async function makeTable(optics:RefractiveLightField,light:{color:THREE.Color;windowFraction:number;irradiance:number},facilities:FacilityShadows,puddle:Puddle) {
  const loader=new THREE.TextureLoader();
  const urls=[new URL('../assets/wood_texture/wood_base.jpg',import.meta.url).href,
    new URL('../assets/wood_texture/wood_normal.png',import.meta.url).href,
    new URL('../assets/wood_texture/wood_roughness.jpg',import.meta.url).href];
  const [base,normal,roughness]=await Promise.all(urls.map(url=>loader.loadAsync(url)));
  base.colorSpace=THREE.SRGBColorSpace;
  for(const t of [base,normal,roughness]) {t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;}
  // Orient the grain along narrow hardwood boards, in world metres so the
  // droplet and its refraction share the same continuous floor pattern.
  const along=positionWorld.x.mul(.94).add(positionWorld.z.mul(.342));
  const across=positionWorld.z.mul(.94).sub(positionWorld.x.mul(.342));
  const board=across.add(.016).div(.035);
  const boardId=board.floor();
  const uv=vec2(across,along).div(.65).add(.5);
  const edge=board.fract().sub(.5).abs();
  const longSeam=edge.smoothstep(.482,.498);
  const end=along.div(.21).add(boardId.mul(.381)).fract().sub(.5).abs();
  const endSeam=end.smoothstep(.497,.4995);
  const seam=longSeam.max(endSeam);
  const boardShade=boardId.mul(12.9898).sin().mul(43758.5453).fract().mul(.12).add(.88);
  const opticalUV=positionWorld.xz.sub(optics.originNode).div(optics.spanNode);
  const inside=float(opticalUV.x.greaterThan(0).and(opticalUV.x.lessThan(1)).and(opticalUV.y.greaterThan(0)).and(opticalUV.y.lessThan(1)));
  const shadowUV=positionWorld.xz.sub(optics.shadowOriginNode).div(optics.shadowSpanNode);
  const shadowInside=float(shadowUV.x.greaterThan(0).and(shadowUV.x.lessThan(1)).and(shadowUV.y.greaterThan(0)).and(shadowUV.y.lessThan(1)));
  const shadow=texture(optics.shadowTexture,shadowUV).r.mul(shadowInside);
  const contactUV=positionWorld.xz.sub(optics.contactOriginNode).div(optics.shadowSpanNode);
  const contactInside=float(contactUV.x.greaterThan(0).and(contactUV.x.lessThan(1)).and(contactUV.y.greaterThan(0)).and(contactUV.y.lessThan(1)));
  const contact=texture(optics.shadowTexture,contactUV).g.mul(contactInside);
  // Stable, slightly asymmetric footprint, aligned with the impact's horizontal motion.
  const offset=positionWorld.xz.sub(puddle.center);
  const local=vec2(offset.dot(puddle.direction),offset.dot(vec2(puddle.direction.y.negate(),puddle.direction.x)));
  const footprint=local.div(vec2(puddle.aspect,float(1).div(puddle.aspect)));
  const angle=atan(footprint.y,footprint.x.add(.0000001));
  const outline=float(1).add(angle.mul(3).add(.8).sin().mul(.06))
    .add(angle.mul(7).add(2.1).sin().mul(.035)).add(angle.mul(11).add(4.3).sin().mul(.02));
  const distance=footprint.length().div(outline);
  // A glossy core transitions through a broad damp fringe back to untouched wood.
  const visibleRadius=puddle.radius.mul(1.25);
  const coreMask=float(1).sub(distance.smoothstep(visibleRadius.mul(.86),visibleRadius));
  const wet=coreMask.mul(puddle.strength);
  const halo=float(1).sub(distance.smoothstep(visibleRadius.mul(.82),visibleRadius.mul(1.22)))
    .mul(float(1).sub(coreMask)).mul(puddle.strength);
  // Broad sinusoidal wave packets perturb highlights, never draw luminous rings.
  let ripple=float(0).add(0);
  for(const [delay,duration,amplitude,ellipse] of [[0,.35,1,.94],[.08,.36,.55,1.07],[.14,.41,.25,.98]]) {
    const progress=puddle.age.sub(delay).div(duration).clamp(0,1);
    const envelope=progress.mul(Math.PI).sin().max(0);
    const waveDistance=footprint.mul(vec2(ellipse,1/ellipse)).length().div(puddle.radius);
    const phase=waveDistance.sub(progress.mul(1.2)).mul(9);
    const packet=float(1).sub(phase.abs().div(Math.PI).clamp(0,1));
    ripple=ripple.add(phase.sin().mul(packet.mul(packet)).mul(envelope).mul(amplitude));
  }
  const waveX=local.x.mul(190).add(puddle.age.mul(3.1)).sin().mul(.0025);
  const waveZ=local.y.mul(260).sub(puddle.age.mul(2.3)).sin().mul(.002);
  const surfaceWave=vec2(waveX,waveZ).add(footprint.div(footprint.length().max(.001)).mul(ripple.mul(.003))).mul(wet);
  const albedo=texture(base,uv).rgb.mul(vec3(.72,.39,.18)).mul(boardShade).mul(float(1).sub(seam.mul(.70)));
  const material=new THREE.MeshPhysicalNodeMaterial({metalness:0,roughness:.26,clearcoat:.38,clearcoatRoughness:.23});
  const facilityUV=facilities.worldToUVNode.mul(vec3(positionWorld.xz,1)).xy;
  const facilityInside=float(facilityUV.x.greaterThan(0).and(facilityUV.x.lessThan(1)).and(facilityUV.y.greaterThan(0)).and(facilityUV.y.lessThan(1)));
  // A deterministic tent filter softens the finite window's occlusion. No
  // temporal noise, transparent sorting, or nearly coplanar depth comparisons.
  let facilityMask=vec2(0,0).add(0);
  for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++) {
    const weight=(x===0?2:1)*(y===0?2:1)/16;
    facilityMask=facilityMask.add(texture(facilities.target.texture,facilityUV.add(vec2(x,y).mul(1.5/512))).rg.mul(weight));
  }
  const facilityShadow=facilityMask.x.mul(facilityInside),facilityContact=facilityMask.y.mul(facilityInside);
  const visibility=float(1).sub(shadow).mul(float(1).sub(facilityShadow));
  const wetAlbedo=albedo.mul(float(1).sub(wet.mul(.20)).sub(halo.mul(.09)));
  material.colorNode=wetAlbedo.mul(float(1).sub(float(1).sub(visibility).mul(light.windowFraction))).mul(float(1).sub(contact.mul(.40))).mul(float(1).sub(facilityContact.mul(.35)));
  // Plane UV-v points toward -Z; the metre-scaled world UV points toward +Z.
  material.normalNode=normalMap(texture(normal,uv),vec2(.27,-.27).mul(float(1).sub(wet.mul(.85))));
  const dryRoughness=texture(roughness,uv).r.mul(.24).add(.12).add(seam.mul(.22));
  material.roughnessNode=mix(dryRoughness.mul(float(1).sub(halo.mul(.10))),float(.055),wet);
  material.clearcoatNode=mix(float(.38).add(halo.mul(.07)),float(.98),wet);
  material.clearcoatRoughnessNode=mix(float(.23).sub(halo.mul(.02)),float(.055),wet);
  // A slightly softened room reflection supplies the sheen without painted highlight shapes.
  material.specularColorNode=mix(vec3(.04),vec3(.16),wet);
  const coatTexture=texture(normal,uv).xyz;
  const coatXY=coatTexture.xy.sub(.5).mul(vec2(.27,-.27)).mul(float(1).sub(wet)).add(surfaceWave).add(.5);
  material.clearcoatNormalNode=normalMap(vec3(coatXY,coatTexture.z),vec2(1));
  material.emissiveNode=albedo.mul(texture(optics.lightTexture,opticalUV).rgb).mul(light.irradiance/Math.PI).mul(vec3(light.color.r,light.color.g,light.color.b)).mul(inside).mul(float(1).sub(facilityShadow));
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(200,200),material);
  mesh.rotation.x=-Math.PI/2;mesh.position.y=-.00005;
  return {mesh,dispose:()=>{mesh.geometry.dispose();material.dispose();[base,normal,roughness].forEach(t=>t.dispose());}};
}
