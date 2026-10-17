import { MODEL_VERSION, ROCKET, VOLCANO } from './constants.js';
import { sizedRocket } from './rocket.js';
import { ENGINE_CLASSES, engineOfClass } from './engine.js';
import { createScene } from '../shared/domain/scene.js';

export { DEFAULT_PLACE, DEFAULT_QUALITY, defaultReceiver, headingToward, PLACE_NAME_KINDS, placeLabel, QUALITY_NUMBERS, QUALITY_SWITCHES, SceneError, TERRAIN_DEFAULTS } from '../shared/domain/scene.js';

const RUMBLETECT_PARAMETERS = Object.freeze({
  startSeconds: { minimum: 0, maximum: 240, unit: 's', label: 'Onset', reliability: null },
  headingDegrees: { minimum: 0, maximum: 360, unit: '°', label: 'Heading', reliability: null },
  climbDegrees: { minimum: -90, maximum: 90, unit: '°', label: 'Climb', reliability: null },
  mach: { minimum: .1, maximum: 3, unit: '', label: 'Mach', reliability: null },
  accelerationMetresPerSecondSquared: { minimum: -50, maximum: 100, unit: 'm/s²', label: 'Acceleration', reliability: null },
  turnDegreesPerSecond: { minimum: -10, maximum: 10, unit: '°/s', label: 'Turn', reliability: null },
  flightSeconds: { minimum: 1, maximum: 600, unit: 's', label: 'Flight time', reliability: null },
  pressureRatio: { minimum: 1.01, maximum: 6, unit: '', label: 'Nozzle pressure ratio', reliability: 'C' },
  totalTemperatureKelvin: { minimum: 300, maximum: 2300, unit: 'K', label: 'Jet temperature', reliability: 'C' },
  nozzleDiameterMetres: { minimum: .02, maximum: 3, unit: 'm', label: 'Nozzle diameter', reliability: 'C' },
  engines: { minimum: 1, maximum: 60, unit: '', label: 'Engines', reliability: null, integer: true },
  thrustKilonewtons: { minimum: .01, maximum: 10000, unit: 'kN', label: 'Thrust per engine', reliability: 'B' },
  exitVelocityMetresPerSecond: { minimum: 500, maximum: 5000, unit: 'm/s', label: 'Exhaust velocity', reliability: 'B' },
  exitDiameterMetres: { minimum: .001, maximum: 6, unit: 'm', label: 'Nozzle exit diameter', reliability: 'B' },
  efficiencyPercent: { minimum: .05, maximum: 1, unit: '%', label: 'Acoustic efficiency', reliability: 'B' },
  liftoffMassTonnes: { minimum: .00001, maximum: 10000, unit: 't', label: 'Liftoff mass', reliability: 'C' },
  burnSeconds: { minimum: 1, maximum: 590, unit: 's', label: 'Burn time', reliability: 'C' },
  pitchKickAtSeconds: { minimum: 0, maximum: 120, unit: 's', label: 'Pitch kick at', reliability: 'C' },
  pitchKickDegrees: { minimum: 0, maximum: 45, unit: '°', label: 'Pitch kick', reliability: 'C' },
  throttleDownSeconds: { minimum: 0, maximum: 590, unit: 's', label: 'Throttle down at', reliability: 'C' },
  throttleUpSeconds: { minimum: 0, maximum: 590, unit: 's', label: 'Throttle up at', reliability: 'C' },
  throttlePercent: { minimum: 30, maximum: 100, unit: '%', label: 'Throttle', reliability: 'C' },
  launchDegrees: { minimum: 5, maximum: 90, unit: '°', label: 'Launch angle', reliability: null },
  aircraft: { minimum: 1, maximum: 24, unit: '', label: 'Aircraft', reliability: null, integer: true },
  lateralSpacingMetres: { minimum: 0, maximum: 2000, unit: 'm', label: 'Lateral spacing', reliability: null },
  trailSpacingMetres: { minimum: 0, maximum: 3000, unit: 'm', label: 'Trail spacing', reliability: null },
  ventDiameterMetres: { minimum: 1, maximum: 500, unit: 'm', label: 'Vent diameter', reliability: 'C' },
  ventVelocityMetresPerSecond: { minimum: 10, maximum: 600, unit: 'm/s', label: 'Exit velocity', reliability: 'C' },
  gasTemperatureKelvin: { minimum: 300, maximum: 1600, unit: 'K', label: 'Gas temperature', reliability: 'C' },
  eruptionSeconds: { minimum: 5, maximum: 400, unit: 's', label: 'Duration', reliability: null },
  riseSeconds: { minimum: 0, maximum: 120, unit: 's', label: 'Rise', reliability: null },
  fadeSeconds: { minimum: 0, maximum: 300, unit: 's', label: 'Fade', reliability: null },
  pulsePeriodSeconds: { minimum: 1, maximum: 120, unit: 's', label: 'Pulse period', reliability: 'C' },
  pulseDepthPercent: { minimum: 0, maximum: 100, unit: '%', label: 'Pulse depth', reliability: 'C' },
  rounds: { minimum: 1, maximum: 48, unit: '', label: 'Rounds', reliability: null, integer: true },
  salvoSize: { minimum: 1, maximum: 24, unit: '', label: 'Rounds per salvo', reliability: null, integer: true },
  salvoSeconds: { minimum: 0, maximum: 300, unit: 's', label: 'Duration', reliability: null },
  salvoSpreadSeconds: { minimum: 0, maximum: 10, unit: 's', label: 'Salvo spread', reliability: 'C' },
  launcherRadiusMetres: { minimum: 0, maximum: 2000, unit: 'm', label: 'Launcher radius', reliability: null },
  headingSpreadDegrees: { minimum: 0, maximum: 30, unit: '°', label: 'Heading spread', reliability: 'C' },
  launchSpreadDegrees: { minimum: 0, maximum: 15, unit: '°', label: 'Launch angle spread', reliability: 'C' },
  thrustSpreadPercent: { minimum: 0, maximum: 30, unit: '%', label: 'Thrust spread', reliability: 'C' }
});

