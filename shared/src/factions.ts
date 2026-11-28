export const flagSize = 6;
export const flagCellCount = flagSize ** 2;

// Cells are stored left to right, starting with the top row.
export type FactionFlag = readonly string[];
export type Faction = { id: string; name: string; color: string; flag?: FactionFlag };

export function factionFlag(faction: Pick<Faction, "color" | "flag">): FactionFlag {
  return faction.flag ?? Array<string>(flagCellCount).fill(faction.color);
}

export type CreateFactionResult =
  | { ok: true; faction: Faction }
  | { ok: false; error: string };
