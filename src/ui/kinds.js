import { VIEW } from '../domain/constants.js';
import { jetOfEngine, powerLabel, powerOfEngine } from '../domain/engine.js';
import { jetComponents, speedOfSound } from '../domain/jet.js';
import { defaultJet, defaultRocket, ROCKET_VEHICLES } from '../domain/scene.js';
import { RENDER, ROCKET } from '../domain/constants.js';
import { heardSteps } from '../domain/rocket-grains.js';
import { peakFrequencyHz, soundPowerWatts, vehicleOf } from '../domain/rocket.js';
import { newSeed } from '../shared/domain/random.js';
import { formatMetres } from '../shared/ui/canvas.js';
import { checkboxField, numberField, pointFields, seedField, selectField, textField } from './fields.js';
import { cachedTracks } from './geometry-cache.js';
import { macrosFor, rocketMacros } from './macros.js';
import { machCone } from '../shared/domain/trajectory.js';

const flownSeconds = (emitter, scene) => { const [path] = cachedTracks(emitter, scene); return Math.round((path.seconds.length - 1) * path.step); };

function summary(emitter, scene) {
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  return `${powerLabel(powerOfEngine(emitter.engine))}, jet ${Math.round(jet.velocityMetresPerSecond)} m/s · Mach ${emitter.mach.toFixed(2)} at ${formatMetres(emitter.startMetres.z)} for ${flownSeconds(emitter, scene)} s`;
}

function details(emitter, { updateEmitter, scene }) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setEngine = key => value => updateEmitter(emitter.id, item => { item.engine = { ...item.engine, [key]: value }; });
  const section = (title, build) => ({ title, build });
  const numbers = keys => container => keys.forEach(key => numberField(container, { key, value: emitter[key], onCommit: set(key) }));
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  return [
    section('Placement', container => {
      textField(container, { label: 'Name', value: emitter.name, onCommit: set('name') });
      seedField(container, { value: emitter.seed, onCommit: set('seed'), onNew: () => set('seed')(newSeed()) });
      numberField(container, { key: 'startSeconds', value: emitter.startSeconds, onCommit: set('startSeconds') });
      pointFields(container, { label: 'Start', point: emitter.startMetres, onCommit: set('startMetres') });
    }),
    section('Flight', container => {
      numbers(['headingDegrees', 'climbDegrees', 'mach', 'accelerationMetresPerSecondSquared', 'turnDegreesPerSecond'])(container);
      checkboxField(container, { label: 'Auto flight time', value: emitter.autoDuration, reliability: 'C', onCommit: set('autoDuration') });
      if (!emitter.autoDuration) numberField(container, { key: 'flightSeconds', value: emitter.durationSeconds, onCommit: set('durationSeconds') });
      else {
        const note = document.createElement('p');
        note.className = 'field-note';
        note.textContent = `Flies ${flownSeconds(emitter, scene)} s, until every microphone is out of hearing`;
        container.append(note);
      }
    }),
    section('Engine', container => {
      numberField(container, { key: 'pressureRatio', value: emitter.engine.pressureRatio, onCommit: setEngine('pressureRatio') });
      numberField(container, { key: 'totalTemperatureKelvin', value: emitter.engine.totalTemperatureKelvin, onCommit: setEngine('totalTemperatureKelvin') });
      numberField(container, { key: 'nozzleDiameterMetres', value: emitter.engine.diameterMetres, onCommit: setEngine('diameterMetres') });
      const note = document.createElement('p');
      note.className = 'field-note';
      note.textContent = `Jet ${Math.round(jet.velocityMetresPerSecond)} m/s · ${jet.temperatureRatio.toFixed(2)} × ambient temperature`;
      container.append(note);
    })
  ];
}

const pathPoints = (emitter, scene, at) => { for (const path of cachedTracks(emitter, scene)) path.x.forEach((x, index) => at({ x, y: path.y[index], z: path.z[index] })); };

function amplitudes(emitter, scene) {
  const { air } = scene;
  const components = jetComponents(jetOfEngine(emitter.engine, air.temperatureCelsius), { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: emitter.mach * speedOfSound(air.temperatureCelsius) });
  const amplitude = 10 ** (components.large.decibels / 20) * 20e-6 * components.diameterMetres * Math.sqrt(components.large.peakHz);
  return new Map([[`${emitter.id}:0`, { amplitude, frequencyHz: components.large.peakHz }]]);
}

function wavefrontSources(emitter, scene, placedPoint, candidates) {
  cachedTracks(emitter, scene).forEach((path, member) => {
    const every = Math.max(1, Math.ceil(path.seconds.length / VIEW.wavefront.flightFronts));
    const spacingSeconds = every * path.step;
    for (let index = 0; index < path.seconds.length; index += every) candidates.push({ point: { x: path.x[index], y: path.y[index], z: path.z[index] }, emitted: path.seconds[index], group: `${emitter.id}:${member}`, spacingSeconds });
  });
}

function warnings(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  const sound = speedOfSound(scene.air.temperatureCelsius);
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius).velocityMetresPerSecond;
  const at = index => `${(index * path.step).toFixed(1)} s`;
  const supersonic = path.speed.findIndex(speed => speed >= sound);
  const outrun = path.speed.findIndex(speed => speed >= jet);
  return [
    ...(supersonic >= 0 ? [`Passes the speed of sound at ${at(supersonic)}; its boom is not heard here`] : []),
    ...(outrun >= 0 ? [`No jet noise above Mach ${(jet / sound).toFixed(1)} at this power`] : [])
  ];
}

