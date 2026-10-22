import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDarkness, generatePath, createSVG } from '../src/path.js';

test('thresholds, gamma, inversion and alpha compositing', () => {
  const pixels = new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 100,100,100,255, 0,0,0,0]);
  assert.deepEqual([...makeDarkness(pixels, { black: 0, white: 200, gamma: 1 })], [1,0,0.5,0]);
  assert.equal(makeDarkness(pixels, { black: 0, white: 200, gamma: 2 })[2], 0.25);
  assert.deepEqual([...makeDarkness(pixels, { black: 0, white: 255, gamma: 1, invert: true })].slice(0,2), [0,1]);
  assert.throws(() => makeDarkness(pixels, { black: 100, white: 100 }));
});

test('white image produces no plot; binary threshold has no intermediate tones', () => {
  const result = generatePath(new Float32Array(100), 10, 10);
  assert.equal(result.points.length, 0);
  const data = Uint8ClampedArray.from([127,127,127,255,128,128,128,255]);
  const tones = makeDarkness(data, {black:127, white:128, gamma:1});
  assert.ok(tones[0] > 0.9999 && tones[1] < 0.0001);
});

test('disconnected dark islands remain one finite, bounded and repeatable route', () => {
  const width = 48, height = 40;
  const field = Float32Array.from({ length: width * height }, (_, i) => {
    const x = i % width, y = Math.floor(i / width);
    return (x < 14 && y < 14) || (x > 33 && y > 25) ? 1 : 0;
  });
  const a = generatePath(field, width, height, { seed: 42 });
  const b = generatePath(field, width, height, { seed: 42 });
  assert.deepEqual(a.points, b.points);
  assert.ok(a.points.length > 10);
  let firstIsland = false, secondIsland = false, measured = 0;
  for (let i = 0; i < a.points.length; i += 2) {
    const x = a.points[i], y = a.points[i+1];
    assert.ok(Number.isFinite(x) && x >= 0 && x <= width - 1);
    assert.ok(Number.isFinite(y) && y >= 0 && y <= height - 1);
    firstIsland ||= x < 14 && y < 14; secondIsland ||= x > 33 && y > 25;
    if (i) measured += Math.hypot(x-a.points[i-2], y-a.points[i-1]);
  }
  assert.ok(firstIsland && secondIsland);
  assert.ok(Math.abs(measured-a.length) < 0.0001);
  assert.equal(field[0], 1, 'source field must not be consumed');
});

test('more density adds path length; a different seed changes the drawing', () => {
  const field = new Float32Array(800).fill(0.65);
  const low = generatePath(field, 40, 20, { density: 0.5 });
  const high = generatePath(field, 40, 20, { density: 1.5 });
  assert.ok(high.length > low.length * 2);
  assert.notDeepEqual(low.points, generatePath(field, 40, 20, { density: 0.5, seed: 123 }).points);
});

test('SVG contains exactly one open continuous path with physical units and margin', () => {
  const svg = createSVG(new Float32Array([0,0, 10,20, 20,40]), {gridWidth:21, gridHeight:41, widthMM:100, marginMM:10, penMM:0.3});
  assert.match(svg, /width="120.000mm" height="220.000mm"/);
  assert.equal((svg.match(/<path /g) || []).length, 1);
  const d = svg.match(/ d="([^"]+)"/)[1];
  assert.equal((d.match(/M/g) || []).length, 1);
  assert.equal((d.match(/L/g) || []).length, 2);
  assert.ok(!/[Zz]/.test(d));
  assert.match(d, /^M10.000 10.000 L60.000 110.000 L110.000 210.000$/);
  assert.throws(() => createSVG(new Float32Array(), {gridWidth:21,gridHeight:41}));
});

test('invalid dimensions, nonfinite data and path options are rejected', () => {
  assert.throws(() => generatePath(new Float32Array(4), 3, 3));
  assert.throws(() => generatePath(new Float32Array(4).fill(NaN), 2, 2));
  assert.throws(() => generatePath(new Float32Array(4), 2, 2, {density: 0}));
});