export const PROPELLANTS = Object.freeze(Object.keys(ROCKET.propellants));

/** Class C: a close formation, wingtips some 10 m apart. */
const JET_FORMATION = Object.freeze({ aircraft: 1, lateralSpacingMetres: 20, trailSpacingMetres: 30 });

const JET_NUMBERS = Object.freeze(['startSeconds', 'headingDegrees', 'climbDegrees', 'mach', 'accelerationMetresPerSecondSquared', 'turnDegreesPerSecond']);

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
    autoDuration: false,
    engineClass: 'fighter',
    engine: engineOfClass('fighter'),
    formation: { ...JET_FORMATION }
  };
}

export function defaultRocket(id = 'rocket-1', seed = 20261017) {
  const sized = sizedRocket(7.6e6, 9, 'kerosene');
  return {
    id, name: 'Rocket', kind: 'rocket', enabled: true, seed,
    propellant: 'kerosene',
    startSeconds: 0,
    startMetres: { x: 0, y: 0, z: 10 },
    headingDegrees: 90,
    launchDegrees: 90,
    engine: { ...sized.engine, efficiencyPercent: .3 },
    ascent: { ...ROCKET.defaultAscent, ...sized.ascent },
    salvo: { ...ROCKET.defaultSalvo }
  };
}

export function defaultVolcano(id = 'volcano-1', seed = 20261018) {
  const { key, ventDiameterMetres, ventVelocityMetresPerSecond, gasTemperatureKelvin } = VOLCANO.categories.at(-1);
  return {
    id, name: 'Volcano', kind: 'volcano', enabled: true, seed,
    category: key,
    startSeconds: 0,
    ventMetres: { x: 0, y: 0, z: 0 },
    jet: { ventDiameterMetres, ventVelocityMetresPerSecond, gasTemperatureKelvin },
    eruption: { ...VOLCANO.defaultEruption }
  };
}

const VOLCANO_CATEGORIES = Object.freeze(VOLCANO.categories.map(category => category.key));

function readVolcano(value, { point, numbers }, path) {
  return {
    category: VOLCANO_CATEGORIES.includes(value.category) ? value.category : VOLCANO_CATEGORIES.at(-1),
    ventMetres: point(value.ventMetres, `${path}.ventMetres`),
    ...numbers(value, ['startSeconds'], path),
    jet: numbers(value.jet, ['ventDiameterMetres', 'ventVelocityMetresPerSecond', 'gasTemperatureKelvin'], `${path}.jet`),
    eruption: numbers(value.eruption, Object.keys(VOLCANO.defaultEruption), `${path}.eruption`)
  };
}

