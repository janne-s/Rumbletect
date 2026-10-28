import assert from 'node:assert/strict';
import test from 'node:test';
import { ascentPath, categoryRocket, directivityDecibels, ignitionBurstGain, ignitionPulse, ignitionSecondsOf, nearestCategory, normalizedPowerDecibels, sizedRocket, sourceLocationMetres, speedShare, vehicleOf } from '../src/domain/rocket.js';
import { rocketGrains } from '../src/domain/rocket-grains.js';
import { rocketMacros } from '../src/ui/macros.js';
import { ROCKET } from '../src/domain/constants.js';
import { defaultRocket, defaultScene, parseScene, readScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';

test('SATURN\'s power spectrum is continuous, peaks at Sr 0.0108 with 14.35 dB, and holds the overall power', () => {
  for (const at of [3.6e-3, 4.8e-2]) assert.ok(Math.abs(normalizedPowerDecibels(at * (1 - 1e-9)) - normalizedPowerDecibels(at * (1 + 1e-9))) < .05);
  assert.ok(Math.abs(normalizedPowerDecibels(.0108) - 14.35) < .02);
  assert.ok(normalizedPowerDecibels(.0108) > normalizedPowerDecibels(.009) && normalizedPowerDecibels(.0108) > normalizedPowerDecibels(.013));
  let sum = 0;
  for (let x = Math.log(1e-5); x < Math.log(1e3); x += 1e-3) sum += 10 ** (normalizedPowerDecibels(Math.exp(x)) / 10) * Math.exp(x) * 1e-3;
  assert.ok(Math.abs(10 * Math.log10(sum)) < .3, `${10 * Math.log10(sum)} dB`);
});

test('low frequencies radiate toward the plume axis, high ones near 70°, and the forward side falls off without a step', () => {
  const peak = strouhal => { let best = 0; for (let degrees = 0; degrees <= 84; degrees += 1) if (directivityDecibels(strouhal, degrees) > directivityDecibels(strouhal, best)) best = degrees; return best; };
  assert.ok(peak(.002) < 30);
  assert.ok(peak(.01) > 45 && peak(.01) < 65);
  assert.ok(peak(.1) > 65 && peak(.1) < 78);
  assert.ok(Math.abs(directivityDecibels(.05, 84) - directivityDecibels(.05, 84.001)) < .01);
  assert.ok(directivityDecibels(.05, 170) < directivityDecibels(.05, 100) - 5);
  assert.ok(sourceLocationMetres(.001, 2.76) > sourceLocationMetres(.1, 2.76));
});

test('the default rocket, the Medium launcher, follows Falcon 9\'s webcast telemetry up to T+100 s', () => {
  const path = ascentPath(defaultRocket());
  const at = seconds => Math.round((seconds + path.heldSeconds) / path.step);
  for (const [seconds, kilometres, speed] of [[30, 1.93, 146], [60, 8.91, 337], [100, 25.49, 874]]) {
    assert.ok(Math.abs(path.z[at(seconds)] / 1000 - kilometres) / kilometres < .12, `T+${seconds}: ${path.z[at(seconds)]} m`);
    assert.ok(Math.abs(path.speed[at(seconds)] - speed) / speed < .2, `T+${seconds}: ${path.speed[at(seconds)]} m/s`);
  }
  assert.equal(path.z[0], path.z[at(0)]);
});

test('the default rocket, Falcon 9\'s size, is about 135 dB at 1 km over grass, as measured', () => {
  const base = defaultScene('rocket');
  const rocket = defaultRocket();
  const { burnSeconds, burnoutMetresPerSecond, accelerationPercent } = rocket.ascent;
  const share = 30 / burnSeconds;
  const shortened = accelerationPercent * share;
  rocket.ascent = { ...rocket.ascent, burnSeconds: 30, accelerationPercent: shortened, burnoutMetresPerSecond: burnoutMetresPerSecond * speedShare(accelerationPercent, share), bendDegrees: 0 };
  const scene = parseScene({
    ...base, air: { ...base.air, refraction: false }, ground: { ...base.ground, type: 'grass', forest: false, surroundings: false }, emitters: [rocket],
    receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: -1000, z: 1.7 } }], render: { ...base.render, ambisonicOrder: 0 }
  });
  const { samples, sampleRate } = renderReceiver(prepareScene(scene), scene.receivers[0], scene);
  let loudest = 0;
  for (let start = 0; start + sampleRate <= samples.length; start += sampleRate / 4) {
    let sum = 0;
    for (let index = start; index < start + sampleRate; index += 1) sum += samples[index] ** 2;
    loudest = Math.max(loudest, sum / sampleRate);
  }
  const decibels = 10 * Math.log10(loudest / 4e-10);
  assert.ok(Math.abs(decibels - 135) < 2.5, `${decibels.toFixed(1)} dB`);
});

