import { ENGINE, GAS_CONSTANT_AIR_J_PER_KG_KELVIN as GAS_CONSTANT_AIR, KELVIN_OFFSET } from './constants.js';

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
/** A class's separate fan stream at a power, or null. */
function bypassAt(power, engineClass) {
  const bypass = ENGINE.classes[engineClass]?.bypass;
  if (!bypass) return null;
  const upper = Math.max(1, bypass.findIndex(setting => setting.power >= power));
  const [low, high] = [bypass[upper - 1], bypass[upper]];
  const share = Math.min(1, Math.max(0, (power - low.power) / (high.power - low.power)));
  return {
    pressureRatio: between(low.pressureRatio, high.pressureRatio, share),
    totalTemperatureKelvin: between(low.totalTemperatureKelvin, high.totalTemperatureKelvin, share),
    diameterMetres: between(low.diameterMetres, high.diameterMetres, share)
  };
}

export function streamsOf(engine, engineClass, temperatureCelsius) {
  const fan = bypassAt(powerOfEngine(engine, engineClass), engineClass);
  const core = jetOfEngine(engine, temperatureCelsius);
  return fan ? [core, jetOfEngine(fan, temperatureCelsius)] : [core];
}

/** Class A for ideal nozzles at sea level: an engine's thrust at a power, its streams' exit momentum ρ A U². */
export function thrustNewtons(power, engineClass) {
  const core = engineAtPower(power, engineClass);
  const fan = bypassAt(power, engineClass);
  const momentum = settings => {
    const { velocityMetresPerSecond: velocity } = jetOfEngine(settings, 15);
    const exitKelvin = settings.totalTemperatureKelvin - velocity ** 2 / (2 * ENGINE.gasHeatCapacityJoulesPerKilogramKelvin);
    return 101325 / (GAS_CONSTANT_AIR * exitKelvin) * Math.PI * settings.diameterMetres ** 2 / 4 * velocity ** 2;
  };
  return momentum(core) + (fan ? momentum(fan) : 0);
}

/** Class C: the fan's speed as a share of its full speed, about the square root of the thrust share (fan pressure rise goes as speed squared). */
export const fanSpeedShare = (power, engineClass) => Math.sqrt(Math.max(0, thrustNewtons(power, engineClass) / thrustNewtons(1, engineClass)));

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
