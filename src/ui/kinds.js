import { ENGINE } from '../domain/constants.js';
import { jetOfEngine, powerLabel, powerOfEngine } from '../domain/engine.js';
import { speedOfSound } from '../domain/jet.js';
import { defaultAirliner, defaultFormation, defaultJet, defaultRocket, defaultSalvo, defaultVolcano, PARAMETERS, PROPELLANTS, ROCKET_ASCENT_NUMBERS } from '../domain/scene.js';
import { RENDER, ROCKET } from '../domain/constants.js';
import { heardCounts } from '../domain/rocket-grains.js';
import { peakFrequencyHz, sizedRocket, totalThrustNewtons, vehicleOf } from '../domain/rocket.js';
import { newSeed } from '../shared/domain/random.js';
import { formatMetres, formatMetresSpan } from '../shared/ui/canvas.js';
import { checkboxField, numberField, pointFields, seedField, selectField, textField } from './fields.js';
import { cachedCoastedTracks, cachedLevels, cachedSoundTracks, cachedTracks } from './geometry-cache.js';
import { formatAtKilometre, formatDecibels } from '../shared/ui/levels.js';
import { macrosFor, rocketMacros, thrustLabel, volcanoMacros } from './macros.js';
import { volcanoCategory, volcanoSourcePosition } from '../domain/volcano.js';
import { machCone, soundSpeedAt } from '../shared/domain/trajectory.js';
import { followerPlacement, followerSeed } from '../shared/domain/follower.js';
import { engineAtPower, engineOfClass } from '../domain/engine.js';
import { frontProfile } from '../shared/domain/refraction.js';

/** The first sample at or above the speed of sound of the air at its height, or −1. */
export const supersonicIndex = (path, air) => path.speed.findIndex((speed, index) => speed >= soundSpeedAt(air, path.z[index]));

function levelInfo(emitter, scene) {
  const { soundPowerDecibels, aWeightedAtKilometreDecibels } = cachedLevels(emitter, scene);
  const line = `LW ${formatDecibels(soundPowerDecibels)} · ${formatAtKilometre(formatDecibels(aWeightedAtKilometreDecibels).replace(/ dB$/, ' dB(A)'))}`;
  return [emitter.kind === 'salvo' ? `${line} per round` : line];
}

const flownSeconds = (emitter, scene) => { const [path] = cachedTracks(emitter, scene); return Math.round((path.seconds.length - 1) * path.step); };

const kilometresPerHour = metresPerSecond => Math.round(metresPerSecond * 3.6).toLocaleString('en').replace(/,/g, ' ');

function flightSpeedLabel(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  const [slowest, fastest] = [Math.min(...path.speed), Math.max(...path.speed)];
  const span = Math.round(fastest * 3.6) - Math.round(slowest * 3.6) >= 10 ? `${kilometresPerHour(slowest)}–${kilometresPerHour(fastest)}` : kilometresPerHour(path.speed[0]);
  return `${span} km/h (Mach ${emitter.mach.toFixed(2)})`;
}

function flightHeightLabel(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  const [from, to] = [path.z[0], path.z.at(-1)];
  return Math.abs(to - from) >= 10 ? formatMetresSpan(from, to) : formatMetres(emitter.startMetres.z);
}

function summary(emitter, scene) {
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  const aircraft = emitter.kind === 'formation' ? emitter.memberCount : 1;
  const { engines } = emitter.engine;
  if (emitter.follows) return `${ENGINE.classes[emitter.engineClass].label}, ${powerLabel(powerOfEngine(emitter.engine, emitter.engineClass), emitter.engineClass)}, on ${emitter.follows.app}'s ${emitter.follows.name} · ${flightSpeedLabel(emitter, scene)}`;
  return `${aircraft > 1 ? `${aircraft} × ` : ''}${ENGINE.classes[emitter.engineClass].label}${engines > 1 ? `, ${engines} engines` : ''}, ${powerLabel(powerOfEngine(emitter.engine, emitter.engineClass), emitter.engineClass)}, exhaust ${Math.round(jet.velocityMetresPerSecond)} m/s · ${flightSpeedLabel(emitter, scene)} at ${flightHeightLabel(emitter, scene)} for ${flownSeconds(emitter, scene)} s${emitter.gearAndFlaps ? ' · gear & flaps down' : ''}`;
}

