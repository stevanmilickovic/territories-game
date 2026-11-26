import { schema, t, type SchemaType } from "@colyseus/schema";

export const ArenaPlayer = schema({
  color: t.string(),
  factionId: t.string(),
  health: t.uint8(),
  respawnAt: t.float64(),
  life: t.uint32(),
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
  fire: t.boolean(),
  life: t.uint32(),
}, "ArenaInput");
export type ArenaInput = SchemaType<typeof ArenaInput>;
