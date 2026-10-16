import { VIEW } from '../domain/constants.js';
import { fitCanvas, formatMetres, niceStep, palette } from './canvas.js';
import { cachedTracks, currentSurface, isTrackKind } from './geometry-cache.js';

const TERRAIN_LIGHT = (() => { const { x, y, z } = VIEW.terrain.light; const length = Math.hypot(x, y, z); return { x: x / length, y: y / length, z: z / length }; })();
const LABEL_PRIORITY = Object.freeze({ city: 0, town: 1, village: 2, peak: 3, water: 4, hamlet: 5, locality: 6 });

const extents = new WeakMap();

const ground = (x, y) => currentSurface().heightAt(x, y);
const placed = point => ({ ...point, z: ground(point.x, point.y) + point.z });

function facingTip(receiver, box) {
  const length = Math.max(box.x1 - box.x0, box.y1 - box.y0) * VIEW.box.facingLengthShare;
  const heading = receiver.headingDegrees * Math.PI / 180;
  const pitch = receiver.pitchDegrees * Math.PI / 180;
  const base = placed(receiver.positionMetres);
  const x = base.x + Math.sin(heading) * Math.cos(pitch) * length;
  const y = base.y + Math.cos(heading) * Math.cos(pitch) * length;
  return { x, y, z: Math.max(ground(x, y), base.z + Math.sin(pitch) * length) };
}

function handles(scene, box) {
  const list = [];
  for (const emitter of scene.emitters) {
    if (!isTrackKind(emitter)) continue;
    const start = emitter.startMetres;
    list.push({ type: 'emitter', id: emitter.id, field: 'startMetres', point: start, role: 'start' });
    const reach = box ? Math.max(box.x1 - box.x0, box.y1 - box.y0) * VIEW.box.facingLengthShare : 1000;
    const heading = emitter.headingDegrees * Math.PI / 180;
    list.push({ type: 'emitter', id: emitter.id, field: 'flightHeading', point: { x: start.x + reach * Math.sin(heading), y: start.y + reach * Math.cos(heading), z: start.z }, role: 'end', ownPlaneOnly: true });
  }
  for (const receiver of scene.receivers) {
    list.push({ type: 'receiver', id: receiver.id, field: 'positionMetres', point: placed(receiver.positionMetres), role: 'receiver', listening: receiver.listen });
    if (receiver.type === 'binaural' && box) {
      list.push({ type: 'receiver', id: receiver.id, field: 'headingDegrees', point: facingTip(receiver, box), role: 'facing', ownPlaneOnly: true, listening: receiver.listen });
    }
  }
  return list;
}

