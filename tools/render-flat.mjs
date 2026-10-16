// Renders the default jet over flat grass, through the shared propagation and through the near listen, for comparison.
// node tools/render-flat.mjs <folder> [seeds...] writes grains-<seed>.wav and near-<seed>.wav there.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { jetOfEngine } from '../src/domain/engine.js';
import { nearListen } from '../src/domain/near-listen.js';
import { speedOfSound } from '../src/domain/jet.js';
import { encodeFloat32Wav } from '../src/shared/domain/wav.js';

const [folder, ...seedArguments] = process.argv.slice(2);
const seeds = seedArguments.length ? seedArguments.map(Number) : [1, 2, 3, 4];
mkdirSync(folder, { recursive: true });
const normalized = samples => { const peak = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0); return Float32Array.from(samples, value => value / peak * .9); };

for (const seed of seeds) {
  const base = defaultScene();
  const scene = parseScene({
    ...base,
    air: { ...base.air, refraction: false },
    ground: { ...base.ground, type: 'grass', forest: false, surroundings: false },
    emitters: [{ ...base.emitters[0], seed }],
    receivers: [{ ...base.receivers[0], type: 'omni' }],
    render: { ...base.render, ambisonicOrder: 0 }
  });
  const started = performance.now();
  const grains = renderReceiver(prepareScene(scene), scene.receivers[0], scene);
  const grainMilliseconds = performance.now() - started;
  writeFileSync(join(folder, `grains-${seed}.wav`), Buffer.from(encodeFloat32Wav([normalized(grains.samples)], grains.sampleRate)));

  const emitter = scene.emitters[0];
  const sound = speedOfSound(scene.air.temperatureCelsius);
  const speed = emitter.mach * sound;
  const heading = emitter.headingDegrees * Math.PI / 180;
  const start = { east: emitter.startMetres.x, north: emitter.startMetres.y, up: emitter.startMetres.z };
  const velocity = { east: speed * Math.sin(heading), north: speed * Math.cos(heading), up: 0 };
  const trajectory = { positionAt: t => ({ east: start.east + velocity.east * t, north: start.north + velocity.north * t, up: start.up }), velocityAt: () => velocity };
  const listener = { east: scene.receivers[0].positionMetres.x, north: scene.receivers[0].positionMetres.y, up: scene.receivers[0].positionMetres.z };
  const near = nearListen({
    trajectory, listener, jet: jetOfEngine(emitter.engine, scene.air.temperatureCelsius), air: scene.air, emissionSeconds: emitter.durationSeconds,
    sampleRate: scene.render.sampleRate, seed, ground: 'grass', scintillation: true
  });
  writeFileSync(join(folder, `near-${seed}.wav`), Buffer.from(encodeFloat32Wav([normalized(near.pressure)], near.sampleRate)));
  console.log(JSON.stringify({ seed, grainMilliseconds: Math.round(grainMilliseconds), grainsPeakPa: +grains.peakPa.toFixed(2), nearPeakPa: +near.pressure.reduce((top, value) => Math.max(top, Math.abs(value)), 0).toFixed(2) }));
}
