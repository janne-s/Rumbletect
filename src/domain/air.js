import { GAMMA_AIR, GAS_CONSTANT_AIR_J_PER_KG_KELVIN, KELVIN_OFFSET } from './constants.js';

const REFERENCE_TEMPERATURE_KELVIN = 293.15;
const TRIPLE_POINT_TEMPERATURE_KELVIN = 273.16;
const REFERENCE_PRESSURE_KPA = 101.325;

/** Class A. */
export const speedOfSound = temperatureCelsius => Math.sqrt(GAMMA_AIR * GAS_CONSTANT_AIR_J_PER_KG_KELVIN * (temperatureCelsius + KELVIN_OFFSET));

const saturationPressureRatio = temperatureKelvin => 10 ** (-6.8346 * (TRIPLE_POINT_TEMPERATURE_KELVIN / temperatureKelvin) ** 1.261 + 4.6151);

/** Class B: ISO 9613-1, pure tone. */
export function atmosphericAbsorptionDbPerMetre(frequencyHz, { temperatureCelsius, relativeHumidityPercent, pressureKpa }) {
  const temperatureKelvin = temperatureCelsius + KELVIN_OFFSET;
  const temperatureRatio = temperatureKelvin / REFERENCE_TEMPERATURE_KELVIN;
  const pressureRatio = pressureKpa / REFERENCE_PRESSURE_KPA;
  const waterVapourMolarPercent = relativeHumidityPercent * saturationPressureRatio(temperatureKelvin) / pressureRatio;
  const oxygenRelaxationHz = pressureRatio * (24 + 40400 * waterVapourMolarPercent * (.02 + waterVapourMolarPercent) / (.391 + waterVapourMolarPercent));
  const nitrogenRelaxationHz = pressureRatio * temperatureRatio ** -.5
    * (9 + 280 * waterVapourMolarPercent * Math.exp(-4.17 * (temperatureRatio ** (-1 / 3) - 1)));
  const classical = 1.84e-11 / pressureRatio * Math.sqrt(temperatureRatio);
  const molecular = temperatureRatio ** -2.5 * (
    .01275 * Math.exp(-2239.1 / temperatureKelvin) / (oxygenRelaxationHz + frequencyHz ** 2 / oxygenRelaxationHz)
    + .1068 * Math.exp(-3352 / temperatureKelvin) / (nitrogenRelaxationHz + frequencyHz ** 2 / nitrogenRelaxationHz)
  );
  return 8.686 * frequencyHz ** 2 * (classical + molecular);
}
