/* global window */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const poses=JSON.parse(readFileSync('/tmp/squish-character-poses.json','utf8'));
const legPoses=JSON.parse(readFileSync('/tmp/squish-legs-poses.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan']});
try {
  const page=await browser.newPage({viewport:{width:900,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL??'http://localhost:5173');
  await page.locator('#loading.hidden').waitFor({timeout:90000});
  for(const [name,pose] of Object.entries({front:{...poses.rest,view:[0,.075,.25]},'three-quarter':{...poses.rest,view:[.16,.075,.20]},rolled:{...legPoses.roll,view:[.025,.11,.23]}})) {
    await page.evaluate(p=>window.dropletDebug.inspectLegPose(p),pose);
    await page.waitForTimeout(1500);
    assert(await page.evaluate(()=>window.dropletDebug.finite));
    await page.screenshot({path:`/tmp/squish-character-${name}.png`});
  }
  // Actual gameplay grab, not a synthetic deformation: review a moderate pull.
  await page.reload();await page.locator('#loading.hidden').waitFor({timeout:90000});
  await page.waitForTimeout(800);
  await page.mouse.move(450,350);await page.mouse.down();
  await page.mouse.move(510,310,{steps:12});await page.waitForTimeout(200);
  assert(await page.evaluate(()=>window.dropletDebug.grabs===1),'body remains pickable');
  assert(await page.evaluate(()=>window.dropletDebug.finite));
  await page.screenshot({path:'/tmp/squish-character-stretch.png'});
  const held=await page.evaluate(()=>window.dropletDebug.legs);
  await page.mouse.up();await page.waitForTimeout(300);
  assert(await page.evaluate(()=>window.dropletDebug.grabs===0&&window.dropletDebug.finite));
  console.log('Leg state during real grab:',JSON.stringify(held));
  assert.deepEqual(errors,[]);console.log('Captured front, three-quarter, rolled and moderate live stretch; load/grab/release finite.');
} finally {await browser.close();}
