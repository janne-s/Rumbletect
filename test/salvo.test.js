import assert from 'node:assert/strict';
import test from 'node:test';
import { ROCKET } from '../src/domain/constants.js';
import { ascentPath } from '../src/domain/rocket.js';
import { heardAscents, rocketGrains } from '../src/domain/rocket-grains.js';
import { salvoRounds } from '../src/domain/salvo.js';
import { defaultRocket, defaultSalvo, defaultScene, parseScene, readScene, serializeScene } from '../src/domain/scene.js';

test('a rocket is its only round', () => {
  const rocket = defaultRocket();
  assert.deepEqual(salvoRounds(rocket), [rocket]);
});

test('a salvo fires six Artillery rounds one at a time over about 30 s, each near the salvo\'s heading, angle and thrust', () => {
  const salvo = defaultSalvo();
  const rounds = salvoRounds(salvo);
  assert.equal(rounds.length, 6);
  const starts = rounds.map(round => round.startSeconds);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  const span = starts.at(-1) - starts[0];
  assert.ok(span > 30 * (1 - 2 * ROCKET.salvoJitter) - 1 && span < 30 * (1 + 2 * ROCKET.salvoJitter) + 1, `${span} s`);
  for (let index = 1; index < rounds.length; index += 1) assert.ok(starts[index] - starts[index - 1] > 2, `${starts}`);
  assert.equal(new Set(rounds.map(round => round.seed)).size, 6);
  for (const round of rounds) {
    assert.equal(round.kind, 'rocket');
    assert.equal(round.roundCount, undefined);
    assert.ok(Math.hypot(round.startMetres.x - salvo.startMetres.x, round.startMetres.y - salvo.startMetres.y) <= salvo.launcherRadiusMetres);
    assert.ok(Math.abs(round.launchDegrees - salvo.launchDegrees) < 5 && Math.abs(round.engine.thrustKilonewtons / salvo.engine.thrustKilonewtons - 1) < .25);
  }
  assert.deepEqual(salvoRounds(salvo), rounds);
});

test('rounds per salvo leave together within the salvo spread', () => {
  const salvo = { ...defaultSalvo(), roundCount: 12, salvoSize: 4, salvoSpreadSeconds: 2 };
  const starts = salvoRounds(salvo).map(round => round.startSeconds);
  for (let group = 0; group < 3; group += 1) {
    const part = starts.slice(group * 4, group * 4 + 4);
    assert.ok(part.at(-1) - part[0] <= 2, `${part}`);
  }
});

test('a salvo round-trips, takes its layout\'s defaults when missing, and its rounds are brought into range', () => {
  const base = defaultScene('rocket');
  const scene = { ...base, emitters: [defaultSalvo()] };
  assert.deepEqual(readScene(JSON.parse(serializeScene(scene))).emitters[0], scene.emitters[0]);
  const { roundCount, ...rest } = defaultSalvo();
  assert.equal(readScene({ ...scene, emitters: [rest] }).emitters[0].roundCount, ROCKET.salvoLayout.roundCount);
  assert.equal(readScene({ ...scene, emitters: [{ ...rest, roundCount: 500 }] }).emitters[0].roundCount, 48);
});

test('a salvo\'s grains are every round\'s, and each grain is synthesised by its own round', () => {
  const base = defaultScene('rocket');
  const scene = parseScene({ ...base, emitters: [defaultSalvo()], receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: -300, z: 1.7 } }], render: { ...base.render, ambisonicOrder: 0 } });
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
});

test('an Artillery round burns out near Mach 2.5, and an engine left burning too long stops when its propellant runs out', () => {
  const [round] = salvoRounds(defaultSalvo());
  const path = ascentPath(round);
  assert.ok(path.speed.at(-1) > 700 && path.speed.at(-1) < 1100, `${path.speed.at(-1)} m/s`);
  const burnt = ascentPath({ ...round, ascent: { ...round.ascent, burnSeconds: 30 } });
  assert.equal(burnt.throttle.at(-1), 0);
  assert.ok(burnt.throttle.some(value => value > 0) && burnt.speed.every(Number.isFinite));
});
