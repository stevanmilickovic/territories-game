import assert from "node:assert/strict";
import { test } from "node:test";
import { simplifyBorder } from "./simplify-world-map-border.mts";
import type { Point } from "./trace-world-map-borders.mts";

test("removes one-cell steps while retaining a prominent bend and endpoints", () => {
  const points: Point[] = [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [3, 4], [3, 5]];
  assert.deepEqual(simplifyBorder(points, 8, 8), [[1, 1], [3, 2], [3, 5]]);
});

test("retains an intermediate contact with the map edge", () => {
  const points: Point[] = [[1, 0], [1, 1], [2, 1], [2, 0], [3, 0]];
  assert.ok(simplifyBorder(points, 8, 8).includes(points[3]));
});

test("keeps a one-cell lake closed and nondegenerate", () => {
  const points: Point[] = [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]];
  assert.deepEqual(simplifyBorder(points, 8, 8), points);
});
