export type Point = [x: number, y: number];

type BorderPath =
  | { kind: "shared"; labels: [right: number, left: number]; points: Point[] }
  | { kind: "coastline" | "map-edge"; labels: [right: number]; points: Point[] };

type GridEdge = { from: number; to: number; rightLabel: number; leftLabel: number };

export function traceBorderPaths(grid: Uint32Array, width: number, height: number): BorderPath[] {
  const stride = width + 1;
  const outside = -1;
  const edges: GridEdge[] = [];
  const incidentEdges = new Map<number, GridEdge[]>();

  function labelAt(x: number, y: number): number {
    return x >= 0 && x < width && y >= 0 && y < height ? grid[y * width + x] : outside;
  }

  function addEdge(from: number, to: number, rightLabel: number, leftLabel: number) {
    if (rightLabel === leftLabel || (rightLabel <= 0 && leftLabel <= 0)) return;

    // Keep land on the right. For a shared edge, use the lower province label on the right.
    if (rightLabel <= 0 || (leftLabel > 0 && leftLabel < rightLabel)) {
      [from, to] = [to, from];
      [rightLabel, leftLabel] = [leftLabel, rightLabel];
    }
    const edge = { from, to, rightLabel, leftLabel };
    edges.push(edge);
    for (const vertex of [from, to]) {
      const incident = incidentEdges.get(vertex);
      if (incident) incident.push(edge);
      else incidentEdges.set(vertex, [edge]);
    }
  }

  for (let y = 0; y <= height; y++) {
    for (let x = 0; x <= width; x++) {
      const vertex = y * stride + x;
      if (x < width) addEdge(vertex, vertex + 1, labelAt(x, y), labelAt(x, y - 1));
      if (y < height) addEdge(vertex, vertex + stride, labelAt(x - 1, y), labelAt(x, y));
    }
  }

  function continuation(edge: GridEdge, endpoint: "from" | "to"): GridEdge | undefined {
    const vertex = edge[endpoint];
    const incident = incidentEdges.get(vertex);
    if (incident?.length !== 2) return;

    const other = incident[0] === edge ? incident[1] : incident[0];
    if (other.rightLabel === edge.rightLabel && other.leftLabel === edge.leftLabel) return other;
  }

  const visited = new Set<GridEdge>();
  const toPoint = (vertex: number): Point => [vertex % stride, Math.floor(vertex / stride)];

  function trace(start: GridEdge): BorderPath {
    const points = [toPoint(start.from)];
    for (let edge: GridEdge | undefined = start; edge && !visited.has(edge); edge = continuation(edge, "to")) {
      visited.add(edge);
      points.push(toPoint(edge.to));
    }

    const { rightLabel, leftLabel } = start;
    if (leftLabel > 0) return { kind: "shared", labels: [rightLabel, leftLabel], points };
    return { kind: leftLabel === outside ? "map-edge" : "coastline", labels: [rightLabel], points };
  }

  const paths: BorderPath[] = [];
  // Start at junctions and changes in border type, then trace any closed loops left over.
  for (const edge of edges) {
    if (!continuation(edge, "from")) paths.push(trace(edge));
  }
  for (const edge of edges) {
    if (!visited.has(edge)) paths.push(trace(edge));
  }
  return paths;
}
