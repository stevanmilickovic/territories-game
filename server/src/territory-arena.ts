import { ErrorCode, Room, ServerError, type Client } from "colyseus";
import {
  arenaCaptureRadius, arenaCaptureTicks, arenaLayout, arenaMaxHealth, arenaPlayerRadius,
  arenaRespawnDelayMs, arenaTickRate, arenaWeapon, stepArenaMovement,
  type ArenaPoint, type ArenaShot,
} from "../../shared/src/arena.ts";
import { ArenaInput, ArenaPlayer, ArenaState } from "../../shared/src/arena-schema.ts";

type ArenaMember = { guestSessionId: string; displayName: string; factionId: string; color: string };
type ArenaClient = Client<{ auth: ArenaMember }>;

type Projectile = {
  shooterId: string;
  factionId: string;
  origin: ArenaPoint;
  position: ArenaPoint;
  directionX: number;
  directionY: number;
  remainingDistance: number;
};

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

export class TerritoryArena extends Room<{ client: ArenaClient; input: ArenaInput; state: ArenaState }> {
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
  private projectiles: Projectile[] = [];
  private readonly nextShotTick = new Map<string, number>();
  private readonly pendingRespawns = new Map<string, number>();
  private nextLife = 1;
  onTerritoryCaptured?: (factionId: string) => void;

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate({ ownerFactionId = null }: { ownerFactionId?: string | null }) {
    this.state.ownerFactionId = ownerFactionId ?? "";
    await this.setPrivate();
    this.setFixedTimestep(({ dt, tick }) => {
      this.stepPlayers(dt, tick);
      this.stepProjectiles(dt);
      this.stepCapture();
    }, arenaTickRate);
  }

  private stepCapture() {
    const state = this.state;
    let holdingFactionId = "";
    for (const player of state.players.values()) {
      if (player.health === 0) continue;
      const dx = player.x - centerSpawn.x;
      const dy = player.y - centerSpawn.y;
      if (dx * dx + dy * dy > arenaCaptureRadius ** 2) continue;
      if (holdingFactionId && holdingFactionId !== player.factionId) {
        state.captureContested = true;
        return;
      }
      holdingFactionId = player.factionId;
    }

    state.captureContested = false;
    if (!holdingFactionId || holdingFactionId === state.ownerFactionId) {
      state.captureFactionId = "";
      state.captureTicks = 0;
      return;
    }
    if (state.captureFactionId !== holdingFactionId) {
      state.captureFactionId = holdingFactionId;
      state.captureTicks = 0;
    }
    state.captureTicks++;
    if (state.captureTicks < arenaCaptureTicks) return;

    this.onTerritoryCaptured?.(holdingFactionId);
    state.ownerFactionId = holdingFactionId;
    state.captureFactionId = "";
    state.captureTicks = 0;
  }

  private stepPlayers(dt: number, tick: number) {
    const now = this.clock.elapsedTime;
    const firingPlayers: string[] = [];
    for (const [sessionId, player] of this.state.players) {
      const input = this.inputs.get(sessionId).next();
      if (player.health === 0) {
        const member = this.clients.getById(sessionId)?.auth;
        if (member && now >= player.respawnAt) {
          Object.assign(player, this.getSpawn(member), {
            aim: 0,
            health: arenaMaxHealth,
            respawnAt: 0,
            life: this.nextLife++,
          });
          this.nextShotTick.delete(sessionId);
        }
        continue;
      }
      if (!input || input.life !== player.life) continue;
      Object.assign(player, stepArenaMovement(player, input, dt));
      if (input.fire && tick >= (this.nextShotTick.get(sessionId) ?? 0)) {
        firingPlayers.push(sessionId);
      }
    }
    for (const sessionId of firingPlayers) {
      const shooter = this.state.players.get(sessionId);
      if (!shooter || shooter.health === 0) continue;
      this.nextShotTick.set(sessionId, tick + arenaWeapon.shotIntervalTicks);
      this.spawnProjectile(sessionId, shooter);
    }
  }

