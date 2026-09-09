import assert from 'node:assert/strict';
import { Boiler, BOILER, strikeDrop, makeBoilers } from '../src/game/boilers.ts';

const run = (boiler, seconds, dt = 1 / 60) => {
  let reliefs = 0;
  for (let t = 0; t < seconds; t += dt) if (boiler.advance(dt)) reliefs++;
  return reliefs;
};

// --- Pressure rises, clamps, and the two boilers are independent -------------
{
  const boiler = new Boiler(.2, .05);
  const before = boiler.pressure;
  run(boiler, 4);
  assert(boiler.pressure > before, 'pressure rises over time');
  assert(Math.abs(boiler.pressure - (before + .05 * 4)) < .01, `rise tracks riseRate, got ${boiler.pressure}`);
}
{
  const [a, b] = makeBoilers();
  assert.notEqual(a.pressure, b.pressure, 'the two boilers start apart so the loop reads immediately');
  run(a, 3);
  const bBefore = b.pressure;
  a.strike(BOILER.fullStrikeSpeed);
  assert.equal(b.pressure, bBefore, 'striking one boiler leaves the other alone');
  assert.equal(b.reliefCount, 0);
}
{
  const boiler = new Boiler(.9, .5);
  for (let i = 0; i < 600; i++) {
    boiler.advance(1 / 60);
    assert(boiler.pressure >= 0 && boiler.pressure <= 1, `pressure stays in 0..1, got ${boiler.pressure}`);
  }
  const empty = new Boiler(.05, 0);
  empty.strike(BOILER.fullStrikeSpeed * 4);
  assert(empty.pressure >= 0, 'a huge strike on an almost empty boiler cannot go negative');
}

// --- The impact curve --------------------------------------------------------
{
  assert.equal(strikeDrop(0), 0, 'a still body vents nothing');
  assert.equal(strikeDrop(-2), 0, 'moving away vents nothing');
  assert.equal(strikeDrop(BOILER.minStrikeSpeed), 0, 'the threshold itself is free');
  // Expressed as fractions of the usable span so the bands survive retuning.
  const span = BOILER.fullStrikeSpeed - BOILER.minStrikeSpeed;
  const at = (fraction) => strikeDrop(BOILER.minStrikeSpeed + fraction * span);
  const brush = at(.15), decent = at(.50), fling = at(.75);
  assert(brush >= 0 && brush <= .15, `a weak bump vents little, got ${brush}`);
  assert(decent >= .30 && decent <= .50, `a decent hit vents a useful chunk, got ${decent}`);
  assert(fling >= .60 && fling <= .85, `a hard fling vents most of it, got ${fling}`);
  assert.equal(strikeDrop(4), BOILER.maxDrop, 'the curve saturates rather than running away');
  assert(BOILER.fullStrikeSpeed < .4, 'saturation stays inside what a fling can reach');
  let previous = -1;
  for (let v = 0; v <= 1.5; v += .05) {
    const drop = strikeDrop(v);
    assert(drop >= previous, 'the curve is monotonic, with no hard edge to tune against');
    previous = drop;
  }
  // An excellent strike nearly empties an overheated boiler.
  const hot = new Boiler(1, 0);
  hot.strike(BOILER.fullStrikeSpeed * 1.2);
  assert(hot.pressure < .2, `an excellent strike nearly zeroes it, left ${hot.pressure}`);
}

// A direct slam beats a glancing skim at the same speed. The runtime projects
// velocity onto the line into the boiler, so a skim arrives here already small.
{
  const reach = BOILER.minStrikeSpeed + (BOILER.fullStrikeSpeed - BOILER.minStrikeSpeed) * .6;
  const direct = reach, glancing = reach * Math.cos(1.2);
  assert(strikeDrop(direct) > strikeDrop(glancing) * 2,
    `a direct hit far outscores a skim (${strikeDrop(direct)} vs ${strikeDrop(glancing)})`);
}

