import { fft } from '../src/shared/domain/fft.js';

export const OCTAVES = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const THIRDS = [50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000];

const exactCentre = (nominal, perOctave) => 1000 * 2 ** (Math.round(perOctave * Math.log2(nominal / 1000)) / perOctave);

export function aWeightDecibels(frequency) {
  const f2 = frequency * frequency;
  const ra = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return 20 * Math.log10(ra) + 2;
}

export const decibels = value => 10 * Math.log10(Math.max(value, 1e-30));

export function windowPower(samples, start, length, size) {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  real.set(samples.subarray(start, start + length));
  fft(real, imaginary);
  const power = new Float64Array(size / 2);
  for (let bin = 1; bin < size / 2; bin += 1) power[bin] = 2 * (real[bin] ** 2 + imaginary[bin] ** 2) / (size * length);
  return power;
}

export function averagedPower(samples, size = 8192) {
  const power = new Float64Array(size / 2);
  const hann = Float64Array.from({ length: size }, (_, index) => .5 - .5 * Math.cos(2 * Math.PI * index / size));
  for (let start = 0; start + size <= samples.length; start += size / 2) {
    const real = Float64Array.from({ length: size }, (_, index) => samples[start + index] * hann[index]);
    const imaginary = new Float64Array(size);
    fft(real, imaginary);
    for (let bin = 1; bin < size / 2; bin += 1) power[bin] += real[bin] ** 2 + imaginary[bin] ** 2;
  }
  return power;
}

export function bandPowers(power, sampleRate, centres, perOctave) {
  const size = power.length * 2;
  return centres.map(nominal => {
    const centre = exactCentre(nominal, perOctave);
    const [low, high] = [centre * 2 ** (-.5 / perOctave), centre * 2 ** (.5 / perOctave)];
    let sum = 0;
    for (let bin = Math.max(1, Math.ceil(low * size / sampleRate)); bin < Math.min(power.length, high * size / sampleRate); bin += 1) sum += power[bin];
    return sum;
  });
}

export function aWeightedSum(power, sampleRate) {
  const size = power.length * 2;
  let sum = 0;
  for (let bin = 1; bin < power.length; bin += 1) sum += power[bin] * 10 ** (aWeightDecibels(bin * sampleRate / size) / 10);
  return sum;
}
