# Territories Game

Territories Game is a planned browser multiplayer game where players form factions and fight for control of territories in real-time arenas. A shared world map shows current ownership, and a history book lets players revisit past ownership maps.

## How it plays

1. **Found a faction.** A player who wants to conquer territory creates a faction, gives it a name and color, and designs a flag on a 6 × 6 pixel grid. A territory can have at most one owning faction.
2. **Challenge a territory.** A faction with no holdings can attack any territory. A faction that owns land can attack only territories adjacent to at least one of its holdings. Each attacking faction starts its own gathering window when it declares, including when a fight is already underway. A territory can sit idle until someone attacks.
3. **Fight for control.** Each territory has one shared arena with a single central capture point. The owning faction can enter at any time and spawns near the center. When an attacking faction finishes gathering, it gets a virtual spawn point at the edge of that same arena, and its players spawn around it. Players can join their faction while the fight is underway. Capturing the central point transfers ownership, and fighting can continue as long as factions want to contest the territory.
4. **Revisit the world map.** At a set time each day, the game saves a snapshot of territory ownership. Any player can open the history book and view the map from a previous day.

## Open design questions

- How does capture progress work if several factions are present at the center?
- How do spawn assignments and attack eligibility change when ownership changes during a fight?
- How should the arena assign edge spawn points when many factions enter?
- How should resources work in a later version?
- Could factions start with a king and pass the title to a successor when the king dies? How would succession work?

## Planned technology stack

| Area | Tools |
| --- | --- |
| Language and workspace | TypeScript, npm workspaces |
| Browser interface and world map | React, Vite |
| Battle rendering and input | Phaser |
| HTTP API | Node.js (active LTS), Express |
| Real-time multiplayer | Colyseus over WebSockets |
| Persistence and migrations | PostgreSQL, Prisma |
| Map authoring | Tiled Map Editor |
| Testing | Vitest, Playwright, Colyseus load-testing tools |
| Formatting and linting | Prettier, ESLint |
| Local infrastructure and initial deployment | Docker, Docker Compose |

## Architecture

The planned monorepo has three workspaces.

- **`client/`** contains the React world map, faction tools, and history book, plus the Phaser battle client.
- **`server/`** hosts a Colyseus world room and one arena room per active territory in one Node.js service. The server runs the authoritative arena simulation and serves Express routes as HTTP endpoints are needed.
- **`shared/`** contains TypeScript types and protocol contracts used by both sides.

PostgreSQL stores faction data, current territory ownership, capture results, and daily map snapshots. Active arena state stays in memory. Recording a capture and changing ownership happen in one transaction that can be safely retried.

The initial deployment targets a single VPS with Docker Compose. Redis is reserved for coordinating rooms across processes or hosts if needed. Google AdSense or H5 Games Ads may be considered once the core game is playable, subject to approval.

## Visual direction

Pixel art is the default for game art, including sprites, terrain, and faction flags. Other styles can be used where they fit the design.

## Development workflow

Use Node.js 22.18 or later. Run `npm ci` from the repository root, then launch both the server and client with `./scripts/launch-app.sh` or `npm run dev`. Open the local URL printed by Vite to join the world room. Press Ctrl+C to stop both services.

See [Codex skills](docs/codex-skills.md) for the project’s shared agent tooling.

The [v0.1 plan](docs/versions/v0.1.md) covers the first playable local version. The [v0.2 plan](docs/versions/v0.2.md) covers the generated world map, player entry, and larger arena. The [v0.3 plan](docs/versions/v0.3.md) covers curved province borders, faction flags, and province-shaped battles.

## Project status

The local scaffold includes a React client and a Colyseus world room.