const engineSection = (emitter, setEngine, jet) => ({
  title: 'Set by category',
  build: container => {
    numberField(container, { key: 'engines', value: emitter.engine.engines, onCommit: setEngine('engines') });
    numberField(container, { key: 'pressureRatio', value: emitter.engine.pressureRatio, onCommit: setEngine('pressureRatio') });
    numberField(container, { key: 'totalTemperatureKelvin', value: emitter.engine.totalTemperatureKelvin, onCommit: setEngine('totalTemperatureKelvin') });
    numberField(container, { key: 'nozzleDiameterMetres', value: emitter.engine.diameterMetres, onCommit: setEngine('diameterMetres') });
    const note = document.createElement('p');
    note.className = 'field-note';
    note.textContent = `Exhaust ${Math.round(jet.velocityMetresPerSecond)} m/s · ${jet.temperatureRatio.toFixed(2)} × ambient temperature`;
    container.append(note);
  }
});

function details(emitter, { updateEmitter, scene }) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setEngine = key => value => updateEmitter(emitter.id, item => { item.engine = { ...item.engine, [key]: value }; });
  const section = (title, build) => ({ title, build });
  const numbers = keys => container => keys.forEach(key => numberField(container, { key, value: emitter[key], onCommit: set(key) }));
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  if (emitter.follows) {
    return [
      section('Placement', container => {
        textField(container, { label: 'Name', value: emitter.name, onCommit: set('name') });
        seedField(container, { value: emitter.seed, onCommit: set('seed'), onNew: () => set('seed')(newSeed()) });
      }),
      engineSection(emitter, setEngine, jet)
    ];
  }
  return [
    section('Placement', container => {
      textField(container, { label: 'Name', value: emitter.name, onCommit: set('name') });
      seedField(container, { value: emitter.seed, onCommit: set('seed'), onNew: () => set('seed')(newSeed()) });
      numberField(container, { key: 'startSeconds', value: emitter.startSeconds, onCommit: set('startSeconds') });
      pointFields(container, { label: 'Start', point: emitter.startMetres, onCommit: set('startMetres') });
    }),
    section('Flight', container => {
      numbers(['headingDegrees', 'climbDegrees', 'mach', 'accelerationMetresPerSecondSquared', 'bendDegrees', 'turnStartPercent', 'turnLengthPercent'])(container);
      if (emitter.kind === 'airliner') checkboxField(container, { label: 'Gear & flaps', value: emitter.gearAndFlaps, reliability: 'B', onCommit: set('gearAndFlaps') });
      checkboxField(container, { label: 'Auto flight time', value: emitter.autoDuration, reliability: 'C', onCommit: set('autoDuration') });
      if (!emitter.autoDuration) numberField(container, { key: 'flightSeconds', value: emitter.durationSeconds, onCommit: set('durationSeconds') });
      else {
        const note = document.createElement('p');
        note.className = 'field-note';
        note.textContent = `Flies ${flownSeconds(emitter, scene)} s, until every microphone is out of hearing`;
        container.append(note);
      }
    }),
    engineSection(emitter, setEngine, jet),
    ...(emitter.kind === 'formation' ? [section('Formation', numbers(['memberCount', 'lateralSpacingMetres', 'trailSpacingMetres', 'verticalSpacingMetres']))] : [])
  ];
}

const pathPoints = (emitter, scene, at) => { for (const path of cachedTracks(emitter, scene)) path.x.forEach((x, index) => at({ x, y: path.y[index], z: path.z[index] })); };

function wavefrontSources(emitter, scene, placedPoint, candidates) {
  cachedSoundTracks(emitter, scene).forEach((path, member) => path.seconds.forEach((emitted, index) => candidates.push({ point: { x: path.x[index], y: path.y[index], z: path.z[index] }, emitted, group: `${emitter.id}:${member}` })));
}

function warnings(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  const sound = speedOfSound(scene.air.temperatureCelsius);
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius).velocityMetresPerSecond;
  const at = index => `${(index * path.step).toFixed(1)} s`;
  const supersonic = supersonicIndex(path, scene.air);
  const outrun = path.speed.findIndex(speed => speed >= jet);
  return [
    ...(supersonic >= 0 ? [`Passes the speed of sound at ${at(supersonic)}; Boomtect makes its boom`] : []),
    ...(outrun >= 0 ? [`No jet noise above Mach ${(jet / sound).toFixed(1)} at this power`] : [])
  ];
}

