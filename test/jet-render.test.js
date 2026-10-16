import test from 'node:test';
import assert from 'node:assert/strict';
import { jetPath, pathTrajectory, renderReceiver } from '../src/domain/jet-render.js';
import { defaultScene } from '../src/domain/scene.js';
import { speedOfSoundMetresPerSecond } from '../src/domain/air.js';

const shortScene = () => {
  const scene = defaultScene();
  Object.assign(scene.emitters[0], { durationSeconds: 3, startMetres: { x: -200, y: 0, z: 150 } });
  return scene;
};

test('a flight path as a trajectory gives its samples back and interpolates between them', () => {
  const scene = shortScene();
  const path = jetPath(scene.emitters[0], scene.air);
  const trajectory = pathTrajectory(path);
  const index = 17;
  const at = trajectory.positionAt(index * path.step);
  assert.ok(Math.abs(at.east - path.x[index]) < 1e-9 && Math.abs(at.up - path.z[index]) < 1e-9);
  const half = trajectory.positionAt((index + .5) * path.step);
  assert.ok(Math.abs(half.east - (path.x[index] + path.x[index + 1]) / 2) < 1e-9);
  assert.ok(Math.abs(trajectory.velocityAt(0).east - path.vx[0]) < 1e-9);
});

test('a microphone hears the jet from its first arrival, in every ambisonic channel, finite', () => {
  const scene = shortScene();
  scene.emitters[0].startSeconds = 2;
  const result = renderReceiver(scene, 0);
  const first = Math.hypot(200, 150 - 1.7) / speedOfSoundMetresPerSecond(15);
  assert.ok(Math.abs(result.startSeconds - (2 + first)) < 1e-9, `${result.startSeconds}`);
  assert.equal(result.channels.length, (scene.render.ambisonicOrder + 1) ** 2);
  assert.ok(result.channels.every(channel => channel.length === result.samples.length && channel.every(Number.isFinite)));
  assert.ok(result.peakPa > 0);
  assert.ok(result.arrivals.count > 0 && result.arrivals.seconds.every(Number.isFinite));
});

test('the same scene renders the same sound', () => {
  const scene = shortScene();
  assert.deepEqual(renderReceiver(scene, 0).samples, renderReceiver(scene, 0).samples);
});
