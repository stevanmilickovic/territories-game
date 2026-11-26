export const arenaLayout = { width: 800, height: 480, edgeInset: 32 };
export const arenaTickRate = 30;
export const arenaPlayerRadius = 9;

export type ArenaPoint = { x: number; y: number };

export type ArenaPlayer = ArenaPoint & {
  sessionId: string;
  color: string;
  aim: number;
};

export type ArenaInput = { moveX: number; moveY: number; aimX: number; aimY: number };

export function stepArenaMovement(
  player: ArenaPoint & { aim: number },
  input: ArenaInput,
  dt: number,
): ArenaPoint & { aim: number } {
  const distance = 180 * dt / Math.max(1, Math.hypot(input.moveX, input.moveY));
  const x = Math.max(arenaPlayerRadius, Math.min(arenaLayout.width - arenaPlayerRadius, player.x + input.moveX * distance));
  const y = Math.max(arenaPlayerRadius, Math.min(arenaLayout.height - arenaPlayerRadius, player.y + input.moveY * distance));
  const aimX = input.aimX - x;
  const aimY = input.aimY - y;
  const aim = aimX === 0 && aimY === 0 ? player.aim : Math.atan2(aimY, aimX);
  return { x, y, aim };
}