test('a rocket read from a document takes defaults for what is missing and brings values into range', () => {
  const scene = defaultScene('rocket');
  const { ascent, ...rest } = scene.emitters[0];
  const read = readScene({ ...scene, emitters: [{ ...rest, engine: { ...rest.engine, engines: 400 } }] });
  assert.equal(read.emitters[0].engine.engines, 60);
  assert.equal(read.emitters[0].ascent.burnSeconds, scene.emitters[0].ascent.burnSeconds);
  assert.throws(() => parseScene({ ...scene, emitters: [{ ...scene.emitters[0], propellant: 'gunpowder' }] }));
});

test('sizing reaches known engines within a third and scales from a hobby motor to a super-heavy', () => {
  const merlin = sizedRocket(7.6e6, 9, 'kerosene').engine;
  const raptor = sizedRocket(74.4e6, 33, 'methane').engine;
  assert.ok(Math.abs(merlin.exitDiameterMetres / .92 - 1) < .33 && Math.abs(raptor.exitDiameterMetres / 1.306 - 1) < .33);
  const hobby = sizedRocket(10, 1, 'solid');
  assert.ok(hobby.engine.exitDiameterMetres < .01 && hobby.ascent.burnSeconds <= 3 && !hobby.ascent.water);
  assert.ok(sizedRocket(74.4e6, 33, 'methane').ascent.water);
});

test('without a bend a rocket flies straight along its launch angle and reaches its burnout speed', () => {
  const rocket = { ...defaultRocket(), propellant: 'solid', launchDegrees: 50 };
  rocket.ascent = { ...rocket.ascent, burnSeconds: 5, burnoutMetresPerSecond: 700, accelerationPercent: 30, bendDegrees: 0 };
  const path = ascentPath(rocket);
  const slope = Math.tan(50 * Math.PI / 180);
  for (let index = 0; index < path.x.length; index += 1) assert.ok(Math.abs(path.z[index] - rocket.startMetres.z - slope * (path.x[index] - rocket.startMetres.x)) < 1);
  assert.ok(Math.abs(path.speed.at(-1) - 700) < 1e-9);
  assert.equal(path.seconds[0], rocket.startSeconds);
});

test('a bend turns the flight by its angle between the turn\'s start and end along the distance flown', () => {
  const rocket = defaultRocket();
  rocket.ascent = { ...rocket.ascent, bendDegrees: 60, turnStartPercent: 20, turnLengthPercent: 50 };
  const path = ascentPath(rocket);
  const angle = index => Math.atan2(path.vz[index], Math.hypot(path.vx[index], path.vy[index])) * 180 / Math.PI;
  const flown = path.flownMetres.at(-1);
  const before = path.flownMetres.findIndex(metres => metres > .19 * flown);
  const after = path.flownMetres.findIndex(metres => metres > .61 * flown);
  assert.ok(Math.abs(angle(before) - 90) < 1e-6, `${angle(before)}°`);
  assert.ok(Math.abs(angle(after) - 30) < 1e-6 && Math.abs(angle(path.speed.length - 1) - 30) < 1e-6, `${angle(after)}°`);
  assert.deepEqual(path.turnMetres.map(metres => Math.round(metres / flown * 100)), [20, 60]);
});

test('Acceleration shapes the speed from even to late without changing the burnout speed', () => {
  assert.equal(speedShare(0, .5), .5);
  assert.ok(speedShare(50, .5) < .5 && speedShare(100, .5) < speedShare(50, .5));
  for (const percent of [0, 50, 100]) assert.ok(Math.abs(speedShare(percent, 1) - 1) < 1e-12 && speedShare(percent, 0) === 0);
});

test('a rocket stops where it comes down to the ground, and its pad is not the ground it hits', () => {
  const rocket = { ...defaultRocket(), propellant: 'solid', launchDegrees: 20 };
  rocket.ascent = { ...rocket.ascent, burnSeconds: 60, burnoutMetresPerSecond: 1000, accelerationPercent: 0, bendDegrees: 60, turnStartPercent: 10, turnLengthPercent: 20 };
  const path = ascentPath(rocket);
  assert.ok(path.groundSeconds > 0 && path.groundSeconds < 60, `${path.groundSeconds} s`);
  assert.ok(Math.min(...path.z) >= 0 && path.seconds.at(-1) <= path.groundSeconds + path.step);
  const hill = { heightAt: () => 5000 };
  assert.ok(ascentPath(defaultRocket(), hill).seconds.length > 2);
});

