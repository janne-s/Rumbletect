import { ENGINE, JET } from './constants.js';
import { engineAtPower, fanSpeedShare, streamsOf } from './engine.js';
import { jetComponents, jetSpectra } from './jet.js';

const between = (pair, share) => pair[0] + (pair[1] - pair[0]) * share;

/** The static full-power mixing noise of a class at 90°, Pa² at 1 m, that turbomachinery levels refer to. */
export function referencePower(engineClass, temperatureCelsius) {
  const frequencies = [];
  for (let x = Math.log(1); x < Math.log(30000); x += .02) frequencies.push(Math.exp(x));
  return streamsOf(engineAtPower(1, engineClass), engineClass, temperatureCelsius).reduce((total, jet) => {
    const { large, fine } = jetSpectra(jetComponents(jet, { temperatureCelsius }), 90, frequencies);
    return total + frequencies.reduce((sum, frequency, index) => sum + (large[index] + fine[index]) * frequency * .02, 0);
  }, 0);
}

/** Class C: the blade-passing frequency and the tones' and hump's powers at a power share, or null for a class without turbomachinery. */
export function turbomachineryAt(engineClass, power, referencePa2) {
  const turbo = ENGINE.classes[engineClass]?.turbomachinery;
  if (!turbo) return null;
  const weights = turbo.harmonics.map(decibels => 10 ** (decibels / 10));
  const total = weights.reduce((a, b) => a + b, 0);
  const tones = referencePa2 * 10 ** (between(turbo.toneDecibels, power) / 10);
  const speed = turbo.blades ? fanSpeedShare(power, engineClass) : null;
  const bladeHz = speed === null ? between([turbo.idleBladeHz, turbo.fullBladeHz], power) : turbo.fullBladeHz * speed;
  return {
    bladeHz,
    tones: weights.map(weight => tones * weight / total),
    hump: turbo.humpDecibels ? referencePa2 * 10 ** (between(turbo.humpDecibels, power) / 10) : 0,
    humpOctaves: turbo.humpOctaves ?? JET.humpOctaves,
    humpCentre: turbo.humpCentre ?? 1,
    buzzSaw: turbo.buzzSaw ? buzzSawTones(turbo, bladeHz, speed, referencePa2) : null
  };
}

const smoothStep = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };

/** Class C: the buzz-saw's tones at the shaft's orders below the blade count, log-normal about a quarter of it, once the fan tips are supersonic. */
function buzzSawTones(turbo, bladeHz, speed, referencePa2) {
  const { fromSpeed, decibels, orderSpread } = turbo.buzzSaw;
  const share = smoothStep((speed - fromSpeed) / (1 - fromSpeed));
  if (share <= 0) return null;
  const centre = Math.log(turbo.blades / 4);
  const orders = Array.from({ length: turbo.blades - 1 }, (_, index) => index + 1);
  const weights = orders.map(order => Math.exp(-((Math.log(order) - centre) ** 2) / (2 * orderSpread ** 2)));
  const total = weights.reduce((a, b) => a + b, 0);
  const buzzPower = share * referencePa2 * 10 ** (decibels / 10);
  return { shaftHz: bladeHz / turbo.blades, tones: weights.map(weight => buzzPower * weight / total) };
}

const aftGain = inletDegrees => 10 ** (-JET.turbomachineryAftDecibels * Math.max(0, inletDegrees - 90) / 90 / 10);

/** Adds the turbomachinery toward `inletDegrees` to a PSD on evenly spaced bins: each tone split between its two nearest bins, the hump log-normal about `humpCentre` times the blade-passing frequency. */
export function addTurbomachinery(psd, frequencies, state, inletDegrees) {
  if (!state) return psd;
  const binHz = frequencies[1] - frequencies[0];
  const gain = aftGain(inletDegrees);
  const tone = (hz, power) => {
    const position = hz / binHz;
    const low = Math.floor(position);
    if (low < 1 || low + 1 >= psd.length) return;
    const share = position - low;
    psd[low] += gain * power * (1 - share) / binHz;
    psd[low + 1] += gain * power * share / binHz;
  };
  state.tones.forEach((power, index) => tone(state.bladeHz * (index + 1), power));
  state.buzzSaw?.tones.forEach((power, index) => tone(state.buzzSaw.shaftHz * (index + 1), power));
  if (state.hump > 0) {
    const sigma = state.humpOctaves * Math.LN2;
    const centreHz = state.humpCentre * state.bladeHz;
    for (let bin = 1; bin < psd.length; bin += 1) {
      const z = Math.log(frequencies[bin] / centreHz) / sigma;
      if (Math.abs(z) > 5) continue;
      psd[bin] += gain * state.hump * Math.exp(-z * z / 2) / (Math.sqrt(2 * Math.PI) * sigma * frequencies[bin]);
    }
  }
  return psd;
}
