import { GROUND, JET, SYNTHESIS, TURBULENCE } from './constants.js';
import { isReflecting, sphericalReflectionCoefficient } from './ground.js';
import { createScintillation } from './scintillation.js';
import { turbulentPhaseVariance } from './turbulence.js';
import { ambisonicDirection, channelCount, encodeDirection } from './ambisonics.js';
import { atmosphericAbsorptionDbPerMetre, speedOfSoundMetresPerSecond as speedOfSound } from './air.js';
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

/**
 * The path from the emission frame to the listener per bin, as `{ re, im }` at the received frequency: air
 * absorption, and with `ground` its reflection over the plane up = 0, 1 + (R₁/R₂)·γ·Q·e^(−iωΔ) with the
 * scattered share r²|Q|²(1 − γ²) added as power (class C), γ from roughness and turbulence.
 */
function pathGains({ frequencies, doppler, limit, geometry, source, listener, air, sound, ground, scintillation }) {
  const re = new Float64Array(frequencies.length);
  const im = new Float64Array(frequencies.length);
  const direct = geometry.distance;
  const image = Math.hypot(source.east - listener.east, source.north - listener.north, source.up + listener.up);
  const cosIncidence = (source.up + listener.up) / image;
  const delay = (image - direct) / sound;
  const ratio = direct / image;
  const rough = ground && !isReflecting(ground) ? GROUND.roughnessMetres : 0;
  const turbulent = { turbulenceStrength: air.turbulenceStrength ?? TURBULENCE.strength, turbulenceScaleMetres: air.turbulenceScaleMetres ?? TURBULENCE.scaleMetres };
  frequencies.forEach((frequency, bin) => {
    if (frequency >= limit) return;
    const received = frequency * doppler;
    const absorbed = air.absorption === false ? 1 : 10 ** (-atmosphericAbsorptionDbPerMetre(received, air) * direct / 20);
    const magnitude = absorbed * (scintillation ? scintillation[bin] : 1);
    let [gainRe, gainIm] = [1, 0];
    if (ground && received > 0) {
      const [qRe, qIm] = sphericalReflectionCoefficient(received, ground, cosIncidence, image, sound);
      const k = 2 * Math.PI * received / sound;
      const variance = (2 * k * rough * cosIncidence) ** 2 + turbulentPhaseVariance(received, direct, source.up, listener.up, turbulent, sound);
      const coherent = Math.exp(-variance / 2);
      const phase = -2 * Math.PI * received * delay;
      const [cos, sin] = [Math.cos(phase), Math.sin(phase)];
      const cRe = 1 + ratio * coherent * (qRe * cos - qIm * sin);
      const cIm = ratio * coherent * (qRe * sin + qIm * cos);
      const coherentSize = Math.hypot(cRe, cIm);
      const total = Math.sqrt(coherentSize ** 2 + ratio * ratio * (qRe * qRe + qIm * qIm) * (1 - coherent * coherent));
      [gainRe, gainIm] = coherentSize > 0 ? [cRe / coherentSize * total, cIm / coherentSize * total] : [total, 0];
    }
    re[bin] = magnitude * gainRe;
    im[bin] = magnitude * gainIm;
  });
  return { re, im };
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
 * −10 log(1 − M cos ψ) (Stone et al. 2003, eq. 2) and the path (`pathGains`) are applied here, not in the
 * source, so they count once.
 */
export function nearListen({ trajectory, listener, jet, air, emissionSeconds: duration, sampleRate, seed, ground = null, scintillation = false, order = 0 }) {
  const sound = speedOfSound(air.temperatureCelsius);
  const startSeconds = length(difference(listener, trajectory.positionAt(0))) / sound;
  const endSeconds = duration + length(difference(listener, trajectory.positionAt(duration))) / sound;
  const outputLength = Math.floor((endSeconds - startSeconds) * sampleRate);
  if (length(trajectory.velocityAt(0)) >= sound) throw new RangeError('The near listen needs a source slower than sound.');

  const emissionLength = Math.ceil(duration * sampleRate) + 4;
  const componentsAt = mach => jetComponents(jet, { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: mach * sound });
  const hop = SYNTHESIS.frameSamples / 2;
  const fluctuation = scintillation ? createScintillation({ ...(scintillation === true ? {} : scintillation), seed: (seed ^ 0x27d4eb2f) >>> 0, hopSeconds: hop / sampleRate }) : null;
  const frames = new Map();
  const frameAt = (centre, binHz) => {
    if (frames.has(centre)) return frames.get(centre);
    const geometry = emissionGeometry(trajectory, listener, centre / sampleRate, sound);
    const frequencies = Array.from({ length: SYNTHESIS.frameSamples / 2 + 1 }, (_, bin) => bin * binHz);
    const components = componentsAt(geometry.mach);
    const spectra = jetSpectra(components, geometry.inletDegrees, frequencies);
    const doppler = 1 / (1 - geometry.mach * geometry.cosine);
    const limit = SYNTHESIS.bandLimitShare * sampleRate / doppler;
    const path = pathGains({ frequencies, doppler, limit, geometry, source: trajectory.positionAt(centre / sampleRate), listener, air, sound, ground, scintillation: fluctuation?.gainsAt(centre / hop, frequencies) });
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

  const channels = Array.from({ length: channelCount(order) }, () => new Float32Array(outputLength));
  const gains = new Float64Array(channels.length);
  for (let sample = 0; sample < outputLength; sample += 1) {
    const knot = Math.floor(sample / grid);
    const emission = knots[knot] + (knots[knot + 1] - knots[knot]) * (sample % grid) / grid;
    if (emission < 0 || emission > duration) continue;
    const geometry = emissionGeometry(trajectory, listener, emission, sound);
    const value = catmullRom(emitted, emission * sampleRate) / (geometry.distance * Math.sqrt(1 - geometry.mach * geometry.cosine));
    channels[0][sample] = value;
    if (order === 0) continue;
    const toward = difference(trajectory.positionAt(emission), listener);
    encodeDirection(...ambisonicDirection(toward.east / geometry.distance, toward.north / geometry.distance, toward.up / geometry.distance), order, gains);
    for (let channel = 1; channel < channels.length; channel += 1) channels[channel][sample] = value * gains[channel];
  }
  return { pressure: channels[0], channels, sampleRate, startSeconds };
}
