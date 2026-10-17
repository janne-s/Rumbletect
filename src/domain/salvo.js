import { ROCKET } from './constants.js';
import { createRandom, normalDeviate } from '../shared/domain/random.js';

const LAUNCH_RANGE = Object.freeze([5, 90]);

/**
 * Class C: a rocket's salvo laid out as Boomtect's barrage, each round the rocket with its own seed, launch time,
 * place within the launcher radius, heading, launch angle and thrust. One round is the rocket itself.
 */
export function salvoRounds(rocket) {
  const { salvo } = rocket;
  if (salvo.rounds <= 1) return [rocket];
  const random = createRandom(rocket.seed);
  const salvos = Math.ceil(salvo.rounds / salvo.salvoSize);
  const interval = salvos > 1 ? salvo.salvoSeconds / (salvos - 1) : 0;
  const thrustSigma = salvo.thrustSpreadPercent / 100;
  const rounds = [];
  for (let group = 0; group < salvos; group += 1) {
    const groupSeconds = Math.max(0, group * interval + (random() - .5) * 2 * ROCKET.salvoJitter * interval);
    const count = Math.min(salvo.salvoSize, salvo.rounds - rounds.length);
    for (let round = 0; round < count; round += 1) {
      const radius = salvo.launcherRadiusMetres * Math.sqrt(random());
      const angle = 2 * Math.PI * random();
      const heading = rocket.headingDegrees + salvo.headingSpreadDegrees * normalDeviate(random);
      const launch = rocket.launchDegrees + salvo.launchSpreadDegrees * normalDeviate(random);
      const thrust = Math.exp(thrustSigma * normalDeviate(random) - thrustSigma ** 2 / 2);
      rounds.push({
        ...rocket,
        id: `${rocket.id}:${rounds.length}`,
        seed: Math.floor(random() * 0x100000000),
        startSeconds: rocket.startSeconds + groupSeconds + random() * salvo.salvoSpreadSeconds,
        startMetres: { x: rocket.startMetres.x + radius * Math.cos(angle), y: rocket.startMetres.y + radius * Math.sin(angle), z: rocket.startMetres.z },
        headingDegrees: ((heading % 360) + 360) % 360,
        launchDegrees: Math.min(LAUNCH_RANGE[1], Math.max(LAUNCH_RANGE[0], launch)),
        engine: { ...rocket.engine, thrustKilonewtons: rocket.engine.thrustKilonewtons * thrust },
        salvo: { ...salvo, rounds: 1 }
      });
    }
  }
  return rounds.sort((a, b) => a.startSeconds - b.startSeconds);
}
