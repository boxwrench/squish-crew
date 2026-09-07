import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileKernel } from './compile-kernel.mjs';

const dir=mkdtempSync(join(tmpdir(),'jelly-kernel-'));
try {
  const wasm=join(dir,'soft-body-kernel.wasm');
  compileKernel(wasm);
  const encoded=readFileSync(wasm).toString('base64');
  const file='src/physics/soft-body-kernel.js';
  const source=readFileSync(file,'utf8');
  const pattern=/const KERNEL_BASE64='[^']*';/;
  if(!pattern.test(source))throw new Error('Could not find generated kernel payload');
  const next=source.replace(pattern,`const KERNEL_BASE64='${encoded}';`);
  writeFileSync(file,next);
  console.log(`Embedded ${readFileSync(wasm).byteLength} byte WebAssembly kernel in ${file}`);
} finally {
  rmSync(dir,{recursive:true,force:true});
}
