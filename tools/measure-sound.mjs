// Measures a flyover recording or render as in Doc/reviews/2026-10-15-jet-sound-diagnosis.md.
// node tools/measure-sound.mjs <file.wav>... prints one JSON line per file.
import { basename } from 'node:path';
import { fft, nextPowerOfTwo } from '../src/shared/domain/fft.js';
import { readAudio } from './audio-file.mjs';

const OCTAVES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const ENVELOPE_BANDS = [[30, 250], [250, 2000], [2000, 8000]];
const SWIRL_OCTAVES = [250, 500, 1000, 2000];

function spectrum(samples) {
  const size = nextPowerOfTwo(samples.length);
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  real.set(samples);
  fft(real, imaginary);
  return { real, imaginary, size };
}

function bandPower({ real, imaginary, size }, sampleRate, low, high) {
  let sum = 0;
  for (let bin = Math.max(1, Math.ceil(low * size / sampleRate)); bin < Math.min(size / 2, high * size / sampleRate); bin += 1) sum += real[bin] ** 2 + imaginary[bin] ** 2;
  return sum;
}

function bandSignal(samples, sampleRate, low, high) {
  const { real, imaginary, size } = spectrum(samples);
  for (let bin = 0; bin <= size / 2; bin += 1) {
    const frequency = bin * sampleRate / size;
    if (frequency >= low && frequency < high) continue;
    real[bin] = 0; imaginary[bin] = 0;
    if (bin > 0 && bin < size / 2) { real[size - bin] = 0; imaginary[size - bin] = 0; }
  }
  fft(real, imaginary, true);
  return real.subarray(0, samples.length);
}

const decibels = value => 10 * Math.log10(Math.max(value, 1e-30));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const deviation = values => { const m = mean(values); return Math.sqrt(mean(values.map(value => (value - m) ** 2))); };

function moments(values) {
  const m = mean(values);
  let second = 0; let third = 0; let fourth = 0;
  for (const value of values) { const d = value - m; second += d * d; third += d ** 3; fourth += d ** 4; }
  second /= values.length; third /= values.length; fourth /= values.length;
  return { skewness: third / second ** 1.5, kurtosis: fourth / second ** 2 };
}

function levels(samples, sampleRate, windowSeconds, hopSeconds = windowSeconds) {
  const window = Math.round(windowSeconds * sampleRate);
  const hop = Math.round(hopSeconds * sampleRate);
  const result = [];
  for (let start = 0; start + window <= samples.length; start += hop) {
    let sum = 0;
    for (let index = start; index < start + window; index += 1) sum += samples[index] ** 2;
    result.push(sum / window);
  }
  return result;
}

const round = (value, digits = 1) => +value.toFixed(digits);

function octaveShares(samples, sampleRate) {
  const transformed = spectrum(samples);
  const total = bandPower(transformed, sampleRate, 22, Math.min(22000, sampleRate / 2));
  const centroid = (() => {
    let weighted = 0; let sum = 0;
    for (let bin = 1; bin < transformed.size / 2; bin += 1) {
      const frequency = bin * sampleRate / transformed.size;
      if (frequency < 22 || frequency > 22000) continue;
      const power = transformed.real[bin] ** 2 + transformed.imaginary[bin] ** 2;
      weighted += power * frequency; sum += power;
    }
    return weighted / sum;
  })();
  return { octaves: OCTAVES.map(centre => round(decibels(bandPower(transformed, sampleRate, centre / Math.SQRT2, centre * Math.SQRT2) / total))), centroidHz: Math.round(centroid) };
}

function measure(file) {
  const { samples, sampleRate } = readAudio(file);
  const twoSeconds = 2 * sampleRate;
  const windows = levels(samples, sampleRate, 2, .25);
  const peakIndex = windows.indexOf(Math.max(...windows));
  const riseIndex = windows.findIndex(value => value >= windows[peakIndex] / 100);
  const hop = Math.round(.25 * sampleRate);
  const segment = (start, length) => samples.subarray(Math.max(0, start), Math.min(samples.length, start + length));
  const peakStart = peakIndex * hop;
  const around = (seconds) => segment(peakStart + twoSeconds / 2 - seconds * sampleRate, 2 * seconds * sampleRate);
  const near = around(2);
  const derivative = near.subarray(1).map((value, index) => value - near[index]);
  const envelope = ENVELOPE_BANDS.map(([low, high]) => round(deviation(levels(bandSignal(near, sampleRate, low, high), sampleRate, .02).map(decibels))));
  const wide = around(4);
  const swirlLevels = SWIRL_OCTAVES.map(centre => {
    const fast = levels(bandSignal(wide, sampleRate, centre / Math.SQRT2, centre * Math.SQRT2), sampleRate, .05).map(decibels);
    const span = 40;
    return fast.map((value, index) => value - mean(fast.slice(Math.max(0, index - span / 2), index + span / 2))).slice(span / 2, -span / 2);
  });
  const correlation = (a, b) => { const ma = mean(a); const mb = mean(b); let ab = 0; let aa = 0; let bb = 0; a.forEach((value, index) => { ab += (value - ma) * (b[index] - mb); aa += (value - ma) ** 2; bb += (b[index] - mb) ** 2; }); return ab / Math.sqrt(aa * bb); };
  const pairs = [];
  for (let i = 0; i < swirlLevels.length; i += 1) for (let j = i + 1; j < swirlLevels.length; j += 1) pairs.push(correlation(swirlLevels[i], swirlLevels[j]));
  const pressure = moments(near);
  const slope = moments(derivative);
  return {
    file: basename(file),
    rise: octaveShares(segment(riseIndex * hop, twoSeconds), sampleRate),
    peak: octaveShares(segment(peakStart, twoSeconds), sampleRate),
    kurtosis: round(pressure.kurtosis),
    skewness: round(pressure.skewness, 2),
    slopeSkewness: round(slope.skewness, 2),
    slopeKurtosis: round(slope.kurtosis),
    envelopeDecibels: envelope,
    swirlDecibels: round(mean(swirlLevels.map(deviation))),
    bandCorrelation: round(mean(pairs), 2)
  };
}

for (const file of process.argv.slice(2)) console.log(JSON.stringify(measure(file)));
