import { formationJets, jetPath, jetSource } from '../domain/grains.js';
import { sourceLevels } from '../domain/source-levels.js';
import { ascentPath, rocketSource } from '../domain/rocket.js';
import { salvoRounds } from '../domain/salvo.js';
import { ventPath, volcanoSource } from '../domain/volcano.js';
import { cached, currentSurface } from '../shared/ui/geometry-cache.js';

export { currentSurface, useTerrain } from '../shared/ui/geometry-cache.js';

const tracks = new Map();
const surfaceIds = new WeakMap();
let surfaceCount = 0;
const surfaceId = surface => {
  if (!surfaceIds.has(surface)) surfaceIds.set(surface, surfaceCount += 1);
  return surfaceIds.get(surface);
};
const soundTracks = new Map();

const rocketTracks = (emitter, surface) => cached(tracks, emitter, [surfaceId(surface)], () => salvoRounds(emitter).map(round => ascentPath(round, surface)));

export const cachedTracks = (emitter, scene) => (emitter.kind === 'volcano'
  ? cached(tracks, emitter, [], () => [ventPath(emitter)])
  : emitter.kind === 'rocket' || emitter.kind === 'salvo'
  ? rocketTracks(emitter, currentSurface())
  : cached(tracks, emitter, [scene.air, emitter.autoDuration ? scene.receivers.map(receiver => receiver.positionMetres) : null], () => formationJets(emitter).map(member => jetPath(member, scene))));

export function cachedSoundTracks(emitter, scene) {
  const paths = cachedTracks(emitter, scene);
  if (emitter.kind !== 'rocket' && emitter.kind !== 'salvo') return paths;
  return cached(soundTracks, emitter, [scene.air, surfaceId(currentSurface())], () => salvoRounds(emitter).map((round, member) => {
    const path = paths[member];
    const source = rocketSource(round, scene, path);
    const points = path.seconds.map((seconds, index) => {
      const velocity = { x: path.vx[index], y: path.vy[index], z: path.vz[index] };
      const axis = source.axis(null, velocity, path.speed[index]);
      return source.place(null, { x: path.x[index], y: path.y[index], z: path.z[index] }, axis);
    });
    return { ...path, x: points.map(point => point.x), y: points.map(point => point.y), z: points.map(point => point.z) };
  }));
}

const levels = new Map();

const sourceOf = (emitter, scene, path) => (emitter.kind === 'volcano'
  ? volcanoSource(emitter, scene)
  : emitter.kind === 'rocket' || emitter.kind === 'salvo'
  ? rocketSource(salvoRounds(emitter)[0], scene, path)
  : jetSource(emitter, scene));

/** The loudest moment of one aircraft, rocket round or vent; a formation's aircraft add up. */
export function cachedLevels(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  return cached(levels, emitter, [scene.air, scene.render.sampleRate, path.seconds.length, path.step], () => {
    const one = sourceLevels(sourceOf(emitter, scene, path), path, scene);
    const members = 10 * Math.log10(emitter.kind === 'formation' ? emitter.memberCount : 1);
    return { soundPowerDecibels: one.soundPowerDecibels + members, aWeightedAtKilometreDecibels: one.aWeightedAtKilometreDecibels + members };
  });
}
