export type TerritoryChallenge = {
  territoryId: string;
  challengerFactionId: string;
  readyAt: number;
};

export type StartChallengeResult =
  | { ok: true; challenge: TerritoryChallenge }
  | { ok: false; error: string };

export type ArenaEntryResult<Reservation> =
  | { ok: true; reservation: Reservation }
  | { ok: false; error: string };

export type TerritoryActivity = {
  serverTime: number;
  owners: Record<string, string | null>;
  challenges: TerritoryChallenge[];
};