export function createCubeView(canvas, { onSelect, onMove, onCommit, onView, onViewChange, focus, contours = () => false, names = () => false, map = () => false, mapTiles: loadMapTiles = () => [] }) {
  let scene = null;
  let selection = null;
  let view = { ...VIEW.box.defaultView };
  let frame = null;
  let drag = null;
  let animation = null;
  let held = false;
  let lastBox = null;
  let terrainLayer = null;
  let terrainMeshCache = null;
  let relief = null;

  function sceneBox() {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let maxZ = 0;
    const include = point => {
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      maxZ = Math.max(maxZ, point.z);
    };
    const includeExtent = (geometry, points) => {
      if (!extents.has(geometry)) {
        const extent = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, maxZ: -Infinity };
        for (const point of points()) {
          extent.minX = Math.min(extent.minX, point.x); extent.maxX = Math.max(extent.maxX, point.x);
          extent.minY = Math.min(extent.minY, point.y); extent.maxY = Math.max(extent.maxY, point.y);
          extent.maxZ = Math.max(extent.maxZ, point.z);
        }
        extents.set(geometry, extent);
      }
      const extent = extents.get(geometry);
      if (!(extent.maxX >= extent.minX)) return;
      include({ x: extent.minX, y: extent.minY, z: extent.maxZ });
      include({ x: extent.maxX, y: extent.maxY, z: extent.maxZ });
    };
    for (const emitter of scene.emitters) {
      if (isTrackKind(emitter)) {
        const paths = cachedTracks(emitter, scene.air);
        includeExtent(paths, () => {
          const points = [];
          for (const path of paths) {
            for (let index = 0; index < path.x.length; index += 10) points.push({ x: path.x[index], y: path.y[index], z: path.z[index] });
            points.push({ x: path.x.at(-1), y: path.y.at(-1), z: path.z.at(-1) });
          }
          return points;
        });
      }
    }
    scene.receivers.forEach(receiver => include(placed(receiver.positionMetres)));
    const surface = currentSurface();
    const span = VIEW.box.minimumSpanMetres;
    const pad = Math.max(span, maxX - minX, maxY - minY, maxZ) * VIEW.box.padding;
    const grow = (low, high) => {
      const half = Math.max(high - low, span) / 2 + pad;
      return [(low + high) / 2 - half, (low + high) / 2 + half];
    };
    const [x0, x1] = grow(minX, maxX);
    const [y0, y1] = grow(minY, maxY);
    let minZ = 0;
    if (!surface.flat) {
      const relief = groundRange(surface, x0, x1, y0, y1);
      minZ = Math.min(minZ, relief.low);
      maxZ = Math.max(maxZ, relief.high);
    }
    return { x0, x1, y0, y1, z0: minZ, z1: Math.max(minZ + span, maxZ) + pad };
  }

  function groundRange(surface, x0, x1, y0, y1) {
    const key = [x0, x1, y0, y1].join('|');
    if (relief?.surface === surface && relief.key === key) return relief;
    const { columns, rows, cellMetres, bounds } = surface;
    let low = Infinity;
    let high = -Infinity;
    for (let row = 0; row < rows; row += 1) {
      const y = bounds.south + (row + .5) * cellMetres;
      if (y < y0 || y > y1) continue;
      for (let column = 0; column < columns; column += 1) {
        const x = bounds.west + (column + .5) * cellMetres;
        if (x < x0 || x > x1) continue;
        const z = surface.values[row * columns + column] - surface.datumMetres;
        low = Math.min(low, z);
        high = Math.max(high, z);
      }
    }
    relief = { surface, key, low, high };
    return relief;
  }

  function computeFrame(width, height) {
    const box = held && lastBox ? lastBox : sceneBox();
    lastBox = box;
    const { yaw, pitch, zoom } = view;
    const cosYaw = Math.cos(yaw); const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch); const sinPitch = Math.sin(pitch);
    const centre = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, z: (box.z0 + box.z1) / 2 };
    const raw = point => {
      const dx = point.x - centre.x; const dy = point.y - centre.y; const dz = point.z - centre.z;
      const a = cosYaw * dx - sinYaw * dy;
      const b = sinYaw * dx + cosYaw * dy;
      return { x: a, y: dz * cosPitch + b * sinPitch, depth: b * cosPitch - dz * sinPitch };
    };
    let extentX = 0; let extentY = 0;
    for (const x of [box.x0, box.x1]) for (const y of [box.y0, box.y1]) for (const z of [box.z0, box.z1]) {
      const p = raw({ x, y, z });
      extentX = Math.max(extentX, Math.abs(p.x));
      extentY = Math.max(extentY, Math.abs(p.y));
    }
    const scale = zoom * Math.min((width / 2 - VIEW.box.marginPixels) / extentX, (height / 2 - VIEW.box.marginPixels) / extentY);
    const unit = Math.max(extentX, extentY);
    const panX = view.panU * unit;
    const panY = view.panV * unit;
    const project = point => {
      const p = raw(point);
      return { x: width / 2 + (p.x + panX) * scale, y: height / 2 - (p.y + panY) * scale, depth: p.depth };
    };
    const farX = sinYaw > 0 ? box.x1 : box.x0;
    const farY = cosYaw > 0 ? box.y1 : box.y0;
    const right = { x: cosYaw, y: -sinYaw, z: 0 };
    const up = { x: sinPitch * sinYaw, y: sinPitch * cosYaw, z: cosPitch };
    const key = [yaw, pitch, zoom, view.panU, view.panV, width, height, box.x0, box.x1, box.y0, box.y1, box.z0, box.z1].join('|');
    return { box, scale, unit, project, farX, farY, width, height, right, up, key };
  }

  function planes() {
    const { farX, farY } = frame;
    return [
      { name: 'floor', fixed: 'z', value: 0, free: ['x', 'y'] },
      { name: 'wall-x', fixed: 'x', value: farX, free: ['y', 'z'] },
      { name: 'wall-y', fixed: 'y', value: farY, free: ['x', 'z'] }
    ];
  }

  function onPlane(point, plane) {
    if (plane.name === 'floor') return { ...point, z: ground(point.x, point.y) };
    return { ...point, [plane.fixed]: plane.value };
  }

  function fromScreen(plane, base, x, y) {
    const origin = frame.project({ ...base, [plane.free[0]]: 0, [plane.free[1]]: 0 });
    const first = frame.project({ ...base, [plane.free[0]]: 1, [plane.free[1]]: 0 });
    const second = frame.project({ ...base, [plane.free[0]]: 0, [plane.free[1]]: 1 });
    const ax = first.x - origin.x; const ay = first.y - origin.y;
    const bx = second.x - origin.x; const by = second.y - origin.y;
    const determinant = ax * by - ay * bx;
    if (Math.abs(determinant) < VIEW.box.degenerateArea * frame.scale * frame.scale) return null;
    const dx = x - origin.x; const dy = y - origin.y;
    return { [plane.free[0]]: (dx * by - dy * bx) / determinant, [plane.free[1]]: (ax * dy - ay * dx) / determinant };
  }

  function verticalPlane(point) {
    const facesX = Math.abs(frame.right.x) >= Math.abs(frame.right.y);
    return facesX ? { name: 'vertical', fixed: 'y', value: point.y, free: ['x', 'z'] } : { name: 'vertical', fixed: 'x', value: point.x, free: ['y', 'z'] };
  }

  function planeUsable(plane) {
    return fromScreen(plane, { x: 0, y: 0, z: 0 }, 0, 0) !== null;
  }

  function polygon(context, points) {
    context.beginPath();
    points.forEach((point, index) => {
      const p = frame.project(point);
      if (index) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y);
    });
    context.closePath();
  }

  const boxStep = box => niceStep(Math.max(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0), 6);

  function heightLevels(bounds, spacing) {
    const surface = currentSurface();
    const datum = surface.flat ? 0 : surface.datumMetres;
    const levels = [];
    let metres = Math.ceil((bounds.z0 + datum) / spacing) * spacing;
    if (metres - datum <= bounds.z0) metres += spacing;
    for (; metres - datum <= bounds.z1; metres += spacing) levels.push({ z: metres - datum, metres });
    return levels;
  }

  function drawBox(context, colors) {
    const { box, farX, farY } = frame;
    context.fillStyle = colors.wall;
    polygon(context, [{ x: farX, y: box.y0, z: box.z0 }, { x: farX, y: box.y1, z: box.z0 }, { x: farX, y: box.y1, z: box.z1 }, { x: farX, y: box.y0, z: box.z1 }]);
    context.fill();
    polygon(context, [{ x: box.x0, y: farY, z: box.z0 }, { x: box.x1, y: farY, z: box.z0 }, { x: box.x1, y: farY, z: box.z1 }, { x: box.x0, y: farY, z: box.z1 }]);
    context.fill();
    context.fillStyle = colors.ground;
    polygon(context, [{ x: box.x0, y: box.y0, z: box.z0 }, { x: box.x1, y: box.y0, z: box.z0 }, { x: box.x1, y: box.y1, z: box.z0 }, { x: box.x0, y: box.y1, z: box.z0 }]);
    context.fill();

    const step = boxStep(box);
    context.lineWidth = 1;
    context.strokeStyle = colors.grid;
    const line = (a, b) => { const p = frame.project(a); const q = frame.project(b); context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke(); };
    for (let x = Math.ceil(box.x0 / step) * step; x <= box.x1; x += step) {
      if (currentSurface().flat) line({ x, y: box.y0, z: box.z0 }, { x, y: box.y1, z: box.z0 });
      line({ x, y: farY, z: box.z0 }, { x, y: farY, z: box.z1 });
    }
    for (let y = Math.ceil(box.y0 / step) * step; y <= box.y1; y += step) {
      if (currentSurface().flat) line({ x: box.x0, y, z: box.z0 }, { x: box.x1, y, z: box.z0 });
      line({ x: farX, y, z: box.z0 }, { x: farX, y, z: box.z1 });
    }
    for (const { z } of heightLevels(box, step)) {
      line({ x: farX, y: box.y0, z }, { x: farX, y: box.y1, z });
      line({ x: box.x0, y: farY, z }, { x: box.x1, y: farY, z });
    }
    context.strokeStyle = colors.line;
    line({ x: farX, y: farY, z: box.z0 }, { x: farX, y: farY, z: box.z1 });
  }

  function drawBoxLabels(context, colors) {
    const { box, farX, farY } = frame;
    const nearX = farX === box.x1 ? box.x0 : box.x1;
    const nearY = farY === box.y1 ? box.y0 : box.y1;
    const step = boxStep(box);
    context.lineWidth = 1;
    context.font = '10px system-ui, sans-serif';
    context.fillStyle = colors.faint;
    const label = (text, point, dx = 4, dy = 12) => { const p = frame.project(point); context.fillText(text, p.x + dx, p.y + dy); };
    for (let x = Math.ceil(box.x0 / step) * step; x <= box.x1; x += step) label(formatMetres(x), { x, y: nearY, z: box.z0 });
    context.textAlign = 'right';
    for (let y = Math.ceil(box.y0 / step) * step; y <= box.y1; y += step) label(formatMetres(y), { x: nearX, y, z: box.z0 }, -6, 12);
    context.textAlign = 'left';
    for (const { z, metres } of heightLevels(box, step)) label(formatMetres(metres), { x: farX, y: farY, z }, 4, -2);
    const origin = frame.project({ x: 0, y: 0, z: ground(0, 0) });
    context.strokeStyle = colors.muted;
    context.beginPath();
    context.moveTo(origin.x - 6, origin.y); context.lineTo(origin.x + 6, origin.y);
    context.moveTo(origin.x, origin.y - 6); context.lineTo(origin.x, origin.y + 6);
    context.stroke();
    label('E', { x: box.x1, y: nearY, z: box.z0 }, 6, 24);
    label('N', { x: nearX, y: box.y1, z: box.z0 }, 6, 24);
  }

  function mixColors(a, b, t) {
    return a.map((value, index) => Math.round(value + (b[index] - value) * t));
  }

  const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));

  function terrainFog(surface, x, y) {
    const { box } = frame;
    const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const outside = Math.hypot(Math.max(0, box.x0 - x, x - box.x1), Math.max(0, box.y0 - y, y - box.y1));
    const { west, east, south, north } = surface.bounds;
    const inside = Math.min(x - west, east - x, y - south, north - y);
    return Math.max(smooth(outside / (VIEW.terrain.fogShare * Math.max(box.x1 - box.x0, box.y1 - box.y0))), 1 - smooth(inside / (VIEW.terrain.edgeShare * Math.max(east - west, north - south))));
  }

  function terrainMesh(surface, box, striped, colors) {
    const key = [box.x0, box.x1, box.y0, box.y1, striped, colors.ground, colors.line, colors.muted, colors.panel].join('|');
    if (terrainMeshCache?.key === key && terrainMeshCache.surface === surface) return terrainMeshCache;
    const { bounds } = surface;
    const fogMetres = VIEW.terrain.fogShare * Math.max(box.x1 - box.x0, box.y1 - box.y0);
    const west = Math.max(bounds.west, box.x0 - fogMetres);
    const south = Math.max(bounds.south, box.y0 - fogMetres);
    const east = Math.min(bounds.east, box.x1 + fogMetres);
    const north = Math.min(bounds.north, box.y1 + fogMetres);
    const side = Math.max(east - west, north - south);
    const cells = Math.max(2, Math.min(VIEW.terrain.drawCells, Math.ceil(side / surface.cellMetres)));
    const spacing = side / cells;
    const vertices = [];
    for (let row = 0; row <= cells; row += 1) {
      for (let column = 0; column <= cells; column += 1) {
        const x = Math.min(east, west + column * spacing);
        const y = Math.min(north, south + row * spacing);
        vertices.push({ x, y, z: ground(x, y) });
      }
    }
    let lowest = Infinity;
    let highest = -Infinity;
    for (const vertex of vertices) { lowest = Math.min(lowest, vertex.z); highest = Math.max(highest, vertex.z); }
    const band = niceStep(Math.max(1, highest - lowest), VIEW.terrain.contourBands);
    const dark = rgb(colors.ground);
    const light = mixColors(rgb(colors.line), rgb(colors.muted), .35);
    const fogColor = rgb(colors.panel);
    const quads = [];
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const indices = [row * (cells + 1) + column, row * (cells + 1) + column + 1, (row + 1) * (cells + 1) + column + 1, (row + 1) * (cells + 1) + column];
        const corners = indices.map(index => vertices[index]);
        const centreX = (corners[0].x + corners[2].x) / 2;
        const centreY = (corners[0].y + corners[2].y) / 2;
        if (!(corners[2].x > corners[0].x && corners[2].y > corners[0].y)) continue;
        const fog = terrainFog(surface, centreX, centreY);
        if (fog > .995) continue;
        const u = { x: corners[2].x - corners[0].x, y: corners[2].y - corners[0].y, z: corners[2].z - corners[0].z };
        const v = { x: corners[3].x - corners[1].x, y: corners[3].y - corners[1].y, z: corners[3].z - corners[1].z };
        const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
        const length = Math.hypot(n.x, n.y, n.z) || 1;
        const lit = Math.max(0, (n.x * TERRAIN_LIGHT.x + n.y * TERRAIN_LIGHT.y + n.z * TERRAIN_LIGHT.z) / length);
        const height = corners.reduce((sum, corner) => sum + corner.z, 0) / 4;
        const stripe = striped && Math.floor((height - lowest) / band) % 2 === 1 ? .82 : 1;
        const shaded = mixColors(dark, light, lit * lit).map(value => value * stripe);
        const [r, g, b] = mixColors(shaded, fogColor, fog);
        quads.push({ indices, centreX, centreY, depth: 0, color: `rgb(${r},${g},${b})`, mask: `rgba(255,255,255,${(1 - fog).toFixed(3)})` });
      }
    }
    terrainMeshCache = { key, surface, vertices, quads };
    return terrainMeshCache;
  }

  function terrainLayers(colors) {
    const surface = currentSurface();
    const { box, farX, farY } = frame;
    const ratio = window.devicePixelRatio || 1;
    const striped = contours();
    const key = [frame.key, canvas.width, canvas.height, striped, colors.ground, colors.line, colors.muted, colors.panel].join('|');
    if (terrainLayer?.key === key && terrainLayer.surface === surface) return terrainLayer;
    const layers = (terrainLayer?.layers ?? [null, null, null]).map(layer => {
      layer = sized(layer);
      const paint = layer.getContext('2d');
      paint.setTransform(ratio, 0, 0, ratio, 0, 0);
      paint.lineWidth = .6;
      return layer;
    });
    const { vertices, quads } = terrainMesh(surface, box, striped, colors);
    const projected = vertices.map(frame.project);
    const behind = (x, y) => (farX === box.x1 ? x > box.x1 : x < box.x0) || (farY === box.y1 ? y > box.y1 : y < box.y0);
    for (const quad of quads) quad.depth = projected[quad.indices[0]].depth + projected[quad.indices[1]].depth + projected[quad.indices[2]].depth + projected[quad.indices[3]].depth;
    const ordered = [...quads].sort((a, b) => b.depth - a.depth);
    const paints = layers.map(layer => layer.getContext('2d'));
    for (const { indices, centreX, centreY, color, mask } of ordered) {
      const front = paints[behind(centreX, centreY) ? 0 : 1];
      for (const [paint, style] of [[front, color], [paints[2], mask]]) {
        paint.beginPath();
        paint.moveTo(projected[indices[0]].x, projected[indices[0]].y);
        for (let corner = 1; corner < 4; corner += 1) paint.lineTo(projected[indices[corner]].x, projected[indices[corner]].y);
        paint.closePath();
        paint.fillStyle = style;
        paint.fill();
        if (paint !== paints[2]) { paint.strokeStyle = style; paint.stroke(); }
      }
    }
    terrainLayer = { key, surface, layers };
    return terrainLayer;
  }

  function drawTerrain(context, colors, back) {
    if (currentSurface().flat) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.drawImage(terrainLayers(colors).layers[back ? 0 : 1], 0, 0);
    context.restore();
  }

  function mapArea() {
    const { box, width, height, scale } = frame;
    const z = box.z0;
    const centre = fromScreen({ fixed: 'z', free: ['x', 'y'] }, { x: 0, y: 0, z }, width / 2, height / 2) ?? { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
    const seen = Math.max(width, height) / scale / Math.max(VIEW.map.minimumSine, Math.abs(Math.sin(view.pitch))) * VIEW.map.viewMargin;
    const side = 2 ** Math.ceil(Math.log2(Math.max(seen, box.x1 - box.x0, box.y1 - box.y0)));
    const step = side / 4;
    const x = Math.round(centre.x / step) * step;
    const y = Math.round(centre.y / step) * step;
    return { west: x - side / 2, east: x + side / 2, south: y - side / 2, north: y + side / 2 };
  }

  function drawMap(context, tiles, area) {
    const { box } = frame;
    const z = box.z0;
    context.save();
    polygon(context, [{ x: area.west, y: area.south, z }, { x: area.east, y: area.south, z }, { x: area.east, y: area.north, z }, { x: area.west, y: area.north, z }]);
    context.clip();
    context.globalAlpha *= VIEW.map.alpha;
    for (const { image, northWest, northEast, southWest } of tiles) {
      const origin = frame.project({ ...northWest, z });
      const across = frame.project({ ...northEast, z });
      const down = frame.project({ ...southWest, z });
      const size = image.naturalWidth || image.width || 256;
      context.save();
      context.transform((across.x - origin.x) / size, (across.y - origin.y) / size, (down.x - origin.x) / size, (down.y - origin.y) / size, origin.x, origin.y);
      // Half a pixel over each edge, so that neighbouring tiles leave no seam.
      context.drawImage(image, -.5, -.5, size + 1, size + 1);
      context.restore();
    }
    context.restore();
  }

  function drawNames(context, colors) {
    const list = scene.terrain?.enabled ? scene.terrain.names : [];
    if (!names() || !list?.length) return;
    const placed = [];
    context.font = '10px system-ui, sans-serif';
    context.textBaseline = 'middle';
    const sorted = [...list].sort((a, b) => LABEL_PRIORITY[a.kind] - LABEL_PRIORITY[b.kind]);
    for (const item of sorted) {
      if (placed.length >= VIEW.terrain.maximumLabels) break;
      const p = frame.project({ x: item.x, y: item.y, z: map() ? frame.box.z0 : ground(item.x, item.y) });
      const text = item.kind === 'peak' && item.elevationMetres !== null ? `${item.name} ${Math.round(item.elevationMetres)} m` : item.name;
      const width = context.measureText(text).width;
      const box = { x0: p.x - 3, x1: p.x + 7 + width, y0: p.y - 7, y1: p.y + 7 };
      const fog = terrainFog(currentSurface(), item.x, item.y);
      if (fog > .8) continue;
      if (placed.some(other => box.x0 < other.x1 && box.x1 > other.x0 && box.y0 < other.y1 && box.y1 > other.y0)) continue;
      placed.push(box);
      context.fillStyle = item.kind === 'water' ? colors.direct : colors.muted;
      context.globalAlpha = (item.kind === 'hamlet' || item.kind === 'locality' ? .6 : .85) * (1 - fog);
      if (item.kind === 'peak') {
        context.beginPath(); context.moveTo(p.x, p.y - 3); context.lineTo(p.x + 3, p.y + 2); context.lineTo(p.x - 3, p.y + 2); context.closePath(); context.fill();
      } else if (item.kind !== 'water') {
        context.beginPath(); context.arc(p.x, p.y, 1.6, 0, 2 * Math.PI); context.fill();
      }
      context.fillText(text, p.x + 6, p.y);
    }
    context.globalAlpha = 1;
    context.textBaseline = 'alphabetic';
  }

  function selectedPoints() {
    if (selection?.type === 'receiver') {
      const receiver = scene.receivers.find(item => item.id === selection.id);
      return receiver ? [placed(receiver.positionMetres)] : [];
    }
    const emitter = selection?.type === 'emitter' ? scene.emitters.find(item => item.id === selection.id) : null;
    return emitter && isTrackKind(emitter) ? [emitter.startMetres] : [];
  }

  function drawProjectionLines(context, colors, point) {
    const { farX, farY } = frame;
    const floor = { ...point, z: ground(point.x, point.y) };
    const line = points => {
      context.beginPath();
      points.map(frame.project).forEach((p, index) => (index ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)));
      context.stroke();
    };
    context.save();
    context.setLineDash([3, 4]);
    context.lineWidth = 1;
    context.strokeStyle = colors.receiver;
    context.globalAlpha = .45;
    line([point, floor]);
    line([floor, { ...floor, x: farX }, { ...point, x: farX }]);
    line([floor, { ...floor, y: farY }, { ...point, y: farY }]);
    context.restore();
  }

  function drawFlight(context, emitter, colors, selected, state) {
    context.strokeStyle = selected ? colors.accent : colors.end;
    context.lineWidth = selected ? 1.4 : 1.2;
    for (const path of cachedTracks(emitter, scene.air)) {
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

  function drawHandle(context, handle, colors, selected, usable) {
    const shadowPlanes = handle.ownPlaneOnly ? [] : planes().filter(plane => usable.has(plane.name) && !(handle.onGround && plane.fixed === 'z'));
    const shadowColor = handle.role === 'receiver' ? colors.receiver : colors.end;
    context.globalAlpha *= selected ? .7 : .4;
    for (const plane of shadowPlanes) {
      const p = frame.project(onPlane(handle.point, plane));
      context.fillStyle = shadowColor;
      context.beginPath(); context.arc(p.x, p.y, 2.5, 0, 2 * Math.PI); context.fill();
    }
    context.globalAlpha /= selected ? .7 : .4;
    const p = frame.project(handle.point);
    context.lineWidth = selected ? 2 : 1.5;
    context.beginPath();
    if (handle.role === 'receiver') {
      context.arc(p.x, p.y, VIEW.box.microphoneRadius, 0, 2 * Math.PI);
      context.fillStyle = colors.receiver;
      context.fill();
      context.fillStyle = colors.panel;
      context.beginPath(); context.arc(p.x, p.y, VIEW.box.microphoneRadius * .4, 0, 2 * Math.PI); context.fill();
      if (selected) {
        context.strokeStyle = colors.accent;
        context.beginPath(); context.arc(p.x, p.y, VIEW.box.microphoneRadius + 1.5, 0, 2 * Math.PI); context.stroke();
      }
      return;
    }
    if (handle.role === 'facing') {
      const owner = scene.receivers.find(receiver => receiver.id === handle.id);
      const base = frame.project(placed(owner.positionMetres));
      const angle = Math.atan2(p.y - base.y, p.x - base.x);
      const size = VIEW.box.arrowheadPixels;
      context.moveTo(p.x + Math.cos(angle) * size * .6, p.y + Math.sin(angle) * size * .6);
      context.lineTo(p.x + Math.cos(angle + 2.5) * size, p.y + Math.sin(angle + 2.5) * size);
      context.lineTo(p.x + Math.cos(angle - 2.5) * size, p.y + Math.sin(angle - 2.5) * size);
      context.closePath();
      context.fillStyle = selected ? colors.accent : colors.receiver;
      context.fill();
      return;
    }
    context.arc(p.x, p.y, VIEW.box.handleRadius, 0, 2 * Math.PI);
    if (handle.role === 'end') {
      context.fillStyle = colors.end;
      context.fill();
      context.strokeStyle = selected ? colors.accent : colors.end;
      context.stroke();
    } else {
      context.fillStyle = colors.start;
      context.fill();
      context.strokeStyle = selected ? colors.accent : colors.end;
      context.stroke();
    }
  }

  // Resized only when the view's size changes: setting a canvas's size allocates its pixels again.
  function sized(layer) {
    layer ??= document.createElement('canvas');
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
      return layer;
    }
    const paint = layer.getContext('2d');
    paint.setTransform(1, 0, 0, 1, 0, 0);
    paint.globalCompositeOperation = 'source-over';
    paint.globalAlpha = 1;
    paint.clearRect(0, 0, layer.width, layer.height);
    return layer;
  }

  let draws = 0;
  let drawRequested = false;

  function requestDraw() {
    if (drawRequested) return;
    drawRequested = true;
    const since = draws;
    requestAnimationFrame(() => {
      drawRequested = false;
      if (draws === since) draw();
    });
  }

  function draw() {
    if (!scene) return;
    draws += 1;
    const { context, width, height } = fitCanvas(canvas);
    const colors = palette();
    if (!drag || !frame) frame = computeFrame(width, height);
    const state = animation?.() ?? null;
    const usable = new Set(planes().filter(planeUsable).map(plane => plane.name));

    const area = map() ? mapArea() : null;
    const mapTiles = area ? loadMapTiles(area) : null;
    if (!mapTiles) drawTerrain(context, colors, true);
    if (mapTiles) drawMap(context, mapTiles, area);
    drawBox(context, colors);
    if (mapTiles) drawMap(context, mapTiles, { west: frame.box.x0, east: frame.box.x1, south: frame.box.y0, north: frame.box.y1 });
    else drawTerrain(context, colors, false);
    drawBoxLabels(context, colors);
    drawNames(context, colors);
    for (const emitter of scene.emitters) {
      const selected = selection?.type === 'emitter' && selection.id === emitter.id;
      context.globalAlpha = emitter.enabled ? 1 : .35;
      if (isTrackKind(emitter)) drawFlight(context, emitter, colors, selected, state);
      context.globalAlpha = 1;
    }
    for (const point of selectedPoints()) drawProjectionLines(context, colors, point);
    for (const receiver of scene.receivers) {
      const level = state?.receivers.get(receiver.id) ?? 0;
      if (level > 0) {
        const p = frame.project(placed(receiver.positionMetres));
        context.fillStyle = receiver.listen ? colors.accent : colors.muted;
        context.globalAlpha = (receiver.listen ? 1 : .5) * (.2 + .5 * level);
        context.beginPath(); context.arc(p.x, p.y, 6 + 14 * level, 0, 2 * Math.PI); context.fill();
        context.globalAlpha = 1;
      }
    }
    context.strokeStyle = colors.receiver;
    context.lineWidth = 1.5;
    for (const receiver of scene.receivers) {
      if (receiver.type !== 'binaural') continue;
      const a = frame.project(placed(receiver.positionMetres));
      const b = frame.project(facingTip(receiver, frame.box));
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= VIEW.box.microphoneRadius) continue;
      const ux = (b.x - a.x) / length;
      const uy = (b.y - a.y) / length;
      context.globalAlpha = receiver.listen ? 1 : .35;
      context.beginPath(); context.moveTo(a.x + ux * VIEW.box.microphoneRadius, a.y + uy * VIEW.box.microphoneRadius); context.lineTo(b.x, b.y); context.stroke();
    }
    context.globalAlpha = 1;
    for (const handle of handles(scene, frame.box)) {
      const selected = selection?.type === handle.type && selection.id === handle.id;
      const owner = handle.type === 'emitter' ? scene.emitters.find(emitter => emitter.id === handle.id) : null;
      context.globalAlpha = (owner && !owner.enabled) || handle.listening === false ? .35 : 1;
      drawHandle(context, handle, colors, selected, usable);
      context.globalAlpha = 1;
    }
    context.font = '11px system-ui, sans-serif';
    context.fillStyle = colors.faint;
    for (const emitter of scene.emitters) {
      const p = frame.project(emitter.startMetres);
      context.fillText(emitter.name, p.x + 9, p.y - 8);
    }
    for (const receiver of scene.receivers) {
      const p = frame.project(placed(receiver.positionMetres));
      context.fillText(receiver.name, p.x + 9, p.y - 8);
    }
  }

  function hit(x, y) {
    let best = null;
    const usable = planes().filter(planeUsable);
    for (const handle of handles(scene, frame.box)) {
      if (handle.verticalOnly) {
        const p = frame.project(handle.point);
        const distance = Math.hypot(p.x - x, p.y - y);
        if (distance <= VIEW.box.hitRadius && (!best || distance < best.distance)) best = { ...handle, plane: verticalPlane(handle.point), distance };
        continue;
      }
      const candidates = [{ point: handle.point, plane: { name: 'own', fixed: 'z', value: handle.point.z, free: ['x', 'y'] } }];
      for (const plane of handle.ownPlaneOnly ? [] : usable) {
        if (handle.onGround && plane.fixed === 'z') continue;
        candidates.push({ point: onPlane(handle.point, plane), plane });
      }
      for (const candidate of candidates) {
        const p = frame.project(candidate.point);
        const distance = Math.hypot(p.x - x, p.y - y);
        if (distance <= VIEW.box.hitRadius && (!best || distance < best.distance)) best = { ...handle, plane: candidate.plane, distance };
      }
    }
    return best;
  }

  function localPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function changeView(next) {
    view = next;
    if (frame && scene) {
      frame = computeFrame(frame.width, frame.height);
      requestDraw();
    } else {
      frame = null;
      draw();
    }
    onViewChange?.(view);
  }

  function zoomAt(factor, x, y) {
    if (!frame) return;
    const [low, high] = VIEW.box.zoomRange;
    const zoom = Math.min(high, Math.max(low, view.zoom * factor));
    const before = frame.scale;
    const after = before * zoom / view.zoom;
    const u = (x - frame.width / 2) / before - view.panU * frame.unit;
    const v = (frame.height / 2 - y) / before - view.panV * frame.unit;
    changeView({ ...view, zoom, panU: ((x - frame.width / 2) / after - u) / frame.unit, panV: ((frame.height / 2 - y) / after - v) / frame.unit });
  }

  function panBy(dx, dy) {
    if (!frame) return;
    changeView({ ...view, panU: view.panU + dx / frame.scale / frame.unit, panV: view.panV - dy / frame.scale / frame.unit });
  }

  const touches = new Map();
  let pinch = null;

  function pinchState() {
    const [a, b] = [...touches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  canvas.addEventListener('pointerdown', event => {
    if (!scene || !frame) return;
    const { x, y } = localPoint(event);
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x, y });
      if (touches.size === 2) {
        drag = null;
        pinch = pinchState();
        return;
      }
      if (touches.size > 2) return;
    }
    const target = event.button === 0 && !event.shiftKey ? hit(x, y) : null;
    if (target) {
      onSelect({ type: target.type, id: target.id });
      const grabbed = fromScreen(target.plane, onPlane(target.point, target.plane), x, y);
      drag = grabbed ? { kind: 'point', ...target, origin: { ...target.point }, grabbed, x, y, moving: false } : null;
    } else if (event.button === 1 || event.button === 2 || event.shiftKey) {
      drag = { kind: 'pan', x, y };
    } else {
      drag = { kind: 'rotate', x, y, view: { ...view }, touch: event.pointerType === 'touch' };
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (!scene || !frame) return;
    const { x, y } = localPoint(event);
    if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
      touches.set(event.pointerId, { x, y });
      if (pinch && touches.size === 2) {
        const next = pinchState();
        if (pinch.distance > 0) zoomAt(next.distance / pinch.distance, next.x, next.y);
        panBy(next.x - pinch.x, next.y - pinch.y);
        pinch = next;
        return;
      }
    }
    if (!drag) {
      canvas.style.cursor = hit(x, y) ? 'grab' : 'default';
      return;
    }
    if (drag.kind === 'rotate') {
      const [low, high] = VIEW.box.pitchRange;
      changeView({
        ...view,
        yaw: drag.view.yaw - (drag.touch ? -1 : 1) * (x - drag.x) * VIEW.box.rotateRadiansPerPixel,
        pitch: Math.min(high, Math.max(low, drag.view.pitch + (y - drag.y) * VIEW.box.rotateRadiansPerPixel))
      });
      return;
    }
    if (drag.kind === 'pan') {
      panBy(x - drag.x, y - drag.y);
      drag = { ...drag, x, y };
      return;
    }
    if (!drag.moving && Math.hypot(x - drag.x, y - drag.y) < VIEW.box.clickPixels * (event.pointerType === 'touch' ? 2 : 1)) return;
    drag.moving = true;
    const solved = fromScreen(drag.plane, onPlane(drag.origin, drag.plane), x, y);
    if (!solved) return;
    const clamp = (value, limit, minimum = -limit) => Math.min(limit, Math.max(minimum, value));
    const { box } = frame;
    drag.resolution = Math.min(1, 10 ** Math.floor(Math.log10(Math.max(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) / 1000)));
    const round = (value, step) => +(Math.round(value / step) * step).toFixed(Math.max(0, -Math.log10(step)));
    const point = { ...drag.origin };
    for (const axis of drag.plane.free) {
      if (drag.verticalOnly && axis !== 'z') continue;
      const moved = drag.origin[axis] + solved[axis] - drag.grabbed[axis];
      if (axis === 'z') {
        if (!drag.onGround) point.z = round(clamp(moved, RENDER.maximumHeightMetres, 0), Math.min(.1, drag.resolution));
      } else point[axis] = round(clamp(moved, RENDER.sceneExtentMetres), drag.resolution);
    }
    drag.point = point;
    onMove(drag, point);
  });
  const finish = event => {
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      if (pinch && touches.size < 2) { pinch = null; onView(view); }
    }
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (finished.kind === 'point') { if (finished.moving) onCommit(finished); return; }
    if (finished.kind === 'rotate' && event.type === 'pointerup') {
      const { x, y } = localPoint(event);
      if (Math.hypot(x - finished.x, y - finished.y) < VIEW.box.clickPixels) onSelect({ type: null, id: null });
    }
    onView(view); frame = null; draw();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const { x, y } = localPoint(event);
    const scale = event.deltaMode === 1 ? VIEW.box.wheelLinePixels : 1;
    const deltaX = event.deltaX * scale;
    const deltaY = event.deltaY * scale;
    const mouseWheel = event.deltaMode === 1 || (event.deltaX === 0 && Math.abs(event.deltaY) >= 40 && Number.isInteger(event.deltaY));
    if (event.ctrlKey || mouseWheel) zoomAt(Math.exp(-deltaY * VIEW.box.zoomPerPixel * (event.ctrlKey ? 2 : 1)), x, y);
    else panBy(-deltaX, -deltaY);
    onView(view);
  }, { passive: false });
  let gestureScale = 1;
  canvas.addEventListener('gesturestart', event => { event.preventDefault(); gestureScale = 1; });
  canvas.addEventListener('gesturechange', event => {
    event.preventDefault();
    const { x, y } = localPoint(event);
    zoomAt(event.scale / gestureScale, x, y);
    gestureScale = event.scale;
  });
  canvas.addEventListener('gestureend', event => { event.preventDefault(); onView(view); });
  canvas.addEventListener('dblclick', () => {
    changeView({ ...VIEW.box.defaultView });
    onView(view);
  });
  new ResizeObserver(() => { frame = null; draw(); }).observe(canvas);

  return {
    update(nextScene, nextSelection) {
      scene = nextScene;
      selection = nextSelection;
      if (!drag) frame = null;
      draw();
    },
    setView(next) {
      const { yaw, pitch, zoom, panU, panV } = { ...VIEW.box.defaultView, ...next };
      changeView({ yaw, pitch, zoom, panU, panV });
    },
    getView: () => view,
    zoomBy(factor) { if (frame) zoomAt(factor, frame.width / 2, frame.height / 2); },
    draw,
    setAnimation(source) { animation = source; },
    hold(on) { held = on; if (!on) draw(); }
  };
}
