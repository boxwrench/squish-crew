import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { BufferGeometry, Float32BufferAttribute } from 'three/webgpu';
import { buildCage } from './model-cage.mjs';
import { buildOpticalModel } from './optical-model.mjs';

// One continuous rounded solid: hips, broad belly, shoulders and a small head.
// Elliptical sections keep the back/front shallower than the broad silhouette.
const height=.078,depthScale=.82;
const radius=t=>.059*Math.sqrt(Math.max(0,t*(1-t)))*
  (1-.30*Math.exp(-(((t-.77)/.16)**2)));
function geometry(radial,rings) {
  const positions=[0,0,0],indices=[];
  for(let j=1;j<rings;j++) {
    const t=(1-Math.cos(Math.PI*j/rings))/2,r=radius(t);
    for(let i=0;i<radial;i++) {
      const a=i*2*Math.PI/radial;
      positions.push(r*Math.cos(a),height*t,r*Math.sin(a)*depthScale);
    }
  }
  const top=positions.length/3;positions.push(0,height,0);
  for(let i=0;i<radial;i++) {
    const a=1+i,b=1+(i+1)%radial;indices.push(0,a,b);
    for(let j=0;j<rings-2;j++) {
      const c=a+j*radial,d=b+j*radial;indices.push(c,c+radial,d,d,c+radial,d+radial);
    }
    indices.push(a+(rings-2)*radial,top,b+(rings-2)*radial);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
const mesh=geometry(96,64),positions=mesh.attributes.position.array,normals=mesh.attributes.normal.array,indices=new Uint32Array(mesh.index.array);
let volume=0;const edges=new Map();
for(let i=0;i<indices.length;i+=3) {
  const [a,b,c]=Array.from(indices.slice(i,i+3),id=>id*3),p=positions;
  volume+=(p[a]*(p[b+1]*p[c+2]-p[b+2]*p[c+1])+p[a+1]*(p[b+2]*p[c]-p[b]*p[c+2])+p[a+2]*(p[b]*p[c+1]-p[b+1]*p[c]))/6;
  for(let k=0;k<3;k++) {
    const u=indices[i+k],v=indices[i+(k+1)%3],key=[Math.min(u,v),Math.max(u,v)].join(',');
    const e=edges.get(key)??[0,0];e[0]++;e[1]+=u<v?1:-1;edges.set(key,e);
  }
}
if(volume<=0||[...edges.values()].some(([count,winding])=>count!==2||winding!==0))throw new Error('Mascot must be a closed, consistently wound positive-volume manifold');
const sdf=p=>p.y<0?-p.y:p.y>height?p.y-height:Math.hypot(p.x,p.z/depthScale)-radius(p.y/height);
const arrays={positions,normals,indices,...buildCage(positions,1,0,sdf,volume)};
Object.assign(arrays,buildOpticalModel('',1,0,arrays,geometry(48,32).toNonIndexed()));
const chunks=[],layout={};let offset=0;
for(const [name,array] of Object.entries(arrays)) {
  const padding=(8-offset%8)%8;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}
  layout[name]={offset,length:array.length,type:array.constructor.name};chunks.push(Buffer.from(array.buffer,array.byteOffset,array.byteLength));offset+=array.byteLength;
}
// Publish only after every cage and optical binding has succeeded.
writeFileSync('src/assets/model/jelly-baby.bin',Buffer.concat(chunks));
writeFileSync('src/assets/model/jelly-baby.json',JSON.stringify({shape:'mascot',sourceHash:createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),scale:1,bottom:0,volume,layout},null,2));
console.log({shape:'mascot',vertices:positions.length/3,triangles:indices.length/3,volume});
