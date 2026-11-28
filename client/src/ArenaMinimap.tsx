import type { Room } from "@colyseus/sdk";
import { useEffect, useMemo, useState } from "react";
import type { ArenaPoint } from "../../shared/src/arena";
import type { ArenaState } from "../../shared/src/arena-schema";
import { getProvinceArena } from "../../shared/src/province-arena";

export function ArenaMinimap({ room, provinceId }: { room: Room<unknown, ArenaState>; provinceId: string }) {
  const layout = getProvinceArena(provinceId);
  const [position, setPosition] = useState<ArenaPoint>();
  const outline = useMemo(() => layout.rings.map(ring =>
    `M${ring.map(({ x, y }) => `${x} ${y}`).join("L")}Z`,
  ).join(""), [layout]);

  useEffect(() => {
    function update(state: ArenaState) {
      const player = state.players.get(room.sessionId);
      setPosition(current => {
        if (!player) return undefined;
        return current?.x === player.x && current?.y === player.y ? current : { x: player.x, y: player.y };
      });
    }
    room.onStateChange(update);
    update(room.state);
    return () => room.onStateChange.remove(update);
  }, [room]);

  return (
    <svg className="arena-minimap" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img"
      aria-label="Arena minimap showing your position">
      <path d={outline} fillRule="evenodd" />
      {position && <circle cx={position.x} cy={position.y} r={Math.max(layout.width, layout.height) / 49} />}
    </svg>
  );
}
