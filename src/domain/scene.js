import { MODEL_VERSION, RENDER, SAMPLE_RATE_HZ, TURBULENCE } from './constants.js';
import { MAXIMUM_AMBISONIC_ORDER } from './ambisonics.js';
import { engineAtPower } from './engine.js';
import { GROUND_TYPES } from './ground.js';
import { isSeed } from './random.js';

const SCENE_FORMAT = 'rumbletect.scene';
const SCENE_VERSION = 1;

export const EMITTER_KINDS = Object.freeze(['jet']);
const RECEIVER_TYPES = Object.freeze(['omni', 'binaural']);
const LEVEL_MODES = Object.freeze(['peak', 'fixed']);

const PLACE_NAME_LENGTH = 120;
export const DEFAULT_PLACE = Object.freeze({ name: 'Koli', latitude: 63.0964, longitude: 29.8061 });

/** A null reliability marks a placement or output choice, not a model value. */
export const PARAMETERS = Object.freeze({
  temperatureCelsius: { minimum: -40, maximum: 50, unit: '°C', label: 'Temperature', reliability: 'A' },
  relativeHumidityPercent: { minimum: 0, maximum: 100, unit: '%', label: 'Humidity', reliability: 'B' },
  pressureKpa: { minimum: 50, maximum: 110, unit: 'kPa', label: 'Pressure', reliability: 'A' },
  turbulenceStrength: { minimum: 0, maximum: 1e-4, unit: '⟨μ²⟩', label: 'Turbulence', reliability: 'C' },
  turbulenceScaleMetres: { minimum: .1, maximum: 10, unit: 'm', label: 'Turbulence scale', reliability: 'C' },
  latitude: { minimum: -85, maximum: 85, unit: '°', label: 'Latitude', reliability: null },
  longitude: { minimum: -180, maximum: 180, unit: '°', label: 'Longitude', reliability: null },
  coordinateMetres: { minimum: -RENDER.sceneExtentMetres, maximum: RENDER.sceneExtentMetres, unit: 'm', reliability: null },
  heightMetres: { minimum: 0, maximum: RENDER.maximumHeightMetres, unit: 'm', reliability: null },
  startSeconds: { minimum: 0, maximum: 240, unit: 's', label: 'Onset', reliability: null },
  headingDegrees: { minimum: 0, maximum: 360, unit: '°', label: 'Heading', reliability: null },
  climbDegrees: { minimum: -90, maximum: 90, unit: '°', label: 'Climb', reliability: null },
  mach: { minimum: .1, maximum: .95, unit: '', label: 'Mach', reliability: null },
  accelerationMetresPerSecondSquared: { minimum: -50, maximum: 100, unit: 'm/s²', label: 'Acceleration', reliability: null },
  turnDegreesPerSecond: { minimum: -10, maximum: 10, unit: '°/s', label: 'Turn', reliability: null },
  flightSeconds: { minimum: 1, maximum: 600, unit: 's', label: 'Flight time', reliability: null },
  pressureRatio: { minimum: 1.05, maximum: 6, unit: '', label: 'Nozzle pressure ratio', reliability: 'C' },
  totalTemperatureKelvin: { minimum: 300, maximum: 2300, unit: 'K', label: 'Jet temperature', reliability: 'C' },
  nozzleDiameterMetres: { minimum: .1, maximum: 3, unit: 'm', label: 'Nozzle diameter', reliability: 'C' },
  fullScalePa: { minimum: .01, maximum: 1e5, unit: 'Pa', label: 'Full scale', reliability: null },
  ambisonicOrder: { minimum: 0, maximum: MAXIMUM_AMBISONIC_ORDER, unit: '', label: 'Ambisonic order', reliability: null, integer: true },
  facingDegrees: { minimum: 0, maximum: 360, unit: '°', label: 'Facing', reliability: null },
  pitchDegrees: { minimum: -90, maximum: 90, unit: '°', label: 'Elevation', reliability: null }
});

const JET_NUMBERS = Object.freeze(['startSeconds', 'headingDegrees', 'climbDegrees', 'mach', 'accelerationMetresPerSecondSquared', 'turnDegreesPerSecond']);

export class SceneError extends Error {}

export function defaultJet(id = 'jet-1', name = 'Jet', seed = 20261015) {
  return {
    id, name, kind: 'jet', enabled: true, seed,
    startSeconds: 0,
    startMetres: { x: -2500, y: 0, z: 300 },
    headingDegrees: 90,
    climbDegrees: 0,
    mach: .44,
    accelerationMetresPerSecondSquared: 0,
    turnDegreesPerSecond: 0,
    durationSeconds: 33,
    engine: engineAtPower(.75)
  };
}

