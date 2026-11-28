import { arenaPlayerRadius, arenaSpawnInset, type ArenaPoint } from "./arena.ts";
import { containsArenaPoint, insetArenaEdge, type ArenaEdge, type ProvinceArena } from "./province-arena.ts";

type SpawnSlot = { edge: ArenaEdge; from: number; to: number; weight: number; point: ArenaPoint };
type SpawnRegion = { slots: SpawnSlot[]; length: number };
const spawnRegions = new WeakMap<ProvinceArena, Map<string | undefined, SpawnRegion>>();

function regionsFor(layout: ProvinceArena): Map<string | undefined, SpawnRegion> {
  const cached = spawnRegions.get(layout);
  if (cached) return cached;
  const regions = new Map<string | undefined, SpawnRegion>();
  const perimeter: SpawnRegion = { slots: [], length: 0 };

  for (const { edges, neighborId } of layout.borders) {
    const region = neighborId ? regions.get(neighborId) ?? { slots: [], length: 0 } : perimeter;
    if (neighborId) regions.set(neighborId, region);
    for (const edge of edges) {
      const length = Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y);
      const count = Math.max(1, Math.ceil(length / 12));
      const weight = length / count;
      for (let index = 0; index < count; index++) {
        const from = index / count, to = (index + 1) / count;
        const point = insetArenaEdge(edge, (from + to) / 2, arenaSpawnInset);
        if (!containsArenaPoint(layout.edges, point, arenaPlayerRadius)) continue;
        const slot = { edge, from, to, weight, point };
        region.slots.push(slot);
        region.length += weight;
        if (region !== perimeter) {
          perimeter.slots.push(slot);
          perimeter.length += weight;
        }
      }
    }
  }
  regions.set(undefined, perimeter);
  spawnRegions.set(layout, regions);
  return regions;
}

export function selectAttackOrigin(layout: ProvinceArena, ownedTerritoryIds: ReadonlySet<string>): string | undefined {
  const regions = regionsFor(layout);
  let longest = 0;
  let origin: string | undefined;
  for (const id of [...ownedTerritoryIds].sort()) {
    const length = regions.get(id)?.length ?? 0;
    if (length <= longest) continue;
    longest = length;
    origin = id;
  }
  return origin;
}

export function pickAttackSpawn(layout: ProvinceArena, originId?: string, random = Math.random): ArenaPoint | undefined {
  const region = regionsFor(layout).get(originId);
  if (!region) return;
  let distance = random() * region.length;
  for (const slot of region.slots) {
    if (distance < slot.weight) {
      const along = slot.from + (slot.to - slot.from) * distance / slot.weight;
      const point = insetArenaEdge(slot.edge, along, arenaSpawnInset);
      return containsArenaPoint(layout.edges, point, arenaPlayerRadius) ? point : slot.point;
    }
    distance -= slot.weight;
  }
  return region.slots.at(-1)?.point;
}
