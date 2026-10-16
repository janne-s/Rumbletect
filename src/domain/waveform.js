const SOLVER_STEPS = 20;

const shapedSkewness = a => (6 * a + 8 * a ** 3) / (1 + 2 * a * a) ** 1.5;
const shapedKurtosis = a => (3 + 60 * a * a + 60 * a ** 4) / (1 + 2 * a * a) ** 2;

function solveShape(skewness) {
  if (!(skewness > 0)) return 0;
  let [low, high] = [0, 1];
  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;
    if (shapedSkewness(middle) < skewness) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

/**
 * The quadratic shape `a` and the lognormal modulation depth `sigma` that give a unit Gaussian these
 * moments: z = (x + a(x² − 1))/√(1 + 2a²) times e = exp(σu − σ²) with u a unit Gaussian independent of x.
 * Skewness is Sk(z)·e^(1.5σ²) and kurtosis K(z)·e^(4σ²).
 */
export function waveformShape({ skewness, kurtosis }) {
  let a = 0;
  let sigma = 0;
  for (let step = 0; step < SOLVER_STEPS; step += 1) {
    sigma = Math.sqrt(Math.max(0, Math.log(kurtosis / shapedKurtosis(a)) / 4));
    a = solveShape(skewness / Math.exp(1.5 * sigma * sigma));
  }
  return { a, sigma };
}

/** `gaussian` of local RMS `rmsAt(sample)` turned skewed and intermittent by `envelope`, a unit Gaussian; power is kept. */
export function shapeWaveform(gaussian, rmsAt, envelope, { a, sigma }) {
  const norm = 1 / Math.sqrt(1 + 2 * a * a);
  const output = new Float64Array(gaussian.length);
  for (let index = 0; index < gaussian.length; index += 1) {
    const rms = rmsAt(index);
    if (!(rms > 0)) continue;
    const x = gaussian[index] / rms;
    output[index] = rms * norm * (x + a * (x * x - 1)) * Math.exp(sigma * envelope[index] - sigma * sigma);
  }
  return output;
}
