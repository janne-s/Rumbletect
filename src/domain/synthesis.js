import { fft } from './fft.js';
import { createRandom, normalDeviate } from './random.js';
import { SYNTHESIS } from './constants.js';

/** `spectrumAt(centreSample, binHz)` gives each bin's one-sided PSD in Pa²/Hz; sine windows at half overlap keep the variance. */
export function synthesizeNoise({ length, sampleRate, seed, spectrumAt, frameSamples = SYNTHESIS.frameSamples }) {
  const hop = frameSamples / 2;
  const binHz = sampleRate / frameSamples;
  const window = Float64Array.from({ length: frameSamples }, (_, index) => Math.sin(Math.PI * (index + .5) / frameSamples));
  const output = new Float64Array(length);
  const random = createRandom(seed);
  const real = new Float64Array(frameSamples);
  const imaginary = new Float64Array(frameSamples);
  for (let centre = 0; centre - hop < length; centre += hop) {
    const psd = spectrumAt(centre, binHz);
    real.fill(0);
    imaginary.fill(0);
    for (let bin = 1; bin < frameSamples / 2; bin += 1) {
      const scale = Math.sqrt(frameSamples * sampleRate * psd[bin] / 4);
      real[bin] = scale * normalDeviate(random);
      imaginary[bin] = scale * normalDeviate(random);
      real[frameSamples - bin] = real[bin];
      imaginary[frameSamples - bin] = -imaginary[bin];
    }
    fft(real, imaginary, true);
    const start = centre - hop;
    for (let index = 0; index < frameSamples; index += 1) {
      const at = start + index;
      if (at >= 0 && at < length) output[at] += window[index] * real[index];
    }
  }
  return output;
}
