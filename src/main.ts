import './style.css';
document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
<main id="viewport" aria-label="Boilerplate Bash boiler room"></main>
<header class="masthead"><span class="eyebrow">UNSCHEDULED MAINTENANCE</span><h1>BOILERPLATE BASH<span>.</span></h1></header>
<nav class="actions" aria-label="Boilerplate Bash controls"><button id="sound" class="icon-button" aria-label="Mute sound" aria-pressed="false" title="Sound">♫</button><button id="reset" class="icon-button" aria-label="Reset Boilerplate Bash" title="Reset · R">↺</button></nav>
<footer class="play-hints">poke · grab · fling · fix things</footer>
<section id="loading" role="status" aria-live="polite"><div class="loading-card"><h2>BOILERPLATE BASH</h2><p id="load-message">Clocking in…</p><pre id="fatal" hidden></pre><button id="retry" hidden>Try again</button></div></section>`;
let failed=false,game:{stop:()=>void}|undefined;
function fail(reason:unknown) {
 if(failed)return;failed=true;game?.stop();
 const error=reason instanceof Error?reason:new Error(String(reason));
 document.querySelector('#loading')!.classList.remove('hidden');
 document.querySelector('h2')!.textContent='Maintenance delay.';
 document.querySelector('#load-message')!.textContent='Boilerplate Bash needs a WebGPU-capable browser on HTTPS or localhost.';
 const detail=document.querySelector<HTMLPreElement>('#fatal')!;detail.hidden=false;detail.textContent=error.message;
 document.querySelector<HTMLButtonElement>('#retry')!.hidden=false;console.error(error);
}
window.addEventListener('error',e=>fail(e.error||e.message));
window.addEventListener('unhandledrejection',e=>fail(e.reason));
document.querySelector('#retry')!.addEventListener('click',()=>location.reload());
void import('./game/runtime.ts').then(({startGame})=>startGame(message=>{
 if(failed)throw new Error('Startup aborted');document.querySelector('#load-message')!.textContent=message;
},fail)).then(started=>{game=started;if(failed){game.stop();return;}document.querySelector('#loading')!.classList.add('hidden');}).catch(fail);