export function defaultReceiver(id = 'receiver-1', name = 'Mic 1', { type = 'omni', listen = true } = {}) {
  return { id, name, type, listen, positionMetres: { x: 0, y: 0, z: 1.7 }, headingDegrees: 0, pitchDegrees: 0 };
}

export const emitterAnchor = emitter => emitter.startMetres;

export function headingToward(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx === 0 && dy === 0 ? 0 : Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360) % 360;
}

export function defaultScene() {
  const emitter = defaultJet();
  const receiver = defaultReceiver('receiver-1', 'Mic 1', { type: 'binaural' });
  receiver.headingDegrees = headingToward(receiver.positionMetres, emitterAnchor(emitter));
  return {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    modelVersion: MODEL_VERSION,
    air: {
      temperatureCelsius: 15, relativeHumidityPercent: 70, pressureKpa: 101.325, absorption: true,
      turbulenceStrength: TURBULENCE.strength, turbulenceScaleMetres: TURBULENCE.scaleMetres, scintillation: true
    },
    ground: { enabled: true, type: 'grass' },
    place: { ...DEFAULT_PLACE },
    emitters: [emitter],
    receivers: [receiver],
    render: { sampleRate: SAMPLE_RATE_HZ, levelMode: 'peak', fullScalePa: 20, ambisonicOrder: 1 }
  };
}

function check(condition, message) {
  if (!condition) throw new SceneError(message);
}

let bringIntoRange = false;

function number(value, key, path) {
  const range = PARAMETERS[key];
  check(typeof value === 'number' && Number.isFinite(value), `${path} must be a number.`);
  if (bringIntoRange) {
    const inRange = Math.min(range.maximum, Math.max(range.minimum, value));
    return range.integer ? Math.min(range.maximum, Math.max(range.minimum, Math.round(inRange))) : inRange;
  }
  check(value >= range.minimum && value <= range.maximum, `${path} must be between ${range.minimum} and ${range.maximum} ${range.unit}.`);
  if (range.integer) check(Number.isInteger(value), `${path} must be a whole number.`);
  return value;
}

function point(value, path) {
  check(value && typeof value === 'object', `${path} is missing.`);
  return {
    x: number(value.x, 'coordinateMetres', `${path}.x`),
    y: number(value.y, 'coordinateMetres', `${path}.y`),
    z: number(value.z, 'heightMetres', `${path}.z`)
  };
}

function text(value, path) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 64, `${path} must be a short name.`);
  return value;
}

function numbers(value, keys, path) {
  return Object.fromEntries(keys.map(key => [key, number(value[key], key, `${path}.${key}`)]));
}

function emitter(value, index) {
  const path = `emitters[${index}]`;
  check(value && typeof value === 'object', `${path} is missing.`);
  check(EMITTER_KINDS.includes(value.kind), `${path}.kind is not supported.`);
  check(typeof value.enabled === 'boolean', `${path}.enabled must be true or false.`);
  check(isSeed(value.seed), `${path}.seed must be a 32-bit unsigned integer.`);
  const engine = value.engine ?? {};
  return {
    id: text(value.id, `${path}.id`), name: text(value.name, `${path}.name`), kind: value.kind, enabled: value.enabled, seed: value.seed,
    startMetres: point(value.startMetres, `${path}.startMetres`),
    durationSeconds: number(value.durationSeconds, 'flightSeconds', `${path}.durationSeconds`),
    ...numbers(value, JET_NUMBERS, path),
    engine: {
      pressureRatio: number(engine.pressureRatio, 'pressureRatio', `${path}.engine.pressureRatio`),
      totalTemperatureKelvin: number(engine.totalTemperatureKelvin, 'totalTemperatureKelvin', `${path}.engine.totalTemperatureKelvin`),
      diameterMetres: number(engine.diameterMetres, 'nozzleDiameterMetres', `${path}.engine.diameterMetres`)
    }
  };
}

function place(value) {
  check(value && typeof value === 'object', 'place is missing.');
  check(typeof value.name === 'string' && value.name.length <= PLACE_NAME_LENGTH, 'place.name must be a short text.');
  return { name: value.name, latitude: number(value.latitude, 'latitude', 'place.latitude'), longitude: number(value.longitude, 'longitude', 'place.longitude') };
}

