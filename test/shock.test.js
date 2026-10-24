import test from 'node:test';
import assert from 'node:assert/strict';
import { shockComponent, shockDirectivityDecibels, shockSpectrum, shockSpectrumDecibels, shockStrouhal } from '../src/domain/shock.js';
import { engineAtPower, jetOfEngine, streamsOf } from '../src/domain/engine.js';
import { jetComponents, jetSpectra, speedOfSound } from '../src/domain/jet.js';
import { ENGINE, REFERENCE_SOUND_PRESSURE_PA } from '../src/domain/constants.js';

const close = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const sound = speedOfSound(15);
const military = jetOfEngine(engineAtPower(.75, 'fighter'), 15);

test('the spectra reproduce Stone et al. 2003, Table VII', () => {
  const rows = {
    0: [[-3.6, -181], [-.3, -16], [-.1, -6], [0, -4], [.2, -7.5], [2, -43.5]],
    50: [[-3.6, -181.5], [0, -4.5], [1, -24]],
    80: [[-.2, -8], [0, -7.5], [2, -47.5]],
    90: [[-3.6, -178.4], [-.1, -6.4], [.2, -10.9], [2, -37.9]],
    100: [[-.1, -6.6], [1, -23.1]],
    180: [[-2.2, -110.2], [-.1, -8.2], [2, -39.7]]
  };
  for (const [angle, pairs] of Object.entries(rows)) {
    for (const [logStrouhal, decibels] of pairs) close(shockSpectrumDecibels(logStrouhal, +angle), decibels, 1e-9, `${angle}° at ${logStrouhal}`);
  }
});

test('each column\'s third octaves add up to the table\'s overall level', () => {
  const overall = { 0: 1.8, 50: 1.3, 70: .3, 90: 0, 120: -.6, 180: -1.8 };
  for (const [angle, expected] of Object.entries(overall)) {
    let power = 0;
    for (let tenth = -40; tenth <= 40; tenth += 1) power += 10 ** (shockSpectrumDecibels(tenth / 10, +angle) / 10);
    close(10 * Math.log10(power), expected, .1, `${angle}°`);
  }
});

test('a fully expanded subsonic jet, or one its flight outruns, makes no shock noise', () => {
  assert.equal(shockComponent({ machNumber: .95, diameterMetres: 1, velocityMetresPerSecond: 500 }, sound), null);
  assert.equal(shockComponent({ machNumber: 1.5, diameterMetres: 1, velocityMetresPerSecond: 500 }, sound, 500), null);
  assert.equal(jetComponents({ diameterMetres: .9, velocityMetresPerSecond: 650, temperatureRatio: 2.6 }, { temperatureCelsius: 15 }).shock, null);
  for (const key of Object.keys(ENGINE.classes).filter(key => ENGINE.classes[key].civil)) {
    for (const jet of streamsOf(engineAtPower(1, key), key, 15)) assert.ok(jet.machNumber < 1, key);
  }
});

test('the Mach number is that of the ideal nozzle, sonic at the critical pressure ratio', () => {
  const gamma = ENGINE.gasGamma;
  const critical = ((gamma + 1) / 2) ** (gamma / (gamma - 1));
  close(jetOfEngine({ pressureRatio: critical, totalTemperatureKelvin: 750, diameterMetres: .9 }, 15).machNumber, 1, 1e-12, 'critical');
  close(military.machNumber ** 2, 2 / (gamma - 1) * (3.5 ** ((gamma - 1) / gamma) - 1), 1e-9, 'military');
});

test('the overall level follows Stone\'s eq. 14 and the spectrum peaks near log S = 0', () => {
  const shock = shockComponent(military, sound);
  const beta2 = military.machNumber ** 2 - 1;
  close(shock.decibels, 158 + 10 * Math.log10(Math.PI * .9 ** 2 / 4) + 10 * Math.log10(beta2 ** 2 / (1 + beta2 ** 2)), 1e-9, 'level');
  const frequencies = Array.from({ length: 4000 }, (_, index) => 10 * 1.002 ** index);
  const psd = shockSpectrum(shock, 90, frequencies);
  const peak = frequencies[psd.indexOf(Math.max(...psd))];
  const logStrouhal = Math.log10(shockStrouhal(shock, peak, 90));
  assert.ok(logStrouhal > -.15 && logStrouhal < .05, `${logStrouhal}`);
  let power = 0;
  for (let index = 1; index < frequencies.length; index += 1) power += psd[index] * (frequencies[index] - frequencies[index - 1]);
  close(10 * Math.log10(power / REFERENCE_SOUND_PRESSURE_PA ** 2), shock.decibels, .2, 'overall at 90°');
});

test('the peak frequency is lowest toward the inlet and rises toward the side, as the F-35B shows', () => {
  const shock = shockComponent(military, sound);
  const peakHz = angle => 10 ** -.1 / shockStrouhal(shock, 1, angle);
  assert.ok(peakHz(30) < peakHz(60) && peakHz(60) < peakHz(90));
});

test('flight raises the noise ahead as −40 log(1 − M cos ψ), less the grain\'s own −10 log, and it falls aft of the Mach angle', () => {
  const still = shockComponent(military, sound);
  const flying = shockComponent(military, sound, .44 * sound);
  close(shockDirectivityDecibels(flying, 30) - shockDirectivityDecibels(still, 30), -30 * Math.log10(1 - .44 * Math.cos(Math.PI / 6)), 1e-9, 'ahead');
  close(shockDirectivityDecibels(still, still.machAngleDegrees), 0, 1e-12, 'at the Mach angle');
  close(shockDirectivityDecibels(still, still.machAngleDegrees + 10), -7.5, 1e-9, '10° aft of it');
  const fast = shockComponent(military, sound, .95 * sound);
  close(shockDirectivityDecibels(fast, 0), -30 * Math.log10(.2), 1e-9, 'limited at Mach 0.8');
});

test('a fighter at military power carries shock noise in its jet spectra, an airliner none', () => {
  const frequencies = [100, 300, 1000, 3000];
  const fighter = jetSpectra(jetComponents(military, { temperatureCelsius: 15, flightMetresPerSecond: 150 }), 45, frequencies);
  assert.ok(fighter.shock.every(value => value > 0));
  const [core] = streamsOf(engineAtPower(1, 'widebody'), 'widebody', 15);
  assert.ok(jetSpectra(jetComponents(core, { temperatureCelsius: 15 }), 45, frequencies).shock.every(value => value === 0));
});
