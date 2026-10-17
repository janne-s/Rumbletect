import { JET, JET_FLIGHT, REFERENCE_SOUND_PRESSURE_PA } from './constants.js';
import { speedOfSoundMetresPerSecond as speedOfSound } from '../shared/domain/air.js';

export { speedOfSound };

/** Class B: Tam, Golebiowski & Seiner 1996, eq. 5. */
export function largeSimilarityDecibels(ratio) {
  const l = Math.log10(ratio);
  if (ratio >= 2.5) return 5.64174 - 27.7472 * l;
  if (ratio >= 1) return (1.06617 - 45.2994 * l + 21.40972 * l * l) * l;
  if (ratio >= .5) return -38.19338 * l * l - 16.91175 * l * l * l;
  return 2.53895 + 18.4 * l;
}

/** Class B: Tam, Golebiowski & Seiner 1996, eq. 6, its 10–30 piece in log(f/(10 f_F)), as printed it is discontinuous. */
export function fineSimilarityDecibels(ratio) {
  const l = Math.log10(ratio);
  if (ratio >= 30) return 29.77786 - 38.16739 * l;
  if (ratio >= 10) {
    const m = Math.log10(ratio / 10);
    return -11.8 - (27.2523 + .8091863 * m + 14.851964 * m * m) * m;
  }
  if (ratio >= 1) return -(8.1476823 + 3.6523177 * l) * l * l;
  if (ratio >= .15) return (-1.0550362 + 4.9774046 * l) * l * l;
  if (ratio >= .05) {
    const m = Math.log10(20 * ratio / 3);
    return -3.5 + (11.874876 + 2.1202444 * m + 7.5211814 * m * m) * m;
  }
  return 9.9 + 14.91126 * l;
}

/** Class B: Stone, Krejsa & Clark 2003, eq. 2a, the velocity split evenly between relative and absolute. */
export const effectiveVelocity = (jetVelocity, flightVelocity) => jetVelocity * Math.sqrt(Math.max(0, 1 - flightVelocity / jetVelocity));

const convection = (mach, cosine) => (1 + mach * cosine) ** 2 + JET_FLIGHT.convectionSpread * mach * mach;

/**
 * The jet's two mixing-noise components in flight, as peak level and peak frequency. `jet` holds the fully
 * expanded diameter, velocity, and reservoir-to-ambient temperature ratio; levels are dB per 1 Hz scaled to r = D_j.
 */
export function jetComponents(jet, { temperatureCelsius, flightMetresPerSecond = 0 }) {
  const sound = speedOfSound(temperatureCelsius);
  const ratio = jet.temperatureRatio;
  const velocity = effectiveVelocity(jet.velocityMetresPerSecond, flightMetresPerSecond);
  const acoustic = Math.log10(velocity / sound);
  const { large, fine } = JET;
  const largeExponent = large.velocityExponent[0] + large.velocityExponent[1] * ratio;
  const fineExponent = fine.velocityExponent[0] + fine.velocityExponent[1] / ratio ** fine.velocityExponent[2];
  const staticConvection = JET_FLIGHT.convectionRatio * jet.velocityMetresPerSecond / sound;
  const size = 10 * Math.log10(jet.diameterMetres / JET.levelReferenceDiameterMetres);
  return {
    sound,
    diameterMetres: jet.diameterMetres,
    staticConvection,
    flightConvection: JET_FLIGHT.convectionRatio * (jet.velocityMetresPerSecond - flightMetresPerSecond) / sound,
    large: {
      decibels: large.base + large.temperature / ratio ** large.temperatureExponent + 10 * largeExponent * acoustic + size,
      peakHz: JET.largePeakStrouhal * velocity / jet.diameterMetres
    },
    fine: {
      decibels: fine.base + fine.temperature / ratio ** fine.temperatureExponent + 10 * fineExponent * acoustic + size,
      peakHz: JET.finePeakStrouhal * velocity / jet.diameterMetres
    }
  };
}

export function largeDirectivityDecibels(inletDegrees) {
  if (inletDegrees < JET.largePlateauStartDegrees) return -JET.largeRiseDecibelsPerDegree * (JET.largePlateauStartDegrees - inletDegrees);
  if (inletDegrees <= JET.large.referenceAngleDegrees) return 0;
  return -JET.largeAftFallDecibelsPerDegree * (inletDegrees - JET.large.referenceAngleDegrees);
}

export const fineDirectivityDecibels = inletDegrees => JET.fineRiseDecibelsPerDegree * (inletDegrees - JET.fine.referenceAngleDegrees);

/** Class B: Stone, Krejsa & Clark 2003, eq. 2, the change of convective amplification from static to flight. */
export function flightConvectionDecibels(components, inletDegrees) {
  const cosine = Math.cos(inletDegrees * Math.PI / 180);
  return JET_FLIGHT.convectionDecibels * Math.log10(convection(components.staticConvection, cosine) / convection(components.flightConvection, cosine));
}

/**
 * Power spectral densities, Pa²/Hz at 1 m from the nozzle, of each component toward `inletDegrees`
 * (0 ahead along the jet's inlet axis, 180 straight aft) at the given frequencies.
 */
export function jetSpectra(components, inletDegrees, frequencies) {
  const scale = REFERENCE_SOUND_PRESSURE_PA ** 2 * components.diameterMetres ** 2;
  const flight = flightConvectionDecibels(components, inletDegrees);
  const largeDecibels = components.large.decibels + largeDirectivityDecibels(inletDegrees) + flight;
  const fineDecibels = components.fine.decibels + fineDirectivityDecibels(inletDegrees) + flight;
  const large = new Float64Array(frequencies.length);
  const fine = new Float64Array(frequencies.length);
  frequencies.forEach((frequency, index) => {
    if (frequency <= 0) return;
    large[index] = scale * 10 ** ((largeDecibels + largeSimilarityDecibels(frequency / components.large.peakHz)) / 10);
    fine[index] = scale * 10 ** ((fineDecibels + fineSimilarityDecibels(frequency / components.fine.peakHz)) / 10);
  });
  return { large, fine };
}
