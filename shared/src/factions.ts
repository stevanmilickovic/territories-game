export type Faction = { id: string; name: string; color: string };

export type CreateFactionResult =
  | { ok: true; faction: Faction }
  | { ok: false; error: string };
