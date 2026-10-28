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

test('a fast receding grain, stretched by 1 + M, stays whole inside its frame in both bands', async () => {
  const { defaultRocket } = await import('../src/domain/scene.js');
  const { rocketGrains } = await import('../src/domain/rocket-grains.js');
  const { fft, nextPowerOfTwo } = await import('../src/shared/domain/fft.js');
  const base = defaultScene('rocket');
  const rocket = { ...defaultRocket(), propellant: 'solid', launchDegrees: 15 };
  rocket.ascent = { ...rocket.ascent, burnSeconds: 12, burnoutMetresPerSecond: 5760, accelerationPercent: 0, bendDegrees: 0 };
  const scene = parseScene({ ...base, emitters: [rocket], receivers: [{ ...base.receivers[0], positionMetres: { x: -20000, y: 0, z: 1.7 } }] });
  const sampleRate = scene.render.sampleRate;
  const radians = 15 * Math.PI / 180;
  const receding = { x: -Math.sin(Math.PI / 2) * Math.cos(radians), y: 0, z: -Math.sin(radians) };
  for (const band of ['high', 'low']) {
    const grains = rocketGrains(rocket, scene, band);
    const row = grains.rows.filter(item => item.pulse === 'grain').at(-1);
    const size = 2 * nextPowerOfTwo(Math.ceil(row.spanSeconds * sampleRate));
    const { re, im } = grains.emission(row.noiseSeed, receding, { size });
    const real = new Float64Array(size);
    const imaginary = new Float64Array(size);
    for (let bin = 1; bin < re.length && bin < size / 2; bin += 1) {
      real[bin] = re[bin]; imaginary[bin] = im[bin];
      real[size - bin] = re[bin]; imaginary[size - bin] = -im[bin];
    }
    fft(real, imaginary, true);
    const energy = (from, to) => { let sum = 0; for (let sample = from; sample < to; sample += 1) sum += real[sample] ** 2; return sum; };
    const span = Math.ceil(row.spanSeconds * sampleRate);
    const outside = energy(span, size) / energy(0, size);
    assert.ok(outside < 1e-6, `${band}: ${outside} of the grain beyond its span`);
    assert.ok(row.spanSeconds >= (1 + 5000 / speedOfSound(15)) * row.durationSeconds, `${band}: span ${row.spanSeconds} s`);
  }
});
