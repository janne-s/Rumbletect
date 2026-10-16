import { writeFileSync } from 'node:fs';
import { nearListen } from '../src/domain/near-listen.js';
import { straightTrajectory } from '../src/domain/trajectory.js';
import { encodeFloat32Wav } from '../src/domain/wav.js';
import { fft, nextPowerOfTwo } from '../src/domain/fft.js';
import { REFERENCE_SOUND_PRESSURE_PA, SAMPLE_RATE_HZ } from '../src/domain/constants.js';

const [output = 'flyover.wav', ...pairs] = process.argv.slice(2);
const option = Object.fromEntries(pairs.map(pair => pair.split('=')).map(([key, value]) => [key, Number.isNaN(Number(value)) ? value : Number(value)]));
const settings = {
  altitudeMetres: 300,
  speedMetresPerSecond: 150,
  approachMetres: 2500,
  diameterMetres: .9,
  jetMetresPerSecond: 650,
  temperatureRatio: 2.6,
  temperatureCelsius: 15,
  relativeHumidityPercent: 70,
  listenerHeightMetres: 1.7,
  ground: 'grass',
  scintillation: 1,
  seed: 1,
  ...option
};

const emission = 2 * settings.approachMetres / settings.speedMetresPerSecond;
const result = nearListen({
  trajectory: straightTrajectory({ startMetres: { east: -settings.approachMetres, north: 0, up: settings.altitudeMetres }, headingDegrees: 90, speedMetresPerSecond: settings.speedMetresPerSecond }),
  listener: { east: 0, north: 0, up: settings.listenerHeightMetres },
  jet: { diameterMetres: settings.diameterMetres, velocityMetresPerSecond: settings.jetMetresPerSecond, temperatureRatio: settings.temperatureRatio, ...(settings.largeScaleKurtosis ? { largeScaleKurtosis: settings.largeScaleKurtosis } : {}) },
  air: { temperatureCelsius: settings.temperatureCelsius, relativeHumidityPercent: settings.relativeHumidityPercent, pressureKpa: 101.325 },
  emissionSeconds: emission,
  sampleRate: SAMPLE_RATE_HZ,
  seed: settings.seed,
  ground: settings.ground === 'none' ? null : settings.ground,
  scintillation: settings.scintillation ? { ...(settings.scintillationDecibels ? { decibels: settings.scintillationDecibels } : {}), ...(settings.scintillationSeconds ? { seconds: settings.scintillationSeconds } : {}) } : false
});

/** IEC 61672-1 A-weighting, as a power factor. */
function aWeighting(frequency) {
  const f2 = frequency * frequency;
  const response = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return (response / .7943) ** 2;
}

function windowLevels(samples, sampleRate) {
  const size = nextPowerOfTwo(sampleRate);
  const levels = [];
  for (let start = 0; start + sampleRate <= samples.length; start += sampleRate / 2) {
    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    for (let index = 0; index < sampleRate; index += 1) real[index] = samples[start + index];
    fft(real, imaginary);
    let total = 0;
    let weighted = 0;
    for (let bin = 1; bin < size / 2; bin += 1) {
      const power = 2 * (real[bin] ** 2 + imaginary[bin] ** 2) / (size * sampleRate);
      total += power;
      weighted += power * aWeighting(bin * sampleRate / size);
    }
    const decibels = value => 10 * Math.log10(value / REFERENCE_SOUND_PRESSURE_PA ** 2);
    levels.push({ seconds: start / sampleRate + result.startSeconds, overall: decibels(total), a: decibels(weighted) });
  }
  return levels;
}

const levels = windowLevels(result.pressure, result.sampleRate);
const loudest = levels.reduce((best, level) => (level.overall > best.overall ? level : best));
const peakPa = result.pressure.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
const normalized = Float32Array.from(result.pressure, value => value / peakPa * .9);
writeFileSync(output, Buffer.from(encodeFloat32Wav([normalized], result.sampleRate)));
console.log(JSON.stringify({
  output,
  settings,
  listenerStartSeconds: +result.startSeconds.toFixed(3),
  durationSeconds: +(result.pressure.length / result.sampleRate).toFixed(2),
  peakPa: +peakPa.toFixed(2),
  fullScalePa: +(peakPa / .9).toFixed(2),
  maximumOverallDecibels: +loudest.overall.toFixed(1),
  maximumADecibels: +Math.max(...levels.map(level => level.a)).toFixed(1),
  loudestAtListenerSeconds: +loudest.seconds.toFixed(1)
}, null, 2));
