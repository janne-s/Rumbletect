import assert from 'node:assert/strict';
import test from 'node:test';
import { formationJets, jetGrains } from '../src/domain/grains.js';
import { defaultJet, defaultScene, parseScene, readScene } from '../src/domain/scene.js';

test('one aircraft is the jet itself, and a jet saved without a formation reads back as one', () => {
  const jet = defaultJet();
  assert.deepEqual(formationJets(jet), [jet]);
  const scene = defaultScene();
  const { formation, ...rest } = scene.emitters[0];
  assert.deepEqual(readScene({ ...scene, emitters: [rest] }).emitters[0].formation, formation);
});

test('a formation flies the shared V behind the leader, each aircraft with its own seed and the leader\'s own', () => {
  const jet = { ...defaultJet(), formation: { aircraft: 4, lateralSpacingMetres: 20, trailSpacingMetres: 30 } };
  const members = formationJets(jet);
  assert.equal(members.length, 4);
  assert.deepEqual(members[0].startMetres, jet.startMetres);
  assert.equal(members[0].seed, jet.seed);
  assert.equal(new Set(members.map(member => member.seed)).size, 4);
  assert.ok(members.slice(1).every(member => member.startMetres.x < jet.startMetres.x && member.formation.aircraft === 1));
});

test('a formation\'s grains are every aircraft\'s', () => {
  const base = defaultScene();
  const jet = { ...base.emitters[0], durationSeconds: 3, formation: { aircraft: 3, lateralSpacingMetres: 20, trailSpacingMetres: 30 } };
  const scene = parseScene({ ...base, emitters: [jet], render: { ...base.render, ambisonicOrder: 0 } });
  const all = jetGrains(scene.emitters[0], scene);
  const single = formationJets(scene.emitters[0]).map(member => jetGrains(member, scene));
  assert.equal(all.rows.length, single.reduce((sum, item) => sum + item.rows.length, 0));
  assert.equal(new Set(all.rows.map(row => row.noiseSeed)).size, all.rows.length);
});
