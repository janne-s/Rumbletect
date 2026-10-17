import assert from 'node:assert/strict';
import test from 'node:test';
import { formationJets, jetGrains } from '../src/domain/grains.js';
import { defaultFormation, defaultJet, defaultScene, parseScene, readScene, serializeScene } from '../src/domain/scene.js';

test('a jet is its only member, and a formation round-trips with its layout', () => {
  const jet = defaultJet();
  assert.deepEqual(formationJets(jet), [jet]);
  const scene = { ...defaultScene(), emitters: [defaultFormation()] };
  assert.deepEqual(readScene(JSON.parse(serializeScene(scene))).emitters[0], scene.emitters[0]);
  const { memberCount, ...rest } = defaultFormation();
  assert.equal(readScene({ ...scene, emitters: [rest] }).emitters[0].memberCount, defaultFormation().memberCount);
});

test('a formation flies the shared V behind the leader, each aircraft a jet with its own seed and the leader\'s its own', () => {
  const formation = defaultFormation();
  const members = formationJets(formation);
  assert.equal(members.length, formation.memberCount);
  assert.deepEqual(members[0].startMetres, formation.startMetres);
  assert.equal(members[0].seed, formation.seed);
  assert.equal(new Set(members.map(member => member.seed)).size, formation.memberCount);
  assert.ok(members.every(member => member.kind === 'jet') && members.slice(1).every(member => member.startMetres.x < formation.startMetres.x));
});

test('a formation\'s grains are every aircraft\'s', () => {
  const base = defaultScene();
  const scene = parseScene({ ...base, emitters: [{ ...defaultFormation(), memberCount: 3, durationSeconds: 3 }], render: { ...base.render, ambisonicOrder: 0 } });
  const all = jetGrains(scene.emitters[0], scene);
  const single = formationJets(scene.emitters[0]).map(member => jetGrains(member, scene));
  assert.equal(all.rows.length, single.reduce((sum, item) => sum + item.rows.length, 0));
  assert.equal(new Set(all.rows.map(row => row.noiseSeed)).size, all.rows.length);
});
