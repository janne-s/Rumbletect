import { ENGINE, KELVIN_OFFSET } from './constants.js';

const between = (a, b, share) => a + (b - a) * share;

export const ENGINE_CLASSES = Object.freeze(Object.keys(ENGINE.classes).filter(key => !ENGINE.classes[key].civil));
export const AIRLINER_CLASSES = Object.freeze(Object.keys(ENGINE.classes).filter(key => ENGINE.classes[key].civil));

const settingsOf = engineClass => (ENGINE.classes[engineClass] ?? ENGINE.classes.fighter).settings;

/** The nozzle at a power from 0 (idle) to 1 (full power, the fighter's full afterburner) of an engine class, interpolated between its settings (class C). */
export function engineAtPower(power, engineClass = 'fighter') {
  const settings = settingsOf(engineClass);
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
export function powerOfEngine({ totalTemperatureKelvin }, engineClass = 'fighter') {
  const settings = settingsOf(engineClass);
  const upper = Math.max(1, settings.findIndex(setting => setting.totalTemperatureKelvin >= totalTemperatureKelvin));
  const [low, high] = [settings[upper - 1], settings[upper]];
  const share = (totalTemperatureKelvin - low.totalTemperatureKelvin) / (high.totalTemperatureKelvin - low.totalTemperatureKelvin);
  return Math.min(1, Math.max(0, low.power + (high.power - low.power) * share));
}

export function powerLabel(power, engineClass = 'fighter') {
  const settings = settingsOf(engineClass);
  const nearest = settings.reduce((best, setting) => (Math.abs(setting.power - power) < Math.abs(best.power - power) ? setting : best));
  if (Math.abs(nearest.power - power) < .02) return nearest.label;
  if (settings.length < 3) return `${Math.round(power * 100)} %`;
  const military = settings[1].power;
  return power < military ? `${Math.round(power / military * 100)} %` : `AB ${Math.round((power - military) / (1 - military) * 100)} %`;
}

/** Each stream's fully expanded jet: the engine's own, and for a class with a separate fan stream its bypass at the same power. */
export function streamsOf(engine, engineClass, temperatureCelsius) {
  const bypass = ENGINE.classes[engineClass]?.bypass;
  const core = jetOfEngine(engine, temperatureCelsius);
  if (!bypass) return [core];
  const power = powerOfEngine(engine, engineClass);
  const upper = Math.max(1, bypass.findIndex(setting => setting.power >= power));
  const [low, high] = [bypass[upper - 1], bypass[upper]];
  const share = Math.min(1, Math.max(0, (power - low.power) / (high.power - low.power)));
  const fan = {
    pressureRatio: between(low.pressureRatio, high.pressureRatio, share),
    totalTemperatureKelvin: between(low.totalTemperatureKelvin, high.totalTemperatureKelvin, share),
    diameterMetres: between(low.diameterMetres, high.diameterMetres, share)
  };
  return [core, jetOfEngine(fan, temperatureCelsius)];
}

/** A jet of an engine class at its usual power, with the class's engine count. */
export function engineOfClass(engineClass) {
  const type = ENGINE.classes[engineClass];
  return { ...engineAtPower(type.defaultPower, engineClass), engines: type.engines };
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
