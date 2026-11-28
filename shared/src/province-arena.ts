import type { ArenaPoint } from "./arena.ts";
import { worldMap } from "./world-map.ts";

export type ArenaEdge = { from: ArenaPoint; to: ArenaPoint };
export type ArenaBorder = { edges: ArenaEdge[]; neighborId?: string };
export type ProvinceArena = {
  width: number;
  height: number;
  rings: ArenaPoint[][];
  edges: ArenaEdge[];
  borders: ArenaBorder[];
  capturePoint: ArenaPoint;
};

function outlinePoints(path: string, scale = 1): ArenaPoint[][] {
  const rings: ArenaPoint[][] = [];
  for (const [, command, coordinates] of path.matchAll(/([MLQZ])([^MLQZ]*)/g)) {
    const [x, y, endX, endY] = coordinates.split(" ").map(Number);
    if (command === "M") {
      rings.push([{ x, y }]);
      continue;
    }
    const ring = rings[rings.length - 1];
    const last = ring[ring.length - 1];
    if (command === "Q") {
      const bend = Math.hypot(last.x + endX - 2 * x, last.y + endY - 2 * y);
      const count = Math.max(1, Math.ceil(Math.sqrt(bend * scale / 4)));
      for (let index = 1; index <= count; index++) {
        const t = index / count;
        const u = 1 - t;
        ring.push({ x: u * u * last.x + 2 * u * t * x + t * t * endX, y: u * u * last.y + 2 * u * t * y + t * t * endY });
      }
    } else {
      const next = command === "Z" ? ring[0] : { x, y };
      if (last.x !== next.x || last.y !== next.y) ring.push(next);
    }
  }
  return rings;
}

function edgesOf(points: readonly ArenaPoint[]): ArenaEdge[] {
  return points.slice(1).map((to, index) => ({ from: points[index], to }));
}

export function pointEdgeDistanceSquared(point: ArenaPoint, { from, to }: ArenaEdge): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  const fraction = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)));
  return (point.x - from.x - fraction * dx) ** 2 + (point.y - from.y - fraction * dy) ** 2;
}

export function containsArenaPoint(edges: readonly ArenaEdge[], point: ArenaPoint, clearance = 0): boolean {
  let inside = false;
  for (const edge of edges) {
    const { from, to } = edge;
    if ((from.y > point.y) !== (to.y > point.y)
      && point.x < from.x + (point.y - from.y) * (to.x - from.x) / (to.y - from.y)) inside = !inside;
    if (clearance > 0 && pointEdgeDistanceSquared(point, edge) < clearance ** 2) return false;
  }
  return inside;
}

const layouts = new Map<string, ProvinceArena>();

export function getProvinceArena(territoryId: string): ProvinceArena {
  const cached = layouts.get(territoryId);
  if (cached) return cached;
  const province = worldMap.territories.find(({ id }) => id === territoryId);
  if (!province) throw new Error(`Unknown province ${territoryId}`);
  const frame = outlinePoints(province.path).flat();
  const minX = Math.min(...frame.map(point => point.x));
  const minY = Math.min(...frame.map(point => point.y));
  const spanX = Math.max(...frame.map(point => point.x)) - minX;
  const spanY = Math.max(...frame.map(point => point.y)) - minY;
  const scale = 2304 / Math.max(spanX, spanY);
  const width = Math.max(480, Math.ceil(spanX * scale + 96));
  const height = Math.max(480, Math.ceil(spanY * scale + 96));
  const transform = ({ x, y }: ArenaPoint) => ({
    x: (x - minX) * scale + (width - spanX * scale) / 2,
    y: (y - minY) * scale + (height - spanY * scale) / 2,
  });
  const convert = (path: string) => outlinePoints(path, scale).map(ring => ring.map(transform));
  const rings = convert(province.path);
  const edges = rings.flatMap(edgesOf);
  const borders = worldMap.borderPaths.flatMap(({ path, territoryIds }) => {
    const index = territoryIds.indexOf(territoryId);
    if (index < 0) return [];
    const [points] = convert(path);
    return [{ edges: edgesOf(index === 0 ? points : points.reverse()), neighborId: territoryIds[1 - index] }];
  });

  const [seedX, seedY] = province.seed;
  let capturePoint = transform({ x: seedX, y: seedY });
  let closest = Infinity;
  for (let y = 16; y < height; y += 32) {
    for (let x = 16; x < width; x += 32) {
      const distance = (x - width / 2) ** 2 + (y - height / 2) ** 2;
      if (distance >= closest || !containsArenaPoint(edges, { x, y }, 48)) continue;
      capturePoint = { x, y };
      closest = distance;
    }
  }
  const layout = { width, height, rings, edges, borders, capturePoint };
  layouts.set(territoryId, layout);
  return layout;
}
