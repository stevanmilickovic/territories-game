import { Room, type Client } from "colyseus";
import {
  arenaLayout, arenaMaxHealth, arenaPlayerRadius, arenaTickRate, arenaWeapon, stepArenaMovement,
  type ArenaPoint, type ArenaShot,
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
  private readonly nextShotTick = new Map<string, number>();

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate() {
    await this.setPrivate();
    this.setFixedTimestep(({ dt, tick }) => this.stepPlayers(dt, tick), arenaTickRate);
  }

  private stepPlayers(dt: number, tick: number) {
    const firingPlayers: string[] = [];
    for (const [sessionId, player] of this.state.players) {
      const input = this.inputs.get(sessionId).next();
      if (!input || player.health === 0) continue;
      Object.assign(player, stepArenaMovement(player, input, dt));
      if (input.fire && tick >= (this.nextShotTick.get(sessionId) ?? 0)) {
        firingPlayers.push(sessionId);
      }
    }
    for (const sessionId of firingPlayers) {
      const shooter = this.state.players.get(sessionId);
      if (!shooter || shooter.health === 0) continue;
      this.nextShotTick.set(sessionId, tick + arenaWeapon.shotIntervalTicks);
      this.fireShot(sessionId, shooter);
    }
  }

  private fireShot(shooterId: string, shooter: typeof ArenaPlayer.prototype) {
    const directionX = Math.cos(shooter.aim);
    const directionY = Math.sin(shooter.aim);
    let distance = arenaWeapon.range;
    let hit: typeof ArenaPlayer.prototype | undefined;

    for (const target of this.state.players.values()) {
      if (target.health === 0 || target.factionId === shooter.factionId) continue;
      const dx = target.x - shooter.x;
      const dy = target.y - shooter.y;
      const forward = dx * directionX + dy * directionY;
      const sideways = dx * directionY - dy * directionX;
      const radiusSquared = arenaPlayerRadius ** 2;
      if (sideways ** 2 > radiusSquared) continue;
      const halfChord = Math.sqrt(radiusSquared - sideways ** 2);
      if (forward + halfChord < 0) continue;
      const contact = Math.max(0, forward - halfChord);
      if (contact > distance || (hit && contact === distance)) continue;
      distance = contact;
      hit = target;
    }

    if (hit) hit.health = Math.max(0, hit.health - arenaWeapon.damage);
    const shot: ArenaShot = {
      shooterId,
      from: { x: shooter.x, y: shooter.y },
      to: { x: shooter.x + directionX * distance, y: shooter.y + directionY * distance },
      hit: Boolean(hit),
    };
    this.broadcast("arenaShot", shot);
  }

  onJoin(client: ArenaClient) {
    if (!client.auth) throw new Error("Missing arena reservation identity.");
    const { factionId, color, isOwner } = client.auth;
    let spawn = centerSpawn;
    if (!isOwner) {
      spawn = this.edgeSpawns.get(factionId) ?? edgeSpawn(this.edgeSpawns.size);
      this.edgeSpawns.set(factionId, spawn);
    }

    this.state.players.set(client.sessionId, new ArenaPlayer({ factionId, color, ...spawn, aim: 0, health: arenaMaxHealth }));
  }

  onLeave(client: ArenaClient) {
    this.nextShotTick.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }
}
