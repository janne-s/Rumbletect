import assert from 'node:assert/strict';
import test from 'node:test';
import { VOLCANO } from '../src/domain/constants.js';
import { defaultScene, defaultVolcano, parseScene, readScene, serializeScene } from '../src/domain/scene.js';
import { eruptionShare, ventPath, volcanoGrains } from '../src/domain/volcano.js';
import { KIND_PANELS } from '../src/ui/kinds.js';

test('a volcano scene round-trips, and a volcano saved without its eruption takes the default one', () => {
  const scene = defaultScene('volcano');
  assert.deepEqual(readScene(JSON.parse(serializeScene(scene))), scene);
  const { eruption, ...rest } = scene.emitters[0];
  assert.deepEqual(readScene({ ...scene, emitters: [{ ...rest, category: 'unknown' }] }).emitters[0].eruption, VOLCANO.defaultEruption);
  assert.equal(readScene({ ...scene, emitters: [{ ...rest, category: 'unknown' }] }).emitters[0].category, 'plinian');
});

test('the eruption rises, pulses within its depth, and fades to nothing at its end', () => {
  const volcano = defaultVolcano();
  const { eruptionSeconds, riseSeconds, pulseDepthPercent } = volcano.eruption;
  assert.equal(eruptionShare(volcano, 0), 0);
  assert.equal(eruptionShare(volcano, eruptionSeconds), 0);
  assert.equal(eruptionShare(volcano, -1), 0);
  const steady = Array.from({ length: 400 }, (_, index) => eruptionShare(volcano, riseSeconds + index * .2));
  assert.ok(Math.max(...steady) <= 1 + 1e-9 && Math.min(...steady) >= 1 - pulseDepthPercent / 100 - 1e-9);
  assert.ok(Math.max(...steady) - Math.min(...steady) > pulseDepthPercent / 200);
});

test('the vent stays still for the eruption, and its grains rise above the vent', () => {
  const base = defaultScene('volcano');
  const volcano = { ...defaultVolcano(), eruption: { ...VOLCANO.defaultEruption, eruptionSeconds: 10 } };
  const scene = parseScene({ ...base, emitters: [volcano], render: { ...base.render, ambisonicOrder: 0 } });
  const path = ventPath(scene.emitters[0]);
  assert.ok(path.x.every(x => x === volcano.ventMetres.x) && path.speed.every(speed => speed === 0));
  const { rows } = volcanoGrains(scene.emitters[0], scene);
  assert.ok(rows.length > 0 && rows.every(row => row.positionMetres.z === volcano.ventMetres.z + VOLCANO.sourceDiameters * volcano.jet.ventDiameterMetres));
  const fronts = [];
  KIND_PANELS.volcano.wavefrontSources(scene.emitters[0], scene, point => point, fronts);
  assert.equal(fronts.length, 1);
  assert.ok(rows.every(row => row.positionMetres.x === fronts[0].point.x && row.positionMetres.y === fronts[0].point.y && row.positionMetres.z === fronts[0].point.z));
  assert.equal(fronts[0].emitted, volcano.startSeconds);
});

test('a lava fountain\'s smaller vent jets keep its roar falling as Mount Yasur\'s from 63 Hz to 1 kHz', () => {
  const base = defaultScene('volcano');
  const fountain = VOLCANO.categories.find(category => category.key === 'fountain');
  const volcano = { ...defaultVolcano(), category: 'fountain', jet: { ventDiameterMetres: fountain.ventDiameterMetres, ventVelocityMetresPerSecond: fountain.ventVelocityMetresPerSecond, gasTemperatureKelvin: fountain.gasTemperatureKelvin } };
  const scene = parseScene({ ...base, emitters: [volcano] });
  const grains = volcanoGrains(scene.emitters[0], scene, 'high');
  const index = grains.rows[Math.floor(grains.rows.length / 2)].noiseSeed;
  const { re, im } = grains.emission(index, { x: 1, y: 0, z: 0 }, { size: 16384 });
  const octave = centre => { let sum = 0; for (let bin = 1; bin < re.length; bin += 1) { const hz = bin * 48000 / 16384; if (hz >= centre / Math.SQRT2 && hz < centre * Math.SQRT2) sum += re[bin] ** 2 + im[bin] ** 2; } return 10 * Math.log10(sum); };
  const toQuarter = octave(63) - octave(250);
  assert.ok(toQuarter > 8 && toQuarter < 15, `${toQuarter} dB from 63 to 250 Hz; Yasur 14.7, without vent jets 19.4`);
});
