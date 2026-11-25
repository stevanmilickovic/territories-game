import { randomUUID } from "node:crypto";
import { defineRoom, defineServer, Room, type Client } from "colyseus";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";

type GuestClient = Client<{ userData: { guestName: string } }>;

class WorldRoom extends Room {
  autoDispose = false;
  private nextGuestNumber = 1;
  private readonly factionsByFounder = new Map<string, Faction>();

  messages = {
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
