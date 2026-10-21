import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE } from '../src/domain/constants.js';
import { AIRLINER_CLASSES, ENGINE_CLASSES, engineAtPower, streamsOf } from '../src/domain/engine.js';
import { defaultAirliner, defaultScene, parseScene, readScene, serializeScene } from '../src/domain/scene.js';
import { referencePower, turbomachineryAt } from '../src/domain/turbomachinery.js';
import { macrosFor } from '../src/ui/macros.js';

test('an airliner is its own kind with only the civil classes, and a jet keeps only the military ones', () => {
  assert.deepEqual(AIRLINER_CLASSES, ['business', 'regional', 'narrowbody', 'widebody', 'quad']);
  assert.ok(ENGINE_CLASSES.every(key => !AIRLINER_CLASSES.includes(key)));
  const scene = { ...defaultScene(), emitters: [defaultAirliner()] };
  assert.deepEqual(readScene(JSON.parse(serializeScene(parseScene(scene)))).emitters[0], parseScene(scene).emitters[0]);
  assert.equal(readScene({ ...scene, emitters: [{ ...defaultAirliner(), engineClass: 'fighter' }] }).emitters[0].engineClass, 'narrowbody');
  const airliner = defaultAirliner();
  const category = macrosFor(airliner).find(macro => macro.label === 'Category');
  category.write(airliner, 1);
  assert.equal(airliner.engineClass, 'quad');
  assert.equal(airliner.engine.engines, 4);
});

test('each civil class makes its take-off thrust within a tenth from its core and fan streams', () => {
  const thrust = (engine, velocity) => {
    const exitKelvin = engine.totalTemperatureKelvin - velocity ** 2 / (2 * ENGINE.gasHeatCapacityJoulesPerKilogramKelvin);
    return 101325 / (287 * exitKelvin) * Math.PI * engine.diameterMetres ** 2 / 4 * velocity ** 2;
  };
  for (const [key, newtons] of [['business', 16500], ['regional', 64500], ['narrowbody', 120000], ['widebody', 514000], ['quad', 260000]]) {
    const core = engineAtPower(1, key);
    const [coreJet, fanJet] = streamsOf(core, key, 15);
    const total = thrust(core, coreJet.velocityMetresPerSecond) + thrust(ENGINE.classes[key].bypass[1], fanJet.velocityMetresPerSecond);
    assert.ok(Math.abs(total / newtons - 1) < .1, `${key}: ${total} N`);
  }
});

test('the buzz-saw sounds at the shaft\'s orders at take-off and is gone at idle and part power', () => {
  const reference = referencePower('narrowbody', 15);
  const takeOff = turbomachineryAt('narrowbody', 1, reference);
  const { blades, fullBladeHz } = ENGINE.classes.narrowbody.turbomachinery;
  assert.equal(takeOff.buzzSaw.tones.length, blades - 1);
  assert.ok(Math.abs(takeOff.buzzSaw.shaftHz * blades - fullBladeHz) < 1e-9);
  const loudest = takeOff.buzzSaw.tones.indexOf(Math.max(...takeOff.buzzSaw.tones)) + 1;
  assert.ok(Math.abs(loudest - blades / 4) <= 1, `order ${loudest}`);
  assert.equal(turbomachineryAt('narrowbody', .8, reference).buzzSaw, null);
  assert.equal(turbomachineryAt('narrowbody', 0, reference).buzzSaw, null);
});

test('a civil fan is far quieter at idle than at take-off, as approach levels require', () => {
  for (const key of AIRLINER_CLASSES) {
    const { toneDecibels, humpDecibels } = ENGINE.classes[key].turbomachinery;
    assert.ok(toneDecibels[1] - toneDecibels[0] > 15 && humpDecibels[1] - humpDecibels[0] > 15, key);
  }
});
