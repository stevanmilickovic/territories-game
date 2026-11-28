import assert from "node:assert/strict";
import { test } from "node:test";
import { stitchProvinceOutlines } from "./stitch-province-outlines.mts";

test("stitches the same quadratic into neighboring province rings in opposite directions", () => {
  const outlines = stitchProvinceOutlines([
    { labels: [1, 2], points: [[2, 0], [2, 1], [2, 2]], path: "M2 0Q3 1 2 2" },
    { labels: [1], points: [[2, 2], [1, 2], [0, 2], [0, 0], [2, 0]], path: "M2 2L0 2L0 0L2 0" },
    { labels: [2], points: [[2, 0], [3, 0], [4, 0], [4, 2], [2, 2]], path: "M2 0L4 0L4 2L2 2" },
  ]);
  assert.equal(outlines.get(1), "M2 0Q3 1 2 2L0 2L0 0L2 0Z");
  assert.equal(outlines.get(2), "M2 2Q3 1 2 0L4 0L4 2L2 2Z");
});

test("keeps an enclosed coastline as a separate closed ring", () => {
  const outlines = stitchProvinceOutlines([
    { labels: [1], points: [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], path: "M0 0L4 0L4 4L0 4Z" },
    { labels: [1], points: [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]], path: "M1 1L1 3L3 3L3 1Z" },
  ]);
  assert.equal(outlines.get(1), "M0 0L4 0L4 4L0 4L0 0ZM1 1L1 3L3 3L3 1L1 1Z");
});
