/* global window */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const poses=JSON.parse(readFileSync('/tmp/squish-legs-poses.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan']});
try {
  const page=await browser.newPage({viewport:{width:900,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL??'http://localhost:5173');
  await page.locator('#loading.hidden').waitFor({timeout:90000});
  for(const [name,pose] of Object.entries(poses)) {
    await page.evaluate(p=>window.dropletDebug.inspectLegPose(p),pose);
    await page.waitForTimeout(1500);
    assert(await page.evaluate(()=>window.dropletDebug.finite));
    await page.screenshot({path:`/tmp/squish-legs-${name}.png`});
  }
  assert.deepEqual(errors,[]);console.log('Captured measured leg rest, roll, impact and settled states.');
} finally {await browser.close();}
