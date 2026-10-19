import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultScene } from '../src/domain/scene.js';
import { ADD_EMITTERS, KIND_PANELS } from '../src/ui/kinds.js';
import { macrosFor } from '../src/ui/macros.js';
import { createFrontStyle } from '../src/shared/ui/front-style.js';
import { frontProfile, localProfile, soundSpeedProfile, wavefront } from '../src/shared/domain/refraction.js';
import { outsideSphereIntervals, outerSpheres, sampleEnvelopeSources } from '../src/shared/ui/wavefront-envelope.js';
import { cachedSoundTracks } from '../src/ui/geometry-cache.js';
import { rocketGrains } from '../src/domain/rocket-grains.js';

test('the reported high rocket profile joins across 89 km without the old cone step', () => {
  const scene = defaultScene('rocket');
  const rocket = scene.emitters[0];
  Object.assign(rocket, { propellant: 'solid', headingDegrees: 92, launchDegrees: 17 });
  rocket.engine = { engines: 1, thrustKilonewtons: .038, exitVelocityMetresPerSecond: 2500, exitDiameterMetres: .0037, efficiencyPercent: .3 };
  rocket.ascent = { ...rocket.ascent, liftoffMassTonnes: .000117, burnSeconds: 106 };
  const [path] = cachedSoundTracks(rocket, scene);
  const sources = [];
  KIND_PANELS.rocket.wavefrontSources(rocket, scene, point => point, sources);
  const profile = soundSpeedProfile(scene.air);
  const now = 147.456;
  const spheres = outerSpheres(sampleEnvelopeSources(sources, now).map(({ point, emitted, group }) => ({ ...wavefront(frontProfile(profile, point.z), point, now - emitted), group })));
  const cone = KIND_PANELS.rocket.cone(path, now, profile, rocket, scene, 0);
  const centres = cone.rings.map(ring => ({ ring, x: ring.reduce((sum, point) => sum + point.x, 0) / ring.length, z: ring.reduce((sum, point) => sum + point.z, 0) / ring.length }));
  const boundary = centres.filter(centre => centre.x > 80000 && centre.x < 110000);
  assert.equal(boundary.length, 2);
  assert.ok(Math.abs(boundary[0].z - boundary[1].z) < 5000);
  for (const { ring } of boundary) ring.forEach((point, index) => assert.deepEqual(outsideSphereIntervals(point, ring[(index + 1) % ring.length], spheres, 0, 1, Math.cos(Math.PI / 32)), [[0, 1]]));
  const flying = KIND_PANELS.rocket.cone(path, 40, profile, rocket, scene, 0);
  const at = Math.round(40 / path.step);
  assert.deepEqual(flying.apex, { x: path.x[at], y: path.y[at], z: path.z[at] });
});

test('emission histories retain one envelope group per aircraft, rocket, or eruption', () => {
  for (const [kind, { create, mode }] of Object.entries(ADD_EMITTERS)) {
    const scene = defaultScene(mode);
    const emitter = create();
    const fronts = [];
    KIND_PANELS[kind].wavefrontSources(emitter, scene, point => point, fronts);
    const count = kind === 'formation' ? emitter.memberCount : kind === 'salvo' ? emitter.roundCount : 1;
    assert.equal(new Set(fronts.map(front => front.group)).size, count, kind);
    assert.ok(kind === 'volcano' ? fronts.length === 1 : fronts.length > count, kind);
    assert.ok(fronts.every(front => !front.spacingSeconds), kind);
  }
});

test('a supersonic source reaches the microphone through its later emission envelope', () => {
  const scene = defaultScene();
  scene.air = { ...scene.air, refraction: false };
  const emitter = scene.emitters[0];
  emitter.mach = 2;
  emitter.startMetres = { x: -2000, y: 0, z: 300 };
  emitter.durationSeconds = 8;
  const microphone = { x: 0, y: 300, z: 1.7 };
  const candidates = [];
  KIND_PANELS.jet.wavefrontSources(emitter, scene, point => point, candidates);
  const profile = soundSpeedProfile(scene.air);
  const arrival = Math.min(...candidates.map(source => source.emitted + Math.hypot(source.point.x - microphone.x, source.point.y - microphone.y, source.point.z - microphone.z) / profile.groundSpeed));
  const spheres = outerSpheres(sampleEnvelopeSources(candidates, arrival + .01).map(source => ({ group: source.group, ...wavefront(profile, source.point, arrival + .01 - source.emitted) })));
  assert.ok(spheres.some(({ centre, radiusMetres }) => Math.hypot(centre.x - microphone.x, centre.y - microphone.y, centre.z - microphone.z) <= radiusMetres));
  assert.ok(Math.hypot(emitter.startMetres.x, microphone.y, emitter.startMetres.z - microphone.z) > profile.groundSpeed * (arrival + .01));
});

test('rocket envelope origins follow the acoustic plume positions used by its grains', () => {
  const scene = defaultScene('rocket');
  const rocket = scene.emitters[0];
  rocket.ascent = { ...rocket.ascent, burnSeconds: 8 };
  rocket.launchDegrees = 45;
  const [path] = cachedSoundTracks(rocket, scene);
  const { rows } = rocketGrains(rocket, scene);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    const position = (row.emissionSeconds + row.durationSeconds - path.seconds[0]) / path.step;
    const index = Math.min(path.seconds.length - 2, Math.floor(position));
    const share = position - index;
    const coordinate = axis => path[axis][index] + share * (path[axis][index + 1] - path[axis][index]);
    const error = Math.hypot(coordinate('x') - row.positionMetres.x, coordinate('y') - row.positionMetres.y, coordinate('z') - row.positionMetres.z);
    assert.ok(error < .05, `source-position error ${error} m`);
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
