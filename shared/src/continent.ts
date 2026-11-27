import type { Heightmap } from "./heightmap.ts";

export type ContinentalHeightmap = Heightmap & {
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
      const x = index % width;
      for (const neighbor of [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        index - width,
        index + width,
      ]) {
        if (!land[neighbor] || visited[neighbor]) continue;
        visited[neighbor] = 1;
        queue[length++] = neighbor;
      }
    }
    if (length > largest.length) largest = queue.slice(0, length);
  }
  return largest;
}

export function shapeContinent(heightmap: Heightmap, seaLevel: number): ContinentalHeightmap {
  const { width, height, elevations: source } = heightmap;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1
    || source.length !== width * height) {
    throw new RangeError("Heightmap dimensions must match the elevation grid.");
  }
  if (!Number.isFinite(seaLevel) || seaLevel <= 0 || seaLevel >= 1) {
    throw new RangeError("Sea level must be between zero and one.");
  }

  const land = Uint8Array.from(source, (elevation) => Number(elevation > seaLevel));
  const mainland = largestLandComponent(land, width);
  if (mainland.length === 0) throw new RangeError("Sea level leaves no land on this heightmap.");

  const elevations = source.slice();
  land.fill(0);
  for (const index of mainland) land[index] = 1;
  for (let index = 0; index < elevations.length; index++) {
    if (!land[index] && elevations[index] > seaLevel) elevations[index] = 0;
  }

  return { width, height, elevations, land, seaLevel };
}