function rocketSummary(emitter) {
  const engines = emitter.engine.engines === 1 ? '1 engine' : `${emitter.engine.engines} engines`;
  const salvo = emitter.kind === 'salvo' ? ` · ${emitter.roundCount} rounds over ${emitter.salvoSeconds} s` : '';
  return `${ROCKET.propellants[emitter.propellant].label}, ${engines}, ${thrustLabel(totalThrustNewtons(emitter))} · burns ${emitter.ascent.burnSeconds} s to ${kilometresPerHour(emitter.ascent.burnoutMetresPerSecond)} km/h${salvo}`;
}

function rocketDetails(emitter, { updateEmitter }) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setIn = (group, key) => value => updateEmitter(emitter.id, item => { item[group] = { ...item[group], [key]: value }; });
  const choose = propellant => updateEmitter(emitter.id, item => {
    item.propellant = propellant;
    item.engine = { ...item.engine, ...sizedRocket(totalThrustNewtons(item), item.engine.engines, propellant).engine };
  });
  const section = (title, build) => ({ title, build });
  const vehicle = vehicleOf(emitter);
  return [
    section('Placement', container => {
      textField(container, { label: 'Name', value: emitter.name, onCommit: set('name') });
      seedField(container, { value: emitter.seed, onCommit: set('seed'), onNew: () => set('seed')(newSeed()) });
      numberField(container, { key: 'startSeconds', label: 'Ignition', value: emitter.startSeconds, onCommit: set('startSeconds') });
      pointFields(container, { label: 'Nozzles on the pad', point: emitter.startMetres, onCommit: set('startMetres') });
      numberField(container, { key: 'headingDegrees', value: emitter.headingDegrees, onCommit: set('headingDegrees') });
      numberField(container, { key: 'launchDegrees', value: emitter.launchDegrees, onCommit: set('launchDegrees') });
    }),
    section('Flight', container => {
      ROCKET_ASCENT_NUMBERS.forEach(key => numberField(container, { key, value: emitter.ascent[key], onCommit: setIn('ascent', key) }));
    }),
    section('Set by category', container => {
      numberField(container, { key: 'lengthMetres', value: emitter.lengthMetres, onCommit: set('lengthMetres') });
      selectField(container, { label: 'Propellant', value: emitter.propellant, options: PROPELLANTS.map(key => [key, ROCKET.propellants[key].label]), reliability: 'B', onCommit: choose });
      ['engines', 'thrustKilonewtons', 'exitVelocityMetresPerSecond', 'exitDiameterMetres', 'efficiencyPercent'].forEach(key => numberField(container, { key, value: emitter.engine[key], onCommit: setIn('engine', key) }));
      const note = document.createElement('p');
      note.className = 'field-note';
      note.textContent = `${thrustLabel(totalThrustNewtons(emitter))} in all · plume ${vehicle.effectiveDiameterMetres < 1 ? `${Math.round(vehicle.effectiveDiameterMetres * 100)} cm` : `${vehicle.effectiveDiameterMetres.toFixed(2)} m`} across · peak ${peakFrequencyHz(vehicle) < 100 ? peakFrequencyHz(vehicle).toFixed(1) : Math.round(peakFrequencyHz(vehicle))} Hz`;
      container.append(note);
      checkboxField(container, { label: 'Water on the pad', value: emitter.ascent.water, reliability: 'B', onCommit: setIn('ascent', 'water') });
    }),
    ...(emitter.kind === 'salvo' ? [section('Salvo', container => SALVO_LAYOUT.forEach(key => numberField(container, { key, value: emitter[key], onCommit: set(key) })))] : [])
  ];
}

const SALVO_LAYOUT = Object.freeze(['roundCount', 'salvoSize', 'salvoSeconds', 'salvoSpreadSeconds', 'launcherRadiusMetres', 'headingSpreadDegrees', 'launchSpreadDegrees', 'thrustSpreadPercent']);

function rocketWarnings(emitter, scene) {
  const paths = cachedTracks(emitter, scene);
  const [path] = paths;
  const supersonic = supersonicIndex(path, scene.air);
  const counts = heardCounts(paths, scene);
  const grounded = paths.filter(round => round.groundSeconds !== null).length;
  const cut = counts.filter((count, index) => count < paths[index].seconds.length).length;
  const beyond = `beyond the ${RENDER.maximumSeconds} s render`;
  return [
    ...(supersonic >= 0 ? [`Passes the speed of sound at T+${(supersonic * path.step - path.heldSeconds).toFixed(0)} s; Boomtect makes its boom`] : []),
    ...(paths.length === 1 && grounded ? [`Hits the ground at T+${path.groundSeconds.toFixed(0)} s`] : []),
    ...(paths.length > 1 && grounded ? [`${grounded} of ${paths.length} rounds hit the ground`] : []),
    ...(paths.length === 1 && cut ? [`Heard until T+${((counts[0] - 1) * path.step - path.heldSeconds).toFixed(0)} s; later sound arrives ${beyond}`] : []),
    ...(paths.length > 1 && cut ? [`${cut} of ${paths.length} rounds are cut short; later sound arrives ${beyond}`] : [])
  ];
}

