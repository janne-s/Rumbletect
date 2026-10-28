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

test('a salvo fires a 122 mm launcher\'s 40 rounds one at a time over about 20 s, each near the salvo\'s heading, angle and thrust', () => {
  const salvo = defaultSalvo();
  const rounds = salvoRounds(salvo);
  assert.equal(rounds.length, 40);
  const starts = rounds.map(round => round.startSeconds);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  const span = starts.at(-1) - starts[0];
  assert.ok(Math.abs(span - 20) < 1, `${span} s`);
  for (let index = 1; index < rounds.length; index += 1) assert.ok(starts[index] - starts[index - 1] > .2, `${starts}`);
  assert.equal(new Set(rounds.map(round => round.seed)).size, 40);
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
  assert.equal(heard.length, 40);
  const single = heard.map(({ round }) => rocketGrains(round, scene));
  const grainRows = grains => grains.rows.filter(row => row.pulse === 'grain');
  assert.equal(salvo.rows.length, single.reduce((sum, item) => sum + item.rows.length, 0));
  assert.equal(salvo.rows.filter(row => row.pulse === 'friedlander').length, 40);
  assert.equal(new Set(grainRows(salvo).map(row => row.noiseSeed)).size, grainRows(salvo).length);
  const plan = { size: 8192 };
  const departure = { x: 0, y: -1, z: 0 };
  const last = single.at(-1);
  const lastRow = grainRows(salvo).length - grainRows(last).length + 3;
  assert.deepEqual(salvo.emission(grainRows(salvo)[lastRow].noiseSeed, departure, plan).re, last.emission(grainRows(last)[3].noiseSeed, departure, plan).re);
});

test('an Artillery round burns out at a Grad\'s 690 m/s and flies straight off its tube', () => {
  const [round] = salvoRounds(defaultSalvo());
  const path = ascentPath(round);
  assert.ok(Math.abs(path.speed.at(-1) - 690) < 1e-9, `${path.speed.at(-1)} m/s`);
  const angle = index => Math.atan2(path.vz[index], Math.hypot(path.vx[index], path.vy[index])) * 180 / Math.PI;
  assert.ok(Math.abs(angle(path.speed.length - 1) - round.launchDegrees) < 1e-9);
  assert.ok(path.throttle.every(value => value > 0) && path.speed.every(Number.isFinite));
});

test("a rocket's length comes with its category, and a saved rocket without one takes its thrust's", () => {
  assert.equal(defaultSalvo().lengthMetres, 2.87);
  assert.equal(defaultRocket().lengthMetres, 70);
  const saved = JSON.parse(serializeScene({ ...defaultScene('rocket'), emitters: [defaultSalvo()] }));
  delete saved.emitters[0].lengthMetres;
  assert.equal(readScene(saved).emitters[0].lengthMetres, 2.87);
  const kept = JSON.parse(serializeScene({ ...defaultScene('rocket'), emitters: [{ ...defaultSalvo(), lengthMetres: 3.2 }] }));
  assert.equal(readScene(kept).emitters[0].lengthMetres, 3.2);
});

test('a solid round flies on after burnout to about the Grad\'s range, and a liquid launcher\'s path ends at burnout', async () => {
  const { coastedPath } = await import('../src/domain/rocket.js');
  const air = defaultScene('rocket').air;
  const round = salvoRounds(defaultSalvo())[0];
  const path = coastedPath(ascentPath(round), round, air);
  const last = path.seconds.length - 1;
  assert.equal(path.burnoutSeconds - path.seconds[0], 2);
  const range = Math.hypot(path.x[last] - path.x[0], path.y[last] - path.y[0]);
  assert.ok(range > 15000 && range < 30000, `${range}`);
  assert.ok(path.z[last] < 200 && path.seconds[last] - path.seconds[0] > 40);
  const launcher = defaultRocket();
  const ascent = ascentPath(launcher);
  assert.equal(coastedPath(ascent, launcher, air), ascent);
});
