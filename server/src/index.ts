import { randomUUID } from "node:crypto";
import { defineRoom, defineServer, matchMaker, Room, type Client } from "colyseus";
import type {
  ArenaEntryResult,
  StartChallengeResult,
  TerritoryActivity,
  TerritoryChallenge,
} from "../../shared/src/challenges.ts";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";
import { worldMap } from "../../shared/src/world-map.ts";
import { canAttackTerritory } from "./attack-eligibility.ts";
import { TerritoryArena } from "./territory-arena.ts";

type GuestClient = Client<{ userData: { guestName: string } }>;
type ArenaReservation = Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>;
const gatheringWindowMs = 0; // Skip the gathering delay during local playtesting.

class WorldRoom extends Room {
  autoDispose = false;
  private nextGuestNumber = 1;
  private readonly factionsByFounder = new Map<string, Faction>();
  private readonly ownership = new Map<string, string | null>(
    worldMap.territories.map(({ id, ownerFactionId }) => [id, ownerFactionId]),
  );
  private readonly challengesByTerritory = new Map<string, Map<string, TerritoryChallenge>>();
  private readonly arenasByTerritory = new Map<string, ReturnType<typeof matchMaker.createRoom>>();

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

      if (!canAttackTerritory(faction.id, territory, this.ownership)) {
        return { ok: false, error: "Choose an adjacent territory your faction does not own." };
      }

      const challenges = this.challengesByTerritory.get(territory.id)
        ?? new Map<string, TerritoryChallenge>();
      if (challenges.has(faction.id)) {
        return { ok: false, error: "Your faction has already challenged this territory." };
      }

      const challenge = {
        territoryId: territory.id,
        challengerFactionId: faction.id,
        readyAt: Date.now() + gatheringWindowMs,
      };
      challenges.set(faction.id, challenge);
      this.challengesByTerritory.set(territory.id, challenges);
      this.broadcast("territoryActivity", this.getTerritoryActivity());
      return { ok: true, challenge };
    },

    enterArena: async (client: GuestClient, territoryId: unknown): Promise<ArenaEntryResult<ArenaReservation>> => {
      const faction = this.factionsByFounder.get(client.sessionId);
      if (!faction) return { ok: false, error: "Found a faction before entering an arena." };
      if (typeof territoryId !== "string" || !this.ownership.has(territoryId)) {
        return { ok: false, error: "Choose a valid territory." };
      }
      if (this.ownership.get(territoryId) !== faction.id) {
        const challenge = this.challengesByTerritory.get(territoryId)?.get(faction.id);
        if (!challenge) return { ok: false, error: "Declare a challenge before entering." };
        if (Date.now() < challenge.readyAt) return { ok: false, error: "Your faction is still gathering." };
      }

      let arena = this.arenasByTerritory.get(territoryId);
      if (!arena) {
        arena = matchMaker.createRoom("territoryArena", {
          territoryId,
          ownerFactionId: this.ownership.get(territoryId),
        }).then((listing) => {
          const room = matchMaker.getLocalRoomById(listing.roomId);
          if (!(room instanceof TerritoryArena)) throw new Error("Territory arena must be local.");
          room.onTerritoryCaptured = (factionId) => this.applyCapture(territoryId, factionId);
          return listing;
        }).catch((error: unknown) => {
          this.arenasByTerritory.delete(territoryId);
          throw error;
        });
        this.arenasByTerritory.set(territoryId, arena);
      }

      const reservation = await matchMaker.reserveSeatFor(await arena, {}, {
        guestSessionId: client.sessionId,
        factionId: faction.id,
        color: faction.color,
      });
      return { ok: true, reservation };
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

  private applyCapture(territoryId: string, factionId: string) {
    const formerOwner = this.ownership.get(territoryId);
    if (formerOwner === factionId) return;

    const challenges = this.challengesByTerritory.get(territoryId)
      ?? new Map<string, TerritoryChallenge>();
    challenges.delete(factionId);
    if (formerOwner) {
      // The former defender can keep contesting the arena after losing ownership.
      challenges.set(formerOwner, {
        territoryId,
        challengerFactionId: formerOwner,
        readyAt: Date.now(),
      });
    }
    this.challengesByTerritory.set(territoryId, challenges);
    this.ownership.set(territoryId, factionId);
    this.broadcast("territoryActivity", this.getTerritoryActivity());
  }

  private getTerritoryActivity(): TerritoryActivity {
    return {
      serverTime: Date.now(),
      owners: Object.fromEntries(this.ownership),
      challenges: Array.from(this.challengesByTerritory.values()).flatMap(
        (challenges) => [...challenges.values()],
      ),
    };
  }

  onJoin(client: GuestClient) {
    const guestName = `Guest ${this.nextGuestNumber++}`;
    client.userData = { guestName };
    client.send("guestName", guestName);
    client.send("factions", [...this.factionsByFounder.values()]);
    client.send("territoryActivity", this.getTerritoryActivity());
  }
}

const server = defineServer({
  rooms: {
    world: defineRoom(WorldRoom),
    territoryArena: defineRoom(TerritoryArena),
  },
});

await server.listen(2567, "127.0.0.1");
