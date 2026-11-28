import assert from "node:assert/strict";
import { test } from "node:test";
import { traceBorderPaths } from "./trace-world-map-borders.mts";

test("traces a shared border once and distinguishes the coast from the map edge", () => {
  const paths = traceBorderPaths(Uint32Array.of(1, 2, 0, 1, 2, 0), 3, 2);
  assert.deepEqual(paths.filter(({ kind }) => kind === "shared"), [
    { kind: "shared", labels: [1, 2], points: [[1, 0], [1, 1], [1, 2]] },
  ]);
  assert.deepEqual(paths.filter(({ kind }) => kind === "coastline"), [
    { kind: "coastline", labels: [2], points: [[2, 0], [2, 1], [2, 2]] },
  ]);
  const mapEdges = paths.filter(({ kind }) => kind === "map-edge");
  assert.equal(mapEdges.length, 3);
  assert.ok(mapEdges.every(({ points }) => points.every(([x, y]) => x === 0 || y === 0 || y === 2)));
});

test("ends each border at a three-province junction", () => {
  const paths = traceBorderPaths(Uint32Array.of(1, 1, 2, 3), 2, 2);
  const shared = paths.filter(({ kind }) => kind === "shared");
  assert.deepEqual(shared.map(({ labels }) => labels).sort(), [[1, 2], [1, 3], [2, 3]]);
  for (const { points } of shared) {
    assert.equal(points.length, 2);
    assert.ok(points.some(([x, y]) => x === 1 && y === 1));
  }
});

test("keeps four edges separate at a diagonal contact", () => {
  const paths = traceBorderPaths(Uint32Array.of(1, 2, 2, 1), 2, 2);
  const shared = paths.filter(({ kind }) => kind === "shared");
  assert.equal(shared.length, 4);
  for (const { labels, points } of shared) {
    assert.deepEqual(labels, [1, 2]);
    assert.equal(points.length, 2);
    assert.ok(points.some(([x, y]) => x === 1 && y === 1));
  }
});

test("traces an enclosed water boundary as a closed loop", () => {
  const paths = traceBorderPaths(Uint32Array.of(1, 1, 1, 1, 0, 1, 1, 1, 1), 3, 3);
  assert.deepEqual(paths.filter(({ kind }) => kind === "coastline"), [
    { kind: "coastline", labels: [1], points: [[2, 1], [1, 1], [1, 2], [2, 2], [2, 1]] },
  ]);
});
