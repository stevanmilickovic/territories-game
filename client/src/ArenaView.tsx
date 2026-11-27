import { Callbacks, Predict, type Room } from "@colyseus/sdk";
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { ArenaInput, type ArenaState } from "../../shared/src/arena-schema";
import {
  arenaCaptureRadius, arenaCaptureTicks, arenaLayout, arenaMaxHealth, arenaPickupRadius, arenaPlayerRadius,
  arenaWeapon, stepArenaMovement,
  type ArenaPoint, type ArenaShot,
} from "../../shared/src/arena";
import type { Faction } from "../../shared/src/factions.ts";

const { width, height } = arenaLayout;
const viewportSize = 480;
const weaponSlot = new Phaser.Geom.Rectangle(viewportSize / 2 - 36, viewportSize - 52, 72, 40);
const itemHitRadius = 10;
const playerInterpolation = {
  x: "lerp",
  y: "lerp",
  aim: { mode: "lerp", angle: true },
} as const;

export default function ArenaView({ room, factions }: {
  room: Room<unknown, ArenaState>;
  factions: readonly Faction[];
}) {
  const host = useRef<HTMLDivElement>(null);
  const currentFactions = useRef(factions);

  useEffect(() => {
    currentFactions.current = factions;
  }, [factions]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const predict = Predict.get(room, { mode: "lerp", delay: 100 });
    const input = room.input({ type: ArenaInput });
    let audio: AudioContext | undefined;

    class ArenaScene extends Phaser.Scene {
      private markers!: Phaser.GameObjects.Graphics;
      private slotLabel!: Phaser.GameObjects.Text;
      private itemPress = false;
      private draggingWeaponLife?: number;
      private hud!: Phaser.GameObjects.Text;
      private ownerLabel!: Phaser.GameObjects.Text;
      private captureLabel!: Phaser.GameObjects.Text;
      private captureBar!: Phaser.GameObjects.Rectangle;
      private keys?: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
      private trackingPlayers = false;
      private resetLocalPrediction?: () => void;
      private readonly playerLives = new WeakMap<object, number>();
      private readonly nameLabels = new Map<string, Phaser.GameObjects.Text>();
      private firePressed = false;
      private shotCooldown = 0;
      private hitUntil = 0;
      private readonly predictedProjectiles = new Map<number, {
        origin: ArenaPoint;
        aim: number;
        startedAt: number;
      }>();

      create() {
        this.cameras.main.setBounds(0, 0, width, height);
        const floor = this.add.graphics();
        floor.lineStyle(1, 0x41584d);
        for (let x = 32; x < width; x += 32) floor.lineBetween(x, 0, x, height);
        for (let y = 32; y < height; y += 32) floor.lineBetween(0, y, width, y);
        floor.lineStyle(2, 0xaabc95).strokeCircle(width / 2, height / 2, arenaCaptureRadius);
        this.markers = this.add.graphics();
        const hudStyle = { fontFamily: "sans-serif", fontSize: "15px", color: "#e8eddf" };
        this.hud = this.add.text(12, 12, "", hudStyle).setScrollFactor(0).setDepth(2);
        this.ownerLabel = this.add.text(viewportSize - 12, 12, "", hudStyle).setOrigin(1, 0).setScrollFactor(0).setDepth(2);
        this.captureLabel = this.add.text(viewportSize - 12, 32, "", hudStyle).setOrigin(1, 0).setScrollFactor(0).setDepth(2);
        this.add.rectangle(viewportSize - 172, 52, 160, 6, 0x41584d).setOrigin(0, 0).setScrollFactor(0).setDepth(2);
        this.captureBar = this.add.rectangle(viewportSize - 172, 52, 160, 6, 0xaabc95).setOrigin(0, 0).setScrollFactor(0).setDepth(2);
        this.add.rectangle(weaponSlot.centerX, weaponSlot.centerY, weaponSlot.width, weaponSlot.height, 0x172627)
          .setStrokeStyle(1, 0xaabc95).setScrollFactor(0).setDepth(3);
        this.slotLabel = this.add.text(weaponSlot.centerX, weaponSlot.centerY, "Empty", hudStyle)
          .setOrigin(0.5).setScrollFactor(0).setDepth(4);

        const releaseItem = (pointer: Phaser.Input.Pointer) => {
          if (pointer.button !== 0) return;
          const life = this.draggingWeaponLife;
          this.draggingWeaponLife = undefined;
          this.itemPress = false;
          if (life !== undefined && !weaponSlot.contains(pointer.x, pointer.y)) {
            room.send("dropWeapon", life);
          }
        };
        this.input.on("pointerup", releaseItem);
        this.input.on("pointerupoutside", releaseItem);
        this.input.on("gameout", () => { this.game.canvas.style.cursor = ""; });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.game.canvas.style.cursor = ""; });

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!pointer.leftButtonDown()) return;
          const player = room.state?.players.get(room.sessionId);
          if (weaponSlot.contains(pointer.x, pointer.y)) {
            this.itemPress = true;
            if (player?.health && player.equippedWeaponId === arenaWeapon.id) {
              this.draggingWeaponLife = player.life;
            }
            return;
          }
          const itemId = this.hoveredItem(pointer);
          if (player && !player.equippedWeaponId && itemId !== undefined) {
            this.itemPress = true;
            room.send("pickUpWeapon", { itemId, life: player.life });
            return;
          }
          this.firePressed = true;
          if (typeof AudioContext !== "undefined") {
            audio ??= new AudioContext();
            void audio.resume().catch(() => {});
          }
        });
        const stopShots = room.onMessage<ArenaShot>("arenaShot", (shot) => {
          if (shot.shooterId === room.sessionId && shot.hit) {
            this.hitUntil = performance.now() + 180;
          }
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopShots);
        const keyboard = this.input.keyboard;
        if (keyboard) {
          this.keys = {
            up: keyboard.addKey("W"),
            down: keyboard.addKey("S"),
            left: keyboard.addKey("A"),
            right: keyboard.addKey("D"),
          };
        }
      }

      private hoveredItem(pointer: Phaser.Input.Pointer) {
        const player = room.state?.players.get(room.sessionId);
        if (!player?.health || weaponSlot.contains(pointer.x, pointer.y)) return;
        const { scrollX, scrollY } = this.cameras.main;
        const playerX = predict.value(player, "x");
        const playerY = predict.value(player, "y");
        let closest = itemHitRadius;
        let hoveredId: string | undefined;
        for (const [id, item] of room.state.groundItems) {
          if (Math.hypot(item.x - playerX, item.y - playerY) > arenaPickupRadius) continue;
          const distance = Math.hypot(item.x - pointer.x - scrollX, item.y - pointer.y - scrollY);
          if (distance > closest) continue;
          closest = distance;
          hoveredId = id;
        }
        return hoveredId;
      }

      private renderName(sessionId: string, displayName: string, x: number, y: number) {
        let label = this.nameLabels.get(sessionId);
        if (!label) {
          label = this.add.text(0, 0, displayName, {
            fontFamily: "sans-serif",
            fontSize: "12px",
            color: "#e8eddf",
            stroke: "#172627",
            strokeThickness: 3,
          }).setOrigin(0.5, 1).setDepth(1);
          this.nameLabels.set(sessionId, label);
        }
        const halfWidth = label.width / 2;
        label.setPosition(
          Phaser.Math.Clamp(x, halfWidth, width - halfWidth),
          Math.max(label.height, y - arenaPlayerRadius - 3),
        ).setVisible(true);
      }

      private renderCapture() {
        const { captureFactionId, captureTicks, captureContested, ownerFactionId } = room.state;
        const faction = currentFactions.current.find(({ id }) => id === captureFactionId);
        const owner = currentFactions.current.find(({ id }) => id === ownerFactionId);
        this.ownerLabel.setText(owner ? `Owned by ${owner.name}` : ownerFactionId ? "Owned territory" : "Unclaimed territory");
        this.captureLabel.setText(captureContested
          ? "Capture paused · Center contested"
          : captureFactionId ? `${faction?.name ?? "A faction"} is capturing` : "Capture point");
        this.captureBar.setScale(captureTicks / arenaCaptureTicks, 1);
        this.captureBar.setFillStyle(faction ? Phaser.Display.Color.HexStringToColor(faction.color).color : 0xaabc95);
      }

      update(_time: number, delta: number) {
        const players = room.state?.players;
        const localPlayer = players?.get(room.sessionId);
        if (!players || !localPlayer) return;
        this.renderCapture();
        if (!this.trackingPlayers) {
          predict.attachAll("players", playerInterpolation);
          const stopRemovingNames = Callbacks.get(room).onRemove("players", (_player, sessionId) => {
            this.nameLabels.get(sessionId)?.destroy();
            this.nameLabels.delete(sessionId);
          });
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopRemovingNames);
          const reconciler = predict.reconciler(localPlayer, {
            input,
            fields: ["x", "y", "aim"],
            smoothMs: 65,
            step: ({ dt }, player, command) => {
              if (localPlayer.health > 0 && command.life === localPlayer.life) {
                Object.assign(player, stepArenaMovement(player, command, dt));
              }
            },
          });
          this.resetLocalPrediction = () => reconciler.reset();
          this.trackingPlayers = true;
        }

        let snapCamera = !this.playerLives.has(localPlayer);
        for (const [sessionId, player] of players) {
          const previousLife = this.playerLives.get(player);
          if (previousLife === player.life) continue;
          this.playerLives.set(player, player.life);
          if (previousLife === undefined) continue;
          if (sessionId === room.sessionId) {
            this.resetLocalPrediction?.();
            snapCamera = true;
            this.firePressed = false;
            this.draggingWeaponLife = undefined;
            this.shotCooldown = 0;
            this.predictedProjectiles.clear();
            this.hitUntil = 0;
          } else {
            predict.detach(player);
            predict.attach(player, playerInterpolation);
          }
        }

        const now = performance.now();
        const steps = predict.tick(now);
        const camera = this.cameras.main;
        const halfViewport = viewportSize / 2;
        const follow = snapCamera ? 1 : 1 - Math.exp(-delta / 90);
        const targetX = Phaser.Math.Clamp(predict.value(localPlayer, "x") - halfViewport, 0, width - viewportSize);
        const targetY = Phaser.Math.Clamp(predict.value(localPlayer, "y") - halfViewport, 0, height - viewportSize);
        camera.setScroll(
          Phaser.Math.Linear(camera.scrollX, targetX, follow),
          Phaser.Math.Linear(camera.scrollY, targetY, follow),
        );

        const pointer = this.input.activePointer;
        // The camera uses unit zoom and no rotation. Its render matrix still has the previous frame's scroll.
        const aimX = Phaser.Math.Clamp(pointer.x + camera.scrollX, 0, width);
        const aimY = Phaser.Math.Clamp(pointer.y + camera.scrollY, 0, height);
        const hasWeapon = localPlayer.equippedWeaponId === arenaWeapon.id;
        let predictedShot = false;
        for (let step = 0; step < steps; step++) {
          input.data.moveX = Number(Boolean(this.keys?.right.isDown)) - Number(Boolean(this.keys?.left.isDown));
          input.data.moveY = Number(Boolean(this.keys?.down.isDown)) - Number(Boolean(this.keys?.up.isDown));
          input.data.aimX = aimX;
          input.data.aimY = aimY;
          input.data.fire = hasWeapon && localPlayer.health > 0 && !this.itemPress && (this.firePressed || pointer.leftButtonDown());
          input.data.life = localPlayer.life;
          this.firePressed = false;
          this.shotCooldown = Math.max(0, this.shotCooldown - 1);
          input.send();
          if (input.data.fire && this.shotCooldown === 0) {
            this.shotCooldown = arenaWeapon.shotIntervalTicks;
            predictedShot = true;
            this.predictedProjectiles.set(input.sentCount, {
              origin: { x: predict.value(localPlayer, "x"), y: predict.value(localPlayer, "y") },
              aim: predict.value(localPlayer, "aim"),
              startedAt: now,
            });
          }
        }

        const localX = predict.value(localPlayer, "x");
        const localY = predict.value(localPlayer, "y");
        const localAim = aimX === localX && aimY === localY
          ? predict.value(localPlayer, "aim")
          : Math.atan2(aimY - localY, aimX - localX);

        if (predictedShot) {
          if (audio?.state === "running") {
            const pulse = audio.createOscillator();
            const volume = audio.createGain();
            pulse.type = "triangle";
            pulse.frequency.setValueAtTime(145, audio.currentTime);
            pulse.frequency.exponentialRampToValueAtTime(48, audio.currentTime + 0.05);
            volume.gain.setValueAtTime(0.07, audio.currentTime);
            volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.05);
            pulse.connect(volume).connect(audio.destination);
            pulse.start();
            pulse.stop(audio.currentTime + 0.05);
          }
        }

        const hitFeedback = now < this.hitUntil ? "   Hit" : "";
        const secondsToRespawn = Math.ceil((localPlayer.respawnAt - room.clock.serverNow()) / 1000);
        this.hud.setText(localPlayer.health > 0
          ? `Health ${localPlayer.health}/${arenaMaxHealth}${hitFeedback}`
          : secondsToRespawn > 0 ? `Respawn in ${secondsToRespawn}s` : "Respawning…");
        this.markers.clear();
        for (const [sessionId, player] of players) {
          if (player.health === 0) {
            this.nameLabels.get(sessionId)?.setVisible(false);
            continue;
          }
          const x = predict.value(player, "x");
          const y = predict.value(player, "y");
          const aim = sessionId === room.sessionId ? localAim : predict.value(player, "aim");
          const color = Phaser.Display.Color.HexStringToColor(player.color).color;
          const outline = sessionId === room.sessionId ? 0xffffff : 0x131e1b;
          this.markers.lineStyle(2, color).lineBetween(
            x, y, x + Math.cos(aim) * 22, y + Math.sin(aim) * 22,
          );
          this.markers.fillStyle(color).fillCircle(x, y, arenaPlayerRadius);
          this.markers.lineStyle(2, outline).strokeCircle(x, y, arenaPlayerRadius);
          this.renderName(sessionId, player.displayName, x, y);
        }

        const hoveredItemId = this.hoveredItem(pointer);
        const dragging = hasWeapon && this.draggingWeaponLife !== undefined;
        this.slotLabel.setText(hasWeapon ? arenaWeapon.name : "Empty").setPosition(
          dragging ? pointer.x : weaponSlot.centerX,
          dragging ? pointer.y : weaponSlot.centerY,
        );
        this.game.canvas.style.cursor = dragging ? "grabbing"
          : hasWeapon && weaponSlot.contains(pointer.x, pointer.y) ? "grab"
            : !hasWeapon && hoveredItemId !== undefined ? "pointer" : "";
        for (const [id, { x, y }] of room.state.groundItems) {
          this.markers.fillStyle(0x172627).fillRect(x - 9, y - 4, 18, 8);
          this.markers.fillStyle(0xb8cd9d).fillRect(x - 7, y - 2, 14, 4);
          if (localPlayer.health > 0 && Math.hypot(x - localX, y - localY) <= arenaPickupRadius) {
            this.markers.lineStyle(1, 0xe8eddf, id === hoveredItemId ? 1 : 0.35).strokeRect(x - 10, y - 5, 20, 10);
          }
        }

        this.markers.fillStyle(0xffefae);
        for (const [sequence, { origin, aim, startedAt }] of this.predictedProjectiles) {
          const distance = (now - startedAt) * arenaWeapon.projectileSpeed / 1000;
          const x = origin.x + Math.cos(aim) * distance;
          const y = origin.y + Math.sin(aim) * distance;
          if (sequence <= input.lastProcessed || room.state.projectiles.has(`${room.sessionId}:${sequence}`)
            || distance > arenaWeapon.range || x < 0 || x > width || y < 0 || y > height) {
            this.predictedProjectiles.delete(sequence);
            continue;
          }
          this.markers.fillRect(x - 2, y - 2, 4, 4);
        }
        for (const { x, y } of room.state.projectiles.values()) {
          this.markers.fillRect(x - 2, y - 2, 4, 4);
        }
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      width: viewportSize,
      height: viewportSize,
      backgroundColor: "#263c34",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      audio: { noAudio: true },
      scene: ArenaScene,
    });
    return () => {
      predict.dispose();
      game.destroy(true);
      void audio?.close().catch(() => {});
    };
  }, [room]);

  return (
    <div
      className="arena-canvas"
      ref={host}
      role="img"
      aria-label="Arena with a central capture point, player markers, and display names"
    />
  );
}
