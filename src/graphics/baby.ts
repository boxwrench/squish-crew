import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import { MascotLegs } from './mascot-legs.ts';
import { DEFAULT_JELLY_FLAVOR, JELLY_FLAVORS, type JellyFlavorName } from './jelly-flavors.ts';

export const ABSORPTION=JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].absorption;

export class Baby {
  readonly mesh:THREE.Mesh;
  readonly group=new THREE.Group();
  private readonly jellyMaterial:THREE.MeshPhysicalNodeMaterial;
  readonly body:SoftBody;
  readonly legs:MascotLegs;
  constructor(body:SoftBody) {
    this.body=body;
    const material=new THREE.MeshPhysicalNodeMaterial({
      color:0xffffff,vertexColors:true,roughness:.82,metalness:0,transmission:0,
      clearcoat:0,envMapIntensity:1,
      transparent:false,side:THREE.FrontSide,flatShading:false,
    });
    this.jellyMaterial=material;
    const colors=new Float32Array(body.surface.positions.length),color=new THREE.Color();
    for(let i=0;i<colors.length;i+=3) {
      const y=body.surface.positions[i+1];
      color.set(y>.058?'#c58f69':y<.020?'#345775':'#203d60');
      color.toArray(colors,i);
    }
    body.surface.geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    this.mesh=new THREE.Mesh(body.surface.geometry,material);
    this.mesh.renderOrder=1;
    this.mesh.frustumCulled=false;this.group.add(this.mesh);
    this.legs=new MascotLegs(body,this.group);
    this.update();
  }
  setFlavor(flavor:JellyFlavorName) {
    const look=JELLY_FLAVORS[flavor],distance=this.jellyMaterial.attenuationDistance;
    this.jellyMaterial.color.set(look.surface);
    this.jellyMaterial.attenuationColor.setRGB(
      Math.exp(-look.absorption[0]*distance),Math.exp(-look.absorption[1]*distance),Math.exp(-look.absorption[2]*distance),
      THREE.LinearSRGBColorSpace,
    );
  }
  update(dt=0) { this.legs.update(dt); }
  resetFace() { this.legs.reset(); }
  dispose() {
    this.group.traverse(object=>{
      if(object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.forEach(m=>m.dispose());
      }
    });
  }
}
