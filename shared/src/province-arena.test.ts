import { describe, expect, it } from "vitest";
import { arenaCaptureRadius, arenaPlayerRadius, arenaSpawnInset, stepArenaMovement } from "./arena.ts";
import { pickAttackSpawn, selectAttackOrigin } from "./arena-spawn.ts";
import { arenaBoundaryDistance, canTraverseArena, containsArenaPoint, getProvinceArena, pointEdgeDistanceSquared, type ProvinceArena } from "./province-arena.ts";
import { worldMap } from "./world-map.ts";

function testLayout(coordinates: [number, number][]): ProvinceArena {
  const points = coordinates.map(([x, y]) => ({ x, y }));
  const ring = [...points, points[0]];
  const edges = points.map((from, index) => ({ from, to: ring[index + 1] }));
  return { width: 400, height: 400, rings: [ring], edges, borders: [{ edges }], capturePoint: { x: 50, y: 50 } };
}

describe("province arenas", () => {
  it("gives every province a closed, scaled outline with a playable capture point", () => {
    for (const { id, neighborIds } of worldMap.territories) {
      const layout = getProvinceArena(id);
      expect(Math.max(layout.width, layout.height), id).toBe(2400);
      expect(layout.rings.every(ring => ring[0].x === ring.at(-1)?.x && ring[0].y === ring.at(-1)?.y), id).toBe(true);
      expect(containsArenaPoint(layout.edges, layout.capturePoint, arenaCaptureRadius + arenaPlayerRadius), id).toBe(true);
      expect([...new Set(layout.borders.flatMap(border => border.neighborId ?? []))].sort(), id).toEqual(neighborIds);
    }
  });

  it("stops a ray at the first concave edge even when it could re-enter land", () => {
    const { edges } = testLayout([[0, 0], [100, 0], [100, 100], [70, 100], [70, 30], [30, 30], [30, 100], [0, 100]]);
    const origin = { x: 15, y: 75 };
    expect(arenaBoundaryDistance(edges, origin, 1, 0, 200)).toBe(15);
    expect(canTraverseArena(edges, origin, { x: 85, y: 75 }, arenaPlayerRadius)).toBe(false);
  });

  it("keeps the player radius inside an angled edge and allows movement along it", () => {
    const layout = testLayout([[0, 0], [100, 0], [0, 100]]);
    const player = { x: 45, y: 40, aim: 0 };
    const input = { moveX: 1, moveY: 0, aimX: 100, aimY: 40 };
    expect(stepArenaMovement(player, input, 1 / 30, layout)).toMatchObject({ x: 45, y: 40 });
    const along = stepArenaMovement(player, { ...input, moveY: -1 }, 1 / 30, layout);
    expect(along.x).toBeGreaterThan(player.x);
    expect(along.y).toBeLessThan(player.y);
    expect(containsArenaPoint(layout.edges, along, arenaPlayerRadius)).toBe(true);
  });

  it("chooses the longest usable shared border from the faction’s holdings", () => {
    const layout = testLayout([[0, 0], [400, 0], [400, 200], [0, 200]]);
    layout.borders = [
      { edges: [layout.edges[0]], neighborId: "long" },
      { edges: [layout.edges[1]], neighborId: "short" },
    ];
    expect(selectAttackOrigin(layout, new Set(["short", "foreign", "long"]))).toBe("long");
    expect(selectAttackOrigin(layout, new Set(["short", "foreign"]))).toBe("short");
    expect(selectAttackOrigin(layout, new Set(["foreign"]))).toBeUndefined();
  });

  it("spawns landless attackers on the full perimeter and landed attackers on their chosen border", () => {
    for (const { id, neighborIds } of worldMap.territories) {
      const layout = getProvinceArena(id);
      for (const origin of [undefined, ...neighborIds]) {
        const allowed = layout.borders.filter(border => origin === undefined || border.neighborId === origin)
          .flatMap(border => border.edges);
        for (const random of [0, 0.25, 0.5, 0.75, 0.99]) {
          const point = pickAttackSpawn(layout, origin, () => random);
          expect(point, `${id} from ${origin}`).toBeDefined();
          expect(containsArenaPoint(layout.edges, point!, arenaPlayerRadius)).toBe(true);
          expect(allowed.some(edge => pointEdgeDistanceSquared(point!, edge) <= (arenaSpawnInset + 0.001) ** 2)).toBe(true);
        }
      }
    }
  });
});
