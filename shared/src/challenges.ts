export type TerritoryChallenge = {
  territoryId: string;
  challengerFactionId: string;
  readyAt: number;
};

export type StartChallengeResult =
  | { ok: true; challenge: TerritoryChallenge }
  | { ok: false; error: string };
