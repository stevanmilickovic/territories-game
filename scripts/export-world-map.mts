import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { shapeContinent } from "../shared/src/continent.ts";
import { generateHeightmap } from "../shared/src/heightmap.ts";
import { placeTerritoryCenters } from "../shared/src/territory-centers.ts";
import { assignTerrainTerritories } from "../shared/src/terrain-territories.ts";
import { traceBorderPaths, type Point } from "./trace-world-map-borders.mts";

type Edge = { to: number; direction: number };

const settings = { width: 160, height: 160, seed: 202, baseFrequency: 1.5, lacunarity: 2, persistence: 0.24 };
const seaLevel = 0.472;
const { width, height } = settings;
const continent = shapeContinent(generateHeightmap({ ...settings, octaves: 4 }), seaLevel);
const placementTerrain = shapeContinent(generateHeightmap({ ...settings, octaves: 2 }), seaLevel);
const centers = placeTerritoryCenters(placementTerrain, {
  seed: settings.seed, minimumSpacing: 31, minimumStrength: 0.86, maximumStrength: 1.14,
});
const labels = assignTerrainTerritories(continent, centers, {
  ridgeInfluence: 70, drainageInfluence: 105, smoothingRadius: 2,
});
const vertexStride = width + 1;
const toPoint = (vertex: number): Point => [vertex % vertexStride, Math.floor(vertex / vertexStride)];

function traceRings(grid: Uint32Array, label: number): Point[][] {
  const outgoing = new Map<number, Edge[]>();
  function addEdge(from: number, to: number, direction: number) {
    const edges = outgoing.get(from) ?? [];
    edges.push({ to, direction });
    outgoing.set(from, edges);
  }

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== label) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    const topLeft = y * vertexStride + x;
    const topRight = topLeft + 1;
    const bottomLeft = topLeft + vertexStride;
    const bottomRight = bottomLeft + 1;
    if (y === 0 || grid[i - width] !== label) addEdge(topLeft, topRight, 0);
    if (x === width - 1 || grid[i + 1] !== label) addEdge(topRight, bottomRight, 1);
    if (y === height - 1 || grid[i + width] !== label) addEdge(bottomRight, bottomLeft, 2);
    if (x === 0 || grid[i - 1] !== label) addEdge(bottomLeft, topLeft, 3);
  }

  const rings: Point[][] = [];
  while (outgoing.size > 0) {
    const start = outgoing.keys().next().value;
    assert.ok(start !== undefined);
    const ring: Point[] = [];
    let from = start;
    let direction: number | undefined;
    do {
      const edges = outgoing.get(from);
      assert.ok(edges?.length, "An exported boundary must close.");
      // Keep the territory on the right at vertices shared by two rings.
      const previousDirection = direction;
      const next = previousDirection === undefined ? 0
        : [1, 0, 3, 2]
          .map((turn) => edges.findIndex((edge) => edge.direction === (previousDirection + turn) % 4))
          .find((edgeIndex) => edgeIndex >= 0);
      assert.ok(next !== undefined, "Each boundary vertex needs an outgoing edge.");
      const [edge] = edges.splice(next, 1);
      if (edges.length === 0) outgoing.delete(from);
      ring.push(toPoint(from));
      direction = edge.direction;
      from = edge.to;
    } while (from !== start);

    rings.push(ring.filter(([x, y], index) => {
      const before = ring[(index + ring.length - 1) % ring.length];
      const after = ring[(index + 1) % ring.length];
      return (x !== before[0] || x !== after[0]) && (y !== before[1] || y !== after[1]);
    }));
  }
  return rings;
}

function svgLine(points: readonly Point[]): string {
  const [[x, y], ...rest] = points;
  let path = `M${x} ${y}`;
  for (const [index, [nextX, nextY]] of rest.entries()) {
    path += nextX === points[index][0] ? `V${nextY}` : `H${nextX}`;
  }
  return path;
}

function svgPath(rings: readonly Point[][]): string {
  return rings.map((ring) => svgLine(ring) + "Z").join("");
}

function validateOutline(rings: readonly Point[][], label: number) {
  const crossings = new Uint8Array(vertexStride * height);
  for (const ring of rings) {
    assert.ok(ring.length >= 4, "A territory ring needs at least four corners.");
    for (const [i, [x, y]] of ring.entries()) {
      const [nextX, nextY] = ring[(i + 1) % ring.length];
      if (x !== nextX) {
        assert.equal(y, nextY);
        continue;
      }
      for (let row = Math.min(y, nextY); row < Math.max(y, nextY); row++) {
        crossings[row * vertexStride + x] ^= 1;
      }
    }
  }
  for (let y = 0; y < height; y++) {
    let inside = 0;
    for (let x = 0; x < width; x++) {
      inside ^= crossings[y * vertexStride + x];
      assert.equal(Boolean(inside), labels[y * width + x] === label, "Exported outline differs from the territory grid.");
    }
  }
}

