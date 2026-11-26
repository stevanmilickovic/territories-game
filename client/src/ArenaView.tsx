import Phaser from "phaser";
import { useEffect, useRef } from "react";
import { arenaLayout, type ArenaPlayer } from "../../shared/src/arena";

const { width, height } = arenaLayout;

export default function ArenaView({ players, sessionId }: {
  players: readonly ArenaPlayer[];
  sessionId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const latestPlayers = useRef(players);

  useEffect(() => {
    latestPlayers.current = players;
  }, [players]);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    class ArenaScene extends Phaser.Scene {
      private markers!: Phaser.GameObjects.Graphics;
      private drawnPlayers: readonly ArenaPlayer[] | undefined;

      create() {
        const floor = this.add.graphics();
        floor.lineStyle(1, 0x41584d);
        for (let x = 32; x < width; x += 32) floor.lineBetween(x, 0, x, height);
        for (let y = 32; y < height; y += 32) floor.lineBetween(0, y, width, y);
        floor.lineStyle(2, 0xaabc95).strokeCircle(width / 2, height / 2, 24);
        this.markers = this.add.graphics();
      }

      update() {
        const currentPlayers = latestPlayers.current;
        if (this.drawnPlayers === currentPlayers) return;
        this.drawnPlayers = currentPlayers;
        this.markers.clear();
        for (const player of currentPlayers) {
          const color = Phaser.Display.Color.HexStringToColor(player.color).color;
          const outline = player.sessionId === sessionId ? 0xffffff : 0x131e1b;
          this.markers.fillStyle(color).fillCircle(player.x, player.y, 9);
          this.markers.lineStyle(2, outline).strokeCircle(player.x, player.y, 9);
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
    return () => game.destroy(true);
  }, [sessionId]);

  return (
    <div
      className="arena-canvas"
      ref={host}
      role="img"
      aria-label="Arena with a central capture point and player spawn markers"
    />
  );
}