function rocketSummary(emitter) {
  const vehicle = vehicleOf(emitter);
  const name = ROCKET.vehicles[emitter.vehicle]?.label ?? 'Custom';
  return `${name}, ${emitter.engine.engines} × ${Math.round(emitter.engine.thrustKilonewtons)} kN · ${(10 * Math.log10(soundPowerWatts(vehicle) / 1e-12)).toFixed(0)} dB power · burns ${emitter.ascent.burnSeconds} s`;
}

function rocketDetails(emitter, { updateEmitter }) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setIn = (group, key) => value => updateEmitter(emitter.id, item => { item[group] = { ...item[group], [key]: value }; item.vehicle = 'custom'; });
  const choose = vehicle => updateEmitter(emitter.id, item => {
    if (vehicle === 'custom') { item.vehicle = 'custom'; return; }
    const preset = defaultRocket(item.id, vehicle, item.seed);
    Object.assign(item, { vehicle, engine: preset.engine, ascent: preset.ascent });
    if (ROCKET_VEHICLES.some(key => ROCKET.vehicles[key].label === item.name)) item.name = preset.name;
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
    }),
    section('Vehicle', container => {
      selectField(container, { label: 'Vehicle', value: emitter.vehicle, options: [...ROCKET_VEHICLES.map(key => [key, ROCKET.vehicles[key].label]), ['custom', 'Custom']], onCommit: choose });
      ['engines', 'thrustKilonewtons', 'exitVelocityMetresPerSecond', 'exitDiameterMetres', 'efficiencyPercent'].forEach(key => numberField(container, { key, value: emitter.engine[key], onCommit: setIn('engine', key) }));
      const note = document.createElement('p');
      note.className = 'field-note';
      note.textContent = `Plume ${vehicle.effectiveDiameterMetres.toFixed(2)} m across, peak ${peakFrequencyHz(vehicle).toFixed(1)} Hz`;
      container.append(note);
    }),
    section('Ascent', container => {
      ['liftoffMassTonnes', 'burnSeconds', 'pitchKickAtSeconds', 'pitchKickDegrees', 'throttleDownSeconds', 'throttleUpSeconds', 'throttlePercent'].forEach(key => numberField(container, { key, value: emitter.ascent[key], onCommit: setIn('ascent', key) }));
      checkboxField(container, { label: 'Water on the pad', value: emitter.ascent.water, reliability: 'B', onCommit: setIn('ascent', 'water') });
    })
  ];
}

function rocketAmplitudes(emitter, scene) {
  const vehicle = vehicleOf(emitter);
  const amplitude = Math.sqrt(soundPowerWatts(vehicle) * 1.2 * speedOfSound(scene.air.temperatureCelsius) / (4 * Math.PI));
  return new Map([[`${emitter.id}:0`, { amplitude, frequencyHz: peakFrequencyHz(vehicle) }]]);
}

function rocketWarnings(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  const sound = speedOfSound(scene.air.temperatureCelsius);
  const supersonic = path.speed.findIndex(speed => speed >= sound);
  const kept = heardSteps(path, scene);
  return [
    ...(supersonic >= 0 ? [`Passes the speed of sound at T+${(supersonic * path.step - path.heldSeconds).toFixed(0)} s; its boom is not heard here`] : []),
    ...(kept < path.seconds.length ? [`Heard until T+${((kept - 1) * path.step - path.heldSeconds).toFixed(0)} s; later sound arrives beyond the ${RENDER.maximumSeconds} s render`] : [])
  ];
}

export const isSupersonic = (emitter, scene) => cachedTracks(emitter, scene)[0].speed.some(speed => speed >= speedOfSound(scene.air.temperatureCelsius));

export const KIND_PANELS = Object.freeze({
  jet: Object.freeze({
    label: () => 'Jet',
    summary,
    macros: macrosFor,
    details,
    seeded: () => true,
    anchorName: () => 'start',
    info: () => [],
    bounds: (emitter, scene, include) => pathPoints(emitter, scene, include),
    measure: pathPoints,
    move: () => false,
    groundAnchored: () => false,
    timeline: () => [],
    alwaysTimed: () => false,
    eventSeconds: 0,
    tracks: (emitter, scene) => cachedTracks(emitter, scene),
    cone: machCone,
    amplitudes,
    wavefrontSources,
    mergesSources: false,
    warnings
  }),
  rocket: Object.freeze({
    label: () => 'Rocket',
    summary: rocketSummary,
    macros: rocketMacros,
    details: rocketDetails,
    seeded: () => true,
    anchorName: () => 'pad',
    info: () => [],
    bounds: (emitter, scene, include) => pathPoints(emitter, scene, include),
    measure: pathPoints,
    move: () => false,
    groundAnchored: () => false,
    timeline: () => [],
    alwaysTimed: () => false,
    eventSeconds: 0,
    tracks: (emitter, scene) => cachedTracks(emitter, scene),
    cone: machCone,
    amplitudes: rocketAmplitudes,
    wavefrontSources,
    mergesSources: false,
    warnings: rocketWarnings
  })
});

export const ADD_EMITTERS = Object.freeze({
  jet: Object.freeze({ create: defaultJet, label: 'Jet', mode: 'jet' }),
  rocket: Object.freeze({ create: defaultRocket, label: 'Rocket', mode: 'rocket' })
});
