import { schema, t, type SchemaType } from "@colyseus/schema";

export const ArenaPlayer = schema({
  color: t.string(),
  x: t.float64(),
  y: t.float64(),
  aim: t.float64(),
}, "ArenaPlayer");

export const ArenaState = schema({
  players: t.map(ArenaPlayer),
}, "ArenaState");
export type ArenaState = SchemaType<typeof ArenaState>;

export const ArenaInput = schema({
  moveX: t.int8(),
  moveY: t.int8(),
  aimX: t.float64(),
  aimY: t.float64(),
}, "ArenaInput");
export type ArenaInput = SchemaType<typeof ArenaInput>;
