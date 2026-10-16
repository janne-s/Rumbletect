import { MODEL_VERSION } from './constants.js';
import { speedOfSoundMetresPerSecond } from './air.js';
import { jetOfEngine } from './engine.js';
import { flightPath } from './flight.js';
import { nearListen } from './near-listen.js';
import { PATH_DIRECT } from './refraction.js';

const ARRIVAL_POINTS = 2000;

/** The flight path of a jet emitter in still air of the ground's temperature. */
export const jetPath = (emitter, air) => flightPath(emitter, { ...air, refraction: false });

/** A sampled path (`flightPath`) as a trajectory of ENU positions and velocities from its first sample. */
export function pathTrajectory(path) {
  const last = path.seconds.length - 1;
  const at = (values, seconds) => {
    const position = Math.min(last, Math.max(0, seconds / path.step));
    const index = Math.min(last - 1, Math.floor(position));
    const share = position - index;
    return values[index] + (values[index + 1] - values[index]) * share;
  };
  return {
    durationSeconds: last * path.step,
    positionAt: seconds => ({ east: at(path.x, seconds), north: at(path.y, seconds), up: at(path.z, seconds) }),
    velocityAt: seconds => ({ east: at(path.vx, seconds), north: at(path.vy, seconds), up: at(path.vz, seconds) })
  };
}

export const emitterJet = (emitter, air) => jetOfEngine(emitter.engine, air.temperatureCelsius);

function arrivalTable(emitters, receiver, air) {
  const sound = speedOfSoundMetresPerSecond(air.temperatureCelsius);
  const rows = [];
  for (const emitter of emitters) {
    const path = jetPath(emitter, air);
    const every = Math.max(1, Math.ceil(path.seconds.length * emitters.length / ARRIVAL_POINTS));
    for (let index = 0; index < path.seconds.length; index += every) {
      const [dx, dy, dz] = [path.x[index] - receiver.positionMetres.x, path.y[index] - receiver.positionMetres.y, path.z[index] - receiver.positionMetres.z];
      const metres = Math.hypot(dx, dy, dz);
      rows.push({
        seconds: path.seconds[index] + metres / sound, height: path.z[index], metres, level: -20 * Math.log10(Math.max(metres, 1)),
        bearing: ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360, elevation: Math.asin(dz / Math.max(metres, 1e-9)) * 180 / Math.PI
      });
    }
  }
  const column = key => Float64Array.from(rows, row => row[key]);
  return {
    count: rows.length, seconds: column('seconds'), heights: column('height'), metres: column('metres'), levels: column('level'),
    bearings: column('bearing'), elevations: column('elevation'), kinds: new Uint8Array(rows.length).fill(PATH_DIRECT)
  };
}

/** One microphone's result in the shape the views, playback, and export read: channels on the scene's timeline. */
export function renderReceiver(scene, receiverIndex, { onProgress = null } = {}) {
  const receiver = scene.receivers[receiverIndex];
  const { sampleRate, ambisonicOrder: order } = scene.render;
  const listener = { east: receiver.positionMetres.x, north: receiver.positionMetres.y, up: receiver.positionMetres.z };
  const emitters = scene.emitters.filter(emitter => emitter.enabled && emitter.kind === 'jet');
  const parts = emitters.map((emitter, index) => {
    const trajectory = pathTrajectory(jetPath(emitter, scene.air));
    const part = nearListen({
      trajectory, listener, jet: emitterJet(emitter, scene.air), air: scene.air, emissionSeconds: trajectory.durationSeconds, sampleRate, seed: emitter.seed,
      ground: scene.ground.enabled ? scene.ground.type : null, scintillation: scene.air.scintillation, order
    });
    onProgress?.((index + 1) / emitters.length);
    return { ...part, startSeconds: emitter.startSeconds + part.startSeconds };
  });
  const startSeconds = parts.length ? Math.min(...parts.map(part => part.startSeconds)) : 0;
  const length = parts.length ? Math.max(...parts.map(part => Math.round((part.startSeconds - startSeconds) * sampleRate) + part.channels[0].length)) : 0;
  const channels = Array.from({ length: (order + 1) ** 2 }, () => new Float32Array(length));
  let peakPa = 0;
  for (const part of parts) {
    const offset = Math.round((part.startSeconds - startSeconds) * sampleRate);
    part.channels.forEach((samples, channel) => samples.forEach((value, index) => { channels[channel][offset + index] += value; }));
  }
  for (const value of channels[0]) {
    if (!Number.isFinite(value)) throw new RangeError('The render produced a non-finite sample.');
    peakPa = Math.max(peakPa, Math.abs(value));
  }
  return {
    receiverId: receiver.id, sampleRate, startSeconds, channels, samples: channels[0], peakPa,
    speedOfSound: speedOfSoundMetresPerSecond(scene.air.temperatureCelsius), arrivals: arrivalTable(emitters, receiver, scene.air), nonlinearPaths: 0, modelVersion: MODEL_VERSION
  };
}
