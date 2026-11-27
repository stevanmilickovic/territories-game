import { seededRandom } from "./seeded-random.ts";

export type HeightmapSettings = {
  width: number;
  height: number;
  seed: number;
  baseFrequency: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
};

export type Heightmap = {
  width: number;
  height: number;
  // Normalized elevations in row-major order, indexed by y * width + x.
  elevations: Float32Array;
};

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function gradient(hash: number, x: number, y: number): number {
  const alongX = (hash & 1) === 0 ? x : -x;
  const alongY = (hash & 2) === 0 ? y : -y;
  if ((hash & 4) === 0) return (alongX + alongY) * Math.SQRT1_2;
  return (hash & 8) === 0 ? alongX : alongY;
}

function perlin(x: number, y: number, permutation: Uint8Array): number {
  const floorX = Math.floor(x);
  const floorY = Math.floor(y);
  const gridX = floorX & 255;
  const gridY = floorY & 255;
  const dx = x - floorX;
  const dy = y - floorY;
  const left = permutation[gridX] + gridY;
  const right = permutation[gridX + 1] + gridY;
  const blendX = fade(dx);

  const top = lerp(gradient(permutation[left], dx, dy), gradient(permutation[right], dx - 1, dy), blendX);
  const bottom = lerp(
    gradient(permutation[left + 1], dx, dy - 1),
    gradient(permutation[right + 1], dx - 1, dy - 1),
    blendX,
  );
  return lerp(top, bottom, fade(dy));
}

export function generateHeightmap(settings: HeightmapSettings): Heightmap {
  const { width, height, seed, baseFrequency, octaves, lacunarity, persistence } = settings;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw new RangeError("Heightmap dimensions must be positive integers.");
  }
  if (!Number.isSafeInteger(octaves) || octaves < 1 || !Number.isFinite(baseFrequency)
    || baseFrequency <= 0 || !Number.isFinite(lacunarity) || lacunarity < 1
    || !Number.isFinite(persistence) || persistence < 0 || persistence > 1) {
    throw new RangeError("Invalid Perlin noise settings.");
  }
  if (baseFrequency * lacunarity ** (octaves - 1) >= Number.MAX_SAFE_INTEGER - 256) {
    throw new RangeError("The highest octave frequency exceeds the supported coordinate range.");
  }

  const random = seededRandom(seed);
  const permutation = new Uint8Array(512);
  for (let i = 0; i < 256; i++) permutation[i] = i;
  for (let i = 255; i > 0; i--) {
    const other = Math.floor(random() * (i + 1));
    [permutation[i], permutation[other]] = [permutation[other], permutation[i]];
  }
  permutation.copyWithin(256, 0, 256);

  const layers = [];
  let totalAmplitude = 0;
  let frequency = baseFrequency;
  let amplitude = 1;
  for (let octave = 0; octave < octaves && amplitude > 0; octave++) {
    layers.push({ frequency, amplitude, offsetX: random() * 256, offsetY: random() * 256 });
    totalAmplitude += amplitude;
    frequency *= lacunarity;
    amplitude *= persistence;
  }

  const elevations = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const layer of layers) {
        const sampleX = (x + 0.5) / width * layer.frequency + layer.offsetX;
        const sampleY = (y + 0.5) / height * layer.frequency + layer.offsetY;
        sum += perlin(sampleX, sampleY, permutation) * layer.amplitude;
      }
      elevations[y * width + x] = 0.5 + sum / (2 * Math.SQRT2 * totalAmplitude);
    }
  }
  return { width, height, elevations };
}
