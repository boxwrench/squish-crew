/* global window */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run test:mascot first; these are measured solver states, not sculpted poses.
const poses=JSON.parse(readFileSync('/tmp/squish-mascot-poses.json','utf8'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-features=Vulkan']});
try {
  const page=await browser.newPage({viewport:{width:900,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL??'http://localhost:5173');
  await page.locator('#loading.hidden').waitFor({timeout:90000});
  for(const [name,positions] of Object.entries(poses)) {
    await page.evaluate(p=>window.dropletDebug.inspectPose(p),positions);
    await page.waitForTimeout(1500);
    assert(await page.evaluate(()=>window.dropletDebug.finite));
    await page.screenshot({path:`/tmp/squish-mascot-${name}.png`});
  }
  assert.deepEqual(errors,[]);console.log('Captured measured rest, stretch, landing and rolled states.');
} finally {await browser.close();}