// --- Strike cooldown ---------------------------------------------------------
{
  const boiler = new Boiler(1, 0);
  assert(boiler.strike(BOILER.fullStrikeSpeed) > 0, 'the first strike lands');
  assert.equal(boiler.strike(BOILER.fullStrikeSpeed), 0, 'a second strike inside the cooldown is ignored');
  const held = boiler.pressure;
  for (let i = 0; i < 20; i++) { boiler.advance(1 / 60); boiler.strike(BOILER.fullStrikeSpeed); }
  assert.equal(boiler.pressure, held, 'sitting on the boiler cannot drain it');
  // A brush that vents nothing must not consume the cooldown either.
  const fresh = new Boiler(1, 0);
  for (let i = 0; i < 50; i++) assert.equal(fresh.strike(BOILER.minStrikeSpeed * .5), 0, 'a brush vents nothing');
  assert.equal(fresh.hitCooldown, 0, 'and never starts the cooldown');
  assert.equal(fresh.lastPressureDrop, 0, 'nor disturbs the debug values');
  assert(fresh.strike(BOILER.fullStrikeSpeed) > 0, 'so a real strike straight after still lands');
  // advance() clamps a frame to 50ms, so the cooldown ticks in frame-sized steps.
  run(boiler, BOILER.hitCooldown + .05);
  assert.equal(boiler.hitCooldown, 0, 'the cooldown reaches zero');
  assert(boiler.strike(BOILER.fullStrikeSpeed) > 0, 'and another strike lands');
  assert(BOILER.hitCooldown >= .2 && BOILER.hitCooldown <= 1, 'cooldown is short enough to stay playable');
}

// --- Automatic relief --------------------------------------------------------
{
  const boiler = new Boiler(.98, .05);
  const reliefs = run(boiler, 6);
  assert.equal(reliefs, 1, `reaching the peg vents exactly once, got ${reliefs}`);
  assert.equal(boiler.reliefCount, 1);
  assert(boiler.pressure < 1 && boiler.pressure >= BOILER.reliefFloor,
    `relief drops it back to the floor, left ${boiler.pressure}`);
  assert(BOILER.reliefFloor >= .6 && BOILER.reliefFloor <= .7, 'relief floor in the intended band');
  // It then climbs and vents again on its own cycle, not once per frame.
  const cycle = (1 - BOILER.reliefFloor) / boiler.riseRate;
  const more = run(boiler, 30);
  assert(more >= 1, 'it overheats again if left alone');
  assert(Math.abs(more - 30 / cycle) <= 1, `one vent per overheat cycle, expected ~${(30 / cycle).toFixed(1)}, got ${more}`);
  assert(more < 30 * 60 / 10, 'nowhere near one vent per frame');
}
{
  // A strike just under the peg keeps the automatic vent armed for later.
  const boiler = new Boiler(.99, 0);
  boiler.strike(BOILER.fullStrikeSpeed);
  assert.equal(boiler.reliefCount, 0, 'a manual save prevents the automatic vent');
  assert(boiler.pressure < .3);
}

// --- Reset -------------------------------------------------------------------
{
  const boiler = new Boiler(.34, .05);
  run(boiler, 20);
  boiler.strike(BOILER.fullStrikeSpeed);
  assert(boiler.reliefCount > 0 || boiler.lastPressureDrop > 0, 'the boiler has state to clear');
  boiler.reset();
  assert.equal(boiler.pressure, .34, 'reset restores the starting pressure');
  assert.equal(boiler.hitCooldown, 0, 'reset clears the cooldown');
  assert.equal(boiler.lastHitStrength, 0);
  assert.equal(boiler.lastPressureDrop, 0);
  assert.equal(boiler.reliefCount, 0);
  assert(boiler.strike(BOILER.fullStrikeSpeed) > 0, 'and it is immediately strikeable again');
}

// --- The snapshot the debug hook reports -------------------------------------
{
  const boiler = new Boiler(.5, .04);
  boiler.strike(BOILER.fullStrikeSpeed * .8);
  const snap = boiler.snapshot;
  assert.deepEqual(Object.keys(snap).sort(),
    ['lastHitStrength', 'lastPressureDrop', 'pressure', 'reliefCount', 'riseRate']);
  for (const value of Object.values(snap)) assert(Number.isFinite(value), 'snapshot is finite');
}

// A whole plausible session stays sane whatever it is fed.
{
  const boilers = makeBoilers();
  for (let i = 0; i < 4000; i++) {
    for (const boiler of boilers) {
      boiler.advance(1 / 60);
      if (i % 37 === 0) boiler.strike((i % 11) / 30 - .08);
      assert(boiler.pressure >= 0 && boiler.pressure <= 1);
      assert(Number.isFinite(boiler.pressure) && Number.isFinite(boiler.lastPressureDrop));
    }
  }
}

console.log('boilers: rise, clamping, impact curve, cooldown, relief and reset verified');
