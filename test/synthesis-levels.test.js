import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readScene } from '../src/domain/scene.js';
import { REFERENCE_CASES, renderCase } from './reference-scenes.js';

const sceneOf = name => REFERENCE_CASES.find(item => item.name === name).scene();
const pressure = (scene, name) => renderCase({ ...REFERENCE_CASES.find(item => item.name === name), scene: () => scene })[0].channels[0];
const rms = samples => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
const withQuality = (name, quality) => { const scene = sceneOf(name); scene.render.quality = { ...scene.render.quality, ...quality }; return scene; };

test('a scene without the synthesis settings reads them as exact', () => {
  const scene = readScene(JSON.parse(readFileSync(new URL('./fixtures/scene-v1-jet.json', import.meta.url), 'utf8')));
  assert.equal(scene.render.quality.synthesis, 0);
  assert.equal(scene.render.quality.coarseEchoes, false);
});

test('fast synthesis renders the exact sound up to rounding, and fastest other noise at the same level', () => {
  const exact = pressure(sceneOf('jet-flat'), 'jet-flat');
  const fast = pressure(withQuality('jet-flat', { synthesis: 1 }), 'jet-flat');
  assert.equal(fast.length, exact.length);
  const difference = Math.sqrt(fast.reduce((sum, value, index) => sum + (value - exact[index]) ** 2, 0) / fast.length);
  assert.ok(difference < 1e-9 * rms(exact), `difference ${difference}`);
  const fastest = pressure(withQuality('jet-flat', { synthesis: 2 }), 'jet-flat');
  const decibels = 20 * Math.log10(rms(fastest) / rms(exact));
  assert.ok(Math.abs(decibels) < 1.5, `${decibels.toFixed(2)} dB`);
  assert.notDeepEqual(fastest.slice(0, 4096), exact.slice(0, 4096));
});

test('coarse echoes keep the level of a render over terrain', () => {
  const exact = pressure(sceneOf('volcano-terrain'), 'volcano-terrain');
  const coarse = pressure(withQuality('volcano-terrain', { coarseEchoes: true }), 'volcano-terrain');
  const decibels = 20 * Math.log10(rms(coarse) / rms(exact));
  assert.ok(Math.abs(decibels) < .5, `${decibels.toFixed(2)} dB`);
});
