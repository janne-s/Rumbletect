import { formationJets, jetPath } from '../domain/grains.js';
import { ascentPath, rocketSource } from '../domain/rocket.js';
import { salvoRounds } from '../domain/salvo.js';
import { ventPath } from '../domain/volcano.js';
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
