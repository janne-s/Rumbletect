// Renders a rocket preset to an omni microphone over flat grass and prints its levels.
// node tools/render-rocket.mjs <folder> <falcon9|starship> <distance metres> [seconds] [seed] writes rocket-<vehicle>-<distance>m.wav.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultRocket, defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { encodeFloat32Wav } from '../src/shared/domain/wav.js';

const [folder, vehicle = 'falcon9', distanceText = '1000', secondsText, seedText = '1'] = process.argv.slice(2);
const distance = Number(distanceText);
mkdirSync(folder, { recursive: true });
const base = defaultScene('rocket');
const rocket = defaultRocket(undefined, vehicle, Number(seedText));
if (secondsText) rocket.ascent.burnSeconds = Number(secondsText);
const scene = parseScene({
  ...base,
  air: { ...base.air, refraction: false },
  ground: { ...base.ground, type: 'grass', forest: false, surroundings: false },
  emitters: [rocket],
  receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: -distance, z: 1.7 } }],
  render: { ...base.render, ambisonicOrder: 0 }
});
const started = performance.now();
const result = renderReceiver(prepareScene(scene), scene.receivers[0], scene);
const { samples, sampleRate, startSeconds } = result;
const second = sampleRate;
const levels = [];
for (let at = 0; at + second <= samples.length; at += second / 4) {
  let sum = 0;
  for (let index = at; index < at + second; index += 1) sum += samples[index] ** 2;
  levels.push({ seconds: startSeconds + at / sampleRate, decibels: 10 * Math.log10(sum / second / 4e-10) });
}
const loudest = levels.reduce((best, item) => (item.decibels > best.decibels ? item : best));
const peak = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);
writeFileSync(join(folder, `rocket-${vehicle}-${distance}m.wav`), Buffer.from(encodeFloat32Wav([Float32Array.from(samples, value => value / peak * .9)], sampleRate)));
console.log(JSON.stringify({
  vehicle, distance, renderSeconds: Math.round((performance.now() - started) / 1000),
  maxLevelDecibels: +loudest.decibels.toFixed(1), atSeconds: +loudest.seconds.toFixed(1), peakPa: +peak.toFixed(1),
  everyTenSeconds: levels.filter((_, index) => index % 40 === 0).map(item => Math.round(item.decibels))
}));
