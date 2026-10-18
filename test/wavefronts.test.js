import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultScene } from '../src/domain/scene.js';
import { ADD_EMITTERS, KIND_PANELS } from '../src/ui/kinds.js';
import { macrosFor } from '../src/ui/macros.js';
import { createFrontStyle } from '../src/shared/ui/front-style.js';
import { localProfile, soundSpeedProfile, wavefront } from '../src/shared/domain/refraction.js';

test('each continuous source retains one leading front per aircraft, rocket, or eruption', () => {
  for (const [kind, { create, mode }] of Object.entries(ADD_EMITTERS)) {
    const scene = defaultScene(mode);
    const emitter = create();
    const fronts = [];
    KIND_PANELS[kind].wavefrontSources(emitter, scene, point => point, fronts);
    const count = kind === 'formation' ? emitter.memberCount : kind === 'salvo' ? emitter.roundCount : 1;
    assert.equal(fronts.length, count, kind);
    assert.equal(new Set(fronts.map(front => front.group)).size, count, kind);
    assert.ok(fronts.every(front => !front.spacingSeconds), kind);
  }
});

test('the hobby front remains readable at the shortened-playback start and advances at the modeled sound speed', () => {
  const scene = defaultScene();
  const emitter = scene.emitters[0];
  macrosFor(emitter).find(macro => macro.label === 'Category').write(emitter, 0);
  const fronts = [];
  KIND_PANELS.jet.wavefrontSources(emitter, scene, point => point, fronts);
  const [front] = fronts;
  const profile = localProfile(soundSpeedProfile(scene.air), front.point.z);
  const early = wavefront(profile, front.point, 1);
  const later = wavefront(profile, front.point, 7.414);
  assert.ok(Math.abs(early.radiusMetres - 340.2) < 1);
  assert.ok(later.radiusMetres > 2500 && later.radiusMetres < 2600);
  const style = createFrontStyle('geometry');
  assert.equal(style.strength(undefined, early.radiusMetres, undefined, scene.air), 1);
  assert.equal(style.strength(undefined, later.radiusMetres, undefined, scene.air), 1);
});

test('a supersonic hobby source retains its whole geometric cone regardless of source power', () => {
  const scene = defaultScene();
  const emitter = scene.emitters[0];
  macrosFor(emitter).find(macro => macro.label === 'Category').write(emitter, 0);
  emitter.mach = 1.1;
  const kind = KIND_PANELS.jet;
  const [path] = kind.tracks(emitter, scene);
  const cone = kind.cone(path, 5, soundSpeedProfile(scene.air));
  assert.ok(cone && cone.rings.length > 1);
  const style = createFrontStyle('geometry');
  const strengths = cone.radii.map(radius => style.strength(undefined, radius, undefined, scene.air));
  assert.ok(strengths.every(strength => strength === 1));
});
