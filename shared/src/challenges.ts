export type TerritoryChallenge = {
  territoryId: string;
  challengerFactionId: string;
};

export type StartChallengeResult =
  | { ok: true; challenge: TerritoryChallenge }
  | { ok: false; error: string };

export type ArenaEntryResult<Reservation> =
  | { ok: true; reservation: Reservation }
  | { ok: false; error: string };

export type TerritoryActivity = {
  owners: Record<string, string | null>;
  challenges: TerritoryChallenge[];
};
