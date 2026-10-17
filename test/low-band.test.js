import assert from 'node:assert/strict';
import test from 'node:test';
import { LOW_BAND } from '../src/domain/constants.js';
import { prepareScene } from '../src/domain/render.js';
import { defaultScene, defaultVolcano, parseScene } from '../src/domain/scene.js';
import { volcanoGrains } from '../src/domain/volcano.js';

const scene = () => {
  const base = defaultScene('volcano');
  return parseScene({ ...base, emitters: [{ ...defaultVolcano(), eruption: { ...defaultVolcano().eruption, eruptionSeconds: 10 } }], render: { ...base.render, ambisonicOrder: 0 } });
};

test('every source is prepared twice, its long grains limited to the low band', () => {
  const prepared = prepareScene(scene());
  assert.equal(prepared.length, 2);
  assert.equal(prepared[0].highestFrequencyHz, null);
  assert.equal(prepared[1].highestFrequencyHz, LOW_BAND.highestFrequencyHz);
  assert.ok(prepared[1].sources.durationSeconds[0] > 5 * prepared[0].sources.durationSeconds[0]);
});

test('a Plinian jet\'s power lies mostly below the crossover, and a fighter\'s short grains keep nearly all of theirs', async () => {
  const value = scene();
  const power = (grains, band) => grains(band).rows.reduce((sum, row) => sum + row.amplitudePaMetres ** 2 * row.durationSeconds, 0);
  const volcano = band => volcanoGrains(value.emitters[0], value, band);
  assert.ok(power(volcano, 'low') > 5 * power(volcano, 'high'));
  const { jetGrains } = await import('../src/domain/grains.js');
  const jetScene = parseScene({ ...defaultScene(), render: { ...defaultScene().render, ambisonicOrder: 0 } });
  const jet = band => jetGrains({ ...jetScene.emitters[0], durationSeconds: 3 }, jetScene, band);
  assert.ok(Math.abs(10 * Math.log10(power(jet, 'high') / power(jet, 'full'))) < .2);
});

test('a low grain\'s spectrum holds only the low bins and is finite', () => {
  const value = scene();
  const grains = volcanoGrains(value.emitters[0], value, 'low');
  const plan = { size: 2 ** 18 };
  const { re, im } = grains.emission(grains.rows[3].noiseSeed, { x: 0, y: -1, z: 0 }, plan);
  assert.ok(re.length <= Math.ceil(LOW_BAND.highestFrequencyHz * plan.size / value.render.sampleRate) + 2);
  assert.ok(re.every(Number.isFinite) && im.every(Number.isFinite) && re.some(value => value !== 0));
});
