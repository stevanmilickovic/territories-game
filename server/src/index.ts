import { randomUUID } from "node:crypto";
import { defineRoom, defineServer, Room, type Client } from "colyseus";
import type { StartChallengeResult, TerritoryChallenge } from "../../shared/src/challenges.ts";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";
import { worldMap } from "../../shared/src/world-map.ts";

type GuestClient = Client<{ userData: { guestName: string } }>;
const gatheringWindowMs = 30_000;

class WorldRoom extends Room {
  autoDispose = false;
  private nextGuestNumber = 1;
  private readonly factionsByFounder = new Map<string, Faction>();
  private readonly challengesByTerritory = new Map<string, TerritoryChallenge>();

  messages = {
    startChallenge: (client: GuestClient, territoryId: unknown): StartChallengeResult => {
      const faction = this.factionsByFounder.get(client.sessionId);
      if (!faction) {
        return { ok: false, error: "Found a faction before challenging a territory." };
      }

      const territory = worldMap.territories.find((territory) => territory.id === territoryId);
      if (!territory) {
        return { ok: false, error: "Choose a valid territory." };
      }

      const now = Date.now();
      const existing = this.challengesByTerritory.get(territory.id);
      if (existing && existing.closesAt > now) {
        return { ok: false, error: "This territory already has an open challenge." };
      }

      const challenge = {
        territoryId: territory.id,
        challengerFactionId: faction.id,
        closesAt: now + gatheringWindowMs,
      };
      this.challengesByTerritory.set(territory.id, challenge);
      this.clock.setTimeout(() => {
        if (this.challengesByTerritory.get(territory.id) === challenge) {
          this.challengesByTerritory.delete(territory.id);
        }
      }, gatheringWindowMs);
      return { ok: true, challenge };
    },

    createFaction: (client: GuestClient, payload: unknown): CreateFactionResult => {
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return { ok: false, error: "Provide a faction name and color." };
      }

      const name = "name" in payload && typeof payload.name === "string" ? payload.name.trim() : "";
      if (name.length < 1 || name.length > 40) {
        return { ok: false, error: "Use a faction name between 1 and 40 characters." };
      }

      const color = "color" in payload ? payload.color : undefined;
      if (typeof color !== "string" || color.length !== 7 || !/^#[0-9a-f]{6}$/i.test(color)) {
        return { ok: false, error: "Use a six-digit hex color such as #369b72." };
      }

      if (this.factionsByFounder.has(client.sessionId)) {
        return { ok: false, error: "You already founded a faction in this session." };
      }

      const faction = { id: randomUUID(), name, color: color.toLowerCase() };
      this.factionsByFounder.set(client.sessionId, faction);
      this.broadcast("factions", [...this.factionsByFounder.values()]);
      return { ok: true, faction };
    },
  };

  onJoin(client: GuestClient) {
    const guestName = `Guest ${this.nextGuestNumber++}`;
    client.userData = { guestName };
    client.send("guestName", guestName);
    client.send("factions", [...this.factionsByFounder.values()]);
  }
}

const server = defineServer({
  rooms: {
    world: defineRoom(WorldRoom),
  },
});

await server.listen(2567, "127.0.0.1");
