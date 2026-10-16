import test from 'node:test';
import assert from 'node:assert/strict';
import { nearListen } from '../src/domain/near-listen.js';
import { createScintillation } from '../src/domain/scintillation.js';
import { straightTrajectory } from '../src/domain/trajectory.js';
import { speedOfSound } from '../src/domain/air.js';
import { fft } from '../src/domain/fft.js';
import { SCINTILLATION } from '../src/domain/constants.js';

const SAMPLE_RATE = 48000;

function powerSpectrum(samples) {
  const size = 8192;
  const power = new Float64Array(size / 2 + 1);
  const window = Float64Array.from({ length: size }, (_, index) => Math.sin(Math.PI * (index + .5) / size) ** 2);
  for (let start = 0; start + size <= samples.length; start += size / 2) {
    const real = Float64Array.from(window, (value, index) => value * samples[start + index]);
    const imaginary = new Float64Array(size);
    fft(real, imaginary);
    for (let bin = 0; bin <= size / 2; bin += 1) power[bin] += real[bin] ** 2 + imaginary[bin] ** 2;
  }
  return { power, binHz: SAMPLE_RATE / size };
}

test('rigid ground adds its image: a peak of 20 log(1 + R1/R2) and a deep first notch', () => {
  const air = { temperatureCelsius: 15, relativeHumidityPercent: 70, pressureKpa: 101.325, turbulenceStrength: 0 };
  const still = straightTrajectory({ startMetres: { east: 0, north: 0, up: 10 }, headingDegrees: 90, speedMetresPerSecond: 0 });
  const listener = { east: 50, north: 0, up: 1.7 };
  const render = ground => nearListen({ trajectory: still, listener, jet: { diameterMetres: .9, velocityMetresPerSecond: 650, temperatureRatio: 2.6 }, air, emissionSeconds: 6, sampleRate: SAMPLE_RATE, seed: 4, ground });
  const free = powerSpectrum(render(null).pressure);
  const grounded = powerSpectrum(render('rigid').pressure);
  const direct = Math.hypot(50, 10 - 1.7);
  const image = Math.hypot(50, 10 + 1.7);
  const delay = (image - direct) / speedOfSound(15);
  const ratioAt = hz => {
    const bin = Math.round(hz / free.binHz);
    let [a, b] = [0, 0];
    for (let near = bin - 1; near <= bin + 1; near += 1) { a += grounded.power[near]; b += free.power[near]; }
    return 10 * Math.log10(a / b);
  };
  assert.ok(Math.abs(ratioAt(1 / delay) - 20 * Math.log10(1 + direct / image)) < .5, `peak ${ratioAt(1 / delay)}`);
  assert.ok(ratioAt(.5 / delay) < -12, `notch ${ratioAt(.5 / delay)}`);
});

test('scintillation keeps the mean power and has the fitted spread and band correlation', () => {
  const scintillation = createScintillation({ seed: 2, hopSeconds: .0427 });
  const frequencies = [250, 2000];
  const frames = 100000;
  const levels = [[], []];
  let power = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    const gains = scintillation.gainsAt(frame, frequencies);
    power += gains[0] ** 2;
    gains.forEach((gain, band) => levels[band].push(20 * Math.log10(gain)));
  }
  assert.ok(Math.abs(power / frames - 1) < .05, `power ${power / frames}`);
  const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
  const spread = values => Math.sqrt(mean(values.map(value => (value - mean(values)) ** 2)));
  assert.ok(Math.abs(spread(levels[0]) - SCINTILLATION.decibels) < .2, `spread ${spread(levels[0])}`);
  const [m0, m1] = levels.map(mean);
  const correlation = mean(levels[0].map((value, index) => (value - m0) * (levels[1][index] - m1))) / (spread(levels[0]) * spread(levels[1]));
  assert.ok(Math.abs(correlation - (1 - SCINTILLATION.bandShare)) < .08, `correlation ${correlation}`);
});
