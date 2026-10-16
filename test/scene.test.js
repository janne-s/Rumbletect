import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultScene, parseScene, readScene, SceneError, serializeScene } from '../src/domain/scene.js';
import { APP_VERSION } from '../src/domain/constants.js';

test('the application version is the one in package.json', () => {
  assert.equal(APP_VERSION, JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version);
});

test('the default scene parses and survives a save and an open unchanged', () => {
  const scene = parseScene(defaultScene());
  assert.deepEqual(readScene(JSON.parse(serializeScene(scene))), scene);
});

test('a scene is read tolerantly: defaults fill gaps, unknown fields go, values come into range', () => {
  const saved = JSON.parse(serializeScene(defaultScene()));
  delete saved.air.turbulenceStrength;
  saved.air.wind = 12;
  saved.emitters[0].mach = 3;
  delete saved.emitters[0].engine.diameterMetres;
  saved.version = 99;
  const scene = readScene(saved);
  assert.equal(scene.air.turbulenceStrength, defaultScene().air.turbulenceStrength);
  assert.equal(scene.air.wind, undefined);
  assert.equal(scene.emitters[0].mach, .95);
  assert.equal(scene.emitters[0].engine.diameterMetres, defaultScene().emitters[0].engine.diameterMetres);
  assert.equal(scene.version, 1);
});

test('only a document of another kind or broken structure is refused', () => {
  assert.throws(() => readScene({ format: 'boomtect.scene' }), SceneError);
  assert.throws(() => readScene({ ...defaultScene(), emitters: [{ kind: 'flight' }] }), SceneError);
  assert.throws(() => parseScene({ ...defaultScene(), receivers: [] }), SceneError);
});

test('an edit outside its range is refused, not clamped', () => {
  const scene = defaultScene();
  scene.emitters[0].mach = 1.2;
  assert.throws(() => parseScene(scene), SceneError);
});
