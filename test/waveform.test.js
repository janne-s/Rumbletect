import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeWaveform, waveformShape } from '../src/domain/waveform.js';
import { filterFrames, synthesizeNoise } from '../src/domain/synthesis.js';

const SAMPLE_RATE = 48000;

function moments(samples) {
  let [m1, m2, m3, m4] = [0, 0, 0, 0];
  for (const value of samples) m1 += value;
  m1 /= samples.length;
  for (const value of samples) {
    const d = value - m1;
    m2 += d * d; m3 += d ** 3; m4 += d ** 4;
  }
  [m2, m3, m4] = [m2, m3, m4].map(value => value / samples.length);
  return { power: m2 + m1 * m1, skewness: m3 / m2 ** 1.5, kurtosis: m4 / m2 ** 2 };
}

test('the shape solver meets its moments exactly', () => {
  const { a, sigma } = waveformShape({ skewness: .3, kurtosis: 5 });
  const skewness = (6 * a + 8 * a ** 3) / (1 + 2 * a * a) ** 1.5 * Math.exp(1.5 * sigma * sigma);
  const kurtosis = (3 + 60 * a * a + 60 * a ** 4) / (1 + 2 * a * a) ** 2 * Math.exp(4 * sigma * sigma);
  assert.ok(Math.abs(skewness - .3) < 1e-9 && Math.abs(kurtosis - 5) < 1e-9, `${skewness} ${kurtosis}`);
  assert.deepEqual(waveformShape({ skewness: 0, kurtosis: 3 }), { a: 0, sigma: 0 });
});

test('a filter of unit gain returns the signal', () => {
  const signal = synthesizeNoise({ length: 20000, sampleRate: SAMPLE_RATE, seed: 9, spectrumAt: (_, binHz) => Float64Array.from({ length: 2049 }, (__, bin) => (bin * binHz > 50 ? 1e-4 : 0)) });
  const unit = Float64Array.from({ length: 2049 }, () => 1);
  const filtered = filterFrames(signal, SAMPLE_RATE, () => unit);
  assert.ok(signal.every((value, index) => Math.abs(value - filtered[index]) < 1e-12));
});

test('shaped noise keeps its power and takes the skewness and kurtosis asked for', () => {
  const rms = 2;
  const band = (low, high) => (_, binHz) => Float64Array.from({ length: 2049 }, (__, bin) => (bin * binHz >= low && bin * binHz < high ? 1 / (high - low) : 0));
  const gaussian = synthesizeNoise({ length: 60 * SAMPLE_RATE, sampleRate: SAMPLE_RATE, seed: 5, spectrumAt: band(100, 400) }).map(value => value * rms);
  const envelope = synthesizeNoise({ length: 60 * SAMPLE_RATE, sampleRate: SAMPLE_RATE, seed: 6, spectrumAt: band(1, 50) });
  const shaped = moments(shapeWaveform(gaussian, () => rms, envelope, waveformShape({ skewness: .3, kurtosis: 5 })));
  assert.ok(Math.abs(shaped.power / rms ** 2 - 1) < .05, `power ${shaped.power / rms ** 2}`);
  assert.ok(Math.abs(shaped.skewness - .3) < .05, `skewness ${shaped.skewness}`);
  assert.ok(Math.abs(shaped.kurtosis - 5) < .5, `kurtosis ${shaped.kurtosis}`);
});