function neighborsOf(index: number): number[] {
  const x = index % width;
  return [
    ...(x > 0 ? [index - 1] : []),
    ...(x + 1 < width ? [index + 1] : []),
    ...(index >= width ? [index - width] : []),
    ...(index + width < labels.length ? [index + width] : []),
  ];
}

function labelAnchor(cells: readonly number[], label: number, center: Point): Point {
  const distances = new Uint16Array(labels.length);
  const queue = cells.filter((cell) => {
    const neighbors = neighborsOf(cell);
    return neighbors.length < 4 || neighbors.some((neighbor) => labels[neighbor] !== label);
  });
  for (const cell of queue) distances[cell] = 1;

  let anchor = queue[0];
  let closestToCenter = Infinity;
  for (const cell of queue) {
    const x = cell % width;
    const y = Math.floor(cell / width);
    const centerDistance = (x - center[0]) ** 2 + (y - center[1]) ** 2;
    if (distances[cell] > distances[anchor] || (distances[cell] === distances[anchor] && centerDistance < closestToCenter)) {
      anchor = cell;
      closestToCenter = centerDistance;
    }
    for (const neighbor of neighborsOf(cell)) {
      if (labels[neighbor] !== label || distances[neighbor]) continue;
      distances[neighbor] = distances[cell] + 1;
      queue.push(neighbor);
    }
  }
  return [anchor % width + 0.5, Math.floor(anchor / width) + 0.5];
}

assert.equal(centers.length, 10);
for (const [index, label] of labels.entries()) {
  assert.equal(Boolean(label), Boolean(continent.land[index]), "Land must be assigned and water must be unassigned.");
}

const idFor = (label: number) => `province-${String(label).padStart(2, "0")}`;
const boundaries = traceBorderPaths(labels, width, height);
const neighborsByLabel = Array.from({ length: centers.length + 1 }, () => new Set<number>());
for (const boundary of boundaries) {
  if (boundary.kind !== "shared") continue;
  const [right, left] = boundary.labels;
  neighborsByLabel[right].add(left);
  neighborsByLabel[left].add(right);
}

const borderPaths = boundaries.map(({ kind, labels, points }) => {
  const [startX, startY] = points[0];
  const [endX, endY] = points[points.length - 1];
  return {
    kind,
    territoryIds: labels.map(idFor),
    path: startX === endX && startY === endY ? svgLine(points.slice(0, -1)) + "Z" : svgLine(points),
  };
});

const visited = new Set<number>();
const territories = centers.map(({ x, y }, index) => {
  const label = index + 1;
  const origin = y * width + x;
  assert.equal(labels[origin], label, "A center must belong to its own territory.");
  const queue = [origin];
  visited.add(origin);
  for (const cell of queue) {
    for (const neighbor of neighborsOf(cell)) {
      if (labels[neighbor] === label && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  const rings = traceRings(labels, label);
  validateOutline(rings, label);
  return {
    id: idFor(label),
    name: `Province ${label}`,
    seed: [x + 0.5, y + 0.5],
    labelAnchor: labelAnchor(queue, label, [x, y]),
    neighborIds: [...neighborsByLabel[label]].sort((a, b) => a - b).map(idFor),
    path: svgPath(rings),
    ownerFactionId: null,
  };
});
assert.equal(visited.size, continent.land.reduce((sum, land) => sum + land, 0), "Every territory must connect to its center.");
for (const territory of territories) {
  for (const neighborId of territory.neighborIds) {
    assert.ok(territories.find(({ id }) => id === neighborId)?.neighborIds.includes(territory.id));
  }
}

const reliefBands = 6;
const relief = Uint32Array.from(continent.elevations, (elevation, index) =>
  labels[index] ? Math.min(reliefBands, 1 + Math.floor((elevation - seaLevel) * 35)) : 0,
);
const reliefPaths = Array.from({ length: reliefBands }, (_, i) => svgPath(traceRings(relief, i + 1)));
const worldMap = { width, height, territories, reliefPaths, borderPaths };
await writeFile(new URL("../shared/src/world-map.ts", import.meta.url),
  "// Generated by node scripts/export-world-map.mts.\n"
    + `export const worldMap = ${JSON.stringify(worldMap, null, 2)};\n`,
);
console.log(`Exported seed ${settings.seed} with ${territories.length} connected territories.`);
