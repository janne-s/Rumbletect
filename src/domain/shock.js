import { REFERENCE_SOUND_PRESSURE_PA, SHOCK_NOISE } from './constants.js';

const THIRD_OCTAVE_SHARE = 10 ** .05 - 10 ** -.05;
const DEGREES = Math.PI / 180;

export function shockComponent({ machNumber, diameterMetres, velocityMetresPerSecond }, sound, flightMetresPerSecond = 0) {
  if (!(machNumber > 1)) return null;
  const beta = Math.sqrt(machNumber * machNumber - 1);
  const area = Math.PI * diameterMetres * diameterMetres / 4;
  return {
    decibels: SHOCK_NOISE.levelDecibels + 10 * Math.log10(area) + 10 * Math.log10(beta ** 4 / (1 + beta ** 4)),
    beta,
    machAngleDegrees: 180 - Math.asin(1 / machNumber) / DEGREES,
    diameterMetres,
    velocityMetresPerSecond,
    convectiveMach: SHOCK_NOISE.convectionShare * velocityMetresPerSecond / sound,
    flightMach: Math.min(SHOCK_NOISE.flightMachLimit, flightMetresPerSecond / sound)
  };
}

export function shockDirectivityDecibels(shock, inletDegrees) {
  const flight = -(SHOCK_NOISE.flightDecibels - 10) * Math.log10(1 - shock.flightMach * Math.cos(inletDegrees * DEGREES));
  return flight - SHOCK_NOISE.aftFallDecibelsPerDegree * Math.max(0, inletDegrees - shock.machAngleDegrees);
}

export const shockSpectrumDecibels = (logStrouhal, inletDegrees) => betweenColumns(columnsAt(inletDegrees), logStrouhal);

function columnsAt(inletDegrees) {
  const columns = SHOCK_NOISE.spectrum;
  const position = Math.min(columns.length - 1, Math.max(0, inletDegrees / 10));
  const lower = Math.min(columns.length - 2, Math.floor(position));
  return { below: columns[lower], above: columns[lower + 1], share: position - lower };
}

const betweenColumns = ({ below, above, share }, logStrouhal) => (1 - share) * columnDecibels(below, logStrouhal) + share * columnDecibels(above, logStrouhal);

function columnDecibels(column, logStrouhal) {
  const knots = SHOCK_NOISE.spectrumLogStrouhal;
  const last = knots.length - 1;
  if (logStrouhal <= knots[0]) return column[0] - SHOCK_NOISE.lowRiseDecibelsPerDecade * (knots[0] - logStrouhal);
  if (logStrouhal >= knots[last]) return column[last] - column[last + 1] * (logStrouhal - knots[last]);
  const index = Math.min(last - 1, Math.floor((logStrouhal - knots[0]) / (knots[1] - knots[0])));
  const share = (logStrouhal - knots[index]) / (knots[index + 1] - knots[index]);
  return column[index] + share * (column[index + 1] - column[index]);
}

export const shockStrouhal = (shock, frequencyHz, inletDegrees) => strouhalWith(shock, frequencyHz, shockConvection(shock, inletDegrees));

function shockConvection({ convectiveMach: mach }, inletDegrees) {
  return Math.sqrt((1 + mach * Math.cos(inletDegrees * DEGREES)) ** 2 + SHOCK_NOISE.convectionSpread * mach * mach);
}

const strouhalWith = (shock, frequencyHz, convection) => frequencyHz * shock.beta * shock.diameterMetres / (SHOCK_NOISE.convectionShare * shock.velocityMetresPerSecond) * convection;

export function shockSpectrum(shock, inletDegrees, frequencies) {
  const psd = new Float64Array(frequencies.length);
  if (!shock) return psd;
  const level = shock.decibels + shockDirectivityDecibels(shock, inletDegrees);
  const columns = columnsAt(inletDegrees);
  const convection = shockConvection(shock, inletDegrees);
  frequencies.forEach((frequency, index) => {
    if (frequency <= 0) return;
    const band = level + betweenColumns(columns, Math.log10(strouhalWith(shock, frequency, convection)));
    psd[index] = REFERENCE_SOUND_PRESSURE_PA ** 2 * 10 ** (band / 10) / (THIRD_OCTAVE_SHARE * frequency);
  });
  return psd;
}
