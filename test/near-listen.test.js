import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeNoise } from '../src/domain/synthesis.js';
import { emissionSeconds, nearListen } from '../src/domain/near-listen.js';
import { straightTrajectory } from '../src/domain/trajectory.js';
import { atmosphericAbsorptionDbPerMetre, speedOfSound } from '../src/domain/air.js';
import { fft, nextPowerOfTwo } from '../src/domain/fft.js';

const SAMPLE_RATE = 48000;
const meanSquare = (samples, from = 0, to = samples.length) => {
  let sum = 0;
  for (let index = from; index < to; index += 1) sum += samples[index] ** 2;
  return sum / (to - from);
};

function bandpass(samples, low, high) {
  const size = nextPowerOfTwo(samples.length);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  real.set(samples);
  fft(real, imaginary);
  for (let bin = 0; bin < size; bin += 1) {
    const hz = Math.min(bin, size - bin) * SAMPLE_RATE / size;
    if (hz < low || hz > high) real[bin] = imaginary[bin] = 0;
  }
  fft(real, imaginary, true);
  return real.subarray(0, samples.length);
}

test('synthesized noise has the variance of its PSD and repeats with its seed', () => {
  const psd = 1e-3;
  const spectrumAt = (_, binHz) => Float64Array.from({ length: 2049 }, (__, bin) => (bin * binHz >= 100 && bin * binHz < 2100 ? psd : 0));
  const noise = synthesizeNoise({ length: 10 * SAMPLE_RATE, sampleRate: SAMPLE_RATE, seed: 7, spectrumAt });
  // The band holds 2000 Hz at this PSD, give or take a bin at each edge.
  const expected = psd * 2000;
  assert.ok(Math.abs(meanSquare(noise) / expected - 1) < .03, `${meanSquare(noise) / expected}`);
  assert.deepEqual(synthesizeNoise({ length: 5000, sampleRate: SAMPLE_RATE, seed: 7, spectrumAt }), synthesizeNoise({ length: 5000, sampleRate: SAMPLE_RATE, seed: 7, spectrumAt }));
});

test('a stationary source arrives after r/c, spreads as 1/r, and loses what ISO 9613-1 absorbs', () => {
  const air = { temperatureCelsius: 15, relativeHumidityPercent: 70, pressureKpa: 101.325 };
  const jet = { diameterMetres: .9, velocityMetresPerSecond: 650, temperatureRatio: 2.6 };
  const still = straightTrajectory({ startMetres: { east: 0, north: 0, up: 100 }, headingDegrees: 90, speedMetresPerSecond: 0 });
  const listenAt = metres => nearListen({ trajectory: still, listener: { east: metres, north: 0, up: 100 }, jet, air, emissionSeconds: 4, sampleRate: SAMPLE_RATE, seed: 3 });
  const near = listenAt(100);
  const far = listenAt(400);
  assert.ok(Math.abs(near.startSeconds - 100 / speedOfSound(15)) < 1e-12);
  assert.ok(Math.abs(far.startSeconds - 400 / speedOfSound(15)) < 1e-12);
  assert.ok(near.pressure.every(Number.isFinite));
  const band = (pressure, low, high) => meanSquare(Float32Array.from(bandpass(pressure, low, high)));
  const drop = (low, high) => 10 * Math.log10(band(near.pressure, low, high) / band(far.pressure, low, high));
  assert.ok(Math.abs(drop(30, 100) - 20 * Math.log10(4)) < .1, `${drop(30, 100)}`);
  const absorbed = atmosphericAbsorptionDbPerMetre(4000, air) * 300;
  assert.ok(Math.abs(drop(3900, 4100) - 20 * Math.log10(4) - absorbed) < .3, `${drop(3900, 4100)} vs ${20 * Math.log10(4) + absorbed}`);
});

test('the emission time solves the travel time of a moving source', () => {
  const sound = speedOfSound(15);
  const flight = straightTrajectory({ startMetres: { east: -3000, north: 0, up: 300 }, headingDegrees: 90, speedMetresPerSecond: 200 });
  const listener = { east: 0, north: 0, up: 0 };
  for (const listenerSeconds of [5, 15, 25]) {
    const emission = emissionSeconds(flight, listener, listenerSeconds, sound);
    const at = flight.positionAt(emission);
    assert.ok(Math.abs(emission + Math.hypot(at.east, at.north, at.up) / sound - listenerSeconds) < 1e-9);
  }
});

test('a flyover renders finite pressure, loudest near the pass', () => {
  const flight = straightTrajectory({ startMetres: { east: -2000, north: 0, up: 300 }, headingDegrees: 90, speedMetresPerSecond: 150 });
  const result = nearListen({ trajectory: flight, listener: { east: 0, north: 0, up: 1.7 }, jet: { diameterMetres: .9, velocityMetresPerSecond: 650, temperatureRatio: 2.6 }, air: { temperatureCelsius: 15, relativeHumidityPercent: 70, pressureKpa: 101.325 }, emissionSeconds: 26, sampleRate: SAMPLE_RATE, seed: 11 });
  assert.ok(result.pressure.every(Number.isFinite));
  const second = SAMPLE_RATE;
  const levels = Array.from({ length: Math.floor(result.pressure.length / second) }, (_, index) => meanSquare(result.pressure, index * second, (index + 1) * second));
  const loudest = levels.indexOf(Math.max(...levels));
  const passSeconds = 2000 / 150 + 300 / speedOfSound(15) - result.startSeconds;
  assert.ok(loudest > passSeconds - 2 && loudest < passSeconds + 8, `${loudest} vs pass ${passSeconds}`);
});