export const emitterAnchor = emitter => emitter.ventMetres ?? emitter.startMetres;

const ROCKET_ENGINE_NUMBERS = Object.freeze(['engines', 'thrustKilonewtons', 'exitVelocityMetresPerSecond', 'exitDiameterMetres', 'efficiencyPercent']);
const SALVO_NUMBERS = Object.freeze(Object.keys(ROCKET.defaultSalvo));
const ROCKET_ASCENT_NUMBERS = Object.freeze(['liftoffMassTonnes', 'burnSeconds', 'pitchKickAtSeconds', 'pitchKickDegrees', 'throttleDownSeconds', 'throttleUpSeconds', 'throttlePercent']);

function readRocket(value, { check, point, numbers }, path) {
  check(PROPELLANTS.includes(value.propellant), `${path}.propellant is not supported.`);
  check(value.engine && typeof value.engine === 'object' && value.ascent && typeof value.ascent === 'object', `${path} needs an engine and an ascent.`);
  check(typeof value.ascent.water === 'boolean', `${path}.ascent.water must be true or false.`);
  return {
    propellant: value.propellant,
    startMetres: point(value.startMetres, `${path}.startMetres`),
    ...numbers(value, ['startSeconds', 'headingDegrees', 'launchDegrees'], path),
    engine: numbers(value.engine, ROCKET_ENGINE_NUMBERS, `${path}.engine`),
    ascent: { ...numbers(value.ascent, ROCKET_ASCENT_NUMBERS, `${path}.ascent`), water: value.ascent.water },
    salvo: numbers(value.salvo, SALVO_NUMBERS, `${path}.salvo`)
  };
}

function readJet(value, { check, number, point, numbers }, path) {
  const engine = value.engine ?? {};
  check(typeof value.autoDuration === 'boolean', `${path}.autoDuration must be true or false.`);
  return {
    engineClass: ENGINE_CLASSES.includes(value.engineClass) ? value.engineClass : 'fighter',
    startMetres: point(value.startMetres, `${path}.startMetres`),
    durationSeconds: number(value.durationSeconds, 'flightSeconds', `${path}.durationSeconds`),
    autoDuration: value.autoDuration,
    ...numbers(value, JET_NUMBERS, path),
    engine: {
      pressureRatio: number(engine.pressureRatio, 'pressureRatio', `${path}.engine.pressureRatio`),
      totalTemperatureKelvin: number(engine.totalTemperatureKelvin, 'totalTemperatureKelvin', `${path}.engine.totalTemperatureKelvin`),
      diameterMetres: number(engine.diameterMetres, 'nozzleDiameterMetres', `${path}.engine.diameterMetres`),
      engines: number(engine.engines, 'engines', `${path}.engine.engines`)
    },
    formation: numbers(value.formation, Object.keys(JET_FORMATION), `${path}.formation`)
  };
}

export const { PARAMETERS, MODES, defaultScene, parseScene, readScene, serializeScene, sceneInMode } = createScene({
  name: 'Rumbletect',
  format: 'rumbletect.scene',
  version: 1,
  modelVersion: MODEL_VERSION,
  anchor: emitterAnchor,
  modes: {
    jet: { kinds: ['jet'], emitter: () => defaultJet(), receiverMetres: { x: 0, y: 0, z: 1.7 } },
    rocket: { kinds: ['rocket'], emitter: () => defaultRocket(), receiverMetres: { x: -1500, y: -2600, z: 1.7 } },
    volcano: { kinds: ['volcano'], emitter: () => defaultVolcano(), receiverMetres: { x: -3000, y: -4000, z: 1.7 } }
  },
  kinds: {
    jet: { defaults: () => defaultJet(), read: readJet },
    rocket: { defaults: () => defaultRocket(), read: readRocket },
    volcano: { defaults: () => defaultVolcano(), read: readVolcano }
  },
  parameters: RUMBLETECT_PARAMETERS
});
