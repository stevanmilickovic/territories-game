type Point = readonly [x: number, y: number];

type LabelMetrics = { width: number; ascent: number; descent: number };

export function findMapLabelPath(
  anchor: Point,
  metrics: LabelMetrics,
  contains: (x: number, y: number) => boolean,
): string | undefined {
  const halfWidth = metrics.width / 2 + 0.5;
  const step = Math.max(1, halfWidth / 4);
  let best: { score: number; path: string } | undefined;

  for (const offsetY of [0, -1, 1, -2, 2]) {
    for (const offsetX of [0, -1, 1, -2, 2]) {
      const x = anchor[0] + offsetX * step;
      const y = anchor[1] + offsetY * step;
      for (const angle of [0, -15, 15, -30, 30, -45, 45, -60, 60]) {
        const radians = angle * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const place = (u: number, v: number): Point => [x + cos * u - sin * v, y + sin * u + cos * v];
        for (const bow of [0, -halfWidth * 0.19, halfWidth * 0.19]) {
          function fits(extra: number): boolean {
            const samples = Math.ceil(metrics.width);
            for (let index = 0; index <= samples; index++) {
              const t = 2 * index / samples - 1;
              const u = (halfWidth + extra) * t;
              const v = bow * t * t;
              const slope = 2 * bow * t / (halfWidth + extra);
              const normal = Math.hypot(slope, 1);
              for (const height of [-metrics.ascent - 0.35, 0, metrics.descent + 0.35]) {
                const [px, py] = place(u - slope * height / normal, v + height / normal);
                if (!contains(px, py)) return false;
              }
            }
            return true;
          }

          if (!fits(0)) continue;
          // Favor the direction with room around the name, with a mild preference for horizontal text.
          const clearance = fits(step * 2) ? 2 : fits(step) ? 1 : 0;
          const score = clearance * 2 - Math.hypot(offsetX, offsetY) * 0.45 - Math.abs(angle) / 55
            + (bow === 0 ? 0 : 0.24);
          if (best && best.score >= score) continue;

          const point = (u: number, v: number) => place(u, v).map(value => value.toFixed(3)).join(" ");
          const start = point(-halfWidth, bow);
          const end = point(halfWidth, bow);
          const commands = bow === 0 ? `L${end}` : `Q${point(0, -bow)} ${end}`;
          best = { score, path: `M${start}${commands}` };
        }
      }
    }
  }
  return best?.path;
}
