import { ENGINE, KELVIN_OFFSET } from './constants.js';

const between = (a, b, share) => a + (b - a) * share;

/** The engine at a power from 0 (idle) through 0.75 (military) to 1 (full afterburner), interpolated between settings (class C). */
export function engineAtPower(power) {
  const settings = ENGINE.settings;
  const upper = Math.max(1, settings.findIndex(setting => setting.power >= power));
  const [low, high] = [settings[upper - 1], settings[upper]];
  const share = Math.min(1, Math.max(0, (power - low.power) / (high.power - low.power)));
  return {
    pressureRatio: +between(low.pressureRatio, high.pressureRatio, share).toFixed(3),
    totalTemperatureKelvin: Math.round(between(low.totalTemperatureKelvin, high.totalTemperatureKelvin, share)),
    diameterMetres: +between(low.diameterMetres, high.diameterMetres, share).toFixed(3)
  };
}

/** The power whose total temperature this is, the inverse of `engineAtPower` along its temperature. */
export function powerOfEngine({ totalTemperatureKelvin }) {
  const settings = ENGINE.settings;
  const upper = Math.max(1, settings.findIndex(setting => setting.totalTemperatureKelvin >= totalTemperatureKelvin));
  const [low, high] = [settings[upper - 1], settings[upper]];
  const share = (totalTemperatureKelvin - low.totalTemperatureKelvin) / (high.totalTemperatureKelvin - low.totalTemperatureKelvin);
  return Math.min(1, Math.max(0, low.power + (high.power - low.power) * share));
}

export function powerLabel(power) {
  const nearest = ENGINE.settings.reduce((best, setting) => (Math.abs(setting.power - power) < Math.abs(best.power - power) ? setting : best));
  if (Math.abs(nearest.power - power) < .02) return nearest.label;
  const military = ENGINE.settings[1].power;
  return power < military ? `${Math.round(power / military * 100)} %` : `AB ${Math.round((power - military) / (1 - military) * 100)} %`;
}

/** Class A for an ideal nozzle: the fully expanded jet of a pressure ratio and total temperature. */
export function jetOfEngine({ pressureRatio, totalTemperatureKelvin, diameterMetres }, temperatureCelsius) {
  const exponent = (ENGINE.gasGamma - 1) / ENGINE.gasGamma;
  const expansion = Math.max(0, 1 - pressureRatio ** -exponent);
  return {
    diameterMetres,
    velocityMetresPerSecond: Math.sqrt(2 * ENGINE.gasHeatCapacityJoulesPerKilogramKelvin * totalTemperatureKelvin * expansion),
    temperatureRatio: totalTemperatureKelvin / (temperatureCelsius + KELVIN_OFFSET)
  };
}
