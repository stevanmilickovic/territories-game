import assert from "node:assert/strict";
import { test } from "node:test";
import { roundedBorderPath } from "./round-world-map-border.mts";

test("rounds a bend without moving the path endpoints", () => {
  assert.equal(roundedBorderPath([[1, 1], [5, 1], [5, 5]], 10, 10),
    "M1 1L3.8 1Q5 1 5 2.2L5 5");
});

test("keeps the sharp turn and the contact with the map frame", () => {
  assert.equal(roundedBorderPath([[1, 2], [5, 2], [3, 0], [3, 5]], 10, 10),
    "M1 2L5 2L3 0L3 5");
});

test("closes a rounded loop at its original anchor", () => {
  const path = roundedBorderPath([[2, 2], [6, 2], [6, 6], [2, 6], [2, 2]], 10, 10);
  assert.equal(path, "M2 2L4.8 2Q6 2 6 3.2L6 4.8Q6 6 4.8 6L3.2 6Q2 6 2 4.8Z");
});
