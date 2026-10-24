import assert from 'node:assert/strict';
import test from 'node:test';
import { VOLCANO } from '../src/domain/constants.js';
import { defaultScene, defaultVolcano, parseScene, readScene, serializeScene } from '../src/domain/scene.js';
import { craterPosition, eruptionShare, ventPath, volcanoGrains, volcanoSourcePosition } from '../src/domain/volcano.js';
import { follower, KIND_PANELS } from '../src/ui/kinds.js';

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

test('Strombolian bursts come at gaps about the pulse period, lift the eruption to its full velocity, and drop it between', async () => {
  const { burstLevel, burstSchedule } = await import('../src/domain/volcano.js');
  const strombolian = VOLCANO.categories.find(category => category.key === 'strombolian');
  const volcano = { ...defaultVolcano(), eruption: { ...VOLCANO.defaultEruption, eruptionSeconds: 600, riseSeconds: 1, fadeSeconds: 1, ...strombolian.eruption } };
  const bursts = burstSchedule(volcano);
  const gaps = bursts.slice(1).map((burst, index) => burst.start - bursts[index].start).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  assert.ok(median > .7 * volcano.eruption.pulsePeriodSeconds && median < 1.3 * volcano.eruption.pulsePeriodSeconds, `${median} s`);
  assert.deepEqual(burstSchedule({ ...volcano }), bursts);
  const peak = bursts[10].start + VOLCANO.bursts.riseSeconds + bursts[10].length / 2;
  assert.ok(Math.abs(burstLevel(volcano, peak) - 1) < 1e-9 && Math.abs(eruptionShare(volcano, peak) - 1) < 1e-9);
  const between = bursts[10].start - .01;
  assert.ok(Math.abs(eruptionShare(volcano, between) - (1 - volcano.eruption.pulseDepthPercent / 100)) < .02, `${eruptionShare(volcano, between)}`);
  const steady = { ...volcano, eruption: { ...volcano.eruption, burstsPercent: 0 } };
  assert.ok(Math.abs(eruptionShare(steady, between) - eruptionShare({ ...steady, eruption: { ...steady.eruption, burstSeconds: 9 } }, between)) < 1e-12);
});

test('the crater stands its height above the ground of the terrain, and the roar rises five jet widths above it', () => {
  const volcano = { ...defaultVolcano(), ventMetres: { x: 100, y: -200, z: 30 } };
  const hill = { heightAt: (x, y) => 1500 + x / 10 - y / 100 };
  const crater = craterPosition(volcano, hill);
  assert.equal(crater.z, 1500 + 10 + 2 + 30);
  assert.equal(ventPath(volcano, hill).z[0], crater.z);
  assert.equal(volcanoSourcePosition(volcano, crater).z, crater.z + VOLCANO.sourceDiameters * volcano.jet.ventDiameterMetres);
});

test('a volcano follows the linked Boomtect volcano\'s crater and onset, its category chosen once from the eruption', () => {
  const scene = defaultScene('volcano');
  const ghost = { id: 'volcano-2', name: 'Volcano 2', follow: { role: 'volcano', crater: { x: 40, y: 50, z: 0 }, startSeconds: 3, eruption: 'strongVulcanian', paths: [] } };
  const options = { partner: 'Boomtect', uniqueId: base => `${base}-9`, scene };
  const made = follower(ghost, null, options);
  assert.equal(made.category, 'plinian');
  assert.deepEqual(made.ventMetres, { x: 40, y: 50, z: 0 });
  assert.equal(made.startSeconds, 3);
  assert.deepEqual(made.follows, { app: 'Boomtect', id: 'volcano-2', name: 'Volcano 2' });
  const kept = follower({ ...ghost, follow: { ...ghost.follow, crater: { x: 60, y: 50, z: 0 }, eruption: 'strombolian' } }, { ...made, category: 'fountain' }, options);
  assert.equal(kept.category, 'fountain');
  assert.equal(kept.ventMetres.x, 60);
  assert.deepEqual(parseScene({ ...scene, emitters: [kept] }).emitters[0].follows, kept.follows);
  assert.equal(KIND_PANELS.volcano.followAs(parseScene({ ...scene, emitters: [kept] }).emitters[0]), null);
  assert.equal(follower(ghost, null, { ...options, scene: defaultScene('jet') }), null);
  assert.equal(KIND_PANELS.volcano.followAs(made), null);
  const labels = KIND_PANELS.volcano.macros(made, { onset: true }).map(macro => macro.label);
  assert.ok(labels.includes('Jet width') && labels.includes('Category'));
  assert.ok(!labels.includes('Crater height') && !labels.includes('Onset'));
  assert.equal(KIND_PANELS.volcano.followAs(scene.emitters[0]).role, 'volcano');
});
