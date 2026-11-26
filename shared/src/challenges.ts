export type TerritoryChallenge = {
  territoryId: string;
  challengerFactionId: string;
  closesAt: number;
};

export type StartChallengeResult =
  | { ok: true; challenge: TerritoryChallenge }
  | { ok: false; error: string };
