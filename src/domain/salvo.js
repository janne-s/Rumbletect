import { ROCKET } from './constants.js';
import { createRandom, normalDeviate } from '../shared/domain/random.js';

const LAUNCH_RANGE = Object.freeze([5, 90]);
const LAYOUT_KEYS = Object.freeze(Object.keys(ROCKET.salvoLayout));

/**
 * Class C: a salvo's rounds laid out as Boomtect's barrage, each round its rocket with its own seed, launch time,
 * place within the launcher radius, heading, launch angle and thrust. Any other rocket is its only round.
 */
export function salvoRounds(rocket) {
  if (rocket.kind !== 'salvo') return [rocket];
  const plain = Object.fromEntries(Object.entries(rocket).filter(([key]) => !LAYOUT_KEYS.includes(key)));
  const random = createRandom(rocket.seed);
  const salvos = Math.ceil(rocket.roundCount / rocket.salvoSize);
  const interval = salvos > 1 ? rocket.salvoSeconds / (salvos - 1) : 0;
  const thrustSigma = rocket.thrustSpreadPercent / 100;
  const rounds = [];
  for (let group = 0; group < salvos; group += 1) {
    const groupSeconds = Math.max(0, group * interval + (random() - .5) * 2 * ROCKET.salvoJitter * interval);
    const count = Math.min(rocket.salvoSize, rocket.roundCount - rounds.length);
    for (let round = 0; round < count; round += 1) {
      const radius = rocket.launcherRadiusMetres * Math.sqrt(random());
      const angle = 2 * Math.PI * random();
      const heading = rocket.headingDegrees + rocket.headingSpreadDegrees * normalDeviate(random);
      const launch = rocket.launchDegrees + rocket.launchSpreadDegrees * normalDeviate(random);
      const thrust = Math.exp(thrustSigma * normalDeviate(random) - thrustSigma ** 2 / 2);
      rounds.push({
        ...plain,
        kind: 'rocket',
        id: `${rocket.id}:${rounds.length}`,
        seed: Math.floor(random() * 0x100000000),
        startSeconds: rocket.startSeconds + groupSeconds + random() * rocket.salvoSpreadSeconds,
        startMetres: { x: rocket.startMetres.x + radius * Math.cos(angle), y: rocket.startMetres.y + radius * Math.sin(angle), z: rocket.startMetres.z },
        headingDegrees: ((heading % 360) + 360) % 360,
        launchDegrees: Math.min(LAUNCH_RANGE[1], Math.max(LAUNCH_RANGE[0], launch)),
        engine: { ...rocket.engine, thrustKilonewtons: rocket.engine.thrustKilonewtons * thrust }
      });
    }
  }
  return rounds.sort((a, b) => a.startSeconds - b.startSeconds);
}
