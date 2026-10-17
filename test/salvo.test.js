import assert from 'node:assert/strict';
import test from 'node:test';
import { ROCKET } from '../src/domain/constants.js';
import { ascentPath, categoryRocket } from '../src/domain/rocket.js';
import { heardAscents, rocketGrains } from '../src/domain/rocket-grains.js';
import { salvoRounds } from '../src/domain/salvo.js';
import { defaultRocket, defaultScene, parseScene, readScene } from '../src/domain/scene.js';

const ARTILLERY = ROCKET.categories.find(category => category.label === 'Artillery');

const artillery = () => categoryRocket(defaultRocket(), ARTILLERY);

test('one round is the rocket itself', () => {
  const rocket = defaultRocket();
  assert.deepEqual(salvoRounds(rocket), [rocket]);
});

test('Artillery fires six rounds one at a time over about 30 s, each near the rocket\'s heading, angle and thrust', () => {
  const rocket = artillery();
  const rounds = salvoRounds(rocket);
  assert.equal(rounds.length, 6);
  const starts = rounds.map(round => round.startSeconds);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  const span = starts.at(-1) - starts[0];
  assert.ok(span > 30 * (1 - 2 * ROCKET.salvoJitter) - 1 && span < 30 * (1 + 2 * ROCKET.salvoJitter) + 1, `${span} s`);
  for (let index = 1; index < rounds.length; index += 1) assert.ok(starts[index] - starts[index - 1] > 2, `${starts}`);
  assert.equal(new Set(rounds.map(round => round.seed)).size, 6);
  for (const round of rounds) {
    assert.ok(Math.hypot(round.startMetres.x - rocket.startMetres.x, round.startMetres.y - rocket.startMetres.y) <= rocket.salvo.launcherRadiusMetres);
    assert.ok(Math.abs(round.launchDegrees - rocket.launchDegrees) < 5 && Math.abs(round.engine.thrustKilonewtons / rocket.engine.thrustKilonewtons - 1) < .25);
    assert.equal(round.salvo.rounds, 1);
  }
  assert.deepEqual(salvoRounds(rocket), rounds);
});

test('rounds per salvo leave together within the salvo spread', () => {
  const rocket = artillery();
  rocket.salvo = { ...rocket.salvo, rounds: 12, salvoSize: 4, salvoSpreadSeconds: 2 };
  const starts = salvoRounds(rocket).map(round => round.startSeconds);
  for (let group = 0; group < 3; group += 1) {
    const salvo = starts.slice(group * 4, group * 4 + 4);
    assert.ok(salvo.at(-1) - salvo[0] <= 2, `${salvo}`);
  }
});

test('a rocket saved without a salvo reads back as one round, and rounds are brought into range', () => {
  const scene = defaultScene('rocket');
  const { salvo, ...rest } = scene.emitters[0];
  assert.deepEqual(readScene({ ...scene, emitters: [rest] }).emitters[0].salvo, ROCKET.defaultSalvo);
  assert.equal(readScene({ ...scene, emitters: [{ ...rest, salvo: { ...salvo, rounds: 500 } }] }).emitters[0].salvo.rounds, 48);
});

test('a salvo\'s grains are every round\'s, and each grain is synthesised by its own round', () => {
  const base = defaultScene('rocket');
  const rocket = artillery();
  const scene = parseScene({ ...base, emitters: [rocket], receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: -300, z: 1.7 } }], render: { ...base.render, ambisonicOrder: 0 } });
  const salvo = rocketGrains(scene.emitters[0], scene);
  const heard = heardAscents(scene.emitters[0], scene);
  assert.equal(heard.length, 6);
  const single = heard.map(({ round }) => rocketGrains(round, scene));
  assert.equal(salvo.rows.length, single.reduce((sum, item) => sum + item.rows.length, 0));
  assert.equal(new Set(salvo.rows.map(row => row.noiseSeed)).size, salvo.rows.length);
  const plan = { size: 8192 };
  const departure = { x: 0, y: -1, z: 0 };
  const last = single.at(-1);
  const lastRow = salvo.rows.length - last.rows.length + 3;
  assert.deepEqual(salvo.emission(salvo.rows[lastRow].noiseSeed, departure, plan).re, last.emission(last.rows[3].noiseSeed, departure, plan).re);
  assert.equal(salvo.rows[lastRow].emissionSeconds, last.rows[3].emissionSeconds);
});

test('an Artillery round burns out near Mach 2.5, and an engine left burning too long stops when its propellant runs out', () => {
  const [round] = salvoRounds(artillery());
  const path = ascentPath(round);
  assert.ok(path.speed.at(-1) > 700 && path.speed.at(-1) < 1100, `${path.speed.at(-1)} m/s`);
  const long = { ...round, ascent: { ...round.ascent, burnSeconds: 30 } };
  const burnt = ascentPath(long);
  assert.equal(burnt.throttle.at(-1), 0);
  assert.ok(burnt.throttle.some(value => value > 0) && burnt.speed.every(Number.isFinite));
});
