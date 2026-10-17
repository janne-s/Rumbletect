import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultJet, defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { engineAtPower, jetOfEngine } from '../src/domain/engine.js';
import { nearListen } from '../src/domain/near-listen.js';
import { speedOfSound } from '../src/domain/jet.js';

const shortFlight = { ...defaultJet(), engine: { ...defaultJet().engine, ...engineAtPower(.15) }, startMetres: { x: -600, y: 0, z: 300 }, durationSeconds: 8 };

function scene({ ground = true } = {}) {
  const base = defaultScene();
  return parseScene({
    ...base,
    air: { ...base.air, refraction: false, turbulenceStrength: 0 },
    ground: { ...base.ground, enabled: ground, type: 'grass', forest: false, surroundings: false },
    emitters: [shortFlight],
    receivers: [{ ...base.receivers[0], type: 'omni' }],
    render: { ...base.render, ambisonicOrder: 0 }
  });
}

const amplitude = samples => Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0));
const centre = (samples, startSeconds, sampleRate) => {
  let weighted = 0; let sum = 0;
  samples.forEach((value, index) => { weighted += value * value * index; sum += value * value; });
  return startSeconds + weighted / sum / sampleRate;
};

test('a jet below crackle, as grains through the shared propagation, is as loud as the near listen of the same flight, ground and all', () => {
  for (const ground of [false, true]) {
    const value = scene({ ground });
    const grains = renderReceiver(prepareScene(value), value.receivers[0], value);
    const sound = speedOfSound(value.air.temperatureCelsius);
    const speed = shortFlight.mach * sound;
    const near = nearListen({
      trajectory: { positionAt: t => ({ east: -600 + speed * t, north: 0, up: 300 }), velocityAt: () => ({ east: speed, north: 0, up: 0 }) },
      listener: { east: 0, north: 0, up: 1.7 }, jet: jetOfEngine(shortFlight.engine, value.air.temperatureCelsius), air: value.air,
      emissionSeconds: shortFlight.durationSeconds, sampleRate: value.render.sampleRate, seed: shortFlight.seed, ground: ground ? 'grass' : null
    });
    const decibels = 20 * Math.log10(amplitude(grains.samples) / amplitude(near.pressure));
    assert.ok(Math.abs(decibels) < 1.5, `${ground ? 'with' : 'without'} ground: ${decibels.toFixed(2)} dB`);
    const [heard, listened] = [centre(grains.samples, grains.startSeconds, grains.sampleRate), centre(near.pressure, near.startSeconds, near.sampleRate)];
    assert.ok(Math.abs(heard - listened) < .1, `centre ${heard} vs ${listened}`);
  }
});

test('a grain\'s paths share its phases, so the same seed renders the same sound and another seed another', () => {
  const value = scene();
  const once = renderReceiver(prepareScene(value), value.receivers[0], value).samples;
  assert.deepEqual(renderReceiver(prepareScene(value), value.receivers[0], value).samples, once);
  const other = { ...value, emitters: [{ ...value.emitters[0], seed: 7 }] };
  assert.notDeepEqual(renderReceiver(prepareScene(other), other.receivers[0], other).samples, once);
});

test('a supersonic jet is heard from behind its Mach cone, its approach reversed, and silent once it outruns its jet', () => {
  const value = scene();
  const military = { ...value.emitters[0], engine: defaultJet().engine };
  const fast = { ...value, emitters: [{ ...military, mach: 1.6, startMetres: { x: -3000, y: 0, z: 300 } }] };
  const result = renderReceiver(prepareScene(fast), fast.receivers[0], fast);
  assert.ok(result.samples.every(Number.isFinite) && result.peakPa > 0);
  const outrun = { ...value, emitters: [{ ...military, mach: 2.5 }] };
  assert.equal(prepareScene(outrun)[0].sources.length, 0);
});

test('an automatic flight time flies on until every microphone is out of hearing', async () => {
  const { jetPath } = await import('../src/domain/grains.js');
  const value = scene();
  const auto = { ...value.emitters[0], autoDuration: true };
  const path = jetPath(auto, value);
  const at = value.receivers[0].positionMetres;
  const distance = index => Math.hypot(path.x[index] - at.x, path.y[index] - at.y, path.z[index] - at.z);
  const closest = Math.min(...path.x.map((_, index) => distance(index)));
  assert.ok(path.seconds.length > jetPath(value.emitters[0], value).seconds.length);
  assert.ok(Math.abs(distance(path.x.length - 1) / closest - 10 ** (30 / 20)) < .1);
});
