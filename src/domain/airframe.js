import { AIRFRAME, GAS_CONSTANT_AIR_J_PER_KG_KELVIN as GAS_CONSTANT_AIR, KELVIN_OFFSET } from './constants.js';
import { speedOfSoundMetresPerSecond as speedOfSound } from '../shared/domain/air.js';

const SEA_LEVEL_PASCALS = 101325;
const PER_THIRD_OCTAVE = Math.log(10) / 10;
const radians = degrees => degrees * Math.PI / 180;

const sutherlandViscosity = kelvin => 1.458e-6 * kelvin ** 1.5 / (kelvin + 110.4);

const peaked = (scale, exponent) => strouhal => .613 * (scale * strouhal) ** 4 * ((scale * strouhal) ** exponent + .5) ** -4;

const SPECTRA = Object.freeze({
  trailingEdge: peaked(10, 1.5),
  slat: peaked(2.19, 1.5),
  flap: strouhal => (strouhal < 2 ? .0480 * strouhal : strouhal <= 20 ? .1406 * strouhal ** -.55 : 216.49 * strouhal ** -3),
  tripleFlap: strouhal => (strouhal < 2 ? .0257 * strouhal : strouhal <= 75 ? .0536 * strouhal ** -.0625 : 17078 * strouhal ** -3),
  twoWheels: strouhal => 13.59 * strouhal ** 2 * (12.5 + strouhal ** 2) ** -2.25,
  twoWheelStrut: strouhal => 5.325 * strouhal ** 2 * (30 + strouhal ** 8) ** -1,
  fourWheels: strouhal => .0577 * strouhal ** 2 * (1 + .25 * strouhal ** 2) ** -1.5,
  fourWheelStrut: strouhal => 1.280 * strouhal ** 3 * (1.06 + strouhal ** 2) ** -3
});

const DIRECTIVITY = Object.freeze({
  lift: (theta, phi) => 4 * Math.cos(phi) ** 2 * Math.cos(theta / 2) ** 2,
  side: (theta, phi) => 4 * Math.sin(phi) ** 2 * Math.cos(theta / 2) ** 2,
  wheels: theta => 1.5 * Math.sin(theta) ** 2,
  strut: (theta, phi) => 3 * Math.sin(theta) ** 2 * Math.sin(phi) ** 2,
  flap: deflection => (theta, phi) => 3 * (Math.sin(deflection) * Math.cos(theta) + Math.cos(deflection) * Math.sin(theta) * Math.cos(phi)) ** 2
});

/** Fink's dimensionless turbulent boundary-layer thickness at the trailing edge of a surface, re its span (ANOPP eq. 5). */
function boundaryLayer({ areaSquareMetres: area, spanMetres: span }, density, speed, viscosity) {
  return .37 * area / span ** 2 * (density * speed * area / (viscosity * span)) ** -.2;
}

function surfaces(airframe, mach, density, speed, viscosity, deployed) {
  const { wing, horizontalTail, verticalTail } = airframe;
  const constant = AIRFRAME.trailingEdgeConstant[deployed || !airframe.cleanWing ? 'conventional' : 'clean'];
  const wingSpan = wing.spanMetres;
  return [[wing, DIRECTIVITY.lift], [horizontalTail, DIRECTIVITY.lift], [verticalTail, DIRECTIVITY.side]].map(([surface, directivity]) => {
    const thickness = boundaryLayer(surface, density, speed, viscosity);
    return { power: constant * mach ** 5 * thickness * (surface.spanMetres / wingSpan) ** 2, lengthMetres: thickness * surface.spanMetres, spectrum: SPECTRA.trailingEdge, directivity };
  });
}

