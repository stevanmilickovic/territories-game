export const arenaLayout = { width: 800, height: 480, edgeInset: 32 };

export type ArenaPoint = { x: number; y: number };

export type ArenaPlayer = ArenaPoint & {
  sessionId: string;
  color: string;
};
