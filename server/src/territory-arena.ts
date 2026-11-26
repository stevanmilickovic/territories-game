import { Room, type Client } from "colyseus";
import {
  arenaLayout, arenaTickRate, stepArenaMovement,
  type ArenaInput, type ArenaPlayer, type ArenaPoint,
} from "../../shared/src/arena.ts";

type ArenaClient = Client<{ auth: { factionId: string; color: string; isOwner: boolean } }>;

const { width, height, edgeInset } = arenaLayout;
const centerSpawn: ArenaPoint = { x: width / 2, y: height / 2 };
const inputTimeoutMs = 250;

function isArenaInput(payload: unknown): payload is ArenaInput {
  if (typeof payload !== "object" || payload === null) return false;
  const { moveX, moveY, aimX, aimY } = payload as ArenaInput;
  return Number.isFinite(moveX) && Math.abs(moveX) <= 1
    && Number.isFinite(moveY) && Math.abs(moveY) <= 1
    && Number.isFinite(aimX) && Number.isFinite(aimY);
}

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
  private readonly latestInputs = new Map<string, { input: ArenaInput; receivedAt: number }>();

  messages = {
    arenaInput: (client: ArenaClient, payload: unknown) => {
      if (this.players.has(client.sessionId) && isArenaInput(payload)) {
        this.latestInputs.set(client.sessionId, { input: payload, receivedAt: performance.now() });
      }
    },
  };

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate() {
    await this.setPrivate();
    this.setFixedTimestep(({ dt }) => this.stepPlayers(dt), arenaTickRate);
  }

  private stepPlayers(dt: number) {
    const now = performance.now();
    let changed = false;
    for (const [sessionId, player] of this.players) {
      const latest = this.latestInputs.get(sessionId);
      if (!latest || now - latest.receivedAt > inputTimeoutMs) continue;

      const next = stepArenaMovement(player, latest.input, dt);
      if (next.x === player.x && next.y === player.y && next.aim === player.aim) continue;
      this.players.set(sessionId, { ...player, ...next });
      changed = true;
    }
    if (changed) this.broadcast("arenaPlayers", [...this.players.values()]);
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
    this.players.set(sessionId, { sessionId, color, ...spawn, aim: 0 });
    const players = [...this.players.values()];
    client.send("arenaPlayers", players);
    this.broadcast("arenaPlayers", players, { except: client });
  }

  onLeave(client: ArenaClient) {
    this.latestInputs.delete(client.sessionId);
    this.players.delete(client.sessionId);
    this.broadcast("arenaPlayers", [...this.players.values()]);
  }
}
