import { useId, useLayoutEffect, useRef, useState } from "react";
import { findMapLabelPath } from "./map-label-layout";

type MapLabel = {
  id: string;
  name: string;
  anchor: readonly [number, number];
  fontSize?: number;
  outlineIds: readonly string[];
};
type Placement = { path: string; fontSize: number };

export function MapLabels({ labels }: { labels: readonly MapLabel[] }) {
  const idPrefix = useId();
  const measurements = useRef<SVGGElement>(null);
  const [placements, setPlacements] = useState<(Placement | undefined)[]>([]);

  useLayoutEffect(() => {
    const group = measurements.current;
    const svg = group?.ownerSVGElement;
    if (!group || !svg) return;
    const texts = Array.from(group.querySelectorAll("text"));
    const point = svg.createSVGPoint();

    setPlacements(labels.map(({ outlineIds, anchor }, index) => {
      const outlines = outlineIds.map(id => svg.getElementById(id))
        .filter((outline): outline is SVGGeometryElement => outline instanceof SVGGeometryElement);
      const text = texts[index];
      const baseSize = Number.parseFloat(getComputedStyle(text).fontSize);
      if (outlines.length === 0 || text.getComputedTextLength() <= 0) return;
      const contains = (x: number, y: number) => {
        point.x = x;
        point.y = y;
        return outlines.some(outline => outline.isPointInFill(point));
      };
      const originalSize = text.style.fontSize;
      try {
        for (const scale of [1.55, 1.4, 1.25, 1.1, 1]) {
          const fontSize = baseSize * scale;
          text.style.fontSize = `${fontSize}px`;
          const { y, height } = text.getBBox();
          const path = findMapLabelPath(anchor, { width: text.getComputedTextLength(), ascent: -y, descent: y + height }, contains);
          if (path) return { path, fontSize };
        }
      } finally {
        text.style.fontSize = originalSize;
      }
    }));
  }, [labels]);

  return (
    <g aria-hidden="true">
      <g ref={measurements} visibility="hidden">
        {labels.map(({ id, name, fontSize }) => <text key={id} style={{ fontSize }}>{name}</text>)}
      </g>
      <defs>
        {placements.map((placement, index) => placement && (
          <path key={labels[index].id} id={`${idPrefix}-${labels[index].id}`} d={placement.path} />
        ))}
      </defs>
      {labels.map(({ id, name, anchor, fontSize }, index) => {
        const placement = placements[index];
        return (
          <text key={id} className="map-label" textAnchor="middle" style={{ fontSize: placement?.fontSize ?? fontSize }}
            x={placement ? undefined : anchor[0]} y={placement ? undefined : anchor[1]}>
            {placement ? <textPath href={`#${idPrefix}-${id}`} startOffset="50%">{name}</textPath> : name}
          </text>
        );
      })}
    </g>
  );
}
