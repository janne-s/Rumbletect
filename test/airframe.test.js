import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE } from '../src/domain/constants.js';
import { addAirframe, airframeAt } from '../src/domain/airframe.js';
import { engineAtPower } from '../src/domain/engine.js';
import { jetGrains } from '../src/domain/grains.js';
import { defaultAirliner, defaultScene, parseScene, readScene, serializeScene } from '../src/domain/scene.js';

const widebody = ENGINE.classes.widebody.airframe;
const approach = (speed, deployed = true) => airframeAt(widebody, { speedMetresPerSecond: speed, temperatureCelsius: 15, deployed });

test('gear and flaps add slats, flaps and gear to the trailing edges, which are always there', () => {
  assert.equal(approach(70, false).parts.length, 3);
  assert.equal(approach(70).parts.length, 3 + 2 + 1 + 2 * (widebody.mainGear.count + widebody.noseGear.count));
  assert.equal(airframeAt(undefined, { speedMetresPerSecond: 70, temperatureCelsius: 15, deployed: true }), null);
  assert.equal(airframeAt(widebody, { speedMetresPerSecond: 0, temperatureCelsius: 15, deployed: true }), null);
});

test('gear and flaps radiate as the sixth power of speed, trailing edges as the fifth with a thinning boundary layer', () => {
  const [slow, fast] = [approach(60), approach(120)];
  fast.parts.forEach((part, index) => {
    const ratio = part.power / slow.parts[index].power;
    const expected = index < 5 ? 2 ** 4.8 : 2 ** 6;
    assert.ok(Math.abs(ratio / expected - 1) < 1e-9, `part ${index}: ${ratio}`);
  });
});

test('every directivity averages to one over the sphere, so each part keeps its acoustic power', () => {
  const state = approach(70);
  const steps = 360;
  for (const part of state.parts) {
    let sum = 0;
    let weight = 0;
    for (let i = 0; i < steps; i += 1) {
      const theta = (i + .5) * Math.PI / steps;
      for (let j = 0; j < steps; j += 1) {
        const phi = (j + .5) * 2 * Math.PI / steps;
        sum += part.directivity(theta, phi) * Math.sin(theta);
        weight += Math.sin(theta);
      }
    }
    assert.ok(Math.abs(sum / weight - 1) < 1e-3, `${sum / weight}`);
  }
});

test('the spectrum carries each part\'s power, and a strut is silent straight below and loudest to the side', () => {
  const binHz = 1;
  const frequencies = Array.from({ length: 40001 }, (_, bin) => bin * binHz);
  const state = approach(70);
  const psd = addAirframe(new Float64Array(frequencies.length), frequencies, state, 90, 0);
  const total = psd.reduce((sum, value) => sum + value * binHz, 0);
  const expected = state.parts.reduce((sum, part) => sum + state.scalePa2 * part.power * part.directivity(Math.PI / 2, 0), 0);
  assert.ok(Math.abs(total / expected - 1) < .03, `${total} vs ${expected}`);
  const strut = state.parts.at(-1);
  assert.equal(strut.directivity(Math.PI / 2, 0), 0);
  assert.ok(Math.abs(strut.directivity(Math.PI / 2, Math.PI / 2) - 3) < 1e-12);
});

test('an airliner\'s gear and flaps are saved and read, off when missing, and make a slow approach louder', () => {
  const base = { ...defaultScene(), emitters: [{ ...defaultAirliner(), engineClass: 'widebody', gearAndFlaps: true }] };
  assert.equal(readScene(JSON.parse(serializeScene(parseScene(base)))).emitters[0].gearAndFlaps, true);
  const { gearAndFlaps, ...missing } = base.emitters[0];
  assert.equal(gearAndFlaps, true);
  assert.equal(readScene({ ...base, emitters: [missing] }).emitters[0].gearAndFlaps, false);
  assert.equal(defaultAirliner().gearAndFlaps, false);
  const energy = down => {
    const scene = parseScene({ ...base, emitters: [{ ...base.emitters[0], gearAndFlaps: down, engine: { ...engineAtPower(0, 'widebody'), engines: 2 }, mach: .21, climbDegrees: -3, durationSeconds: 2 }] });
    return jetGrains(scene.emitters[0], scene).rows.reduce((sum, row) => sum + row.amplitudePaMetres ** 2, 0);
  };
  assert.ok(10 * Math.log10(energy(true) / energy(false)) > 1);
});
