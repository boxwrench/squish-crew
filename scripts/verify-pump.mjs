import assert from 'node:assert/strict';
import { Pump, PUMP, bonkStrength } from '../src/game/pump.ts';
import { RoomMood, MOOD } from '../src/game/room-mood.ts';

const DT = 1 / 60;
/** Run the pump for a while, collecting the discrete events it reports. */
const run = (pump, seconds) => {
  const events = [];
  for (let t = 0; t < seconds; t += DT) { const e = pump.advance(DT); if (e) events.push(e); }
  return events;
};

// --- It runs, then eventually faults -----------------------------------------
{
  const pump = new Pump(7);
  assert.equal(pump.faulted, false, 'it starts running');
  assert.equal(pump.speed, 1, 'at full speed');
  const [low, high] = PUMP.faultInterval;
  assert(pump.timeUntilFault >= low && pump.timeUntilFault <= high, 'first fault is scheduled in range');
  assert.deepEqual(run(pump, low - 1), [], 'nothing breaks during the free-play window');
  assert.equal(pump.faulted, false);
  const events = run(pump, high + 1);
  assert.equal(events[0], 'fault', 'it does fault eventually');
  assert.equal(pump.faultCount, 1);
  assert(pump.speed < 1, 'and the flywheel is coasting down');
}
{
  // Faults are spaced, not constant: a long shift left alone is mostly running.
  const pump = new Pump(3);
  let faulted = 0, frames = 0;
  for (let t = 0; t < 300; t += DT) { pump.advance(DT); frames++; if (pump.faulted) faulted++; }
  assert(pump.faultCount >= 5, `it faults repeatedly over five minutes, got ${pump.faultCount}`);
  assert(faulted / frames < .5, 'but is running for most of the time');
  assert(PUMP.faultInterval[0] >= 15 && PUMP.faultInterval[1] <= 30, 'one problem every 15-30s');
}
{
  // Seeded, so a run is reproducible.
  const a = new Pump(42), b = new Pump(42);
  assert.equal(a.timeUntilFault, b.timeUntilFault, 'the same seed schedules the same shift');
  assert.notEqual(new Pump(1).timeUntilFault, new Pump(2).timeUntilFault, 'different seeds differ');
}

// --- Bonking it ---------------------------------------------------------------
const faultIt = (seed = 5) => {
  const pump = new Pump(seed);
  while (!pump.faulted) pump.advance(DT);
  return pump;
};
{
  const pump = faultIt();
  assert.equal(pump.bonk(PUMP.minStrikeSpeed * .5), 0, 'a weak brush does not catch the motor');
  assert.equal(pump.faulted, true, 'so it stays faulted');
  assert.equal(pump.hitCooldown, 0, 'and the brush does not start the cooldown');
  assert(pump.bonk(PUMP.fullStrikeSpeed) > 0, 'a decent bonk restarts it');
  assert.equal(pump.faulted, false);
  assert.equal(pump.restartCount, 1);
  assert(pump.timeUntilFault > 0, 'and the next fault is rescheduled');
}
{
  const pump = faultIt();
  assert(pump.bonk(PUMP.fullStrikeSpeed) > 0);
  // Sitting on a running pump does nothing at all.
  for (let i = 0; i < 60; i++) { pump.advance(DT); pump.bonk(PUMP.fullStrikeSpeed); }
  assert.equal(pump.restartCount, 1, 'a running pump cannot be restarted again');
}
{
  const pump = faultIt();
  assert(pump.bonk(PUMP.fullStrikeSpeed) > 0, 'first bonk lands');
  pump.faulted = true;                       // fault again immediately
  assert.equal(pump.bonk(PUMP.fullStrikeSpeed), 0, 'a second bonk inside the cooldown is ignored');
  for (let t = 0; t < PUMP.hitCooldown + .05; t += DT) pump.advance(DT);
  assert.equal(pump.hitCooldown, 0);
  assert(pump.bonk(PUMP.fullStrikeSpeed) > 0, 'the cooldown expires and another bonk lands');
}
{
  // A sustained overlap cannot spam restarts.
  const pump = faultIt();
  let restarts = 0;
  for (let i = 0; i < 600; i++) {
    pump.advance(DT);
    if (pump.bonk(PUMP.fullStrikeSpeed) > 0) restarts++;
    if (!pump.faulted && i % 90 === 0) pump.faulted = true;   // it breaks again occasionally
  }
  assert(restarts <= 8, `restarts are cooldown limited, got ${restarts}`);
}
{
  assert.equal(bonkStrength(0), 0, 'a still body catches nothing');
  assert.equal(bonkStrength(-1), 0, 'moving away catches nothing');
  assert.equal(bonkStrength(PUMP.fullStrikeSpeed * 3), 1, 'the curve saturates');
  let previous = -1;
  for (let v = 0; v <= .4; v += .01) { const s = bonkStrength(v); assert(s >= previous); previous = s; }
  const span = PUMP.fullStrikeSpeed - PUMP.minStrikeSpeed;
  assert(bonkStrength(PUMP.minStrikeSpeed + span * .15) < PUMP.restartStrength, 'a soft nudge is below the bar');
  assert(bonkStrength(PUMP.minStrikeSpeed + span * .5) >= PUMP.restartStrength, 'a committed bonk clears it');
}

