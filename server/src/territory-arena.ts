import { Room, type Client } from "colyseus";
import { arenaLayout, type ArenaPlayer, type ArenaPoint } from "../../shared/src/arena.ts";

type ArenaClient = Client<{ auth: { factionId: string; color: string; isOwner: boolean } }>;

const { width, height, edgeInset } = arenaLayout;
const centerSpawn: ArenaPoint = { x: width / 2, y: height / 2 };

function edgeSpawn(index: number): ArenaPoint {
  // Spread successive spawns across all four edges without imposing a faction cap.
  const along = (0.5 + Math.floor(index / 4) * 0.61803398875) % 1;
  const x = edgeInset + along * (width - 2 * edgeInset);
  const y = edgeInset + along * (height - 2 * edgeInset);

  switch (index % 4) {
    case 0: return { x, y: edgeInset };
    case 1: return { x: width - edgeInset, y };
    case 2: return { x, y: height - edgeInset };
    default: return { x: edgeInset, y };
  }
}

export class TerritoryArena extends Room {
  // The world room reuses the same arena even when all players return to the map.
  autoDispose = false;
  private readonly edgeSpawns = new Map<string, ArenaPoint>();
  private readonly players = new Map<string, ArenaPlayer>();

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate() {
    await this.setPrivate();
  }

  onJoin(client: ArenaClient) {
    if (!client.auth) throw new Error("Missing arena reservation identity.");
    const { factionId, color, isOwner } = client.auth;
    let spawn = centerSpawn;
    if (!isOwner) {
      spawn = this.edgeSpawns.get(factionId) ?? edgeSpawn(this.edgeSpawns.size);
      this.edgeSpawns.set(factionId, spawn);
    }

    const { sessionId } = client;
    this.players.set(sessionId, { sessionId, color, ...spawn });
    const players = [...this.players.values()];
    client.send("arenaPlayers", players);
    this.broadcast("arenaPlayers", players, { except: client });
  }

  onLeave(client: ArenaClient) {
    this.players.delete(client.sessionId);
    this.broadcast("arenaPlayers", [...this.players.values()]);
  }
}
