/** ENU metres; the heading is compass degrees clockwise from north, level flight. */
export function straightTrajectory({ startMetres, headingDegrees, speedMetresPerSecond }) {
  const heading = headingDegrees * Math.PI / 180;
  const velocity = { east: speedMetresPerSecond * Math.sin(heading), north: speedMetresPerSecond * Math.cos(heading), up: 0 };
  return {
    positionAt: seconds => ({
      east: startMetres.east + velocity.east * seconds,
      north: startMetres.north + velocity.north * seconds,
      up: startMetres.up + velocity.up * seconds
    }),
    velocityAt: () => velocity
  };
}

export const difference = (a, b) => ({ east: a.east - b.east, north: a.north - b.north, up: a.up - b.up });
export const length = v => Math.hypot(v.east, v.north, v.up);
export const dot = (a, b) => a.east * b.east + a.north * b.north + a.up * b.up;
