import assert from 'node:assert/strict';
import test from 'node:test';
import { KIND_PANELS } from '../src/ui/kinds.js';
import { defaultJet, defaultRocket, defaultSalvo, defaultScene, defaultVolcano, readScene } from '../src/domain/scene.js';

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
