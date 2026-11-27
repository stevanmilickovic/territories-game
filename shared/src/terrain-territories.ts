import type { IslandHeightmap } from "./island.ts";
import { MinQueue } from "./min-queue.ts";
import { assignFlatTerritories, type TerritoryCenter } from "./territory-centers.ts";

type TerrainBorderSettings = {
  ridgeInfluence: number;
  drainageInfluence: number;
  smoothingRadius: number;
};

type LandLink = { to: number; dx: number; dy: number; length: number; cost: number };
type LandLinks = LandLink[][];

function smoothLand(island: IslandHeightmap, radius: number): Float64Array {
  const { width, height, land, elevations } = island;
  const smooth = new Float64Array(land.length);
  for (let index = 0; index < land.length; index++) {
    if (!land[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    let total = 0;
    let count = 0;
    for (let row = Math.max(0, y - radius); row <= Math.min(height - 1, y + radius); row++) {
      for (let column = Math.max(0, x - radius); column <= Math.min(width - 1, x + radius); column++) {
        const neighbor = row * width + column;
        if (!land[neighbor]) continue;
        total += elevations[neighbor];
        count++;
      }
    }
    smooth[index] = total / count;
  }
  return smooth;
}

function buildLandLinks({ width, height, land }: IslandHeightmap): LandLinks {
  const links: LandLinks = Array.from(land, () => []);
  const directions = [[1, 0], [0, 1], [1, 1], [-1, 1]];
  for (let index = 0; index < land.length; index++) {
    if (!land[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    for (const [dx, dy] of directions) {
      const to = index + dy * width + dx;
      if (x + dx < 0 || x + dx >= width || y + dy >= height || !land[to]) continue;
      const diagonal = dx !== 0 && dy !== 0;
      if (diagonal && (!land[index + dx] || !land[index + dy * width])) continue;
      const length = diagonal ? Math.SQRT2 : 1;
      links[index].push({ to, dx, dy, length, cost: length });
      links[to].push({ to: index, dx: -dx, dy: -dy, length, cost: length });
    }
  }
  return links;
}

function traceDrainage(land: Uint8Array, links: LandLinks, elevations: Float64Array) {
  const downstream = new Int32Array(land.length).fill(-1);
  const flow = new Uint32Array(land.length);
  const queue = new MinQueue();
  const order: number[] = [];
  let landCount = 0;
  for (let index = 0; index < land.length; index++) {
    if (!land[index]) continue;
    landCount++;
    // Fewer than four cardinal links means this cell can drain into water.
    if (links[index].filter(({ length }) => length === 1).length < 4) {
      flow[index] = 1;
      queue.push(index, elevations[index]);
    }
  }

  // Flood inward from water. Even a depression gets a route through its lowest outlet.
  for (let outlet = queue.pop(); outlet; outlet = queue.pop()) {
    order.push(outlet.index);
    for (const { to } of links[outlet.index]) {
      if (flow[to]) continue;
      flow[to] = 1;
      downstream[to] = outlet.index;
      queue.push(to, Math.max(outlet.cost, elevations[to]));
    }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const index = order[i];
    const outlet = downstream[index];
    if (outlet >= 0) flow[outlet] += flow[index];
  }
  return { downstream, flow, channelThreshold: Math.max(6, landCount * 0.008) };
}

function applyTerrainCosts(island: IslandHeightmap, links: LandLinks, settings: TerrainBorderSettings) {
  const { width, height, land } = island;
  const { ridgeInfluence, drainageInfluence, smoothingRadius } = settings;
  const elevations = smoothLand(island, smoothingRadius);
  const drainage = drainageInfluence > 0 ? traceDrainage(land, links, elevations) : null;
  const shoulderDistance = Math.max(2, smoothingRadius + 1);

  function landElevation(x: number, y: number): number | undefined {
    if (x < 0 || x >= width || y < 0 || y >= height) return undefined;
    const index = y * width + x;
    return land[index] ? elevations[index] : undefined;
  }

  function channelCrossing(from: number, to: number, dx: number, dy: number): number {
    if (!drainage || drainage.flow[from] < drainage.channelThreshold) return 0;
    const down = drainage.downstream[from];
    if (down < 0) return 0;

    const flowX = down % width - from % width;
    const flowY = Math.floor(down / width) - Math.floor(from / width);
    const cross = Math.abs(flowX * dy - flowY * dx) / (Math.hypot(flowX, flowY) * Math.hypot(dx, dy));
    const bank = Math.max(0, elevations[to] - elevations[from]);
    const channelSize = Math.min(1, drainage.flow[from] / (4 * drainage.channelThreshold));
    return cross * channelSize * Math.min(1, bank * 30);
  }

  for (let from = 0; from < links.length; from++) {
    const x = from % width;
    const y = Math.floor(from / width);
    for (const link of links[from]) {
      const { to, dx, dy, length } = link;
      const before = landElevation(x - dx * shoulderDistance, y - dy * shoulderDistance);
      const after = landElevation(x + dx * (shoulderDistance + 1), y + dy * (shoulderDistance + 1));
      const crest = (elevations[from] + elevations[to]) / 2;
      const ridge = before === undefined || after === undefined
        ? 0
        : Math.min(1, Math.max(0, (crest - Math.max(before, after)) * 20));
      const channel = Math.max(channelCrossing(from, to, dx, dy), channelCrossing(to, from, -dx, -dy));
      link.cost = length * (1 + ridge * ridgeInfluence + channel * drainageInfluence);
    }
  }
}

export function assignTerrainTerritories(
  island: IslandHeightmap,
  centers: readonly TerritoryCenter[],
  settings: TerrainBorderSettings,
): Uint32Array {
  const { ridgeInfluence, drainageInfluence, smoothingRadius } = settings;
  if (!Number.isFinite(ridgeInfluence) || ridgeInfluence < 0
    || !Number.isFinite(drainageInfluence) || drainageInfluence < 0
    || !Number.isSafeInteger(smoothingRadius) || smoothingRadius < 0) {
    throw new RangeError("Terrain border influences and smoothing radius must be nonnegative.");
  }

  const { width, height, land } = island;
  const origins = centers.map(({ x, y, strength }) => {
    const index = y * width + x;
    if (!Number.isInteger(x) || x < 0 || x >= width || !Number.isInteger(y) || y < 0 || y >= height
      || !land[index] || !Number.isFinite(strength) || strength <= 0) {
      throw new RangeError("Each territory center needs a land cell and a positive, finite strength.");
    }
    return index;
  });
  if (origins.length === 0 || new Set(origins).size !== origins.length) {
    throw new RangeError("Terrain assignment needs distinct territory centers.");
  }
  if (ridgeInfluence === 0 && drainageInfluence === 0) return assignFlatTerritories(island, centers);

  const links = buildLandLinks(island);
  applyTerrainCosts(island, links, settings);
  const best = new Float64Array(land.length).fill(Infinity);
  const labels = new Uint32Array(land.length);
  const distances = new Float64Array(land.length);
  const queue = new MinQueue();

  for (const [centerIndex, origin] of origins.entries()) {
    const { strength } = centers[centerIndex];
    distances.fill(Infinity);
    distances[origin] = 0;
    queue.push(origin, 0);

    // A stronger center can overtake a weaker one farther along the same route.
    // Search from each center before comparing their weighted distances.
    for (let entry = queue.pop(); entry; entry = queue.pop()) {
      const { index, cost } = entry;
      if (cost !== distances[index]) continue;
      const weightedCost = cost / strength;
      if (weightedCost < best[index]) {
        best[index] = weightedCost;
        labels[index] = centerIndex + 1;
      }
      for (const link of links[index]) {
        const next = cost + link.cost;
        if (next >= distances[link.to]) continue;
        distances[link.to] = next;
        queue.push(link.to, next);
      }
    }
  }
  return labels;
}
