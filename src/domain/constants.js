export * from '../shared/domain/constants.js';

export const APP_VERSION = '0.1.0';

export const MODEL_VERSION = '0.1.0';

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

export const JET_FLIGHT = Object.freeze({
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

export const TURBULENCE = Object.freeze({
  /** Class C, Boomtect's defaults. */
  strength: 1e-6,
  scaleMetres: 1.1
});

export const ENGINE = Object.freeze({
  /** Class B: hot exhaust gas, γ and c_p of combustion products. */
  gasGamma: 1.33,
  gasHeatCapacityJoulesPerKilogramKelvin: 1150,
  /**
   * Class C: assumed settings of a single-engine fighter. The nozzle is about 1 m across and changes with power
   * (F-35, Gee, Neilsen & Wall 2013); afterburning gas reaches about 2 100 K (F404-GE-400 exhaust survey, NASA, NTRS 19880010923).
   */
  settings: Object.freeze([
    Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.3, totalTemperatureKelvin: 550, diameterMetres: .8 }),
    Object.freeze({ power: .75, label: 'Military', pressureRatio: 3.5, totalTemperatureKelvin: 750, diameterMetres: .9 }),
    Object.freeze({ power: 1, label: 'Afterburner', pressureRatio: 4, totalTemperatureKelvin: 1900, diameterMetres: 1.05 })
  ])
});
