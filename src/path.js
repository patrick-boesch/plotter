const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function makeDarkness(rgba, { black = 25, white = 220, gamma = 1.1, invert = false } = {}) {
  if (!(black >= 0 && white <= 255 && black < white) || !(gamma > 0)) {
    throw new Error('Schwarzpunkt muss kleiner als Weißpunkt sein.');
  }
  const field = new Float32Array(rgba.length / 4);
  for (let i = 0; i < field.length; i++) {
    const a = rgba[i * 4 + 3] / 255;
    let luminance = (rgba[i * 4] * 0.2126 + rgba[i * 4 + 1] * 0.7152 + rgba[i * 4 + 2] * 0.0722) * a + 255 * (1 - a);
    if (invert) luminance = 255 - luminance;
    field[i] = Math.pow(1 - clamp((luminance - black) / (white - black), 0, 1), gamma);
  }
  return field;
}

function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Greedy ink-residual walk: each segment consumes darkness. Looking ahead and
// retaining heading produces the loose overlapping strokes of a scribble plot.
// Repositioning is also drawn, so the returned polyline is one unbroken path.
export function generatePath(field, width, height, options = {}, onProgress = () => {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 || field.length !== width * height) {
    throw new Error('Ungültige Bildabmessungen.');
  }
  const { density = 1, looseness = 1, seed = 1, penPixels = 0.55 } = options;
  if (![density, looseness, penPixels].every(v => Number.isFinite(v) && v > 0)) throw new Error('Ungültige Pfadparameter.');
  const random = randomGenerator(seed);
  const remaining = Float32Array.from(field);
  let total = 0, start = 0;
  for (let i = 0; i < field.length; i++) {
    if (!Number.isFinite(field[i]) || field[i] < 0 || field[i] > 1) throw new Error('Ungültige Tonwerte.');
    total += field[i];
    if (field[i] > field[start]) start = i;
  }
  if (total < 0.01) return { points: new Float32Array(), length: 0, capped: false };
  const ink = Math.max(0.12, penPixels) / density;
  const targetLength = total / ink * 1.35;
  const maxSegments = 100000;
  const coords = [start % width, Math.floor(start / width)];
  let x = coords[0], y = coords[1], heading = random() * Math.PI * 2, length = 0;
  const sample = (px, py) => remaining[Math.round(py) * width + Math.round(px)];
  let anchorX = x, anchorY = y;

  for (let step = 0; step < maxSegments && length < targetLength; step++) {
    // Reconsider the next underdrawn region regularly; distance mildly penalizes
    // long connections through blank paper without disconnecting the path.
    if (step % 14 === 0) {
      let best = -Infinity;
      for (let k = 0; k < 160; k++) {
        const i = Math.floor(random() * field.length);
        const ax = i % width, ay = Math.floor(i / width);
        const score = remaining[i] - 0.0015 * Math.hypot(ax - x, ay - y);
        if (score > best) { best = score; anchorX = ax; anchorY = ay; }
      }
    }
    let bestScore = -Infinity, bestX = x, bestY = y, bestAngle = heading;
    const anchorDistance = Math.hypot(anchorX - x, anchorY - y);
    for (let candidate = 0; candidate < 28; candidate++) {
      const angle = candidate === 0 ? Math.atan2(anchorY - y, anchorX - x)
        : heading + (random() - 0.5) * (candidate < 22 ? 2.5 : Math.PI * 2);
      const distance = (2 + random() * 9) * looseness;
      const nx = clamp(x + Math.cos(angle) * distance, 0, width - 1);
      const ny = clamp(y + Math.sin(angle) * distance, 0, height - 1);
      const actual = Math.hypot(nx - x, ny - y);
      if (actual < 0.4) continue;
      let score = 0;
      const n = Math.max(3, Math.ceil(actual));
      for (let s = 1; s <= n; s++) score += sample(x + (nx - x) * s / n, y + (ny - y) * s / n);
      score /= n;
      score += 0.16 * (anchorDistance - Math.hypot(anchorX - nx, anchorY - ny)) / actual;
      score += 0.045 * Math.cos(angle - heading) + random() * 0.015;
      if (score > bestScore) { bestScore = score; bestX = nx; bestY = ny; bestAngle = angle; }
    }
    const distance = Math.hypot(bestX - x, bestY - y);
    if (distance < 0.001) break;
    const n = Math.ceil(distance * 2);
    // Bilinear splatting conserves ink even for a subpixel pen. Saturated areas
    // become less attractive; their penalty is bounded to permit connections.
    for (let s = 1; s <= n; s++) {
      const px = x + (bestX - x) * s / n, py = y + (bestY - y) * s / n;
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        if (ix + dx >= width || iy + dy >= height) continue;
        const i = (iy + dy) * width + ix + dx;
        const amount = ink * distance / n * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
        remaining[i] = Math.max(-0.8, remaining[i] - amount);
      }
    }
    x = bestX; y = bestY; heading = bestAngle; length += distance;
    coords.push(x, y);
    if (step % 300 === 0) onProgress(Math.min(0.99, Math.max(length / targetLength, step / maxSegments)));
  }
  onProgress(1);
  const points = smoothPath(coords);
  length = 0;
  for (let i = 2; i < points.length; i += 2) length += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
  return { points, length, capped: coords.length / 2 >= maxSegments + 1 };
}

function smoothPath(coords) {
  // Quadratic corner rounding, flattened into plotter-friendly straight moves.
  // Convex combinations stay within the source bounds; no extra subpaths arise.
  const output = [coords[0], coords[1]];
  let sx = coords[0], sy = coords[1];
  for (let i = 2; i < coords.length - 2; i += 2) {
    const ex = (coords[i] + coords[i + 2]) / 2, ey = (coords[i + 1] + coords[i + 3]) / 2;
    for (let n = 1; n <= 3; n++) {
      const t = n / 3, u = 1 - t;
      output.push(u * u * sx + 2 * u * t * coords[i] + t * t * ex,
        u * u * sy + 2 * u * t * coords[i + 1] + t * t * ey);
    }
    sx = ex; sy = ey;
  }
  output.push(coords.at(-2), coords.at(-1));
  return new Float32Array(output);
}

export function createSVG(points, { gridWidth, gridHeight, widthMM = 180, marginMM = 10, penMM = 0.35 }) {
  if (!points.length || points.length % 2) throw new Error('Kein exportierbarer Pfad vorhanden.');
  if (![gridWidth, gridHeight, widthMM, penMM].every(v => Number.isFinite(v) && v > 0) || gridWidth < 2 || gridHeight < 2 || !Number.isFinite(marginMM) || marginMM < 0) throw new Error('Ungültige Exportmaße.');
  const scale = widthMM / (gridWidth - 1);
  const heightMM = (gridHeight - 1) * scale;
  const commands = [];
  for (let i = 0; i < points.length; i += 2) {
    if (!Number.isFinite(points[i]) || !Number.isFinite(points[i + 1])) throw new Error('Ungültige Pfadkoordinaten.');
    commands.push(`${i ? 'L' : 'M'}${(marginMM + points[i] * scale).toFixed(3)} ${(marginMM + points[i + 1] * scale).toFixed(3)}`);
  }
  const w = (widthMM + 2 * marginMM).toFixed(3), h = (heightMM + 2 * marginMM).toFixed(3);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n  <title>One Line — continuous plot</title>\n  <path d="${commands.join(' ')}" fill="none" stroke="#000" stroke-width="${penMM}" stroke-linecap="round" stroke-linejoin="round"/>\n</svg>\n`;
}
