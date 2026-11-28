import type { Point } from "./trace-world-map-borders.mts";

// Smooth irregular one-cell steps while retaining bends that extend beyond them.
const tolerance = 1.15;

function distanceToSegment([x, y]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - ax, y - ay);
  const fraction = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return Math.hypot(x - ax - fraction * dx, y - ay - fraction * dy);
}

export function simplifyBorder(points: readonly Point[], width: number, height: number): Point[] {
  const last = points.length - 1;
  const [startX, startY] = points[0];
  const [endX, endY] = points[last];
  const closed = startX === endX && startY === endY;
  const anchors = [0];
  for (let index = 1; index < last; index++) {
    const [x, y] = points[index];
    if (x === 0 || x === width || y === 0 || y === height || (closed && index === Math.floor(last / 2))) {
      anchors.push(index);
    }
  }
  anchors.push(last);

  const simplified = [points[0]];
  function appendSpan(from: number, to: number) {
    let split = from;
    let greatestDistance = tolerance;
    for (let index = from + 1; index < to; index++) {
      const distance = distanceToSegment(points[index], points[from], points[to]);
      if (distance > greatestDistance) {
        greatestDistance = distance;
        split = index;
      }
    }
    if (split === from) {
      simplified.push(points[to]);
      return;
    }
    appendSpan(from, split);
    appendSpan(split, to);
  }

  for (let index = 1; index < anchors.length; index++) appendSpan(anchors[index - 1], anchors[index]);
  if (closed && simplified.length < 4) return [...points];
  return simplified;
}
