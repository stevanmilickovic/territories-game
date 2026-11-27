import type { Heightmap } from "./heightmap.ts";

export type IslandHeightmap = Heightmap & {
  // 1 for playable land and 0 for water, in the same order as elevations.
  land: Uint8Array;
  seaLevel: number;
};

function largestLandComponent(land: Uint8Array, width: number): Uint32Array {
  const queue = new Uint32Array(land.length);
  const visited = new Uint8Array(land.length);
  let largest = new Uint32Array(0);

  for (let start = 0; start < land.length; start++) {
    if (!land[start] || visited[start]) continue;

    queue[0] = start;
    visited[start] = 1;
    let length = 1;
    for (let head = 0; head < length; head++) {
      const index = queue[head];
      // The ocean rim keeps every land index away from the grid edges.
      for (const neighbor of [index - 1, index + 1, index - width, index + width]) {
        if (!land[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        queue[length++] = neighbor;
      }
    }
    if (length > largest.length) largest = queue.slice(0, length);
  }
  return largest;
}

export function shapeIsland(heightmap: Heightmap, seaLevel: number): IslandHeightmap {
  const { width, height, elevations: source } = heightmap;
  if (!Number.isInteger(width) || width < 3 || !Number.isInteger(height) || height < 3
    || source.length !== width * height) {
    throw new RangeError("The island needs a heightmap with room for an ocean rim.");
  }
  if (!Number.isFinite(seaLevel) || seaLevel <= 0 || seaLevel >= 1) {
    throw new RangeError("Sea level must be between zero and one.");
  }

  const elevations = new Float32Array(source.length);
  const land = new Uint8Array(source.length);
  const falloffStart = 0.35;
  const falloffEnd = 0.92;

  for (let y = 0; y < height; y++) {
    const normalizedY = (2 * y) / (height - 1) - 1;
    for (let x = 0; x < width; x++) {
      const normalizedX = (2 * x) / (width - 1) - 1;
      const radius = Math.hypot(normalizedX, normalizedY);
      const falloff = Math.max(0, Math.min(1, (radius - falloffStart) / (falloffEnd - falloffStart)));
      const attenuation = 1 - falloff * falloff * (3 - 2 * falloff);
      const index = y * width + x;
      elevations[index] = source[index] * attenuation;
      land[index] = Number(elevations[index] > seaLevel);
    }
  }

  const mainland = largestLandComponent(land, width);
  if (mainland.length === 0) throw new RangeError("Sea level leaves no land on this heightmap.");

  land.fill(0);
  for (const index of mainland) land[index] = 1;
  for (let index = 0; index < elevations.length; index++) {
    if (!land[index] && elevations[index] > seaLevel) elevations[index] = 0;
  }

  return { width, height, elevations, land, seaLevel };
}
