export type TerritoryChallenge = {
  territoryId: string;
  challengerFactionId: string;
  readyAt: number;
};

export type StartChallengeResult =
  | { ok: true; challenge: TerritoryChallenge }
  | { ok: false; error: string };

export type ArenaEntryResult = { ok: true } | { ok: false; error: string };

export type TerritoryActivity = {
  serverTime: number;
  owners: Record<string, string | null>;
  challenges: TerritoryChallenge[];
};