const coordinatesText = ({ latitude, longitude }) => `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
export const placeLabel = value => value.name || coordinatesText(value);

function receiver(value, index) {
  const path = `receivers[${index}]`;
  check(value && typeof value === 'object', `${path} is missing.`);
  check(RECEIVER_TYPES.includes(value.type), `${path}.type is not supported.`);
  check(typeof value.listen === 'boolean', `${path}.listen must be true or false.`);
  return {
    id: text(value.id, `${path}.id`),
    name: text(value.name, `${path}.name`),
    type: value.type,
    listen: value.listen,
    positionMetres: point(value.positionMetres, `${path}.positionMetres`),
    headingDegrees: number(value.headingDegrees, 'facingDegrees', `${path}.headingDegrees`),
    pitchDegrees: number(value.pitchDegrees, 'pitchDegrees', `${path}.pitchDegrees`)
  };
}

function uniqueIds(items, path) {
  check(new Set(items.map(item => item.id)).size === items.length, `${path} ids must be unique.`);
}

export function parseScene(value) {
  check(value && typeof value === 'object', 'The scene is not an object.');
  check(value.format === SCENE_FORMAT, 'This is not a Rumbletect scene.');
  const air = value.air ?? {};
  check(typeof air.absorption === 'boolean' && typeof air.scintillation === 'boolean', 'air.absorption and air.scintillation must be true or false.');
  const ground = value.ground ?? {};
  check(typeof ground.enabled === 'boolean', 'ground.enabled must be true or false.');
  check(GROUND_TYPES.includes(ground.type), 'ground.type is not supported.');
  check(Array.isArray(value.emitters) && value.emitters.length <= RENDER.maximumEmitters, `A scene holds at most ${RENDER.maximumEmitters} emitters.`);
  check(Array.isArray(value.receivers) && value.receivers.length >= 1 && value.receivers.length <= RENDER.maximumReceivers,
    `A scene needs 1–${RENDER.maximumReceivers} receivers.`);
  const render = value.render ?? {};
  check(render.sampleRate === SAMPLE_RATE_HZ, `render.sampleRate must be ${SAMPLE_RATE_HZ}.`);
  check(LEVEL_MODES.includes(render.levelMode), 'render.levelMode is not supported.');
  const scene = {
    format: SCENE_FORMAT,
    version: SCENE_VERSION,
    modelVersion: MODEL_VERSION,
    air: {
      ...numbers(air, ['temperatureCelsius', 'relativeHumidityPercent', 'pressureKpa', 'turbulenceStrength', 'turbulenceScaleMetres'], 'air'),
      absorption: air.absorption,
      scintillation: air.scintillation
    },
    ground: { enabled: ground.enabled, type: ground.type },
    place: place(value.place),
    emitters: value.emitters.map(emitter),
    receivers: value.receivers.map(receiver),
    render: {
      sampleRate: render.sampleRate,
      levelMode: render.levelMode,
      fullScalePa: number(render.fullScalePa, 'fullScalePa', 'render.fullScalePa'),
      ambisonicOrder: number(render.ambisonicOrder, 'ambisonicOrder', 'render.ambisonicOrder')
    }
  };
  uniqueIds(scene.emitters, 'Emitter');
  uniqueIds(scene.receivers, 'Receiver');
  return scene;
}

export const serializeScene = scene => JSON.stringify(parseScene(scene), null, 2);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function filled(value, defaults) {
  if (!isRecord(defaults)) return value === undefined ? structuredClone(defaults) : value;
  if (!isRecord(value)) return value === undefined ? structuredClone(defaults) : value;
  const result = { ...value };
  for (const [key, fallback] of Object.entries(defaults)) result[key] = filled(value[key], fallback);
  return result;
}

export function readScene(value) {
  check(isRecord(value) && value.format === SCENE_FORMAT, 'This is not a Rumbletect scene.');
  const base = defaultScene();
  const scene = filled({ ...value, emitters: undefined, receivers: undefined }, { ...base, emitters: undefined, receivers: undefined });
  scene.emitters = Array.isArray(value.emitters) ? value.emitters.map(item => (isRecord(item) && item.kind === 'jet' ? filled(item, defaultJet()) : item)) : base.emitters;
  scene.receivers = Array.isArray(value.receivers) ? value.receivers.map(item => filled(item, defaultReceiver())) : base.receivers;
  if (isRecord(scene.place) && typeof scene.place.name === 'string') scene.place.name = scene.place.name.slice(0, PLACE_NAME_LENGTH);
  bringIntoRange = true;
  try {
    return parseScene(scene);
  } finally {
    bringIntoRange = false;
  }
}
