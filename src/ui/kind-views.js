import { TRACK_MARKS, VIEW } from '../domain/constants.js';
import { cachedTracks, currentSurface } from './geometry-cache.js';
import { craterPosition, volcanoSourcePosition } from '../domain/volcano.js';
import { supersonicIndex } from './kinds.js';

const VOLCANO_VIEW = Object.freeze({ topWidthShare: 2, fillAlpha: .18, sourceRadiusPixels: 3.5 });

const pointOf = (path, index) => ({ x: path.x[index], y: path.y[index], z: path.z[index] });

/** A short tick across the drawn path at the sample where it reaches the speed of sound. */
function drawSoundBarrier(context, path, frame, air) {
  const index = supersonicIndex(path, air);
  if (index <= 0) return;
  const p = frame.project(pointOf(path, index));
  const q = frame.project(pointOf(path, Math.min(path.x.length - 1, index + 1)));
  const o = frame.project(pointOf(path, index - 1));
  const [dx, dy] = [q.x - o.x, q.y - o.y];
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return;
  const [nx, ny] = [-dy / length * TRACK_MARKS.barrierPixels, dx / length * TRACK_MARKS.barrierPixels];
  context.beginPath(); context.moveTo(p.x - nx, p.y - ny); context.lineTo(p.x + nx, p.y + ny); context.stroke();
}

/** Small rings where a turn starts and ends: a rocket's along the distance flown, a jet's along its flight time. */
function drawTurn(context, path, frame) {
  const indices = path.turnMetres ? path.turnMetres.map(metres => path.flownMetres.findIndex(flown => flown >= metres))
    : (path.turnSeconds ?? []).map(seconds => Math.round(seconds / path.step));
  for (const index of indices) {
    if (index < 0 || index >= path.x.length) continue;
    const p = frame.project(pointOf(path, index));
    context.beginPath(); context.arc(p.x, p.y, TRACK_MARKS.turnRadius, 0, 2 * Math.PI); context.stroke();
  }
}

export function kindViews() {
  const jet = {
    handles(emitter, box) {
      if (emitter.follows) return [];
      const start = emitter.startMetres;
      const reach = box ? Math.max(box.x1 - box.x0, box.y1 - box.y0) * VIEW.box.facingLengthShare : 1000;
      const heading = emitter.headingDegrees * Math.PI / 180;
      return [
        { type: 'emitter', id: emitter.id, field: 'startMetres', point: start, role: 'start' },
        { type: 'emitter', id: emitter.id, field: 'flightHeading', point: { x: start.x + reach * Math.sin(heading), y: start.y + reach * Math.cos(heading), z: start.z }, role: 'end', ownPlaneOnly: true }
      ];
    },
    extent(emitter, { includeExtent, scene }) {
      const paths = cachedTracks(emitter, scene);
      includeExtent(paths, () => paths.flatMap(path => [...path.x.map((x, index) => ({ x, y: path.y[index], z: path.z[index] })).filter((_, index) => index % 10 === 0), { x: path.x.at(-1), y: path.y.at(-1), z: path.z.at(-1) }]));
    },
    shadowPoints: () => [],
    selectedPoints: emitter => [emitter.startMetres],
    label: emitter => emitter.startMetres,
    draw(context, emitter, { frame, scene }, { colors, selected, state }) {
      context.strokeStyle = selected ? colors.accent : colors.end;
      context.lineWidth = selected ? 1.4 : 1.2;
      for (const path of cachedTracks(emitter, scene)) {
        context.beginPath();
        for (let index = 0; index < path.x.length; index += 1) {
          const p = frame.project({ x: path.x[index], y: path.y[index], z: path.z[index] });
          if (index === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
        }
        context.stroke();
        drawSoundBarrier(context, path, frame, scene.air);
        if (emitter.ascent?.bendDegrees ?? emitter.bendDegrees) drawTurn(context, path, frame);
      }
      for (const body of state?.flights?.get(emitter.id) ?? []) {
        const p = frame.project(body);
        context.fillStyle = colors.flash;
        context.shadowColor = colors.glow;
        context.shadowBlur = 12;
        context.beginPath(); context.arc(p.x, p.y, 5, 0, 2 * Math.PI); context.fill();
        context.shadowBlur = 0;
      }
    }
  };
  const rocket = {
    ...jet,
    handles(emitter, box) {
      const pad = emitter.startMetres;
      const reach = box ? Math.max(box.x1 - box.x0, box.y1 - box.y0) * VIEW.box.facingLengthShare : 1000;
      const heading = emitter.headingDegrees * Math.PI / 180;
      return [
        { type: 'emitter', id: emitter.id, field: 'startMetres', point: pad, role: 'start' },
        { type: 'emitter', id: emitter.id, field: 'flightHeading', point: { x: pad.x + reach * Math.sin(heading), y: pad.y + reach * Math.cos(heading), z: pad.z }, role: 'end', ownPlaneOnly: true }
      ];
    }
  };
  const crater = emitter => craterPosition(emitter, currentSurface());
  const volcano = {
    ...jet,
    handles: emitter => [{ type: 'emitter', id: emitter.id, field: 'ventMetres', point: crater(emitter), role: 'start' }],
    shadowPoints: emitter => [crater(emitter)],
    selectedPoints: emitter => [crater(emitter)],
    label: emitter => crater(emitter),
    extent(emitter, { includeExtent, scene }) {
      const paths = cachedTracks(emitter, scene);
      includeExtent(paths, () => [crater(emitter), volcanoSourcePosition(emitter, crater(emitter))]);
    },
    draw(context, emitter, { frame }, { colors, selected }) {
      const base = crater(emitter);
      const source = volcanoSourcePosition(emitter, base);
      const bottom = frame.project(base);
      const top = frame.project(source);
      const length = Math.hypot(top.x - bottom.x, top.y - bottom.y);
      const colour = selected ? colors.accent : colors.end;
      if (length > 0) {
        const near = length / (source.z - base.z) * emitter.jet.ventDiameterMetres / 2;
        const far = near * VOLCANO_VIEW.topWidthShare;
        const [nx, ny] = [-(top.y - bottom.y) / length, (top.x - bottom.x) / length];
        context.beginPath();
        context.moveTo(bottom.x - nx * near, bottom.y - ny * near);
        context.lineTo(top.x - nx * far, top.y - ny * far);
        context.lineTo(top.x + nx * far, top.y + ny * far);
        context.lineTo(bottom.x + nx * near, bottom.y + ny * near);
        context.closePath();
        context.globalAlpha = VOLCANO_VIEW.fillAlpha;
        context.fillStyle = colour;
        context.fill();
        context.globalAlpha = 1;
        context.strokeStyle = colour;
        context.lineWidth = selected ? 1.4 : 1;
        context.stroke();
      }
      context.fillStyle = colour;
      context.beginPath(); context.arc(top.x, top.y, VOLCANO_VIEW.sourceRadiusPixels, 0, 2 * Math.PI); context.fill();
    }
  };
  return { jet, formation: jet, airliner: jet, rocket, salvo: rocket, volcano };
}