function volcanoSummary(emitter) {
  const { ventDiameterMetres, ventVelocityMetresPerSecond } = emitter.jet;
  const peak = .19 * ventVelocityMetresPerSecond / ventDiameterMetres;
  return `${volcanoCategory(emitter.category).label}, vent ${formatMetres(ventDiameterMetres)} at ${Math.round(ventVelocityMetresPerSecond)} m/s · peak ${peak < 10 ? peak.toFixed(1) : Math.round(peak)} Hz · ${emitter.eruption.eruptionSeconds} s`;
}

function volcanoDetails(emitter, { updateEmitter }) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setIn = (group, key) => value => updateEmitter(emitter.id, item => { item[group] = { ...item[group], [key]: value }; });
  const section = (title, build) => ({ title, build });
  return [
    section('Placement', container => {
      textField(container, { label: 'Name', value: emitter.name, onCommit: set('name') });
      seedField(container, { value: emitter.seed, onCommit: set('seed'), onNew: () => set('seed')(newSeed()) });
      numberField(container, { key: 'startSeconds', value: emitter.startSeconds, onCommit: set('startSeconds') });
      pointFields(container, { label: 'Vent', point: emitter.ventMetres, onCommit: set('ventMetres') });
    }),
    section('Jet', container => ['ventDiameterMetres', 'ventVelocityMetresPerSecond', 'gasTemperatureKelvin'].forEach(key => numberField(container, { key, value: emitter.jet[key], onCommit: setIn('jet', key) }))),
    section('Eruption', container => ['eruptionSeconds', 'riseSeconds', 'fadeSeconds', 'pulsePeriodSeconds', 'pulseDepthPercent', 'burstsPercent', 'burstSeconds'].forEach(key => numberField(container, { key, value: emitter.eruption[key], onCommit: setIn('eruption', key) })))
  ];
}

export const isSupersonic = (emitter, scene) => supersonicIndex(cachedTracks(emitter, scene)[0], scene.air) >= 0;

const VOLCANO_PANEL = Object.freeze({
  label: () => 'Volcano',
  summary: volcanoSummary,
  macros: volcanoMacros,
  details: volcanoDetails,
  seeded: () => true,
  anchorName: () => 'vent',
  info: levelInfo,
  bounds: (emitter, scene, include) => { include(emitter.ventMetres); include(volcanoSourcePosition(emitter)); },
  measure: pathPoints,
  move: () => false,
  groundAnchored: () => false,
  timeline: () => [],
  alwaysTimed: () => false,
  eventSeconds: 0,
  tracks: (emitter, scene) => cachedTracks(emitter, scene),
  cone: () => null,
  wavefrontSources: (emitter, scene, placedPoint, candidates) => candidates.push({ point: volcanoSourcePosition(emitter), emitted: emitter.startSeconds, group: `${emitter.id}:0` }),
  mergesSources: false,
  warnings: () => []
});

