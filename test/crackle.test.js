import assert from 'node:assert/strict';
import test from 'node:test';
import { steepen } from '../src/domain/grains.js';

const skewness = values => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return values.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / values.length;
};
const slopes = values => values.slice(1).map((value, index) => value - values[index]);

test('steepening sharpens a sine\'s rises into shocks, keeps its rms, and leaves it alone at index 0', () => {
  const sampleRate = 48000;
  const hz = 200;
  const sine = Float64Array.from({ length: 4800 }, (_, sample) => Math.sin(2 * Math.PI * hz * sample / sampleRate));
  assert.equal(steepen(sine, 0, hz, sampleRate), sine);
  assert.ok(Math.abs(skewness(slopes(Array.from(sine)))) < .01);
  const steep = steepen(sine, 1.5, hz, sampleRate);
  const rms = values => Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
  assert.ok(Math.abs(rms(steep) / rms(sine) - 1) < 1e-9);
  assert.ok(skewness(slopes(Array.from(steep))) > 2);
  assert.ok(Math.max(...slopes(Array.from(steep))) > 5 * Math.max(...slopes(Array.from(sine))));
});
