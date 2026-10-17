import assert from 'node:assert/strict';
import test from 'node:test';
import { ascentPath, directivityDecibels, normalizedPowerDecibels, sizedRocket, sourceLocationMetres } from '../src/domain/rocket.js';
import { defaultRocket, defaultScene, parseScene, readScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';

test('SATURN\'s power spectrum is continuous, peaks at Sr 0.0108 with 14.35 dB, and holds the overall power', () => {
  for (const at of [3.6e-3, 4.8e-2]) assert.ok(Math.abs(normalizedPowerDecibels(at * (1 - 1e-9)) - normalizedPowerDecibels(at * (1 + 1e-9))) < .05);
  assert.ok(Math.abs(normalizedPowerDecibels(.0108) - 14.35) < .02);
  assert.ok(normalizedPowerDecibels(.0108) > normalizedPowerDecibels(.009) && normalizedPowerDecibels(.0108) > normalizedPowerDecibels(.013));
  let sum = 0;
  for (let x = Math.log(1e-5); x < Math.log(1e3); x += 1e-3) sum += 10 ** (normalizedPowerDecibels(Math.exp(x)) / 10) * Math.exp(x) * 1e-3;
  assert.ok(Math.abs(10 * Math.log10(sum)) < .3, `${10 * Math.log10(sum)} dB`);
});

test('low frequencies radiate toward the plume axis, high ones near 70°, and the forward side falls off without a step', () => {
  const peak = strouhal => { let best = 0; for (let degrees = 0; degrees <= 84; degrees += 1) if (directivityDecibels(strouhal, degrees) > directivityDecibels(strouhal, best)) best = degrees; return best; };
  assert.ok(peak(.002) < 30);
  assert.ok(peak(.01) > 45 && peak(.01) < 65);
  assert.ok(peak(.1) > 65 && peak(.1) < 78);
  assert.ok(Math.abs(directivityDecibels(.05, 84) - directivityDecibels(.05, 84.001)) < .01);
  assert.ok(directivityDecibels(.05, 170) < directivityDecibels(.05, 100) - 5);
  assert.ok(sourceLocationMetres(.001, 2.76) > sourceLocationMetres(.1, 2.76));
});

test('the default rocket, Falcon 9\'s size and propellant, follows its webcast telemetry within a tenth up to T+100 s', () => {
  const path = ascentPath(defaultRocket());
  const at = seconds => Math.round((seconds + path.heldSeconds) / path.step);
  for (const [seconds, kilometres, speed] of [[30, 1.93, 146], [60, 8.91, 337], [100, 25.49, 874]]) {
    assert.ok(Math.abs(path.z[at(seconds)] / 1000 - kilometres) / kilometres < .1, `T+${seconds}: ${path.z[at(seconds)]} m`);
    assert.ok(Math.abs(path.speed[at(seconds)] - speed) / speed < .12, `T+${seconds}: ${path.speed[at(seconds)]} m/s`);
  }
  assert.equal(path.z[0], path.z[at(0)]);
});

test('the default rocket, Falcon 9\'s size, is about 135 dB at 1 km over grass, as measured', () => {
  const base = defaultScene('rocket');
  const rocket = defaultRocket();
  rocket.ascent.burnSeconds = 30;
  const scene = parseScene({
    ...base, air: { ...base.air, refraction: false }, ground: { ...base.ground, type: 'grass', forest: false, surroundings: false }, emitters: [rocket],
    receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: -1000, z: 1.7 } }], render: { ...base.render, ambisonicOrder: 0 }
  });
  const { samples, sampleRate } = renderReceiver(prepareScene(scene), scene.receivers[0], scene);
  let loudest = 0;
  for (let start = 0; start + sampleRate <= samples.length; start += sampleRate / 4) {
    let sum = 0;
    for (let index = start; index < start + sampleRate; index += 1) sum += samples[index] ** 2;
    loudest = Math.max(loudest, sum / sampleRate);
  }
  const decibels = 10 * Math.log10(loudest / 4e-10);
  assert.ok(Math.abs(decibels - 135) < 2.5, `${decibels.toFixed(1)} dB`);
});

test('a rocket read from a document takes defaults for what is missing and brings values into range', () => {
  const scene = defaultScene('rocket');
  const { ascent, ...rest } = scene.emitters[0];
  const read = readScene({ ...scene, emitters: [{ ...rest, engine: { ...rest.engine, engines: 400 } }] });
  assert.equal(read.emitters[0].engine.engines, 60);
  assert.equal(read.emitters[0].ascent.burnSeconds, scene.emitters[0].ascent.burnSeconds);
  assert.throws(() => parseScene({ ...scene, emitters: [{ ...scene.emitters[0], propellant: 'gunpowder' }] }));
});

test('sizing reaches known engines within a third and scales from a hobby motor to a super-heavy', () => {
  const merlin = sizedRocket(7.6e6, 9, 'kerosene').engine;
  const raptor = sizedRocket(74.4e6, 33, 'methane').engine;
  assert.ok(Math.abs(merlin.exitDiameterMetres / .92 - 1) < .33 && Math.abs(raptor.exitDiameterMetres / 1.306 - 1) < .33);
  const hobby = sizedRocket(10, 1, 'solid');
  assert.ok(hobby.engine.exitDiameterMetres < .01 && hobby.ascent.burnSeconds <= 3 && !hobby.ascent.water);
  assert.ok(sizedRocket(74.4e6, 33, 'methane').ascent.water);
  const scene = defaultScene('rocket');
  const small = { ...scene.emitters[0], propellant: 'solid', engine: { ...scene.emitters[0].engine, ...hobby.engine }, ascent: { ...scene.emitters[0].ascent, ...hobby.ascent } };
  const path = ascentPath(parseScene({ ...scene, emitters: [small] }).emitters[0]);
  assert.ok(path.z.at(-1) > small.startMetres.z + 20, `${path.z.at(-1)} m`);
});
