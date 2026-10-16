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

/** Each frame's spectrum times `gainAt(centreSample, binHz)`, an amplitude per bin; sine windows in and out, so a gain of 1 returns the signal. */
export function filterFrames(signal, sampleRate, gainAt, frameSamples = SYNTHESIS.frameSamples) {
  const hop = frameSamples / 2;
  const binHz = sampleRate / frameSamples;
  const window = Float64Array.from({ length: frameSamples }, (_, index) => Math.sin(Math.PI * (index + .5) / frameSamples));
  const output = new Float64Array(signal.length);
  const real = new Float64Array(frameSamples);
  const imaginary = new Float64Array(frameSamples);
  for (let centre = 0; centre - hop < signal.length; centre += hop) {
    const start = centre - hop;
    for (let index = 0; index < frameSamples; index += 1) {
      const at = start + index;
      real[index] = at >= 0 && at < signal.length ? window[index] * signal[at] : 0;
    }
    imaginary.fill(0);
    fft(real, imaginary);
    const gain = gainAt(centre, binHz);
    for (let bin = 0; bin <= frameSamples / 2; bin += 1) {
      real[bin] *= gain[bin];
      imaginary[bin] *= gain[bin];
      if (bin > 0 && bin < frameSamples / 2) {
        real[frameSamples - bin] *= gain[bin];
        imaginary[frameSamples - bin] *= gain[bin];
      }
    }
    fft(real, imaginary, true);
    for (let index = 0; index < frameSamples; index += 1) {
      const at = start + index;
      if (at >= 0 && at < signal.length) output[at] += window[index] * real[index];
    }
  }
  return output;
}
