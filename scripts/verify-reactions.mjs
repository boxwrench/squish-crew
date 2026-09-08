import assert from 'node:assert/strict';
import { ReactionGate, REACTION, sweatDrops, squealVoice, hardImpact } from '../src/game/reactions.ts';

// --- Hard impact grunt -------------------------------------------------------
{
  const gate = new ReactionGate();
  assert.equal(gate.grunt(.13), false, 'a settling contact does not grunt');
  assert.equal(gate.grunt(.22), false, 'an ordinary hop landing does not grunt');
  assert.equal(gate.grunt(REACTION.gruntSpeed - .01), false, 'just under the threshold stays quiet');
  assert.equal(gate.grunt(.38), true, 'a hard landing is grunt-eligible');
  assert.equal(gate.grunt(.4), false, 'a second hard landing inside the cooldown is suppressed');
  gate.advance(REACTION.gruntCooldown * .5);
  assert.equal(gate.grunt(.4), false, 'the cooldown is not half-honoured');
  gate.advance(REACTION.gruntCooldown * .5 + 1e-6);
  assert.equal(gate.grunt(.4), true, 'the grunt returns once the cooldown elapses');
  assert(REACTION.gruntCooldown >= .3 && REACTION.gruntCooldown <= .45, 'cooldown stays in the intended 300-450ms band');
  // Measured in-game landings: settle .12, ordinary hop .22, deliberate drop .33-.41.
  assert(REACTION.gruntSpeed > .25 && REACTION.gruntSpeed < .33, 'the threshold clears every ordinary hop but is reachable by a drop');
  assert.equal(hardImpact(.2), 0, 'soft landings carry no hardness');
  assert.equal(hardImpact(10), 1, 'hardness is clamped');
}

// A run of bouncing must not produce a grunt per bounce.
{
  const gate = new ReactionGate();
  let grunts = 0;
  for (let i = 0; i < 120; i++) { // two seconds of hard bouncing at 60fps
    if (gate.grunt(.4)) grunts++;
    gate.advance(1 / 60);
  }
  assert(grunts >= 4 && grunts <= 7, `bouncing is rate limited, got ${grunts}`);
}

// --- Stretch squeal ----------------------------------------------------------
{
  assert.equal(squealVoice(0).gain, 0, 'no grab, no squeal');
  assert.equal(squealVoice(.15).gain, 0, 'a light drag is silent');
  assert.equal(squealVoice(REACTION.squealFloor).gain, 0, 'the floor itself is silent');
  const strained = squealVoice(.45), squeal = squealVoice(.9);
  assert(strained.gain > 0 && strained.gain < .02, 'mid stretch is only a quiet strained squeak');
  assert(squeal.gain > strained.gain * 3, 'extreme stretch is clearly louder');
  assert(squeal.gain <= .075, 'the squeal stays bounded');
  assert(squeal.frequency > strained.frequency * 2, 'pitch rises into an "eeee" at the extreme');
  let previous = -1;
  for (let v = 0; v <= 1.0001; v += .05) {
    const voice = squealVoice(v);
    assert(voice.gain >= previous, 'loudness is monotonic in stretch');
    assert(Number.isFinite(voice.frequency) && Number.isFinite(voice.filter));
    previous = voice.gain;
  }
  assert.deepEqual(squealVoice(2), squealVoice(1), 'out-of-range stretch is clamped');
}

// --- Extreme-stretch sweat ---------------------------------------------------
{
  const gate = new ReactionGate();
  assert.equal(gate.stretchSweat(.5), false, 'normal dragging raises no sweat');
  assert.equal(gate.stretchSweat(REACTION.stretchArm - .01), false, 'just under the arm point stays dry');
  assert.equal(gate.stretchSweat(.85), true, 'reaching extreme stretch sweats once');
  for (let i = 0; i < 60; i++) assert.equal(gate.stretchSweat(.95), false, 'held extreme stretch does not spam');
  assert.equal(gate.stretchSweat(.6), false, 'relaxing part way does not re-arm');
  assert.equal(gate.stretchSweat(.9), false, 'still disarmed after a partial relax');
  assert.equal(gate.stretchSweat(.4), false, 'falling below the re-arm point is itself silent');
  assert.equal(gate.stretchSweat(.9), true, 'a re-armed grip can sweat again');
  gate.stretchSweat(.95);
  gate.releaseGrab();
  assert.equal(gate.stretchSweat(.9), true, 'a fresh grab starts re-armed');
  assert(REACTION.stretchArm >= .75 && REACTION.stretchArm <= .8);
  assert(REACTION.stretchRearm <= .55 && REACTION.stretchRearm < REACTION.stretchArm);
  assert(REACTION.stretchDrops >= 2 && REACTION.stretchDrops <= 4, 'an extreme-stretch burst is 2-4 drops');
}

// --- Hard impact sweat -------------------------------------------------------
{
  const gate = new ReactionGate();
  assert.equal(gate.impactSweat(.22), 0, 'an ordinary hop landing raises no sweat');
  const drops = gate.impactSweat(.38);
  assert(drops >= 2 && drops <= 6, `impact sweat is 2-6 drops, got ${drops}`);
  assert.equal(gate.impactSweat(.4), 0, 'one landing cannot repeatedly emit bursts');
  gate.advance(REACTION.sweatCooldown + 1e-6);
  assert(gate.impactSweat(.4) > 0, 'a later landing may sweat again');
  for (const speed of [.32, .35, .4, .5, 1.4, 4]) {
    const count = sweatDrops(speed);
    assert(count >= REACTION.minDrops && count <= REACTION.maxDrops, `${speed} m/s yields ${count} drops`);
    assert.equal(count, Math.round(count), 'drop counts are whole drops');
  }
  assert.equal(sweatDrops(.32), REACTION.minDrops, 'a marginal landing sweats the minimum');
  assert.equal(sweatDrops(.45), REACTION.maxDrops, 'the hardest landing still caps at six drops');
}

// The grunt and sweat cooldowns are independent of one another.
{
  const gate = new ReactionGate();
  assert.equal(gate.grunt(.4), true);
  assert(gate.impactSweat(.4) > 0, 'sweat is not blocked by the grunt cooldown');
  gate.advance(REACTION.gruntCooldown + 1e-6);
  assert.equal(gate.grunt(.4), true, 'the grunt clock runs on its own schedule');
  assert.equal(gate.impactSweat(.4), 0, 'while the longer sweat cooldown still holds');
}

// --- Reset -------------------------------------------------------------------
{
  const gate = new ReactionGate();
  gate.grunt(.4); gate.impactSweat(.4); gate.stretchSweat(.9);
  gate.reset();
  assert.equal(gate.grunt(.4), true, 'reset clears the grunt cooldown');
  assert(gate.impactSweat(.4) > 0, 'reset clears the sweat cooldown');
  assert.equal(gate.stretchSweat(.9), true, 'reset re-arms the extreme-stretch burst');
}

console.log('reactions: gating, cooldowns, squeal curve and reset verified');