  private spawnProjectile(shooterId: string, shooter: typeof ArenaPlayer.prototype) {
    const { x, y, aim, factionId } = shooter;
    const directionX = Math.cos(aim);
    const directionY = Math.sin(aim);
    const distanceToXEdge = directionX === 0 ? Infinity : ((directionX > 0 ? width : 0) - x) / directionX;
    const distanceToYEdge = directionY === 0 ? Infinity : ((directionY > 0 ? height : 0) - y) / directionY;
    this.projectiles.push({
      shooterId,
      factionId,
      origin: { x, y },
      position: { x, y },
      directionX,
      directionY,
      remainingDistance: Math.min(arenaWeapon.range, distanceToXEdge, distanceToYEdge),
    });
  }

  private stepProjectiles(dt: number) {
    const travelDistance = arenaWeapon.projectileSpeed * dt;
    this.projectiles = this.projectiles.filter((projectile) => {
      const { shooterId, factionId, position, directionX, directionY, remainingDistance } = projectile;
      let distance = Math.min(travelDistance, remainingDistance);
      let hit: typeof ArenaPlayer.prototype | undefined;
      const radiusSquared = arenaPlayerRadius ** 2;

      for (const [sessionId, target] of this.state.players) {
        if (sessionId === shooterId || target.health === 0 || target.factionId === factionId) continue;
        const dx = target.x - position.x;
        const dy = target.y - position.y;
        const forward = dx * directionX + dy * directionY;
        const sidewaysSquared = (dx * directionY - dy * directionX) ** 2;
        if (sidewaysSquared > radiusSquared) continue;
        const halfChord = Math.sqrt(radiusSquared - sidewaysSquared);
        if (forward + halfChord < 0) continue;
        const contact = Math.max(0, forward - halfChord);
        if (contact > distance || (hit && contact === distance)) continue;
        distance = contact;
        hit = target;
      }

      const to = { x: position.x + directionX * distance, y: position.y + directionY * distance };
      if (!hit && distance < remainingDistance) {
        projectile.position = to;
        projectile.remainingDistance -= distance;
        return true;
      }

      if (hit) {
        hit.health = Math.max(0, hit.health - arenaWeapon.damage);
        if (hit.health === 0) hit.respawnAt = this.clock.elapsedTime + arenaRespawnDelayMs;
      }
      const shot: ArenaShot = { shooterId, from: projectile.origin, to, hit: Boolean(hit) };
      this.broadcast("arenaShot", shot);
      return false;
    });
  }

  private getSpawn({ factionId }: ArenaMember): ArenaPoint {
    if (this.state.ownerFactionId === factionId) return centerSpawn;
    const spawn = this.edgeSpawns.get(factionId) ?? edgeSpawn(this.edgeSpawns.size);
    this.edgeSpawns.set(factionId, spawn);
    return spawn;
  }

  onJoin(client: ArenaClient) {
    if (!client.auth) throw new Error("Missing arena reservation identity.");
    const { guestSessionId, displayName, factionId, color } = client.auth;
    for (const sessionId of this.state.players.keys()) {
      if (this.clients.getById(sessionId)?.auth?.guestSessionId === guestSessionId) {
        throw new ServerError(ErrorCode.APPLICATION_ERROR, "Leave the arena before joining again.");
      }
    }

    const deadline = this.pendingRespawns.get(guestSessionId) ?? 0;
    const respawnAt = deadline > this.clock.elapsedTime ? deadline : 0;
    this.state.players.set(client.sessionId, new ArenaPlayer({
      factionId, color, displayName, ...this.getSpawn(client.auth), aim: 0,
      health: respawnAt ? 0 : arenaMaxHealth, respawnAt, life: this.nextLife++,
    }));
  }

  onLeave(client: ArenaClient) {
    const player = this.state.players.get(client.sessionId);
    const guestSessionId = client.auth?.guestSessionId;
    const now = this.clock.elapsedTime;
    if (guestSessionId && player && player.respawnAt > now) {
      const deadline = player.respawnAt;
      this.pendingRespawns.set(guestSessionId, deadline);
      this.clock.setTimeout(() => {
        if (this.pendingRespawns.get(guestSessionId) === deadline) {
          this.pendingRespawns.delete(guestSessionId);
        }
      }, deadline - now);
    }
    this.nextShotTick.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }
}
