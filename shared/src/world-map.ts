type Point = readonly [x: number, y: number];

type Territory = {
  readonly id: string;
  readonly name: string;
  readonly seed: Point;
  readonly outline: readonly Point[];
  readonly neighborIds: readonly string[];
  readonly ownerFactionId: string | null;
};

const junction = [400, 310] as const;
const northCoast = [400, 70] as const;
const southwestCoast = [110, 455] as const;
const southeastCoast = [690, 455] as const;

// The three coast endpoints lie on the seed bisectors. Each border starts
// at their common junction and bends along the way to the coast.
const northBorder: readonly Point[] = [junction, [382, 255], [411, 189], [387, 133], northCoast];
const southwestBorder: readonly Point[] = [junction, [335, 330], [271, 385], [202, 396], southwestCoast];
const southeastBorder: readonly Point[] = [junction, [467, 361], [537, 367], [620, 423], southeastCoast];

const westernCoastline: readonly Point[] = [
  [329, 53], [285, 94], [239, 88], [197, 119], [168, 171], [108, 183],
  [69, 232], [93, 271], [76, 323], [116, 353], [89, 407],
];
const easternCoastline: readonly Point[] = [
  [473, 89], [522, 62], [576, 87], [603, 142], [662, 155], [710, 202],
  [694, 250], [750, 288], [722, 334], [742, 377], [704, 408],
];
const southernCoastline: readonly Point[] = [
  [629, 475], [599, 523], [531, 550], [482, 524], [431, 560], [364, 539],
  [315, 558], [262, 514], [199, 525], [181, 482], [132, 489],
];

export const worldMap = {
  width: 800,
  height: 600,
  territories: [
    {
      id: "westreach",
      neighborIds: ["eastwatch", "southshore"],
      name: "Westreach",
      seed: [280, 220],
      outline: [...northBorder, ...westernCoastline, ...southwestBorder.slice(1).reverse()],
      ownerFactionId: null,
    },
    {
      id: "eastwatch",
      neighborIds: ["westreach", "southshore"],
      name: "Eastwatch",
      seed: [520, 220],
      outline: [...southeastBorder, ...easternCoastline.slice().reverse(), ...northBorder.slice(1).reverse()],
      ownerFactionId: null,
    },
    {
      id: "southshore",
      neighborIds: ["westreach", "eastwatch"],
      name: "Southshore",
      seed: [400, 460],
      outline: [...southwestBorder, ...southernCoastline.slice().reverse(), ...southeastBorder.slice(1).reverse()],
      ownerFactionId: null,
    },
  ] satisfies readonly Territory[],
};
