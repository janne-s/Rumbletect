// Compares octave (or third-octave) shapes of recordings and renders over chosen time windows, as in Doc/reviews/2026-10-21-new-recordings.md.
// node tools/octaves.mjs [--thirds] <file>[@start-end][=label] ...
// Without a window the 2 s around the loudest second is used. Bands in dB re the window's loudest band; swing is the standard
// deviation of 0.25 s levels in dB; slope skewness is the skewness of the sample-to-sample difference. Recordings in other
// formats than WAV are decoded with ffmpeg.
import { basename } from 'node:path';
import { readAudio } from './audio-file.mjs';
import { OCTAVES, THIRDS, averagedPower, bandPowers, decibels } from './bands.mjs';

const PEAK_WINDOW_SECONDS = 2;
const SWING_WINDOW_SECONDS = .25;

function parse(argument) {
  const [source, label] = argument.split('=');
  const [file, window] = source.split('@');
  const [start, end] = window ? window.split('-').map(Number) : [];
  return { file, start, end, label: label ?? `${basename(file).slice(0, 24)}${window ? ` ${window} s` : ' peak'}` };
}

function loudestWindow(samples, sampleRate) {
  const second = sampleRate;
  const hop = Math.round(SWING_WINDOW_SECONDS * sampleRate);
  let [best, bestStart] = [-1, 0];
  for (let start = 0; start + second <= samples.length; start += hop) {
    let sum = 0;
    for (let index = start; index < start + second; index += 1) sum += samples[index] ** 2;
    if (sum > best) [best, bestStart] = [sum, start];
  }
  const middle = bestStart + second / 2;
  return [Math.max(0, middle - PEAK_WINDOW_SECONDS / 2 * sampleRate), Math.min(samples.length, middle + PEAK_WINDOW_SECONDS / 2 * sampleRate)].map(Math.round);
}

function swingDecibels(segment, sampleRate) {
  const width = Math.round(SWING_WINDOW_SECONDS * sampleRate);
  const levels = [];
  for (let start = 0; start + width <= segment.length; start += width) {
    let sum = 0;
    for (let index = start; index < start + width; index += 1) sum += segment[index] ** 2;
    levels.push(decibels(sum / width));
  }
  const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
  return Math.sqrt(levels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / levels.length);
}

function slopeSkewness(segment) {
  let [second, third] = [0, 0];
  for (let index = 1; index < segment.length; index += 1) { const d = segment[index] - segment[index - 1]; second += d * d; third += d ** 3; }
  const count = segment.length - 1;
  return third / count / (second / count) ** 1.5;
}

const args = process.argv.slice(2);
const thirds = args.includes('--thirds');
const centres = thirds ? THIRDS : OCTAVES;
const name = centre => (centre >= 1000 ? `${centre / 1000}k` : String(centre));
const rows = args.filter(arg => arg !== '--thirds').map(parse);
const width = Math.max(10, ...rows.map(row => row.label.length));
console.log(['window'.padEnd(width), ...centres.map(centre => name(centre).padStart(5)), ' swing', '  slope skew'].join(' '));
for (const row of rows) {
  const { samples, sampleRate } = readAudio(row.file);
  const [first, last] = row.start === undefined ? loudestWindow(samples, sampleRate) : [row.start, row.end].map(seconds => Math.round(seconds * sampleRate));
  const segment = samples.subarray(first, Math.min(samples.length, last));
  const bands = bandPowers(averagedPower(segment), sampleRate, centres, thirds ? 3 : 1).map(decibels);
  const top = Math.max(...bands);
  const cells = bands.map(value => (value - top).toFixed(0).padStart(5));
  console.log([row.label.padEnd(width), ...cells, swingDecibels(segment, sampleRate).toFixed(1).padStart(6), slopeSkewness(segment).toFixed(2).padStart(12)].join(' '));
}
