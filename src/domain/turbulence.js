/** Class B: Clifford & Lataitis 1983, via Salomons 2001; to verify. */
export function turbulentPhaseVariance(frequencyHz, metres, sourceHeight, receiverHeight, air, speed) {
  if (!(air.turbulenceStrength > 0)) return 0;
  const k = 2 * Math.PI * frequencyHz / speed;
  const scale = air.turbulenceScaleMetres;
  const factor = metres > k * scale * scale ? .5 : 1;
  const variance = factor * Math.sqrt(Math.PI) * air.turbulenceStrength * k * k * metres * scale;
  const separation = sourceHeight + receiverHeight > 0 ? 2 * sourceHeight * receiverHeight / (sourceHeight + receiverHeight) : 0;
  const shared = separation > 0 ? Math.sqrt(Math.PI) / 2 * (scale / separation) * erf(separation / scale) : 1;
  return 2 * variance * Math.max(0, 1 - shared);
}

/** Abramowitz & Stegun 7.1.26, |error| < 1.5e-7. */
function erf(x) {
  const t = 1 / (1 + .3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
