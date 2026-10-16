import { JET, SYNTHESIS } from './constants.js';
import { atmosphericAbsorptionDbPerMetre, speedOfSound } from './air.js';
import { jetComponents, jetSpectra } from './jet.js';
import { filterFrames, synthesizeNoise } from './synthesis.js';
import { shapeWaveform, waveformShape } from './waveform.js';
import { difference, dot, length } from './trajectory.js';

const NEWTON_STEPS = 8;

/** The emission time whose sound reaches `listener` at `listenerSeconds`, for a source slower than sound. */
export function emissionSeconds(trajectory, listener, listenerSeconds, sound, guess = listenerSeconds) {
  let emission = guess;
  for (let step = 0; step < NEWTON_STEPS; step += 1) {
    const ray = difference(listener, trajectory.positionAt(emission));
    const distance = length(ray);
    const residual = emission + distance / sound - listenerSeconds;
    const slope = 1 - dot(trajectory.velocityAt(emission), ray) / (distance * sound);
    emission -= residual / slope;
  }
  return emission;
}

export function emissionGeometry(trajectory, listener, seconds, sound) {
  const ray = difference(listener, trajectory.positionAt(seconds));
  const distance = length(ray);
  const velocity = trajectory.velocityAt(seconds);
  const speed = length(velocity);
  const cosine = speed > 0 ? dot(velocity, ray) / (speed * distance) : 1;
  return { distance, inletDegrees: Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI, cosine, mach: speed / sound };
}

const catmullRom = (samples, position) => {
  const index = Math.floor(position);
  const t = position - index;
  const at = offset => samples[Math.min(samples.length - 1, Math.max(0, index + offset))];
  const [a, b, c, d] = [at(-1), at(0), at(1), at(2)];
  return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
};

/**
 * Pressure in pascals from `startSeconds` of listener time. The moving source's Doppler shift and
 * −10 log(1 − M cos ψ) (Stone et al. 2003, eq. 2), and the air's absorption at the received frequency, are
 * applied here, not in the source, so they count once.
 */
export function nearListen({ trajectory, listener, jet, air, emissionSeconds: duration, sampleRate, seed }) {
  const sound = speedOfSound(air.temperatureCelsius);
  const startSeconds = length(difference(listener, trajectory.positionAt(0))) / sound;
  const endSeconds = duration + length(difference(listener, trajectory.positionAt(duration))) / sound;
  const outputLength = Math.floor((endSeconds - startSeconds) * sampleRate);
  if (length(trajectory.velocityAt(0)) >= sound) throw new RangeError('The near listen needs a source slower than sound.');

  const emissionLength = Math.ceil(duration * sampleRate) + 4;
  const componentsAt = mach => jetComponents(jet, { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: mach * sound });
  const frames = new Map();
  const frameAt = (centre, binHz) => {
    if (frames.has(centre)) return frames.get(centre);
    const geometry = emissionGeometry(trajectory, listener, centre / sampleRate, sound);
    const frequencies = Array.from({ length: SYNTHESIS.frameSamples / 2 + 1 }, (_, bin) => bin * binHz);
    const components = componentsAt(geometry.mach);
    const spectra = jetSpectra(components, geometry.inletDegrees, frequencies);
    const doppler = 1 / (1 - geometry.mach * geometry.cosine);
    const limit = SYNTHESIS.bandLimitShare * sampleRate / doppler;
    const path = frequencies.map(frequency => (frequency < limit ? 10 ** (-atmosphericAbsorptionDbPerMetre(frequency * doppler, air) * geometry.distance / 20) : 0));
    const { large, fine } = spectra;
    const cutoff = components.large.peakHz / JET.packetCycles;
    const lowPass = frequencies.map(frequency => (frequency > 0 ? 1 / (1 + (frequency / cutoff) ** 2) : 0));
    const lowPassSum = lowPass.reduce((sum, value) => sum + value, 0) * binHz;
    const frame = {
      large,
      fine,
      path,
      envelope: lowPass.map(value => value / lowPassSum),
      largeVariance: large.reduce((sum, value) => sum + value, 0) * binHz
    };
    frames.set(centre, frame);
    return frame;
  };
  const stream = (part, salt) => synthesizeNoise({ length: emissionLength, sampleRate, seed: (seed ^ salt) >>> 0, spectrumAt: (centre, binHz) => frameAt(centre, binHz)[part] });
  const fine = stream('fine', 0);
  const largeGaussian = stream('large', 0x9e3779b9);
  const envelope = stream('envelope', 0x85ebca6b);
  const hop = SYNTHESIS.frameSamples / 2;
  const varianceAt = centre => frames.get(Math.max(0, Math.min(centre, (Math.ceil(emissionLength / hop)) * hop)))?.largeVariance ?? 0;
  const rmsAt = sample => {
    const centre = Math.floor(sample / hop) * hop;
    const share = (sample - centre) / hop;
    return Math.sqrt((1 - share) * varianceAt(centre) + share * varianceAt(centre + hop));
  };
  const large = shapeWaveform(largeGaussian, rmsAt, envelope, waveformShape({
    skewness: jet.largeScaleSkewness ?? JET.largeScaleSkewness,
    kurtosis: jet.largeScaleKurtosis ?? JET.largeScaleKurtosis
  }));
  const emitted = filterFrames(large.map((value, index) => value + fine[index]), sampleRate, (centre, binHz) => frameAt(centre, binHz).path);

  const grid = SYNTHESIS.delayGridSamples;
  const knots = new Float64Array(Math.ceil(outputLength / grid) + 2);
  let guess = 0;
  for (let knot = 0; knot < knots.length; knot += 1) {
    guess = emissionSeconds(trajectory, listener, startSeconds + knot * grid / sampleRate, sound, guess);
    knots[knot] = guess;
  }

  const pressure = new Float32Array(outputLength);
  for (let sample = 0; sample < outputLength; sample += 1) {
    const knot = Math.floor(sample / grid);
    const emission = knots[knot] + (knots[knot + 1] - knots[knot]) * (sample % grid) / grid;
    if (emission < 0 || emission > duration) continue;
    const geometry = emissionGeometry(trajectory, listener, emission, sound);
    const gain = 1 / (geometry.distance * Math.sqrt(1 - geometry.mach * geometry.cosine));
    pressure[sample] = gain * catmullRom(emitted, emission * sampleRate);
  }
  return { pressure, sampleRate, startSeconds };
}
