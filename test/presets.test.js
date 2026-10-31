import assert from 'node:assert/strict';
import test from 'node:test';
import { KIND_PANELS } from '../src/ui/kinds.js';
import { defaultAirliner, defaultJet, defaultRocket, defaultSalvo, defaultScene, defaultVolcano, readScene } from '../src/domain/scene.js';

const through = (scene, emitter, values) => {
  const next = structuredClone(scene);
  KIND_PANELS[emitter.kind].preset.give(next.emitters.find(item => item.id === emitter.id), structuredClone(values));
  return readScene(next).emitters.find(item => item.id === emitter.id);
};

test('a jet preset changes the engines and leaves the flight, place, name and seed', () => {
  const scene = defaultScene('jet');
  const source = { ...defaultJet('jet-9', 'Source', 7), engineClass: 'bomber', engine: { ...defaultJet().engine, engines: 4, pressureRatio: 2.5 } };
  const values = KIND_PANELS.jet.preset.take(source);
  const target = { ...scene.emitters[0], mach: 1.4, headingDegrees: 200, startMetres: { x: 1, y: 2, z: 900 } };
  scene.emitters = [target];
  const loaded = through(scene, target, values);
  assert.equal(loaded.engineClass, 'bomber');
  assert.deepEqual(loaded.engine, source.engine);
  for (const key of ['mach', 'headingDegrees', 'startMetres', 'name', 'seed', 'id']) assert.deepEqual(loaded[key], target[key], key);
});

test('a rocket\'s device loads into a salvo and back, and only a salvo carries its launcher', () => {
  const scene = defaultScene('rocket');
  const salvo = { ...defaultSalvo('salvo-1', 'Salvo', 3), roundCount: 12 };
  const rocket = defaultRocket('rocket-1', 'Rocket', 4);
  scene.emitters = [rocket, salvo];
  const fromRocket = KIND_PANELS.rocket.preset.take(rocket);
  assert.equal('roundCount' in fromRocket, false);
  const loadedSalvo = through(scene, salvo, fromRocket);
  assert.deepEqual(loadedSalvo.engine, rocket.engine);
  assert.equal(loadedSalvo.roundCount, 12);
  assert.deepEqual(loadedSalvo.ascent.burnSeconds, salvo.ascent.burnSeconds);
  const loadedRocket = through(scene, rocket, KIND_PANELS.salvo.preset.take(salvo));
  assert.deepEqual(loadedRocket.engine, salvo.engine);
  assert.equal('roundCount' in loadedRocket, false);
});

test('a preset from another version loads: a missing field keeps the emitter\'s, one out of range is brought in', () => {
  const scene = defaultScene('volcano');
  const volcano = defaultVolcano();
  scene.emitters = [volcano];
  const loaded = through(scene, volcano, { jet: { ventVelocityMetresPerSecond: 99999 }, unknown: 1 });
  assert.equal(loaded.jet.ventVelocityMetresPerSecond, 600);
  assert.equal(loaded.jet.ventDiameterMetres, volcano.jet.ventDiameterMetres);
  assert.equal(loaded.category, volcano.category);
  assert.equal('unknown' in loaded, false);
});

const flown = (scene, emitter, preset) => {
  const next = structuredClone(scene);
  const target = next.emitters.find(item => item.id === emitter.id);
  if (preset.values) KIND_PANELS[emitter.kind].preset.give(target, structuredClone(preset.values));
  if (preset.flight) KIND_PANELS[emitter.kind].preset.giveFlight(target, structuredClone(preset.flight));
  return readScene(next).emitters.find(item => item.id === emitter.id);
};

test('a jet\'s flight, its place included, loads into an airliner and leaves its engines', () => {
  const scene = defaultScene('jet');
  const jet = { ...defaultJet('jet-1', 'Jet', 1), mach: 1.3, startMetres: { x: 400, y: -900, z: 2000 }, headingDegrees: 45, turnDegrees: 90 };
  const airliner = { ...defaultAirliner('airliner-1', 'Airliner', 2) };
  scene.emitters = [jet, airliner];
  assert.equal(KIND_PANELS.jet.preset.flightSection, KIND_PANELS.airliner.preset.flightSection);
  const loaded = flown(scene, airliner, { flight: KIND_PANELS.jet.preset.takeFlight(jet) });
  for (const key of ['mach', 'startMetres', 'headingDegrees', 'turnDegrees', 'durationSeconds']) assert.deepEqual(loaded[key], jet[key], key);
  assert.deepEqual(loaded.engine, airliner.engine);
  assert.equal(loaded.engineClass, airliner.engineClass);
  assert.equal(loaded.gearAndFlaps, airliner.gearAndFlaps);
});

test('both a rocket\'s device and its ascent load together, and a volcano\'s flight is its crater and onset', () => {
  const scene = defaultScene('rocket');
  const source = { ...defaultRocket('rocket-1', 'Source', 1), launchDegrees: 60, headingDegrees: 10, startMetres: { x: 5, y: 6, z: 10 } };
  source.ascent = { ...source.ascent, burnSeconds: 40, bendDegrees: 30 };
  const target = defaultSalvo('salvo-1', 'Target', 2);
  scene.emitters = [source, target];
  const panel = KIND_PANELS.rocket.preset;
  const loaded = flown(scene, target, { values: panel.take(source), flight: panel.takeFlight(source) });
  assert.deepEqual(loaded.engine, source.engine);
  assert.equal(loaded.launchDegrees, 60);
  assert.equal(loaded.ascent.burnSeconds, 40);
  assert.deepEqual(loaded.startMetres, source.startMetres);
  assert.equal(loaded.roundCount, target.roundCount);
  assert.deepEqual(KIND_PANELS.volcano.preset.takeFlight({ ...defaultVolcano(), ventMetres: { x: 1, y: 2, z: 3 } }), { ventMetres: { x: 1, y: 2, z: 3 }, startSeconds: 0 });
});
