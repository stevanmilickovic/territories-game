import { Predict, type Room } from "@colyseus/sdk";
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { ArenaInput, type ArenaState } from "../../shared/src/arena-schema";
import {
  arenaLayout, arenaMaxHealth, arenaPlayerRadius, arenaWeapon, stepArenaMovement,
  type ArenaPoint, type ArenaShot,
} from "../../shared/src/arena";

const { width, height } = arenaLayout;
const playerInterpolation = {
  x: "lerp",
  y: "lerp",
  aim: { mode: "lerp", angle: true },
} as const;

export default function ArenaView({ room }: { room: Room<unknown, ArenaState> }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const predict = Predict.get(room, { mode: "lerp", delay: 100 });
    const input = room.input({ type: ArenaInput });
    let audio: AudioContext | undefined;

    class ArenaScene extends Phaser.Scene {
      private markers!: Phaser.GameObjects.Graphics;
      private hud!: Phaser.GameObjects.Text;
      private keys?: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
      private trackingPlayers = false;
      private resetLocalPrediction?: () => void;
      private readonly playerLives = new WeakMap<object, number>();
      private firePressed = false;
      private shotCooldown = 0;
      private hitUntil = 0;
      private tracers: { from: ArenaPoint; to: ArenaPoint; expiresAt: number }[] = [];

      create() {
        const floor = this.add.graphics();
        floor.lineStyle(1, 0x41584d);
        for (let x = 32; x < width; x += 32) floor.lineBetween(x, 0, x, height);
        for (let y = 32; y < height; y += 32) floor.lineBetween(0, y, width, y);
        floor.lineStyle(2, 0xaabc95).strokeCircle(width / 2, height / 2, 24);
        this.markers = this.add.graphics();
        this.hud = this.add.text(12, 12, "", { fontFamily: "sans-serif", fontSize: "15px", color: "#e8eddf" });
        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!pointer.leftButtonDown()) return;
          this.firePressed = true;
          if (typeof AudioContext !== "undefined") {
            audio ??= new AudioContext();
            void audio.resume().catch(() => {});
          }
        });
        const stopShots = room.onMessage<ArenaShot>("arenaShot", (shot) => {
          const now = performance.now();
          if (shot.shooterId !== room.sessionId) {
            this.tracers.push({ from: shot.from, to: shot.to, expiresAt: now + 80 });
          } else if (shot.hit) {
            this.hitUntil = now + 180;
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

      update() {
        const players = room.state?.players;
        const localPlayer = players?.get(room.sessionId);
        if (!players || !localPlayer) return;
        if (!this.trackingPlayers) {
          predict.attachAll("players", playerInterpolation);
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

        for (const [sessionId, player] of players) {
          const previousLife = this.playerLives.get(player);
          if (previousLife === player.life) continue;
          this.playerLives.set(player, player.life);
          if (previousLife === undefined) continue;
          if (sessionId === room.sessionId) {
            this.resetLocalPrediction?.();
            this.firePressed = false;
            this.shotCooldown = 0;
            this.hitUntil = 0;
          } else {
            predict.detach(player);
            predict.attach(player, playerInterpolation);
          }
        }

        const now = performance.now();
        const steps = predict.tick(now);
        const pointer = this.input.activePointer.updateWorldPoint(this.cameras.main);
        let predictedShot = false;
        for (let step = 0; step < steps; step++) {
          input.data.moveX = Number(Boolean(this.keys?.right.isDown)) - Number(Boolean(this.keys?.left.isDown));
          input.data.moveY = Number(Boolean(this.keys?.down.isDown)) - Number(Boolean(this.keys?.up.isDown));
          input.data.aimX = Phaser.Math.Clamp(pointer.worldX, 0, width);
          input.data.aimY = Phaser.Math.Clamp(pointer.worldY, 0, height);
          input.data.fire = localPlayer.health > 0 && (this.firePressed || pointer.leftButtonDown());
          input.data.life = localPlayer.life;
          this.firePressed = false;
          this.shotCooldown = Math.max(0, this.shotCooldown - 1);
          if (input.data.fire && this.shotCooldown === 0) {
            this.shotCooldown = arenaWeapon.shotIntervalTicks;
            predictedShot = true;
          }
          input.send();
        }

        if (predictedShot) {
          const x = predict.value(localPlayer, "x");
          const y = predict.value(localPlayer, "y");
          const aim = predict.value(localPlayer, "aim");
          this.tracers.push({
            from: { x, y },
            to: { x: x + Math.cos(aim) * arenaWeapon.range, y: y + Math.sin(aim) * arenaWeapon.range },
            expiresAt: now + 80,
          });
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
          ? `${arenaWeapon.name}   Health ${localPlayer.health}/${arenaMaxHealth}${hitFeedback}`
          : secondsToRespawn > 0 ? `Respawn in ${secondsToRespawn}s` : "Respawning…");
        this.markers.clear();
        this.tracers = this.tracers.filter(({ expiresAt }) => expiresAt > now);
        for (const { from, to } of this.tracers) {
          this.markers.lineStyle(2, 0xffefae, 0.7).lineBetween(from.x, from.y, to.x, to.y);
          this.markers.fillStyle(0xffefae).fillCircle(from.x, from.y, 4);
        }
        for (const [sessionId, player] of players) {
          if (player.health === 0) continue;
          const x = predict.value(player, "x");
          const y = predict.value(player, "y");
          const aim = predict.value(player, "aim");
          const color = Phaser.Display.Color.HexStringToColor(player.color).color;
          const outline = sessionId === room.sessionId ? 0xffffff : 0x131e1b;
          this.markers.lineStyle(2, color).lineBetween(
            x, y, x + Math.cos(aim) * 22, y + Math.sin(aim) * 22,
          );
          this.markers.fillStyle(color).fillCircle(x, y, arenaPlayerRadius);
          this.markers.lineStyle(2, outline).strokeCircle(x, y, arenaPlayerRadius);
        }
      }
    }

    const game = new Phaser.Game({
      type: Phaser.CANVAS,
      parent,
      width,
      height,
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
      aria-label="Arena with a central capture point and player spawn markers"
    />
  );
}
