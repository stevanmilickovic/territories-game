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
export const arenaMaxDimension = 2400;

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

export function arenaBoundaryDistance(edges: readonly ArenaEdge[], origin: ArenaPoint, dx: number, dy: number, limit: number): number {
  let closest = limit;
  for (const { from, to } of edges) {
    const edgeX = to.x - from.x, edgeY = to.y - from.y;
    const determinant = dx * edgeY - dy * edgeX;
    if (Math.abs(determinant) < 1e-8) continue;
    const relativeX = from.x - origin.x, relativeY = from.y - origin.y;
    const distance = (relativeX * edgeY - relativeY * edgeX) / determinant;
    const along = (relativeX * dy - relativeY * dx) / determinant;
    if (distance >= 0 && distance < closest && along >= -1e-8 && along <= 1 + 1e-8) closest = distance;
  }
  return closest;
}

export function canTraverseArena(edges: readonly ArenaEdge[], from: ArenaPoint, to: ArenaPoint, radius: number): boolean {
  if (!containsArenaPoint(edges, to, radius)) return false;
  const dx = to.x - from.x, dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return true;
  if (arenaBoundaryDistance(edges, from, dx / distance, dy / distance, distance) < distance) return false;
  const travel = { from, to };
  const radiusSquared = radius ** 2;
  return edges.every(edge => pointEdgeDistanceSquared(edge.from, travel) >= radiusSquared);
}

export function insetArenaEdge({ from, to }: ArenaEdge, along: number, inset: number): ArenaPoint {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  return { x: from.x + dx * along - dy * inset / length, y: from.y + dy * along + dx * inset / length };
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
  const scale = (arenaMaxDimension - 96) / Math.max(spanX, spanY);
  const width = Math.max(480, Math.round(spanX * scale + 96));
  const height = Math.max(480, Math.round(spanY * scale + 96));
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
