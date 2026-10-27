const test = require("node:test");
const assert = require("node:assert/strict");
const { findFocusPoints } = require("../src/shared/album-focus");

function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      const offset = (y * width + x) * 4;
      data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = 255;
    }
  }
  return { data };
}

test("smart focus chooses detailed central artwork over empty corners", () => {
  const pixels = image(96, 96, (x, y) => {
    if (x > 30 && x < 66 && y > 30 && y < 66) {
      return (x + y) % 6 < 3 ? [245, 215, 40] : [15, 25, 220];
    }
    return [150, 20, 28];
  });
  const points = findFocusPoints(pixels, 96, 96);
  assert.ok(points.length >= 1);
  assert.ok(Math.hypot(points[0].x - 0.5, points[0].y - 0.5) < 0.22);
});

test("smart focus follows an off-centre area with strong colour detail", () => {
  const pixels = image(96, 96, (x, y) => {
    if (x > 57 && x < 90 && y > 7 && y < 40) {
      return (x + y) % 8 < 4 ? [20, 240, 220] : [250, 40, 170];
    }
    return [25, 25, 28];
  });
  const [point] = findFocusPoints(pixels, 96, 96);
  assert.ok(point.x > 0.6 && point.y < 0.45);
});

test("smart focus avoids a barcode-like label along the bottom edge", () => {
  const pixels = image(112, 112, (x, y) => {
    if (y > 84) return x % 4 < 2 ? [250, 250, 250] : [5, 5, 5];
    if (x > 32 && x < 80 && y > 22 && y < 74) {
      return (x + y) % 12 < 6 ? [230, 95, 52] : [35, 80, 180];
    }
    return [80, 32, 28];
  });
  const points = findFocusPoints(pixels, 112, 112);
  assert.ok(points.length >= 1);
  assert.ok(points[0].y < 0.72);
});

test("smart focus falls back to the center for flat artwork", () => {
  const pixels = image(64, 64, () => [80, 80, 80]);
  assert.deepEqual(findFocusPoints(pixels, 64, 64), [{ x: 0.5, y: 0.5, score: 0 }]);
});
