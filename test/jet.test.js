import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveVelocity, fineSimilarityDecibels, flightConvectionDecibels, jetComponents, jetSpectra, largeSimilarityDecibels, speedOfSound } from '../src/domain/jet.js';
import { REFERENCE_SOUND_PRESSURE_PA } from '../src/domain/constants.js';

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

test('static levels follow Tam et al. eqs. 7 and 9', () => {
  const components = jetComponents(jet, { temperatureCelsius: 15 });
  const acoustic = Math.log10(650 / speedOfSound(15));
  close(components.large.decibels, 75 + 46 / 2.6 ** .3 + 10 * (10.06 - .495 * 2.6) * acoustic, 1e-9, 'A');
  close(components.fine.decibels, 83.2 + 19.3 / 2.6 ** .62 + 10 * (6.4 + 1.2 / 2.6 ** 1.4) * acoustic, 1e-9, 'B');
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
