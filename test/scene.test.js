import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultJet, defaultScene, parseScene, readScene, SceneError, serializeScene } from '../src/domain/scene.js';

test('the default scene is a jet heard by a binaural microphone, and it round-trips', () => {
  const scene = defaultScene();
  assert.equal(scene.format, 'rumbletect.scene');
  assert.equal(scene.emitters[0].kind, 'jet');
  assert.equal(scene.receivers[0].type, 'binaural');
  assert.deepEqual(readScene(JSON.parse(serializeScene(scene))), scene);
});

test('a jet lacking its engine takes the default engine, and a foreign scene is refused', () => {
  const saved = JSON.parse(serializeScene(defaultScene()));
  delete saved.emitters[0].engine;
  assert.deepEqual(readScene(saved).emitters[0].engine, defaultJet().engine);
  assert.throws(() => readScene({ ...saved, format: 'boomtect.scene' }), /not a Rumbletect scene/);
  assert.throws(() => parseScene({ ...defaultScene(), emitters: [{ ...defaultJet(), mach: 4 }] }), SceneError);
});
