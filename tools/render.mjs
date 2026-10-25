// Renders a scene file without the browser, for scripts and agents: one WAV per microphone, the filled scene, and a JSON summary on stdout.
// node tools/render.mjs <scene.json> <folder> [--ambix]
// The scene may be one saved from the app or a partial one; missing fields take their defaults and values are brought into range.
// Files are 32-bit float at the app's export gain: `render.levelMode` 'fixed' puts `render.fullScalePa` at full scale, 'peak' puts the
// loudest microphone 3 dB below it. Without --ambix each file is the omni pressure; with it, every AmbiX channel of the scene's order.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RENDER } from '../src/domain/constants.js';
import { readScene, serializeScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { encodeFloat32Wav } from '../src/shared/domain/wav.js';
import { OCTAVES, aWeightedSum, averagedPower, bandPowers, decibels, windowPower } from './bands.mjs';

const REFERENCE_PA = 2e-5;
const LOUDEST_SECONDS = 1;

const [file, folder, ...flags] = process.argv.slice(2);
if (!file || !folder) {
  console.error('node tools/render.mjs <scene.json> <folder> [--ambix]');
  process.exit(2);
}
const ambix = flags.includes('--ambix');
const scene = readScene(JSON.parse(readFileSync(file, 'utf8')));
mkdirSync(folder, { recursive: true });

const slug = text => text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mic';

function loudestSecond(samples, sampleRate) {
  const length = Math.min(samples.length, Math.round(LOUDEST_SECONDS * sampleRate));
  const step = Math.max(1, Math.round(length / 4));
  let [best, bestStart] = [-1, 0];
  for (let start = 0; start + length <= samples.length; start += step) {
    let sum = 0;
    for (let index = start; index < start + length; index += 1) sum += samples[index] ** 2;
    if (sum > best) [best, bestStart] = [sum, start];
  }
  return { start: bestStart, length };
}

function measure(samples, sampleRate) {
  const peakPa = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);
  const { start, length } = loudestSecond(samples, sampleRate);
  let size = 1;
  while (size < length) size *= 2;
  const power = windowPower(samples, start, length, size);
  const shape = bandPowers(averagedPower(samples.subarray(start, start + length), Math.min(8192, size)), sampleRate, OCTAVES, 1);
  const loudestBand = Math.max(...shape);
  let [weighted, total] = [0, 0];
  for (let bin = 1; bin < power.length; bin += 1) [weighted, total] = [weighted + power[bin] * bin * sampleRate / size, total + power[bin]];
  let audibleFrom = -1;
  let audibleTo = -1;
  const threshold = (peakPa / 100) ** 2;
  for (let index = 0; index < samples.length; index += 1) if (samples[index] ** 2 > threshold) [audibleFrom, audibleTo] = [audibleFrom < 0 ? index : audibleFrom, index];
  return {
    durationSeconds: +(samples.length / sampleRate).toFixed(2),
    withinFortyDecibelsSeconds: audibleFrom < 0 ? 0 : +((audibleTo - audibleFrom) / sampleRate).toFixed(2),
    peakDecibelsSpl: +decibels((peakPa / REFERENCE_PA) ** 2).toFixed(1),
    loudestSecondAt: +(start / sampleRate).toFixed(2),
    loudestSecondDecibelsA: +decibels(aWeightedSum(power, sampleRate) / REFERENCE_PA ** 2).toFixed(1),
    spectralCentroidHz: total > 0 ? Math.round(weighted / total) : 0,
    octaveShapeDecibels: Object.fromEntries(OCTAVES.map((centre, index) => [`${centre} Hz`,+(decibels(shape[index]) - decibels(loudestBand)).toFixed(1)]))
  };
}

const started = performance.now();
const prepared = prepareScene(scene);
const results = scene.receivers.map(receiver => ({ receiver, result: renderReceiver(prepared, receiver, scene) }));
const loudestPa = Math.max(...results.map(({ result }) => result.peakPa));
const gain = scene.render.levelMode === 'fixed' ? 1 / scene.render.fullScalePa : loudestPa > 0 ? RENDER.peakTarget / loudestPa : 1;
const microphones = results.map(({ receiver, result }) => {
  const name = `${slug(receiver.name)}.wav`;
  const channels = (ambix ? result.channels : [result.channels[0]]).map(channel => Float32Array.from(channel, value => value * gain));
  writeFileSync(join(folder, name), Buffer.from(encodeFloat32Wav(channels, result.sampleRate)));
  return { file: name, name: receiver.name, channels: channels.length, positionMetres: receiver.positionMetres, ...measure(result.channels[0], result.sampleRate) };
});
writeFileSync(join(folder, 'scene.json'), `${serializeScene(scene)}\n`);
console.log(JSON.stringify({
  scene: 'scene.json',
  fullScalePa: +(1 / gain).toPrecision(4),
  ambisonicConvention: ambix ? 'AmbiX (ACN, SN3D); front = north, left = west, up = up' : undefined,
  modelVersion: scene.modelVersion,
  renderSeconds: +((performance.now() - started) / 1000).toFixed(1),
  microphones
}, null, 2));
