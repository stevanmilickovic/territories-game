import { factionFlag, flagSize, type Faction } from "../../shared/src/factions";

export function FactionFlag({ faction }: { faction: Pick<Faction, "name" | "flag"> }) {
  return (
    <svg className="faction-flag" viewBox={`0 0 ${flagSize} ${flagSize}`} role="img"
      aria-label={`${faction.name} flag`} shapeRendering="crispEdges">
      {factionFlag(faction).map((color, index) => (
        <rect key={index} x={index % flagSize} y={Math.floor(index / flagSize)} width="1" height="1" fill={color} />
      ))}
    </svg>
  );
}
