import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveVelocity, fineSimilarityDecibels, flightConvectionDecibels, jetComponents, jetSpectra, largeSimilarityDecibels, speedOfSound } from '../src/domain/jet.js';
import { JET, REFERENCE_SOUND_PRESSURE_PA } from '../src/domain/constants.js';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const jet = { diameterMetres: .9, velocityMetresPerSecond: 650, temperatureRatio: 2.6 };

test('both similarity spectra are continuous and peak at 0 dB at their peak frequency', () => {
  // The published coefficients are rounded: the pieces of F meet within 3e-4 dB.
  for (const at of [2.5, 1, .5]) close(largeSimilarityDecibels(at * (1 - 1e-9)), largeSimilarityDecibels(at * (1 + 1e-9)), 1e-3, `F at ${at}`);
  for (const at of [30, 10, 1, .15, .05]) close(fineSimilarityDecibels(at * (1 - 1e-9)), fineSimilarityDecibels(at * (1 + 1e-9)), 1e-3, `G at ${at}`);
  close(largeSimilarityDecibels(1), 0, 1e-12, 'F(1)');
  close(fineSimilarityDecibels(1), 0, 1e-12, 'G(1)');
  for (let exponent = -3; exponent <= 3; exponent += .01) {
    assert.ok(largeSimilarityDecibels(10 ** exponent) <= .01);
    assert.ok(fineSimilarityDecibels(10 ** exponent) <= 1e-9);
  }
});

test('static levels follow Tam et al. eqs. 7 and 9, raised by 10 log of the nozzle\'s size over the laboratory\'s', () => {
  const components = jetComponents(jet, { temperatureCelsius: 15 });
  const acoustic = Math.log10(650 / speedOfSound(15));
  const size = 10 * Math.log10(.9 / JET.levelReferenceDiameterMetres);
  close(components.large.decibels, 75 + 46 / 2.6 ** .3 + 10 * (10.06 - .495 * 2.6) * acoustic + size, 1e-9, 'A');
  close(components.fine.decibels, 83.2 + 19.3 / 2.6 ** .62 + 10 * (6.4 + 1.2 / 2.6 ** 1.4) * acoustic + size, 1e-9, 'B');
  close(components.large.peakHz * .9 / 650, .19, 1e-12, 'St_L');
  close(components.fine.peakHz * .9 / 650, .45, 1e-12, 'St_F');
});

test('at 100 D_j the spectrum peaks 40 dB below the component level, as Tam et al. plot it', () => {
  const components = jetComponents(jet, { temperatureCelsius: 15 });
  const { large } = jetSpectra(components, 160, [components.large.peakHz]);
  const atReference = 10 * Math.log10(large[0] / REFERENCE_SOUND_PRESSURE_PA ** 2) - 20 * Math.log10(100 * .9);
  close(atReference, components.large.decibels - 40, 1e-9, 'large at 160°');
  const { fine } = jetSpectra(components, 90, [components.fine.peakHz]);
  close(10 * Math.log10(fine[0] / REFERENCE_SOUND_PRESSURE_PA ** 2) - 20 * Math.log10(90), components.fine.decibels - 40, 1e-9, 'fine at 90°');
});

test('without flight nothing changes, and flight lowers the aft noise', () => {
  const still = jetComponents(jet, { temperatureCelsius: 15 });
  const moving = jetComponents(jet, { temperatureCelsius: 15, flightMetresPerSecond: 0 });
  assert.deepEqual(still, moving);
  for (const angle of [30, 90, 150]) close(flightConvectionDecibels(still, angle), 0, 1e-12, `${angle}°`);
  close(effectiveVelocity(650, 0), 650, 1e-12, 'V_e static');
  const flying = jetComponents(jet, { temperatureCelsius: 15, flightMetresPerSecond: 150 });
  const aft = frequencies => jetSpectra(flying, 150, frequencies).large[0] / jetSpectra(still, 150, frequencies).large[0];
  assert.ok(aft([100]) < 1);
});

test('OASPL at 100 D_j does not depend on the nozzle\'s size and lies near Khavaran & Bridges\'s', () => {
  const frequencies = [];
  for (let x = Math.log(1e-3); x < Math.log(2e5); x += .01) frequencies.push(Math.exp(x));
  const oaspl = diameter => {
    const components = jetComponents({ diameterMetres: diameter, velocityMetresPerSecond: speedOfSound(15), temperatureRatio: 2.7 }, { temperatureCelsius: 15 });
    const { large, fine } = jetSpectra(components, 140, frequencies);
    const sum = frequencies.reduce((total, frequency, index) => total + (large[index] + fine[index]) * frequency * .01, 0);
    return 10 * Math.log10(sum / (100 * diameter) ** 2 / REFERENCE_SOUND_PRESSURE_PA ** 2);
  };
  close(oaspl(.05), oaspl(50), .01, 'size');
  close(oaspl(1), 107, 6, 'Khavaran & Bridges at 140°');
});

test('a jet flies straight, turns by its Turn on its radius from when its turn starts whatever its flight time, and its category leaves its flight as it was', async () => {
  const { defaultJet, defaultScene, parseScene } = await import('../src/domain/scene.js');
  const { jetPath } = await import('../src/domain/grains.js');
  const { macrosFor } = await import('../src/ui/macros.js');
  const base = defaultScene();
  const jet = { ...defaultJet(), turnDegrees: 90, turnStartSeconds: 16, turnRadiusMetres: 1500, durationSeconds: 40 };
  const scene = parseScene({ ...base, emitters: [jet] });
  const path = jetPath(scene.emitters[0], scene);
  const heading = index => (Math.atan2(path.vx[index], path.vy[index]) * 180 / Math.PI + 360) % 360;
  assert.ok(Math.abs(heading(Math.round(15 / path.step)) - 90) < 1e-6);
  assert.ok(Math.abs(heading(path.speed.length - 1) - 180) < 1e-6);
  const quarterSeconds = 1500 * Math.PI / 2 / path.speed[0];
  assert.equal(path.turnSeconds[0], 16);
  assert.ok(Math.abs(path.turnSeconds[1] - 16 - quarterSeconds) < path.step);
  const longer = jetPath(parseScene({ ...base, emitters: [{ ...jet, durationSeconds: 80 }] }).emitters[0], scene);
  assert.deepEqual(longer.turnSeconds, path.turnSeconds);
  assert.deepEqual(longer.x.slice(0, path.x.length), path.x);
  const circling = jetPath(parseScene({ ...base, emitters: [{ ...jet, turnDegrees: -1800, turnStartSeconds: 0, turnRadiusMetres: 800, durationSeconds: 120 }] }).emitters[0], scene);
  assert.deepEqual(circling.turnSeconds, [0]);
  assert.ok(circling.x.every((x, index) => Math.abs(Math.hypot(x - jet.startMetres.x, circling.y[index] - jet.startMetres.y - 800) - 800) < 10));
  const item = structuredClone(scene.emitters[0]);
  macrosFor(item).find(macro => macro.label === 'Category').write(item, 0);
  assert.equal(item.engineClass, 'hobby');
  assert.deepEqual([item.mach, item.startMetres, item.durationSeconds, item.turnDegrees], [jet.mach, jet.startMetres, jet.durationSeconds, jet.turnDegrees]);
});
