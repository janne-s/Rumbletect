import test from 'node:test';
import assert from 'node:assert/strict';
import { engineAtPower, jetOfEngine, powerLabel, powerOfEngine, streamsOf } from '../src/domain/engine.js';
import { jetComponents, jetSpectra } from '../src/domain/jet.js';
import { ENGINE } from '../src/domain/constants.js';

test('the jet of an ideal nozzle follows from its pressure ratio and total temperature', () => {
  const jet = jetOfEngine({ pressureRatio: 3.5, totalTemperatureKelvin: 750, diameterMetres: .9 }, 15);
  const exponent = (ENGINE.gasGamma - 1) / ENGINE.gasGamma;
  assert.ok(Math.abs(jet.velocityMetresPerSecond - Math.sqrt(2 * ENGINE.gasHeatCapacityJoulesPerKilogramKelvin * 750 * (1 - 3.5 ** -exponent))) < 1e-9);
  assert.ok(Math.abs(jet.temperatureRatio - 750 / 288.15) < 1e-12);
  assert.equal(jetOfEngine({ pressureRatio: 1, totalTemperatureKelvin: 600, diameterMetres: 1 }, 15).velocityMetresPerSecond, 0);
});

test('every class\'s power settings are reached exactly and read back', () => {
  for (const [key, type] of Object.entries(ENGINE.classes)) {
    for (const setting of type.settings) {
      const engine = engineAtPower(setting.power, key);
      assert.equal(engine.totalTemperatureKelvin, setting.totalTemperatureKelvin);
      assert.ok(Math.abs(powerOfEngine(engine, key) - setting.power) < 1e-12);
      assert.equal(powerLabel(setting.power, key), setting.label);
    }
    for (const power of [.2, .5, .9]) assert.ok(Math.abs(powerOfEngine(engineAtPower(power, key), key) - power) < .01);
  }
});

test('the smaller classes\' full power gives their engines\' exhaust velocity and thrust within a tenth', () => {
  const thrust = (engine, velocity) => {
    const exitKelvin = engine.totalTemperatureKelvin - velocity ** 2 / (2 * ENGINE.gasHeatCapacityJoulesPerKilogramKelvin);
    return 101325 / (287 * exitKelvin) * Math.PI * engine.diameterMetres ** 2 / 4 * velocity ** 2;
  };
  for (const [key, newtons, metresPerSecond] of [['hobby', 100, 434], ['drone', 4000, 597], ['cruise', 3100, 500]]) {
    const engine = engineAtPower(1, key);
    const velocity = jetOfEngine(engine, 15).velocityMetresPerSecond;
    assert.ok(Math.abs(velocity / metresPerSecond - 1) < .05, `${key}: ${velocity} m/s`);
    assert.ok(Math.abs(thrust(engine, velocity) / newtons - 1) < .1, `${key}: ${thrust(engine, velocity)} N`);
  }
  const [core, fan] = streamsOf(engineAtPower(1, 'bomber'), 'bomber', 15);
  assert.ok(Math.abs(core.velocityMetresPerSecond / 459 - 1) < .01 && Math.abs(fan.velocityMetresPerSecond / 290 - 1) < .01);
  const streams = [[engineAtPower(1, 'bomber'), core], [{ ...ENGINE.classes.bomber.bypass[1] }, fan]];
  const total = streams.reduce((sum, [engine, jet]) => sum + thrust(engine, jet.velocityMetresPerSecond), 0);
  assert.ok(Math.abs(total / 75600 - 1) < .1, `bomber: ${total} N`);
});

test('a bomber\'s core keeps its jet noise near Mach 0.9, where one mixed jet of the same thrust fell silent', () => {
  const frequencies = Array.from({ length: 400 }, (_, index) => 10 * 1.02 ** index);
  const power = (jets, speed) => jets.reduce((sum, jet) => {
    const { large, fine } = jetSpectra(jetComponents(jet, { temperatureCelsius: 15, flightMetresPerSecond: speed }), 90, frequencies);
    return sum + frequencies.reduce((total, frequency, index) => total + (large[index] + fine[index]) * frequency, 0);
  }, 0);
  const streams = streamsOf(engineAtPower(1, 'bomber'), 'bomber', 15);
  const mixed = [jetOfEngine({ pressureRatio: 1.552, totalTemperatureKelvin: 545, diameterMetres: 1.014 }, 15)];
  const drop = jets => 10 * Math.log10(power(jets, 0) / power(jets, 320));
  assert.ok(drop(streams) < 25 && drop(mixed) > 35, `${drop(streams)} dB and ${drop(mixed)} dB`);
});

test('more power is a faster and hotter jet', () => {
  let last = 0;
  for (let power = 0; power <= 1; power += .05) {
    const velocity = jetOfEngine(engineAtPower(power), 15).velocityMetresPerSecond;
    assert.ok(velocity >= last);
    last = velocity;
  }
});

test('a heavy bomber\'s eight engines are 9 dB above one at the same power', async () => {
  const { jetGrains } = await import('../src/domain/grains.js');
  const { defaultJet, defaultScene, parseScene } = await import('../src/domain/scene.js');
  const { engineOfClass } = await import('../src/domain/engine.js');
  const base = defaultScene();
  const power = engines => {
    const jet = { ...defaultJet(), engineClass: 'bomber', engine: { ...engineOfClass('bomber'), engines }, durationSeconds: 2 };
    const scene = parseScene({ ...base, emitters: [jet], render: { ...base.render, ambisonicOrder: 0 } });
    return jetGrains(scene.emitters[0], scene).rows.reduce((sum, row) => sum + row.amplitudePaMetres ** 2, 0);
  };
  assert.ok(Math.abs(10 * Math.log10(power(8) / power(1)) - 10 * Math.log10(8)) < .01);
});
