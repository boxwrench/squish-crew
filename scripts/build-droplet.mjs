import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { buildCage } from './model-cage.mjs';
import { buildOpticalModel } from './optical-model.mjs';

// A rounded belly, flattened underside and gently tapered, soft tip, in metres.
const height=.07;
const radius=t=>{
  const s=Math.max(0,Math.min(1,(t-.38)/.57)),neck=1-.65*s*s*(3-2*s),tail=Math.max(0,1-t);
  return .077*Math.sqrt(Math.max(0,t)*tail)*Math.pow(tail+.001,.35)*neck;
};
function geometry(radial,rings) {
  const positions=[0,0,0],indices=[];
  for(let j=1;j<rings;j++) {
    const t=(1-Math.cos(Math.PI*j/rings))/2,r=radius(t),y=height*Math.pow(t,1.16);
    for(let i=0;i<radial;i++){const a=i*2*Math.PI/radial;positions.push(r*Math.cos(a),y,r*Math.sin(a));}
  }
  const top=positions.length/3;positions.push(0,height,0);
  for(let i=0;i<radial;i++) {
    const a=1+i,b=1+(i+1)%radial;indices.push(0,a,b);
    for(let j=0;j<rings-2;j++) {
      const c=a+j*radial,d=b+j*radial;indices.push(c,c+radial,d,d,c+radial,d+radial);
    }
    const c=a+(rings-2)*radial,d=b+(rings-2)*radial;indices.push(c,top,d);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
  return g;
}
const mesh=geometry(96,64),positions=mesh.attributes.position.array,normals=mesh.attributes.normal.array,indices=new Uint32Array(mesh.index.array);
let volume=0;
for(let i=0;i<indices.length;i+=3) {
  const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,p=positions;
  volume+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;
}
if(volume<=0)throw new Error('Droplet winding must enclose positive volume');
const sdf=p=>p.y<0?-p.y:p.y>height?p.y-height:Math.hypot(p.x,p.z)-radius(Math.pow(p.y/height,1/1.16));
const arrays={positions,normals,indices,...buildCage(positions,1,0,sdf,volume)};
Object.assign(arrays,buildOpticalModel('',1,0,arrays,geometry(48,32).toNonIndexed()));
const chunks=[],layout={};let offset=0;
for(const [name,array] of Object.entries(arrays)) {
  const padding=(8-offset%8)%8;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
  layout[name]={offset,length:array.length,type:array.constructor.name};chunks.push(Buffer.from(array.buffer,array.byteOffset,array.byteLength));offset+=array.byteLength;
}
writeFileSync('src/assets/model/jelly-baby.bin',Buffer.concat(chunks));
writeFileSync('src/assets/model/jelly-baby.json',JSON.stringify({shape:'droplet',sourceHash:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),scale:1,bottom:0,volume,layout},null,2));
console.log({shape:'droplet',vertices:positions.length/3,triangles:indices.length/3,volume});
