import { Room, type Client } from "colyseus";
import {
  arenaLayout, arenaTickRate, stepArenaMovement,
  type ArenaPoint,
} from "../../shared/src/arena.ts";
import { ArenaInput, ArenaPlayer, ArenaState } from "../../shared/src/arena-schema.ts";

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
  state = new ArenaState();
  patchRate = 1000 / arenaTickRate;
  inputs = this.defineInput(ArenaInput, {
    sanitize: {
      moveX: [-1, 1],
      moveY: [-1, 1],
      aimX: [0, width],
      aimY: [0, height],
    },
  });
  private readonly edgeSpawns = new Map<string, ArenaPoint>();

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate() {
    await this.setPrivate();
    this.setFixedTimestep(({ dt }) => this.stepPlayers(dt), arenaTickRate);
  }

  private stepPlayers(dt: number) {
    for (const [sessionId, player] of this.state.players) {
      const input = this.inputs.get(sessionId).next();
      if (input) Object.assign(player, stepArenaMovement(player, input, dt));
    }
  }

  onJoin(client: ArenaClient) {
    if (!client.auth) throw new Error("Missing arena reservation identity.");
    const { factionId, color, isOwner } = client.auth;
    let spawn = centerSpawn;
    if (!isOwner) {
      spawn = this.edgeSpawns.get(factionId) ?? edgeSpawn(this.edgeSpawns.size);
      this.edgeSpawns.set(factionId, spawn);
    }

    this.state.players.set(client.sessionId, new ArenaPlayer({ color, ...spawn, aim: 0 }));
  }

  onLeave(client: ArenaClient) {
    this.state.players.delete(client.sessionId);
  }
}
