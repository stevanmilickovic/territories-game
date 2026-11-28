import { ErrorCode, Room, ServerError, type Client } from "colyseus";
import {
  arenaCaptureRadius, arenaCaptureTicks, arenaSpawnInset, arenaMaxHealth, arenaPickupRadius, arenaPlayerRadius,
  arenaRespawnDelayMs, arenaTickRate, arenaWeapon, stepArenaMovement,
  type ArenaPoint, type ArenaShot,
} from "../../shared/src/arena.ts";
import { ArenaGroundItem, ArenaInput, ArenaPlayer, ArenaProjectile, ArenaState } from "../../shared/src/arena-schema.ts";
import { arenaMaxDimension, arenaBoundaryDistance, containsArenaPoint, getProvinceArena, insetArenaEdge, type ProvinceArena } from "../../shared/src/province-arena.ts";

type ArenaMember = { guestSessionId: string; displayName: string; factionId: string; color: string };
type ArenaClient = Client<{ auth: ArenaMember }>;

type Projectile = {
  id: string;
  shooterId: string;
  factionId: string;
  origin: ArenaPoint;
  position: InstanceType<typeof ArenaProjectile>;
  directionX: number;
  directionY: number;
  remainingDistance: number;
};

export class TerritoryArena extends Room<{ client: ArenaClient; input: ArenaInput; state: ArenaState }> {
  // The world room reuses the same arena even when all players return to the map.
  autoDispose = false;
  state = new ArenaState();
  patchRate = 1000 / arenaTickRate;
  inputs = this.defineInput(ArenaInput, {
    sanitize: {
      moveX: [-1, 1],
      moveY: [-1, 1],
      aimX: [0, arenaMaxDimension],
      aimY: [0, arenaMaxDimension],
    },
  });
  private readonly edgeSpawns = new Map<string, ArenaPoint>();
  private layout!: ProvinceArena;
  private projectiles: Projectile[] = [];
  private readonly nextShotTick = new Map<string, number>();
  private readonly pendingRespawns = new Map<string, number>();
  private nextLife = 1;
  private nextGroundItemId = 1;
  onArenaEmpty?: () => void;
  getEntryError?: (guestSessionId: string, factionId: string) => string | undefined;
  onTerritoryCaptured?: (factionId: string) => void;

