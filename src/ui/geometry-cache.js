import { jetPath } from '../domain/grains.js';
import { cached } from '../shared/ui/geometry-cache.js';

export { currentSurface, useTerrain } from '../shared/ui/geometry-cache.js';

const tracks = new Map();

export const cachedTracks = (emitter, air) => cached(tracks, emitter, air, () => [jetPath(emitter, air)]);
