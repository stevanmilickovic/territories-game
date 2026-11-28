import type { Point } from "./trace-world-map-borders.mts";

const minimumTurnCosine = Math.cos(125 * Math.PI / 180);
const maximumTurnCosine = Math.cos(12 * Math.PI / 180);

function coordinates(x: number, y: number): string {
  return `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
}

export function roundedBorderPath(points: readonly Point[], width: number, height: number): string {
  const last = points.length - 1;
  const [startX, startY] = points[0];
  const closed = startX === points[last][0] && startY === points[last][1];
  let path = `M${coordinates(startX, startY)}`;

  for (let index = 1; index < last; index++) {
    const [x, y] = points[index];
    const [previousX, previousY] = points[index - 1];
    const [nextX, nextY] = points[index + 1];
    const incoming = Math.hypot(x - previousX, y - previousY);
    const outgoing = Math.hypot(nextX - x, nextY - y);
    const cosine = ((x - previousX) * (nextX - x) + (y - previousY) * (nextY - y)) / (incoming * outgoing);
    const onFrame = x === 0 || x === width || y === 0 || y === height;
    if (onFrame || !(cosine > minimumTurnCosine && cosine < maximumTurnCosine)) {
      path += `L${coordinates(x, y)}`;
      continue;
    }

    // Leave a straight section between adjacent curves and cap the trim on long segments.
    const trim = Math.min(1.6, incoming * 0.4, outgoing * 0.4);
    const entry = coordinates(x + (previousX - x) * trim / incoming, y + (previousY - y) * trim / incoming);
    const exit = coordinates(x + (nextX - x) * trim / outgoing, y + (nextY - y) * trim / outgoing);
    path += `L${entry}Q${coordinates(x, y)} ${exit}`;
  }

  return path + (closed ? "Z" : `L${coordinates(...points[last])}`);
}
