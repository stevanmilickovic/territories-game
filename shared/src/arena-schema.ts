import { schema, t, type SchemaType } from "@colyseus/schema";

export const ArenaPlayer = schema({
  displayName: t.string(),
  color: t.string(),
  factionId: t.string(),
  health: t.uint8(),
  respawnAt: t.float64(),
  life: t.uint32(),
  x: t.float64(),
  y: t.float64(),
  aim: t.float64(),
}, "ArenaPlayer");

export const ArenaProjectile = schema({
  x: t.float64(),
  y: t.float64(),
}, "ArenaProjectile");

export const ArenaState = schema({
  players: t.map(ArenaPlayer),
  projectiles: t.map(ArenaProjectile),
  ownerFactionId: t.string(),
  captureFactionId: t.string(),
  captureTicks: t.uint16(),
  captureContested: t.boolean(),
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
