import assert from "node:assert/strict";
import { test } from "node:test";
import { findMapLabelPath } from "../client/src/map-label-layout.ts";

const metrics = { width: 14, ascent: 2, descent: 0.5 };

test("places a label across neighboring outlines that are individually too narrow", () => {
  const left = (x: number, y: number) => x >= 0 && x <= 10 && y >= 0 && y <= 5;
  const right = (x: number, y: number) => x >= 10 && x <= 20 && y >= 0 && y <= 5;
  assert.equal(findMapLabelPath([5, 3], metrics, left), undefined);
  assert.equal(findMapLabelPath([15, 3], metrics, right), undefined);
  const combined = findMapLabelPath([10, 3], metrics, (x, y) => left(x, y) || right(x, y));
  assert.ok(combined);
});

test("rejects a label that would cross the gap between disconnected regions", () => {
  const separated = (x: number, y: number) => y >= 0 && y <= 5
    && ((x >= 0 && x <= 10) || (x >= 16 && x <= 26));
  assert.equal(findMapLabelPath([13, 3], metrics, separated), undefined);
});
