import { VIEW } from '../domain/constants.js';
import { cachedTracks } from './geometry-cache.js';

export function kindViews() {
  const jet = {
    handles(emitter, box) {
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
  const volcano = {
    ...jet,
    handles: emitter => [{ type: 'emitter', id: emitter.id, field: 'ventMetres', point: emitter.ventMetres, role: 'start' }],
    selectedPoints: emitter => [emitter.ventMetres],
    label: emitter => emitter.ventMetres,
    extent(emitter, { includeExtent, scene }) {
      const paths = cachedTracks(emitter, scene);
      includeExtent(paths, () => [emitter.ventMetres, { ...emitter.ventMetres, z: emitter.ventMetres.z + 5 * emitter.jet.ventDiameterMetres }]);
    },
    draw(context, emitter, { frame }, { colors, selected }) {
      const vent = frame.project(emitter.ventMetres);
      const top = frame.project({ ...emitter.ventMetres, z: emitter.ventMetres.z + 5 * emitter.jet.ventDiameterMetres });
      context.strokeStyle = selected ? colors.accent : colors.end;
      context.lineWidth = selected ? 2.4 : 2;
      context.beginPath(); context.moveTo(vent.x, vent.y); context.lineTo(top.x, top.y); context.stroke();
    }
  };
  return { jet, rocket, volcano };
}