// --- Ignored faults recover on their own -------------------------------------
{
  const pump = faultIt();
  const events = run(pump, PUMP.selfRecover + 1);
  assert(events.includes('sputter'), 'an ignored fault coughs itself back to life');
  assert.equal(pump.faulted, false, 'and ends up running again');
  assert.equal(pump.restartCount, 0, 'without crediting the player for it');
  assert(PUMP.selfRecover >= 8, 'the player gets a fair chance to get there first');
}
{
  // Play is never blocked: leaving everything alone still ends up running.
  const pump = new Pump(11);
  run(pump, 240);
  assert(pump.faultCount > 0 && pump.speed >= 0 && pump.speed <= 1, 'state stays sane when ignored');
  assert(Number.isFinite(pump.timeUntilFault));
}

// --- Reset --------------------------------------------------------------------
{
  const pump = new Pump(9);
  run(pump, 40);
  pump.faulted = true;
  pump.bonk(PUMP.fullStrikeSpeed);
  assert(pump.restartCount > 0 || pump.faultCount > 0, 'there is state to clear');
  pump.reset();
  assert.equal(pump.faulted, false);
  assert.equal(pump.speed, 1);
  assert.equal(pump.restartCount, 0);
  assert.equal(pump.faultCount, 0);
  assert.equal(pump.hitCooldown, 0);
  assert.equal(pump.lastHitStrength, 0);
  assert.equal(pump.unattendedTime, 0);
  assert.equal(pump.timeUntilFault, new Pump(9).timeUntilFault, 'reset restores the seeded schedule');
}

// --- Room mood ----------------------------------------------------------------
const calm = { maxPressure: .3, pumpFaulted: false };
{
  const room = new RoomMood();
  assert.equal(room.update(DT, calm), 'smooth', 'quiet machinery is smooth');
  assert.equal(room.entered, false, 'and staying smooth is not a transition');
}
{
  const room = new RoomMood();
  room.update(DT, calm);
  assert.equal(room.update(DT, { maxPressure: .3, pumpFaulted: true }), 'warning', 'a faulted pump warns');
  assert.equal(room.entered, true, 'the change is reported once');
  assert.equal(room.update(DT, { maxPressure: .3, pumpFaulted: true }), 'warning');
  assert.equal(room.entered, false, 'and not repeated every frame');
  assert.equal(room.update(DT, calm), 'smooth', 'fixing it settles the room');
  assert.equal(room.entered, true);
}
{
  const room = new RoomMood();
  room.update(DT, calm);
  assert.equal(room.update(DT, { maxPressure: MOOD.hotPressure, pumpFaulted: false }), 'warning',
    'a hot boiler warns on its own');
  assert.equal(room.update(DT, { maxPressure: MOOD.hotPressure - .01, pumpFaulted: false }), 'smooth',
    'and cooling it settles the room again');
}
{
  const room = new RoomMood();
  room.update(DT, calm);
  room.mishap();
  assert.equal(room.update(DT, calm), 'mishap', 'a discrete event escalates the room');
  assert.equal(room.entered, true, 'once');
  let entries = 0;
  for (let t = 0; t < MOOD.mishapHold - .2; t += DT) { room.update(DT, calm); if (room.entered) entries++; }
  assert.equal(entries, 0, 'and not once per frame while it holds');
  for (let t = 0; t < 1; t += DT) room.update(DT, calm);
  assert.equal(room.mood, 'smooth', 'then it lets go by itself');
}
{
  // A mishap outranks a warning while it holds, then falls back to it.
  const room = new RoomMood();
  const troubled = { maxPressure: .3, pumpFaulted: true };
  room.update(DT, troubled);
  room.mishap();
  assert.equal(room.update(DT, troubled), 'mishap');
  for (let t = 0; t < MOOD.mishapHold + .1; t += DT) room.update(DT, troubled);
  assert.equal(room.mood, 'warning', 'the underlying problem is still there');
}
{
  const room = new RoomMood();
  room.mishap();
  room.update(DT, calm);
  room.reset();
  assert.equal(room.mood, 'smooth');
  assert.equal(room.entered, false);
  assert.equal(room.update(DT, calm), 'smooth', 'reset clears a held mishap');
}

console.log('pump: schedule, bonk curve, cooldown, self-recovery, room mood and reset verified');