  messages = {
    dropWeapon: (client: ArenaClient, life: unknown) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health === 0 || player.life !== life) return false;
      return this.dropEquippedWeapon(player);
    },

    pickUpWeapon: (client: ArenaClient, payload: unknown) => {
      if (typeof payload !== "object" || payload === null || !("itemId" in payload)
        || typeof payload.itemId !== "string" || !("life" in payload)) return false;

      const player = this.state.players.get(client.sessionId);
      if (!player || player.health === 0 || player.life !== payload.life || player.equippedWeaponId) return false;

      const item = this.state.groundItems.get(payload.itemId);
      if (!item || Math.hypot(player.x - item.x, player.y - item.y) > arenaPickupRadius) return false;

      this.state.groundItems.delete(payload.itemId);
      player.equippedWeaponId = item.weaponId;
      return true;
    },
  };

  private dropEquippedWeapon(player: InstanceType<typeof ArenaPlayer>) {
    const { equippedWeaponId, x, y } = player;
    if (!equippedWeaponId) return false;

    this.state.groundItems.set(String(this.nextGroundItemId++), new ArenaGroundItem({
      weaponId: equippedWeaponId, x, y,
    }));
    player.equippedWeaponId = "";
    return true;
  }

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate({ territoryId, ownerFactionId = null }: { territoryId: string; ownerFactionId?: string | null }) {
    this.layout = getProvinceArena(territoryId);
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
      const dx = player.x - this.layout.capturePoint.x;
      const dy = player.y - this.layout.capturePoint.y;
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
    for (const [sessionId, player] of this.state.players) {
      const channel = this.inputs.get(sessionId);
      const input = channel.next();
      if (player.health === 0) {
        const member = this.clients.getById(sessionId)?.auth;
        if (member && now >= player.respawnAt) {
          Object.assign(player, this.getSpawn(member), {
            aim: 0,
            health: arenaMaxHealth,
            equippedWeaponId: arenaWeapon.id,
            respawnAt: 0,
            life: this.nextLife++,
          });
          this.nextShotTick.delete(sessionId);
        }
        continue;
      }
      if (!input || input.life !== player.life) continue;
      Object.assign(player, stepArenaMovement(player, input, dt, this.layout));
      if (input.fire && player.equippedWeaponId === arenaWeapon.id && tick >= (this.nextShotTick.get(sessionId) ?? 0)) {
        this.nextShotTick.set(sessionId, tick + arenaWeapon.shotIntervalTicks);
        this.spawnProjectile(sessionId, player, channel.consumedCount);
      }
    }
  }

  private spawnProjectile(shooterId: string, shooter: typeof ArenaPlayer.prototype, inputSequence: number) {
    const { x, y, aim, factionId } = shooter;
    const directionX = Math.cos(aim);
    const directionY = Math.sin(aim);
    const id = `${shooterId}:${inputSequence}`;
    const position = new ArenaProjectile({ x, y });
    this.state.projectiles.set(id, position);
    this.projectiles.push({
      id,
      shooterId,
      factionId,
      origin: { x, y },
      position,
      directionX,
      directionY,
      remainingDistance: arenaBoundaryDistance(this.layout.edges, shooter, directionX, directionY, arenaWeapon.range),
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
        Object.assign(position, to);
        projectile.remainingDistance -= distance;
        return true;
      }

      if (hit) {
        hit.health = Math.max(0, hit.health - arenaWeapon.damage);
        if (hit.health === 0) {
          this.dropEquippedWeapon(hit);
          hit.respawnAt = this.clock.elapsedTime + arenaRespawnDelayMs;
        }
      }
      this.state.projectiles.delete(projectile.id);
      const shot: ArenaShot = { shooterId, from: projectile.origin, to, hit: Boolean(hit) };
      this.broadcast("arenaShot", shot);
      return false;
    });
  }

  private getSpawn({ factionId }: ArenaMember): ArenaPoint {
    if (this.state.ownerFactionId === factionId) return this.layout.capturePoint;
    const known = this.edgeSpawns.get(factionId);
    if (known) return known;
    const points = this.layout.edges.map(edge => insetArenaEdge(edge, 0.5, arenaSpawnInset))
      .filter(point => containsArenaPoint(this.layout.edges, point, arenaPlayerRadius));
    const spawn = points[Math.floor(Math.random() * points.length)] ?? this.layout.capturePoint;
    this.edgeSpawns.set(factionId, spawn);
    return spawn;
  }

  onJoin(client: ArenaClient) {
    if (!client.auth) throw new Error("Missing arena reservation identity.");
    const { guestSessionId, displayName, factionId, color } = client.auth;
    const entryError = this.getEntryError?.(guestSessionId, factionId);
    if (entryError) throw new ServerError(ErrorCode.APPLICATION_ERROR, entryError);
    for (const sessionId of this.state.players.keys()) {
      if (this.clients.getById(sessionId)?.auth?.guestSessionId === guestSessionId) {
        throw new ServerError(ErrorCode.APPLICATION_ERROR, "Leave the arena before joining again.");
      }
    }

    const deadline = this.pendingRespawns.get(guestSessionId) ?? 0;
    const respawnAt = deadline > this.clock.elapsedTime ? deadline : 0;
    this.state.players.set(client.sessionId, new ArenaPlayer({
      factionId, color, displayName, ...this.getSpawn(client.auth), aim: 0,
      health: respawnAt ? 0 : arenaMaxHealth,
      equippedWeaponId: respawnAt ? "" : arenaWeapon.id,
      respawnAt, life: this.nextLife++,
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
    if (player && this.state.players.size === 0) {
      this.projectiles = [];
      this.state.projectiles.clear();
      this.state.groundItems.clear();
      this.edgeSpawns.clear();
      this.state.captureFactionId = "";
      this.state.captureTicks = 0;
      this.state.captureContested = false;
      this.onArenaEmpty?.();
    }
  }
}
