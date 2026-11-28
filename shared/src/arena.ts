import { arenaMaxDimension, canTraverseArena, type ProvinceArena } from "./province-arena.ts";

export const arenaSpawnInset = 32;
export const arenaTickRate = 30;
export const arenaPlayerRadius = 9;
export const arenaPickupRadius = 32;
export const arenaMaxHealth = 100;
export const arenaRespawnDelayMs = 5000;
export const arenaCaptureRadius = 24;
export const arenaCaptureTicks = 3 * arenaTickRate;
export const arenaWeapon = {
  id: "ak-47",
  name: "AK-47",
  damage: 25,
  shotIntervalTicks: 3,
  projectileSpeed: 1200,
  range: Math.hypot(arenaMaxDimension, 1440),
};

export type ArenaPoint = { x: number; y: number };
export type ArenaShot = { shooterId: string; from: ArenaPoint; to: ArenaPoint; hit: boolean };

export function stepArenaMovement(
  player: ArenaPoint & { aim: number },
  input: { moveX: number; moveY: number; aimX: number; aimY: number },
  dt: number,
  layout: ProvinceArena,
): ArenaPoint & { aim: number } {
  const distance = 180 * dt / Math.max(1, Math.hypot(input.moveX, input.moveY));
  let x = player.x + input.moveX * distance;
  let y = player.y + input.moveY * distance;
  if ((x !== player.x || y !== player.y) && !canTraverseArena(layout.edges, player, { x, y }, arenaPlayerRadius)) {
    if (x !== player.x && canTraverseArena(layout.edges, player, { x, y: player.y }, arenaPlayerRadius)) y = player.y;
    else if (y !== player.y && canTraverseArena(layout.edges, player, { x: player.x, y }, arenaPlayerRadius)) x = player.x;
    else ({ x, y } = player);
  }
  const aimX = input.aimX - x;
  const aimY = input.aimY - y;
  const aim = aimX === 0 && aimY === 0 ? player.aim : Math.atan2(aimY, aimX);
  return { x, y, aim };
}
