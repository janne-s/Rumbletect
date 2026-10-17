// Renders a category's rocket or salvo (Artillery by default) to an omni microphone beside the launchers over flat grass and prints its levels.
// node tools/render-salvo.mjs <folder> [distance metres] [rounds] [seed] [salvo seconds] [category]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROCKET } from '../src/domain/constants.js';
import { categoryRocket } from '../src/domain/rocket.js';
import { salvoRounds } from '../src/domain/salvo.js';
import { defaultRocket, defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { encodeFloat32Wav } from '../src/shared/domain/wav.js';

const [folder, distanceText = '300', roundsText = '6', seedText = '1', secondsText = '30', categoryLabel = 'Artillery'] = process.argv.slice(2);
const distance = Number(distanceText);
mkdirSync(folder, { recursive: true });
const base = defaultScene('rocket');
const rocket = categoryRocket(defaultRocket(undefined, Number(seedText)), ROCKET.categories.find(category => category.label === categoryLabel));
rocket.startMetres = { ...rocket.startMetres, z: 2 };
rocket.salvo = { ...rocket.salvo, rounds: Number(roundsText), salvoSeconds: Number(secondsText) };
const scene = parseScene({
  ...base,
  air: { ...base.air, refraction: false },
  ground: { ...base.ground, type: 'grass', forest: false, surroundings: false },
  emitters: [rocket],
  receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: -distance, z: 1.7 } }],
  render: { ...base.render, ambisonicOrder: 0 }
});
const started = performance.now();
const prepared = prepareScene(scene);
const preparedSeconds = (performance.now() - started) / 1000;
const { samples, sampleRate, startSeconds } = renderReceiver(prepared, scene.receivers[0], scene);
const window = sampleRate / 4;
const levels = [];
for (let at = 0; at + window <= samples.length; at += window) {
  let sum = 0;
  for (let index = at; index < at + window; index += 1) sum += samples[index] ** 2;
  levels.push(10 * Math.log10(sum / window / 4e-10));
}
const peak = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);
writeFileSync(join(folder, `${categoryLabel.toLowerCase().replace(' ', '-')}-${roundsText}-in-${secondsText}s-${distance}m-seed${seedText}.wav`), Buffer.from(encodeFloat32Wav([Float32Array.from(samples, value => value / peak * .9)], sampleRate)));
console.log(JSON.stringify({
  distance, preparedSeconds: +preparedSeconds.toFixed(2), renderSeconds: Math.round((performance.now() - started) / 1000), startSeconds: +startSeconds.toFixed(2),
  launches: salvoRounds(scene.emitters[0]).map(round => +round.startSeconds.toFixed(2)),
  maxLevelDecibels: +Math.max(...levels).toFixed(1), peakPa: +peak.toFixed(1),
  quarterSeconds: levels.map(Math.round).join(' ')
}));
