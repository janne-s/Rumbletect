import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAirliner, defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';

test('a Distance loss of 50 % keeps the nearest pass and halves the decibels lost with distance', () => {
  const render = share => {
    const base = defaultScene();
    const scene = parseScene({
      ...base,
      air: { ...base.air, refraction: false, absorption: false },
      ground: { ...base.ground, enabled: false, forest: false, surroundings: false },
      emitters: [{ ...defaultAirliner(), startMetres: { x: 0, y: 0, z: 200 }, durationSeconds: 24 }],
      receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: 0, z: 1.7 } }],
      render: { ...base.render, ambisonicOrder: 0, distanceLossPercent: share }
    });
    const { samples, sampleRate } = renderReceiver(prepareScene(scene), scene.receivers[0], scene);
    const level = (from, to) => { let sum = 0; for (let i = Math.round(from * sampleRate); i < Math.round(to * sampleRate); i += 1) sum += samples[i] ** 2; return 10 * Math.log10(sum); };
    const peak = samples.reduce((top, value) => Math.max(top, Math.abs(value)), 0);
    const first = samples.findIndex(value => Math.abs(value) > 1e-3 * peak) / sampleRate;
    return { near: level(first + .5, first + 1.5), far: level(first + 20, first + 21) };
  };
  const [physical, eased] = [render(100), render(50)];
  assert.ok(Math.abs(eased.near - physical.near) < .5, `${eased.near - physical.near} dB near`);
  const loss = physical.near - physical.far;
  const easedLoss = eased.near - eased.far;
  assert.ok(loss > 15, `${loss} dB`);
  assert.ok(Math.abs(easedLoss / loss - .5) < .15, `${easedLoss} of ${loss} dB`);
});
