import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE } from '../src/domain/constants.js';
import { AIRLINER_CLASSES, ENGINE_CLASSES, engineAtPower, streamsOf, thrustNewtons } from '../src/domain/engine.js';
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

test('the fan turns with the square root of thrust, so the buzz-saw sounds at take-off and an approach turns the fan at about half speed', () => {
  const reference = referencePower('narrowbody', 15);
  const takeOff = turbomachineryAt('narrowbody', 1, reference);
  const { blades, fullBladeHz } = ENGINE.classes.narrowbody.turbomachinery;
  assert.equal(takeOff.buzzSaw.tones.length, blades - 1);
  assert.ok(Math.abs(takeOff.buzzSaw.shaftHz * blades - fullBladeHz) < 1e-9);
  const loudest = takeOff.buzzSaw.tones.indexOf(Math.max(...takeOff.buzzSaw.tones)) + 1;
  assert.ok(Math.abs(loudest - blades / 4) <= 1, `order ${loudest}`);
  assert.ok(turbomachineryAt('narrowbody', .8, reference).buzzSaw !== null);
  assert.equal(turbomachineryAt('narrowbody', .3, reference).buzzSaw, null);
  assert.equal(turbomachineryAt('narrowbody', 0, reference).buzzSaw, null);
  let [low, high] = [0, 1];
  for (let step = 0; step < 40; step += 1) { const middle = (low + high) / 2; if (thrustNewtons(middle, 'narrowbody') < 6000 * 4.448222) low = middle; else high = middle; }
  const approach = turbomachineryAt('narrowbody', low, reference).bladeHz / fullBladeHz;
  assert.ok(approach > .45 && approach < .5, `${approach} of full speed at ANP's 6 000 lb approach`);
});

test('a civil fan grows with a power of its speed, from at most 30 dB under full at idle', () => {
  for (const key of AIRLINER_CLASSES) {
    const reference = referencePower(key, 15);
    const level = power => 10 * Math.log10(turbomachineryAt(key, power, reference).hump / reference);
    const drop = level(1) - level(0);
    assert.ok(drop > 12 && drop <= 30 + 1e-9, `${key}: ${drop} dB`);
    const { speedExponent } = ENGINE.classes[key].turbomachinery;
    const [a, b] = [.5, .8];
    const expected = 10 * speedExponent * Math.log10(turbomachineryAt(key, b, reference).bladeHz / turbomachineryAt(key, a, reference).bladeHz);
    assert.ok(Math.abs(level(b) - level(a) - expected) < 1e-9, key);
  }
});

test('a civil engine idles at 6 % of its take-off thrust, low enough for ANP\'s approach rows', () => {
  for (const key of AIRLINER_CLASSES) {
    const share = thrustNewtons(0, key) / thrustNewtons(1, key);
    assert.ok(Math.abs(share - .06) < .005, `${key}: ${share}`);
  }
});
