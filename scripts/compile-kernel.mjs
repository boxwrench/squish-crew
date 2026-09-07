import { execFileSync } from 'node:child_process';

// Share the production compiler flags with the native equivalence regression.
// Invoke the compiler directly rather than through a login shell: the shell only
// ever existed to resolve `clang` on the author's machine, and hardcoding one
// makes this fail on any system without it. Set CLANG to point at a toolchain
// that is not on PATH.
export function compileKernel(output,defines=[]) {
  const compiler=process.env.CLANG||'clang';
  const args=['--target=wasm32','-O3','-fno-builtin','-nostdlib',
    '-Wl,--no-entry','-Wl,--export-memory',
    '-Wl,--initial-memory=16777216','-Wl,--max-memory=16777216',
    ...defines.map(name=>`-D${name}`),'scripts/native/soft-body-kernel.c','-o',output,
  ];
  try {
    execFileSync(compiler,args,{stdio:'inherit'});
  } catch(error) {
    if(error.code==='ENOENT')
      throw new Error(`Cannot run '${compiler}'. The WebAssembly kernel regression needs a clang with a wasm32 target; install one or set CLANG to its path. The shipped kernel is already embedded in src/physics/soft-body-kernel.js, so the demo and every other check run without it.`,{cause:error});
    throw error;
  }
}
