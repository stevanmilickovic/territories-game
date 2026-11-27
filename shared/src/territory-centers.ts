import type { ContinentalHeightmap } from "./continent.ts";
import { seededRandom } from "./seeded-random.ts";

type LandGrid = Pick<ContinentalHeightmap, "width" | "height" | "land">;

export type TerritoryCenter = { x: number; y: number; strength: number };

type TerritoryCenterSettings = {
  seed: number;
  minimumSpacing: number;
  minimumStrength: number;
  maximumStrength: number;
};

const territoryCount = 10;

export function placeTerritoryCenters(grid: LandGrid, settings: TerritoryCenterSettings): TerritoryCenter[] {
  const { seed, minimumSpacing, minimumStrength, maximumStrength } = settings;
  if (!Number.isFinite(minimumSpacing) || minimumSpacing < 0) {
    throw new RangeError("Minimum territory spacing must be a finite, nonnegative distance.");
  }
  if (!Number.isFinite(minimumStrength) || minimumStrength <= 0
    || !Number.isFinite(maximumStrength) || maximumStrength < minimumStrength) {
    throw new RangeError("Territory strengths must have a positive, finite range.");
  }

  const random = seededRandom(seed);
  const candidates: number[] = [];
  for (let index = 0; index < grid.land.length; index++) {
    if (grid.land[index]) candidates.push(index);
  }

  const centers: TerritoryCenter[] = [];
  for (let end = candidates.length - 1; end >= 0 && centers.length < territoryCount; end--) {
    const selected = Math.floor(random() * (end + 1));
    const index = candidates[selected];
    candidates[selected] = candidates[end];
    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    if (centers.some((center) => Math.hypot(x - center.x, y - center.y) < minimumSpacing)) continue;

    const strength = minimumStrength + random() * (maximumStrength - minimumStrength);
    centers.push({ x, y, strength });
  }

  if (centers.length !== territoryCount) {
    throw new RangeError("Could not place ten territory centers. Try a smaller spacing or a different seed.");
  }
  return centers;
}

// Water is zero. A land cell labeled n belongs to centers[n - 1].
export function assignFlatTerritories(grid: LandGrid, centers: readonly TerritoryCenter[]): Uint32Array {
  if (centers.length === 0 || centers.some(({ strength }) => !Number.isFinite(strength) || strength <= 0)) {
    throw new RangeError("Flat territory assignment needs centers with positive, finite strengths.");
  }
  const labels = new Uint32Array(grid.land.length);
  for (let index = 0; index < labels.length; index++) {
    if (!grid.land[index]) continue;

    const x = index % grid.width;
    const y = Math.floor(index / grid.width);
    let bestCost = Infinity;
    let bestCenter = 0;
    for (let centerIndex = 0; centerIndex < centers.length; centerIndex++) {
      const center = centers[centerIndex];
      const cost = Math.hypot(x - center.x, y - center.y) / center.strength;
      if (cost < bestCost) {
        bestCost = cost;
        bestCenter = centerIndex;
      }
    }
    labels[index] = bestCenter + 1;
  }
  return labels;
}