test('Size and Category change the engine and leave the flight as it was', () => {
  const rocket = defaultRocket();
  const before = ascentPath(rocket);
  const macros = rocketMacros(rocket);
  for (const [label, t] of [['Size', .2], ['Category', 0], ['Category', 1]]) {
    const item = structuredClone(rocket);
    macros.find(macro => macro.label === label).write(item, t);
    assert.notDeepEqual(item.engine, rocket.engine, label);
    const after = ascentPath(item);
    const flown = path => ['x', 'z', 'speed'].map(key => path[key].slice(Math.round(path.heldSeconds / path.step)).filter((_, index) => index % 50 === 0).map(value => +value.toFixed(6)));
    assert.deepEqual(flown(after), flown(before), label);
    assert.equal(item.launchDegrees, rocket.launchDegrees);
  }
});

test('categories rise in thrust, each reads back as itself, and every one flies above its pad', () => {
  const thrusts = ROCKET.categories.map(category => category.newtons);
  assert.deepEqual(thrusts, [...thrusts].sort((a, b) => a - b));
  const scene = defaultScene('rocket');
  for (const category of ROCKET.categories) {
    const rocket = parseScene({ ...scene, emitters: [categoryRocket(scene.emitters[0], category)] }).emitters[0];
    assert.equal(nearestCategory(rocket), category);
    const path = ascentPath(rocket);
    assert.ok(Math.min(...path.z) >= rocket.startMetres.z - 1e-6 && path.z.at(-1) > rocket.startMetres.z + 10, `${category.label}: ${path.z.at(-1)} m`);
  }
});

test('every size the Size slider reaches, with any engine count and propellant, is a valid rocket', () => {
  const [fewest, most] = ROCKET.sizing.totalNewtons;
  for (let step = 0; step <= 28; step += 1) {
    const newtons = +(fewest * (most / fewest) ** (step / 28)).toPrecision(2);
    for (const engines of [1, 9, 33, 60]) {
      for (const propellant of Object.keys(ROCKET.propellants)) {
        const rocket = defaultRocket();
        const sized = sizedRocket(newtons, engines, propellant);
        Object.assign(rocket, { propellant, engine: { ...rocket.engine, ...sized.engine }, ascent: { ...rocket.ascent, ...sized.ascent } });
        const scene = { ...defaultScene('rocket'), emitters: [rocket] };
        assert.doesNotThrow(() => parseScene(scene), `${newtons} N, ${engines} engines, ${propellant}`);
      }
    }
  }
});

test('a single nozzle peaks at Sr 0.024, a cluster at SATURN\'s 0.0108', async () => {
  const { rocketSource, vehicleOf, peakFrequencyHz } = await import('../src/domain/rocket.js');
  const scene = defaultScene('rocket');
  const artillery = categoryRocket(defaultRocket(), ROCKET.categories.find(category => category.label === 'Artillery'));
  const vehicle = vehicleOf(artillery);
  assert.ok(Math.abs(peakFrequencyHz(vehicle) * vehicle.effectiveDiameterMetres / vehicle.exitVelocityMetresPerSecond - .024) < 1e-12);
  assert.equal(vehicleOf(defaultRocket()).peakStrouhal, ROCKET.spectrum.peakStrouhal);
  const path = ascentPath(artillery);
  const source = rocketSource(artillery, scene, path);
  const components = source.components({ seconds: 1, position: { x: 0, y: 0, z: 500 } });
  const frequencies = Float64Array.from({ length: 24001 }, (_, index) => index);
  const { shaped } = source.spectra(components, 90, frequencies);
  let peak = 1;
  for (let index = 1; index < shaped.length; index += 1) if (shaped[index] > shaped[peak]) peak = index;
  assert.ok(peak > 1.5 * ROCKET.spectrum.peakStrouhal * vehicle.exitVelocityMetresPerSecond / vehicle.effectiveDiameterMetres, `${peak} Hz`);
});

test('a negative bend lofts a rocket above its launch angle after the turn, as ATACMS climbs off its rail', () => {
  const rocket = { ...defaultRocket(), propellant: 'solid', launchDegrees: 55 };
  rocket.ascent = { ...rocket.ascent, burnSeconds: 10, burnoutMetresPerSecond: 1000, accelerationPercent: 30, bendDegrees: -20, turnStartPercent: 10, turnLengthPercent: 50 };
  const path = ascentPath(rocket);
  const angle = index => Math.atan2(path.vz[index], Math.hypot(path.vx[index], path.vy[index])) * 180 / Math.PI;
  assert.ok(Math.abs(angle(path.speed.length - 1) - 75) < 1e-6);
  const item = structuredClone(rocket);
  const bend = rocketMacros(item).find(macro => macro.label === 'Turn');
  bend.write(item, 0);
  assert.equal(item.ascent.bendDegrees, -90);
  bend.write(item, 1 / 3);
  assert.equal(item.ascent.bendDegrees, 0);
});

