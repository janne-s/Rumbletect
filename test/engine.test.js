import test from 'node:test';
import assert from 'node:assert/strict';
import { engineAtPower, jetOfEngine, powerLabel, powerOfEngine } from '../src/domain/engine.js';
import { ENGINE } from '../src/domain/constants.js';

test('the jet of an ideal nozzle follows from its pressure ratio and total temperature', () => {
  const jet = jetOfEngine({ pressureRatio: 3.5, totalTemperatureKelvin: 750, diameterMetres: .9 }, 15);
  const exponent = (ENGINE.gasGamma - 1) / ENGINE.gasGamma;
  assert.ok(Math.abs(jet.velocityMetresPerSecond - Math.sqrt(2 * ENGINE.gasHeatCapacityJoulesPerKilogramKelvin * 750 * (1 - 3.5 ** -exponent))) < 1e-9);
  assert.ok(Math.abs(jet.temperatureRatio - 750 / 288.15) < 1e-12);
  assert.equal(jetOfEngine({ pressureRatio: 1, totalTemperatureKelvin: 600, diameterMetres: 1 }, 15).velocityMetresPerSecond, 0);
});

test('the power settings are reached exactly and read back', () => {
  for (const setting of ENGINE.settings) {
    const engine = engineAtPower(setting.power);
    assert.equal(engine.totalTemperatureKelvin, setting.totalTemperatureKelvin);
    assert.ok(Math.abs(powerOfEngine(engine) - setting.power) < 1e-12);
    assert.equal(powerLabel(setting.power), setting.label);
  }
  for (const power of [.2, .5, .9]) assert.ok(Math.abs(powerOfEngine(engineAtPower(power)) - power) < .01);
});

test('more power is a faster and hotter jet', () => {
  let last = 0;
  for (let power = 0; power <= 1; power += .05) {
    const velocity = jetOfEngine(engineAtPower(power), 15).velocityMetresPerSecond;
    assert.ok(velocity >= last);
    last = velocity;
  }
});
