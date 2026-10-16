import { jetPath } from '../domain/jet-render.js';
import { FLAT_SURFACE } from '../domain/terrain.js';

export const currentSurface = () => FLAT_SURFACE;

function cached(cache, emitter, extra, compute) {
  const { name: _name, enabled: _enabled, ...shape } = emitter;
  const key = JSON.stringify([shape, extra]);
  const entry = cache.get(emitter.id);
  if (entry?.key === key) return entry.value;
  const value = compute();
  cache.set(emitter.id, { key, value });
  return value;
}

const tracks = new Map();

export const cachedTracks = (emitter, air) => cached(tracks, emitter, air, () => [jetPath(emitter, air)]);

export const isTrackKind = emitter => emitter.kind === 'jet';
