import { Predict, type Room } from "@colyseus/sdk";
import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { ArenaInput, type ArenaState } from "../../shared/src/arena-schema";
import { arenaLayout, arenaPlayerRadius, stepArenaMovement } from "../../shared/src/arena";

const { width, height } = arenaLayout;

export default function ArenaView({ room }: { room: Room<unknown, ArenaState> }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const predict = Predict.get(room, { mode: "lerp", delay: 100 });
    const input = room.input({ type: ArenaInput });

    class ArenaScene extends Phaser.Scene {
      private markers!: Phaser.GameObjects.Graphics;
      private keys?: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
      private trackingPlayers = false;

      create() {
        const floor = this.add.graphics();
        floor.lineStyle(1, 0x41584d);
        for (let x = 32; x < width; x += 32) floor.lineBetween(x, 0, x, height);
        for (let y = 32; y < height; y += 32) floor.lineBetween(0, y, width, y);
        floor.lineStyle(2, 0xaabc95).strokeCircle(width / 2, height / 2, 24);
        this.markers = this.add.graphics();
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
        if (!this.trackingPlayers) {
          const localPlayer = players?.get(room.sessionId);
          if (!localPlayer) return;

          predict.attachAll("players", {
            x: "lerp",
            y: "lerp",
            aim: { mode: "lerp", angle: true },
          });
          predict.reconciler(localPlayer, {
            input,
            fields: ["x", "y", "aim"],
            smoothMs: 65,
            step: ({ dt }, player, command) => {
              Object.assign(player, stepArenaMovement(player, command, dt));
            },
          });
          this.trackingPlayers = true;
        }
        if (!players) return;

        const steps = predict.tick(performance.now());
        const pointer = this.input.activePointer.updateWorldPoint(this.cameras.main);
        for (let step = 0; step < steps; step++) {
          input.data.moveX = Number(Boolean(this.keys?.right.isDown)) - Number(Boolean(this.keys?.left.isDown));
          input.data.moveY = Number(Boolean(this.keys?.down.isDown)) - Number(Boolean(this.keys?.up.isDown));
          input.data.aimX = Phaser.Math.Clamp(pointer.worldX, 0, width);
          input.data.aimY = Phaser.Math.Clamp(pointer.worldY, 0, height);
          input.send();
        }

        this.markers.clear();
        for (const [sessionId, player] of players) {
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
