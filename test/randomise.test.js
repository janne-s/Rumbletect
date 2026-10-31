import assert from 'node:assert/strict';
import test from 'node:test';
import { ADD_EMITTERS, KIND_PANELS } from '../src/ui/kinds.js';
import { defaultScene, parseScene } from '../src/domain/scene.js';
import { createRandom } from '../src/shared/domain/random.js';
import { randomiseControls, randomiseEnvironment } from '../src/shared/domain/randomise.js';

const PLACEMENT = ['headingDegrees', 'startSeconds', 'durationSeconds', 'autoDuration'];
const ground = point => point && { x: point.x, y: point.y };

test('a full roll of every kind\'s quick controls is a valid scene and with its default locks leaves where on the ground and when it is', () => {
  for (const [prefix, { create, mode }] of Object.entries(ADD_EMITTERS)) {
    for (let seed = 1; seed <= 60; seed += 1) {
      const scene = defaultScene(mode);
      const emitter = create(`${prefix}-2`, 'Rolled', 1);
      scene.emitters = [emitter];
      const before = structuredClone(emitter);
      randomiseControls(emitter, KIND_PANELS[emitter.kind].macros(emitter, { onset: true }), { random: createRandom(seed), amount: 1, locked: control => Boolean(control.lockedByDefault) });
      randomiseEnvironment(scene, { random: createRandom(seed + 1000), amount: 1, upperWind: mode !== 'jet' });
      assert.doesNotThrow(() => parseScene(scene), `${prefix} seed ${seed}`);
      for (const key of PLACEMENT) if (key in before) assert.deepEqual(emitter[key], before[key], `${prefix} ${key}`);
      assert.deepEqual(ground(emitter.startMetres ?? emitter.ventMetres), ground(before.startMetres ?? before.ventMetres), prefix);
    }
  }
});

test('a jet that starts faster than its exhaust says when and how far away its noise begins', () => {
  const scene = defaultScene('jet');
  const jet = { ...scene.emitters[0], mach: 2.38, accelerationMetresPerSecondSquared: -12, engine: { ...scene.emitters[0].engine, pressureRatio: 2.206, totalTemperatureKelvin: 632 } };
  scene.emitters = [jet];
  const [warning] = KIND_PANELS.jet.warnings(jet, scene).filter(text => text.startsWith('No jet noise'));
  assert.match(warning, /^No jet noise until \d+\.\d s, [\d.]+ k?m from Mic 1$/);
  const steady = { ...jet, accelerationMetresPerSecondSquared: 0 };
  assert.ok(KIND_PANELS.jet.warnings(steady, scene).some(text => /^No jet noise: faster than its \d+ m\/s exhaust all the way$/.test(text)));
});