const KIND_PANELS_EXTENDED = {
  jet: Object.freeze({
    label: () => 'Jet',
    summary,
    macros: macrosFor,
    details,
    seeded: () => true,
    anchorName: () => 'start',
    info: levelInfo,
    bounds: (emitter, scene, include) => pathPoints(emitter, scene, include),
    measure: pathPoints,
    move: () => false,
    groundAnchored: () => false,
    timeline: () => [],
    alwaysTimed: () => false,
    eventSeconds: 0,
    tracks: (emitter, scene) => cachedTracks(emitter, scene),
    cone: (path, now, profile) => machCone(path, now, profile, { profileAt: frontProfile, envelope: true }),
    wavefrontSources,
    mergesSources: false,
    warnings,
    followAs: (emitter, scene) => (!emitter.follows && isSupersonic(emitter, scene) ? { role: 'aircraft', size: emitter.engineClass === 'bomber' || ENGINE.classes[emitter.engineClass]?.civil ? 'bomber' : 'fighter' } : null)
  }),
  rocket: Object.freeze({
    label: () => 'Rocket',
    summary: rocketSummary,
    macros: rocketMacros,
    details: rocketDetails,
    seeded: () => true,
    anchorName: () => 'pad',
    info: levelInfo,
    bounds: (emitter, scene, include) => pathPoints(emitter, scene, include),
    measure: pathPoints,
    move: () => false,
    groundAnchored: () => false,
    timeline: () => [],
    alwaysTimed: () => false,
    eventSeconds: 0,
    tracks: (emitter, scene) => cachedTracks(emitter, scene),
    cone: (path, now, profile, emitter, scene, member) => machCone(cachedSoundTracks(emitter, scene)[member], now, profile, { profileAt: frontProfile, envelope: true }),
    wavefrontSources,
    mergesSources: false,
    warnings: rocketWarnings,
    followAs: (emitter, scene) => {
      if (!cachedTracks(emitter, scene).some(path => supersonicIndex(path, scene.air) >= 0)) return null;
      const paths = cachedCoastedTracks(emitter, scene);
      const burnSeconds = paths[0].burnoutSeconds === undefined ? null : paths[0].burnoutSeconds - paths[0].seconds[0];
      return { role: 'rocket', lengthMetres: emitter.lengthMetres, ...(burnSeconds === null ? {} : { burnSeconds }), paths };
    }
  }),
  volcano: VOLCANO_PANEL
};

KIND_PANELS_EXTENDED.formation = Object.freeze({ ...KIND_PANELS_EXTENDED.jet, label: () => 'Formation', macros: macrosFor });
KIND_PANELS_EXTENDED.airliner = Object.freeze({ ...KIND_PANELS_EXTENDED.jet, label: () => 'Airliner', macros: macrosFor });
KIND_PANELS_EXTENDED.salvo = Object.freeze({ ...KIND_PANELS_EXTENDED.rocket, label: () => 'Salvo', macros: rocketMacros });

export const KIND_PANELS = Object.freeze(KIND_PANELS_EXTENDED);

export const ADD_EMITTERS = Object.freeze({
  jet: Object.freeze({ create: defaultJet, label: 'Jet', mode: 'jet' }),
  formation: Object.freeze({ create: defaultFormation, label: 'Formation', mode: 'jet' }),
  airliner: Object.freeze({ create: defaultAirliner, label: 'Airliner', mode: 'jet' }),
  rocket: Object.freeze({ create: defaultRocket, label: 'Rocket', mode: 'rocket' }),
  salvo: Object.freeze({ create: defaultSalvo, label: 'Salvo', mode: 'rocket' }),
  volcano: Object.freeze({ create: defaultVolcano, label: 'Volcano', mode: 'volcano' })
});

const within = (key, value) => Math.min(PARAMETERS[key].maximum, Math.max(PARAMETERS[key].minimum, value));

/** A jet on a linked tect's flight, so that its engines come from Rumbletect: a fighter in full afterburner when the flight is supersonic; the category and power are kept once chosen. */
export function followerJet(ghost, existing, { partner, uniqueId, scene }) {
  if (ghost.follow.role !== 'aircraft') return null;
  const placement = followerPlacement(ghost.follow.paths[0]);
  const supersonic = placement.topSpeedMetresPerSecond >= soundSpeedAt(scene.air, placement.startMetres.z);
  const engineClass = ghost.follow.size === 'bomber' && !supersonic ? 'bomber' : 'fighter';
  const engine = supersonic ? { ...engineAtPower(1, engineClass), engines: ENGINE.classes[engineClass].engines } : engineOfClass(engineClass);
  const base = existing ?? { ...defaultJet(uniqueId('jet'), `${ghost.name} engines`.slice(0, 64), followerSeed(partner, ghost.id)), engineClass, engine };
  return {
    ...base,
    follows: { app: partner, id: ghost.id, name: ghost.name },
    paths: ghost.follow.paths,
    startMetres: placement.startMetres,
    startSeconds: within('startSeconds', placement.startSeconds),
    headingDegrees: +within('headingDegrees', placement.headingDegrees).toFixed(1),
    climbDegrees: +within('climbDegrees', placement.climbDegrees).toFixed(1),
    mach: +within('mach', placement.topSpeedMetresPerSecond / soundSpeedAt(scene.air, placement.startMetres.z)).toFixed(2),
    accelerationMetresPerSecondSquared: 0,
    bendDegrees: 0,
    durationSeconds: +within('flightSeconds', placement.durationSeconds).toFixed(2),
    autoDuration: false
  };
}
