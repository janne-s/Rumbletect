import { ENGINE, JET } from './constants.js';
import { engineAtPower, jetOfEngine } from './engine.js';
import { jetComponents, jetSpectra } from './jet.js';

const between = (pair, share) => pair[0] + (pair[1] - pair[0]) * share;

/** The static full-power mixing noise of a class at 90°, Pa² at 1 m, that turbomachinery levels refer to. */
export function referencePower(engineClass, temperatureCelsius) {
  const components = jetComponents(jetOfEngine(engineAtPower(1, engineClass), temperatureCelsius), { temperatureCelsius });
  const frequencies = [];
  for (let x = Math.log(1); x < Math.log(30000); x += .02) frequencies.push(Math.exp(x));
  const { large, fine } = jetSpectra(components, 90, frequencies);
  return frequencies.reduce((sum, frequency, index) => sum + (large[index] + fine[index]) * frequency * .02, 0);
}

/** Class C: the blade-passing frequency and the tones' and hump's powers at a power share, or null for a class without turbomachinery. */
export function turbomachineryAt(engineClass, power, referencePa2) {
  const turbo = ENGINE.classes[engineClass]?.turbomachinery;
  if (!turbo) return null;
  const weights = turbo.harmonics.map(decibels => 10 ** (decibels / 10));
  const total = weights.reduce((a, b) => a + b, 0);
  const tones = referencePa2 * 10 ** (between(turbo.toneDecibels, power) / 10);
  return {
    bladeHz: between([turbo.idleBladeHz, turbo.fullBladeHz], power),
    tones: weights.map(weight => tones * weight / total),
    hump: turbo.humpDecibels ? referencePa2 * 10 ** (between(turbo.humpDecibels, power) / 10) : 0
  };
}

const aftGain = inletDegrees => 10 ** (-JET.turbomachineryAftDecibels * Math.max(0, inletDegrees - 90) / 90 / 10);

/** Adds the turbomachinery toward `inletDegrees` to a PSD on evenly spaced bins: each tone split between its two nearest bins, the hump log-normal. */
export function addTurbomachinery(psd, frequencies, state, inletDegrees) {
  if (!state) return psd;
  const binHz = frequencies[1] - frequencies[0];
  const gain = aftGain(inletDegrees);
  state.tones.forEach((power, index) => {
    const position = state.bladeHz * (index + 1) / binHz;
    const low = Math.floor(position);
    if (low < 1 || low + 1 >= psd.length) return;
    const share = position - low;
    psd[low] += gain * power * (1 - share) / binHz;
    psd[low + 1] += gain * power * share / binHz;
  });
  if (state.hump > 0) {
    const sigma = JET.humpOctaves * Math.LN2;
    for (let bin = 1; bin < psd.length; bin += 1) {
      const z = Math.log(frequencies[bin] / state.bladeHz) / sigma;
      if (Math.abs(z) > 5) continue;
      psd[bin] += gain * state.hump * Math.exp(-z * z / 2) / (Math.sqrt(2 * Math.PI) * sigma * frequencies[bin]);
    }
  }
  return psd;
}