test('a rocket\'s burn time is a quick control, from a second to the longest burn', () => {
  const item = defaultRocket();
  const burn = rocketMacros(item).find(macro => macro.label === 'Burn time');
  burn.write(item, 0);
  assert.equal(item.ascent.burnSeconds, 1);
  burn.write(item, 1);
  assert.equal(item.ascent.burnSeconds, 590);
  burn.entry.set(item, 12.5);
  assert.equal(item.ascent.burnSeconds, 12.5);
});

test('a rocket\'s propellant is a quick control that keeps its total thrust', () => {
  const rocket = defaultRocket();
  const propellant = rocketMacros(rocket).find(macro => macro.label === 'Propellant');
  const before = rocket.engine.engines * rocket.engine.thrustKilonewtons;
  propellant.write(rocket, 1);
  assert.equal(rocket.propellant, 'hydrogen');
  assert.ok(Math.abs(rocket.engine.engines * rocket.engine.thrustKilonewtons / before - 1) < .02);
  assert.equal(propellant.show(rocket), ROCKET.propellants.hydrogen.label);
});

test('a single motor starts within 5 ms, a cluster as its engines start in turn, Starship\'s 33 in about 1.2 s', () => {
  const category = label => categoryRocket(defaultRocket(), ROCKET.categories.find(item => item.label === label));
  assert.equal(ignitionSecondsOf(vehicleOf(category('Artillery'))), .005);
  assert.ok(Math.abs(ignitionSecondsOf(vehicleOf(category('Super-heavy'))) - 1.2) < .01);
});

test('the ignition pulse is a Friedlander pulse at the pad, set by its decibels and off at the lowest', () => {
  const scene = defaultScene('rocket');
  const category = label => categoryRocket(defaultRocket(), ROCKET.categories.find(item => item.label === label));
  const grad = ignitionPulse(category('Artillery'), scene);
  const falcon = ignitionPulse(category('Medium launcher'), scene);
  assert.equal(grad.pulse, 'friedlander');
  assert.deepEqual(grad.positionMetres, category('Artillery').startMetres);
  assert.ok(grad.durationSeconds < .002, `${grad.durationSeconds} s`);
  const peakHz = falcon.decay / (2 * Math.PI * falcon.durationSeconds);
  assert.ok(peakHz > 2 && peakHz < 3.5, `${peakHz} Hz`);
  const louder = ignitionPulse({ ...category('Artillery'), ignitionPulseDecibels: 6 }, scene);
  assert.ok(Math.abs(louder.amplitudePaMetres / grad.amplitudePaMetres - 10 ** (6 / 20)) < 1e-9);
  assert.equal(ignitionPulse({ ...category('Artillery'), ignitionPulseDecibels: ROCKET.ignitionPulse.offDecibels }, scene), null);
});

test('a rocket\'s first grain is heard from its ignition on, and a saved rocket without a pulse level takes 0 dB', () => {
  const base = defaultScene('rocket');
  const rocket = categoryRocket(defaultRocket(), ROCKET.categories.find(item => item.label === 'Artillery'));
  const scene = parseScene({ ...base, emitters: [rocket] });
  const [first] = rocketGrains(rocket, scene).rows.filter(row => row.pulse === 'grain');
  assert.ok(Math.abs(first.emissionSeconds + first.durationSeconds - rocket.startSeconds) < 1e-9);
  const { ignitionPulseDecibels, ...saved } = rocket;
  assert.equal(readScene({ ...base, emitters: [saved] }).emitters[0].ignitionPulseDecibels, 0);
});

test('the ignition burst raises the first grain, shares its excess among a cluster\'s engines, and is off at the lowest', () => {
  const category = label => categoryRocket(defaultRocket(), ROCKET.categories.find(item => item.label === label));
  const grad = category('Artillery');
  assert.ok(Math.abs(10 * Math.log10(ignitionBurstGain(grad)) - ROCKET.ignitionBurst.decibels) < 1e-9);
  const starship = category('Super-heavy');
  assert.ok(Math.abs(ignitionBurstGain(starship) - 1 - (ignitionBurstGain(grad) - 1) / starship.engine.engines) < 1e-9);
  assert.equal(ignitionBurstGain({ ...grad, ignitionBurstDecibels: ROCKET.ignitionBurst.offDecibels }), 1);
  const base = defaultScene('rocket');
  const scene = parseScene({ ...base, emitters: [grad] });
  const quiet = parseScene({ ...base, emitters: [{ ...grad, ignitionBurstDecibels: ROCKET.ignitionBurst.offDecibels }] });
  const firstGrain = item => rocketGrains(item.emitters[0], item).rows.find(row => row.pulse === 'grain');
  assert.ok(Math.abs(firstGrain(scene).amplitudePaMetres / firstGrain(quiet).amplitudePaMetres - Math.sqrt(ignitionBurstGain(grad))) < 1e-9);
});
