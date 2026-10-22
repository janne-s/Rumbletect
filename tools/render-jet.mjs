// Renders a jet category's flyover straight over an omni microphone on flat grass and prints its maximum levels.
// node tools/render-jet.mjs <folder> [category] [height metres] [mach] [seed] [power 0–1, else the category's own] [gear]
// `gear` puts an airliner's gear and flaps out.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE } from '../src/domain/constants.js';
import { engineAtPower, engineOfClass } from '../src/domain/engine.js';
import { defaultJet, defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { fft } from '../src/shared/domain/fft.js';
import { encodeFloat32Wav } from '../src/shared/domain/wav.js';

const [folder, engineClass = 'fighter', heightText, machText, seedText = '1', powerText, gearText] = process.argv.slice(2);
const gearAndFlaps = gearText === 'gear';
const { flight } = ENGINE.classes[engineClass];
const height = Number(heightText ?? flight.heightMetres);
const mach = Number(machText ?? flight.mach);
mkdirSync(folder, { recursive: true });
const base = defaultScene();
const speed = mach * 340.3;
const approach = Math.max(1000, 15 * speed);
const jet = { ...defaultJet(undefined, undefined, Number(seedText)), kind: ENGINE.classes[engineClass].civil ? 'airliner' : 'jet', engineClass, gearAndFlaps, engine: powerText === undefined ? engineOfClass(engineClass) : { ...engineAtPower(Number(powerText), engineClass), engines: ENGINE.classes[engineClass].engines }, mach, startMetres: { x: -approach, y: 0, z: height }, durationSeconds: Math.min(600, Math.round(2 * approach / speed)) };
const scene = parseScene({
  ...base,
  air: { ...base.air, refraction: false },
  ground: { ...base.ground, type: 'grass', forest: false, surroundings: false },
  emitters: [jet],
  receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: 0, z: 1.7 } }],
  render: { ...base.render, ambisonicOrder: 0 }
});
const started = performance.now();
const { samples, sampleRate } = renderReceiver(prepareScene(scene), scene.receivers[0], scene);
const aWeight = f => {
  const f2 = f * f;
  const ra = 12194 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return 20 * Math.log10(ra) + 2;
};
const size = 32768;
const gains = Float64Array.from({ length: size / 2 + 1 }, (_, bin) => (bin ? 10 ** (aWeight(bin * sampleRate / size) / 10) : 0));
let [flat, weighted] = [-Infinity, -Infinity];
for (let at = 0; at + size <= samples.length; at += size / 4) {
  const real = Float64Array.from(samples.subarray(at, at + size));
  const imaginary = new Float64Array(size);
  fft(real, imaginary);
  let [z, a] = [0, 0];
  for (let bin = 1; bin < size / 2; bin += 1) { const power = real[bin] ** 2 + imaginary[bin] ** 2; z += power; a += power * gains[bin]; }
  const scale = 2 / size / size / 4e-10;
  flat = Math.max(flat, 10 * Math.log10(z * scale));
  weighted = Math.max(weighted, 10 * Math.log10(a * scale));
}
const peak = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);
writeFileSync(join(folder, `jet-${engineClass}-${height}m${powerText === undefined ? '' : `-power${powerText}`}-mach${mach}${gearAndFlaps ? '-gear' : ''}.wav`), Buffer.from(encodeFloat32Wav([Float32Array.from(samples, value => value / peak * .9)], sampleRate)));
console.log(JSON.stringify({ engineClass, height, mach, power: powerText === undefined ? ENGINE.classes[engineClass].defaultPower : Number(powerText), renderSeconds: Math.round((performance.now() - started) / 1000), maxLevelDecibels: +flat.toFixed(1), maxAWeightedDecibels: +weighted.toFixed(1) }));
