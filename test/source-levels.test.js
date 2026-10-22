import assert from 'node:assert/strict';
import test from 'node:test';
import { jetPath, jetSource } from '../src/domain/grains.js';
import { ascentPath, rocketSource, soundPowerWatts, vehicleOf } from '../src/domain/rocket.js';
import { salvoRounds } from '../src/domain/salvo.js';
import { defaultAirliner, defaultJet, defaultRocket, defaultScene } from '../src/domain/scene.js';
import { sourceLevels } from '../src/domain/source-levels.js';
import { terrainSurface } from '../src/shared/domain/terrain.js';

const sceneWith = emitter => ({ ...defaultScene(), emitters: [emitter] });

test('a rocket’s sound power from its spectra over the sphere matches Mathews & Gee’s overall power', () => {
  const rocket = defaultRocket();
  const scene = sceneWith(rocket);
  const [round] = salvoRounds(rocket);
  const path = ascentPath(round, terrainSurface(scene.terrain));
  const { soundPowerDecibels } = sourceLevels(rocketSource(round, scene, path), path, scene);
  const formula = 10 * Math.log10(soundPowerWatts(vehicleOf(round)) / 1e-12);
  assert.ok(Math.abs(soundPowerDecibels - formula) < .5, `${soundPowerDecibels} vs ${formula} dB`);
});

test('a jet’s levels follow its power: a fighter is louder than an airliner, and its A-weighted level at 1 km is below its power by more than spreading', () => {
  const levels = emitter => { const scene = sceneWith(emitter); return sourceLevels(jetSource(emitter, scene), jetPath(emitter, scene), scene); };
  const fighter = levels(defaultJet());
  const airliner = levels(defaultAirliner());
  assert.ok(fighter.soundPowerDecibels > airliner.soundPowerDecibels + 10);
  assert.ok(fighter.aWeightedAtKilometreDecibels > airliner.aWeightedAtKilometreDecibels + 10);
  const spreading = 10 * Math.log10(4 * Math.PI * 1000 ** 2);
  for (const { soundPowerDecibels, aWeightedAtKilometreDecibels } of [fighter, airliner]) {
    assert.ok(aWeightedAtKilometreDecibels < soundPowerDecibels - spreading + 15, 'directivity alone does not reach 15 dB');
    assert.ok(aWeightedAtKilometreDecibels > soundPowerDecibels - spreading - 40);
  }
});
