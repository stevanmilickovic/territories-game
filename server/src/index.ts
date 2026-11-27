import { randomUUID } from "node:crypto";
import { defineRoom, defineServer, ErrorCode, matchMaker, Room, ServerError, type Client } from "colyseus";
import type {
  ArenaEntryResult,
  StartChallengeResult,
  TerritoryActivity,
  TerritoryChallenge,
} from "../../shared/src/challenges.ts";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";
import { worldMap } from "../../shared/src/world-map.ts";
import { canAttackTerritory } from "../../shared/src/attack-eligibility.ts";
import { TerritoryArena } from "./territory-arena.ts";

type WorldClient = Client<{ auth: { displayName: string } }>;
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
    startChallenge: (client: WorldClient, territoryId: unknown): StartChallengeResult => {
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

    enterArena: async (client: WorldClient, payload: unknown): Promise<ArenaEntryResult<ArenaReservation>> => {
      if (!client.auth) return { ok: false, error: "Join the world again before entering an arena." };
      if (typeof payload !== "object" || payload === null || !("territoryId" in payload)
        || typeof payload.territoryId !== "string" || !this.ownership.has(payload.territoryId)) {
        return { ok: false, error: "Choose a valid territory." };
      }
      const { territoryId } = payload;
      const factionId = "factionId" in payload ? payload.factionId : undefined;
      const faction = [...this.factionsByFounder.values()].find(({ id }) => id === factionId);
      if (!faction) return { ok: false, error: "Choose a valid faction." };

      const entryError = this.getArenaEntryError(territoryId, client.sessionId, faction.id);
      if (entryError) return { ok: false, error: entryError };

      let arena = this.arenasByTerritory.get(territoryId);
      if (!arena) {
        arena = matchMaker.createRoom("territoryArena", {
          territoryId,
          ownerFactionId: this.ownership.get(territoryId),
        }).then((listing) => {
          const room = matchMaker.getLocalRoomById(listing.roomId);
          if (!(room instanceof TerritoryArena)) throw new Error("Territory arena must be local.");
          room.onTerritoryCaptured = (factionId) => this.applyCapture(territoryId, factionId);
          room.onArenaEmpty = () => {
            if (this.challengesByTerritory.delete(territoryId)) {
              this.broadcast("territoryActivity", this.getTerritoryActivity());
            }
          };
          room.getEntryError = (guestSessionId, factionId) => this.getArenaEntryError(territoryId, guestSessionId, factionId);
          return listing;
        }).catch((error: unknown) => {
          this.arenasByTerritory.delete(territoryId);
          throw error;
        });
        this.arenasByTerritory.set(territoryId, arena);
      }

      const reservation = await matchMaker.reserveSeatFor(await arena, {}, {
        guestSessionId: client.sessionId,
        displayName: client.auth.displayName,
        factionId: faction.id,
        color: faction.color,
      });
      return { ok: true, reservation };
    },

    createFaction: (client: WorldClient, payload: unknown): CreateFactionResult => {
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

  private getArenaEntryError(territoryId: string, guestSessionId: string, factionId: string) {
    const challenges = this.challengesByTerritory.get(territoryId);
    if (factionId !== this.factionsByFounder.get(guestSessionId)?.id && !challenges?.size) {
      return "You can join another faction only in a contested territory.";
    }
    if (this.ownership.get(territoryId) === factionId) return;
    const challenge = challenges?.get(factionId);
    if (!challenge) return "That faction is not contesting this territory.";
    if (Date.now() < challenge.readyAt) return "That faction is still gathering.";
  }

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

  onAuth(_client: WorldClient, options: { username?: unknown }) {
    if (options.username === undefined) {
      return { displayName: `Guest ${this.nextGuestNumber++}` };
    }

    const displayName = typeof options.username === "string" ? options.username.trim().normalize("NFC") : "";
    const length = [...displayName].length;
    if (length < 3 || length > 24) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "Use a username between 3 and 24 characters.");
    }
    if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_ -]*$/u.test(displayName)) {
      throw new ServerError(ErrorCode.AUTH_FAILED, "Start with a letter or number and use only letters, numbers, spaces, hyphens, or underscores.");
    }
    return { displayName };
  }

  onJoin(client: WorldClient) {
    if (!client.auth) throw new Error("Missing world display name.");
    client.send("displayName", client.auth.displayName);
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
