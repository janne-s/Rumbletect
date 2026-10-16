export const SAMPLE_RATE_HZ = 48000;

export const GAMMA_AIR = 1.4;
export const GAS_CONSTANT_AIR_J_PER_KG_KELVIN = 287.05;
export const KELVIN_OFFSET = 273.15;
export const REFERENCE_SOUND_PRESSURE_PA = 20e-6;

export const JET = Object.freeze({
  /** Class B: Tam, Golebiowski & Seiner 1996, eqs. 2 and 7–10, dB per 1 Hz scaled to r = D_j (their figures plot 100 D_j, 40 dB lower); M_j 1.37–2.0, T_r/T∞ 0.98–4.89. */
  large: Object.freeze({
    base: 75,
    temperature: 46,
    temperatureExponent: .3,
    velocityExponent: Object.freeze([10.06, -.495]),
    referenceAngleDegrees: 160
  }),
  fine: Object.freeze({
    base: 83.2,
    temperature: 19.3,
    temperatureExponent: .62,
    velocityExponent: Object.freeze([6.4, 1.2, 1.4]),
    referenceAngleDegrees: 90
  }),
  /** Class B: Tam 1996 fig. 6 (M_j 1.8, cold), read from the figure. */
  largePlateauStartDegrees: 144,
  largeRiseDecibelsPerDegree: .85,
  /** Class C: beyond the data, the fall of Khavaran & Bridges 2009 fig. 2.1 from 160° to 165°. */
  largeAftFallDecibelsPerDegree: .4,
  /** Class B: Tam 1996 fig. 7 (M_j 2.24, cold), 60–140°. */
  fineRiseDecibelsPerDegree: .11,
  /**
   * f·D_j/V_e. Class B: full-scale F-35AA and F-22A at military power peak in third octaves near 200 Hz aft and
   * 0.9–1 kHz sideways (Gee, Neilsen & Wall 2013, Acoustics Today, fig. 11), St 0.1–0.3 aft; the values are
   * fitted to those peaks for the default jet (class C). Tam 1996 fig. 10 gives half of it for laboratory jets.
   */
  largePeakStrouhal: .19,
  finePeakStrouhal: .45,
  /** Class B: pressure skewness 0.15–0.4 made at the source, F-35AA at military power (Gee, Neilsen & Wall 2013, fig. 10). */
  largeScaleSkewness: .3,
  /** Class C: intermittent wavepackets; with the path's scintillation a render's kurtosis meets the recordings' 4–7. */
  largeScaleKurtosis: 4,
  packetCycles: 4
});

export const FLIGHT = Object.freeze({
  /** Class B: Stone, Krejsa & Clark 2003, eqs. 2, 2a, 2d; n_c their initial 0.62. */
  convectionRatio: .62,
  convectionSpread: .04,
  convectionDecibels: 15
});

export const SYNTHESIS = Object.freeze({
  frameSamples: 4096,
  bandLimitShare: .45,
  delayGridSamples: 64
});

export const GROUND = Object.freeze({
  /** Class B: mean of each FHWA TNM ground-type range (Embleton, Piercy & Daigle 1983), kPa·s/m², as in Boomtect. */
  flowResistivity: Object.freeze({
    snow: 20,
    forestFloor: 50,
    grass: 212.5,
    soil: 278,
    stonyGround: 550
  }),
  /** Class C, as in Boomtect. */
  roughnessMetres: .05
});

export const TURBULENCE = Object.freeze({
  /** Class C, Boomtect's defaults. */
  strength: 1e-6,
  scaleMetres: 1.1
});

/**
 * Class C: slow level fluctuation fitted so that the 0.2–2 s fluctuation of a render matches the reference
 * recordings, about 2.3 dB with an inter-band correlation of 0.5–0.75, and its kurtosis theirs
 * (`reviews/2026-10-15-jet-sound-diagnosis.md`).
 */
export const SCINTILLATION = Object.freeze({
  decibels: 3.5,
  bandShare: .45,
  seconds: .2,
  bandsHz: Object.freeze([31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000])
});
