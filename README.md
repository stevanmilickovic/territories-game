# Territories Game

Territories Game is a planned browser multiplayer game where players form factions, compete for territory on a shared world map, and settle disputes in real-time battles. The world map persists between battles, and a history book lets players revisit past ownership maps.

## How it plays

1. **Found a faction.** A player who wants to conquer territory creates a faction, gives it a name and color, and designs a flag on a 6 × 6 pixel grid. A territory can have at most one owning faction.
2. **Challenge a territory.** A faction with no holdings can attack any territory. A short gathering window gives other players time to join the attacking faction for that battle. Other factions can also enter the contest independently. If the territory already has an owner, its faction is automatically entered as the defender, and individual players choose whether to participate.
3. **Fight for control.** When the gathering window closes, participants enter a separate battle instance. The current concept is an arcade-style top-down shooter on procedurally generated terrain. The result determines who controls the contested territory on the shared map.
4. **Revisit the world map.** At a set time each day, the game saves a snapshot of territory ownership. Any player can open the history book and view the map from a previous day.

## Open design questions

- Which territories can a faction attack once it already holds land?
- What determines the winner, and how does a battle resolve if no defenders show up?
- How should factions spawn when several sides join the same fight?
- Should the defending faction receive an advantage?
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
- **`server/`** hosts a Colyseus world room and a separate room for each battle in one Node.js service. The server runs the authoritative battle simulation and serves Express routes as HTTP endpoints are needed.
- **`shared/`** contains TypeScript types and protocol contracts used by both sides.

PostgreSQL stores faction data, current territory ownership, finalized battle results, and daily map snapshots. Each active battle runs in its own Colyseus room with simulation state in memory. Finalizing a battle records its result and applies any ownership change in one transaction that can be safely retried.

The initial deployment targets a single VPS with Docker Compose. Redis is reserved for coordinating rooms across processes or hosts if needed. Google AdSense or H5 Games Ads may be considered once the core game is playable, subject to approval.

## Visual direction

Pixel art is the default for game art, including sprites, terrain, and faction flags. Other styles can be used where they fit the design.

## Development workflow

Use Node.js 22.18 or later and run `npm ci` from the repository root. Start the server with `npm run dev -w server` and the client with `npm run dev -w client` in separate terminals. Open the local URL printed by Vite to join the world room.

See [Codex skills](docs/codex-skills.md) for the project’s shared agent tooling.

The [v0.1 plan](docs/versions/v0.1.md) outlines the path to the first playable local version.

## Project status

The local scaffold includes a React client and a Colyseus world room.
