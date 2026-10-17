import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE } from '../src/domain/constants.js';
import { addTurbomachinery, referencePower, turbomachineryAt } from '../src/domain/turbomachinery.js';

test('the blade-passing frequency runs from idle to full with power, and the fighter has none', () => {
  const turbo = ENGINE.classes.hobby.turbomachinery;
  const reference = referencePower('hobby', 15);
  assert.equal(turbomachineryAt('hobby', 0, reference).bladeHz, turbo.idleBladeHz);
  assert.equal(turbomachineryAt('hobby', 1, reference).bladeHz, turbo.fullBladeHz);
  assert.equal(turbomachineryAt('fighter', 1, referencePower('fighter', 15)), null);
});

test('a tone adds its power once, at its frequency, and less aft than ahead', () => {
  const binHz = 48000 / 4096;
  const frequencies = Array.from({ length: 2049 }, (_, bin) => bin * binHz);
  const reference = referencePower('hobby', 15);
  const state = turbomachineryAt('hobby', 1, reference);
  const ahead = addTurbomachinery(new Float64Array(frequencies.length), frequencies, state, 30);
  const total = ahead.reduce((sum, value) => sum + value * binHz, 0);
  const expected = state.tones.reduce((sum, value) => sum + value, 0) - state.tones.filter((_, index) => state.bladeHz * (index + 1) >= 24000 - binHz).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total / expected - 1) < 1e-9, `${total} vs ${expected}`);
  const strongest = ahead.indexOf(Math.max(...ahead.slice(1, Math.round(15000 / binHz))));
  assert.ok(Math.abs(frequencies[strongest] - state.bladeHz) < binHz);
  const aft = addTurbomachinery(new Float64Array(frequencies.length), frequencies, state, 180);
  assert.ok(Math.abs(10 * Math.log10(aft.reduce((a, b) => a + b, 0) / ahead.reduce((a, b) => a + b, 0)) + 10) < 1e-6);
});

test('the bomber\'s fan hump holds its power', () => {
  const binHz = 48000 / 4096;
  const frequencies = Array.from({ length: 2049 }, (_, bin) => bin * binHz);
  const state = { ...turbomachineryAt('bomber', 1, referencePower('bomber', 15)), tones: [] };
  const psd = addTurbomachinery(new Float64Array(frequencies.length), frequencies, state, 90);
  assert.ok(Math.abs(psd.reduce((sum, value) => sum + value * binHz, 0) / state.hump - 1) < .02);
});
