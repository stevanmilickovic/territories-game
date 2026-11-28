import assert from "node:assert/strict";
import type { Point } from "./trace-world-map-borders.mts";

type Arc = { start: string; end: string; outgoing: number; incoming: number; commands: string };

function direction([x, y]: Point, [nextX, nextY]: Point): number {
  if (nextX > x) return 0;
  if (nextY > y) return 1;
  if (nextX < x) return 2;
  return 3;
}

// Reversing a quadratic keeps its control point and swaps its endpoints.
function commandsInBothDirections(path: string): [string, string] {
  const tokens = [...path.matchAll(/([MLQZ])([^MLQZ]*)/g)];
  const start = tokens[0][2];
  let previous = start;
  let forward = "";
  const reverse: string[] = [];
  for (const [, command, coordinates] of tokens.slice(1)) {
    if (command === "Z" && previous === start) continue;
    const [x, y, endX, endY] = coordinates.split(" ");
    if (command === "Q") {
      forward += `Q${coordinates}`;
      reverse.push(`Q${x} ${y} ${previous}`);
      previous = `${endX} ${endY}`;
    } else {
      reverse.push(`L${previous}`);
      previous = command === "Z" ? start : coordinates;
      forward += `L${previous}`;
    }
  }
  return [forward, reverse.reverse().join("")];
}

export function stitchProvinceOutlines(boundaries: readonly {
  labels: readonly number[]; points: readonly Point[]; path: string;
}[]): Map<number, string> {
  const arcsByLabel = new Map<number, Arc[]>();
  for (const { labels, points, path } of boundaries) {
    const last = points.length - 1;
    const start = points[0].join(" ");
    const end = points[last].join(" ");
    const outgoing = direction(points[0], points[1]);
    const incoming = direction(points[last - 1], points[last]);
    const [forward, reverse] = commandsInBothDirections(path);
    const arcs = [
      { start, end, outgoing, incoming, commands: forward },
      { start: end, end: start, outgoing: (incoming + 2) % 4, incoming: (outgoing + 2) % 4, commands: reverse },
    ];
    for (const [index, label] of labels.entries()) {
      const list = arcsByLabel.get(label) ?? [];
      list.push(arcs[index]);
      arcsByLabel.set(label, list);
    }
  }

  const outlines = new Map<number, string>();
  for (const [label, arcs] of arcsByLabel) {
    const atVertex = new Map<string, Arc[]>();
    for (const arc of arcs) {
      const options = atVertex.get(arc.start) ?? [];
      options.push(arc);
      atVertex.set(arc.start, options);
    }
    const visited = new Set<Arc>();
    let outline = "";
    for (const start of arcs) {
      if (visited.has(start)) continue;
      outline += `M${start.start}`;
      let arc = start;
      do {
        assert.ok(!visited.has(arc), `Province ${label} has an open or overlapping outline.`);
        visited.add(arc);
        outline += arc.commands;
        const options = atVertex.get(arc.end);
        // Follow the rightmost turn where two rings touch at the same grid vertex.
        const next = [1, 0, 3, 2].flatMap(turn =>
          options?.filter(candidate => candidate.outgoing === (arc.incoming + turn) % 4) ?? [],
        )[0];
        assert.ok(next, `Province ${label} has an open outline.`);
        arc = next;
      } while (arc !== start);
      outline += "Z";
    }
    outlines.set(label, outline);
  }
  return outlines;
}