function highLift(airframe, mach, density, speed, viscosity) {
  const { wing, flaps } = airframe;
  const parts = [];
  if (airframe.slats) {
    const thickness = boundaryLayer(wing, density, speed, viscosity);
    const power = AIRFRAME.trailingEdgeConstant.conventional * mach ** 5 * thickness;
    for (const spectrum of [SPECTRA.trailingEdge, SPECTRA.slat]) parts.push({ power, lengthMetres: thickness * wing.spanMetres, spectrum, directivity: DIRECTIVITY.lift });
  }
  const deflection = radians(flaps.landingDegrees);
  const triple = flaps.slots >= 3;
  parts.push({
    power: AIRFRAME.flapConstant[triple ? 'triple' : 'slotted'] * mach ** 6 * flaps.areaSquareMetres / wing.spanMetres ** 2 * Math.sin(deflection) ** 2,
    lengthMetres: flaps.areaSquareMetres / flaps.spanMetres,
    spectrum: triple ? SPECTRA.tripleFlap : SPECTRA.flap,
    directivity: DIRECTIVITY.flap(deflection)
  });
  return parts;
}

function gear({ count, wheels, tyreMetres, strutMetres }, mach, wingSpan) {
  const many = wheels > 2;
  const size = (tyreMetres / wingSpan) ** 2;
  return Array.from({ length: count }, () => [
    { power: AIRFRAME.wheelConstant[many ? 'four' : 'two'] * mach ** 6 * wheels * size, lengthMetres: tyreMetres, spectrum: many ? SPECTRA.fourWheels : SPECTRA.twoWheels, directivity: DIRECTIVITY.wheels },
    { power: AIRFRAME.strutConstant * mach ** 6 * size * strutMetres / tyreMetres, lengthMetres: tyreMetres, spectrum: many ? SPECTRA.fourWheelStrut : SPECTRA.twoWheelStrut, directivity: DIRECTIVITY.strut }
  ]).flat();
}

/**
 * Class B: Fink's airframe noise (FAA-RD-77-29, 1977) as ANOPP gives it (Zorumski 1982, NASA TM-83199 part 2, section 8.8):
 * the wing's and tails' trailing edges always, and with `deployed` the slats, the trailing-edge flaps at their landing
 * deflection and the landing gear. Null for an airframe of none.
 */
export function airframeAt(airframe, { speedMetresPerSecond: speed, temperatureCelsius, deployed }) {
  if (!airframe || !(speed > 0)) return null;
  const kelvin = temperatureCelsius + KELVIN_OFFSET;
  const density = SEA_LEVEL_PASCALS / (GAS_CONSTANT_AIR * kelvin);
  const sound = speedOfSound(temperatureCelsius);
  const viscosity = sutherlandViscosity(kelvin);
  const mach = speed / sound;
  const parts = surfaces(airframe, mach, density, speed, viscosity, deployed);
  if (deployed) parts.push(...highLift(airframe, mach, density, speed, viscosity), ...gear(airframe.mainGear, mach, airframe.wing.spanMetres), ...gear(airframe.noseGear, mach, airframe.wing.spanMetres));
  return { mach, speed, scalePa2: (density * sound ** 2) ** 2 * airframe.wing.spanMetres ** 2 / (4 * Math.PI), parts };
}

/**
 * Adds the airframe toward `polarDegrees` from the flight direction and `azimuthDegrees` round it from straight below to
 * a PSD at 1 m on evenly spaced bins, in the source's frame: frequencies are emitted ones, and of Fink's convective
 * (1 − M cos θ)⁻⁴ the grain brings one power, so three are added here.
 */
export function addAirframe(psd, frequencies, state, polarDegrees, azimuthDegrees = 0) {
  if (!state) return psd;
  const [theta, phi] = [radians(polarDegrees), radians(azimuthDegrees)];
  const convection = Math.max(AIRFRAME.smallestConvection, 1 - state.mach * Math.cos(theta)) ** -3;
  for (const part of state.parts) {
    const level = state.scalePa2 * part.power * part.directivity(theta, phi) * convection / PER_THIRD_OCTAVE;
    if (!(level > 0)) continue;
    for (let bin = 1; bin < psd.length; bin += 1) psd[bin] += level * part.spectrum(frequencies[bin] * part.lengthMetres / state.speed) / frequencies[bin];
  }
  return psd;
}
