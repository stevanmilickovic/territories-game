# Codex skills

The selected skills are checked into [`.agents/skills/`](../.agents/skills/) so contributors can use the same versions. Invoke one by name when its workflow fits the task, or let Codex select it from its description.

| Skill | Use it for | Pinned upstream |
| --- | --- | --- |
| `$colyseus` | Battle rooms, matchmaking, state sync, and reconnects. This copy targets Colyseus 0.18. | [colyseus/skill](https://github.com/colyseus/skill/tree/9e3ce1326a057f7f1edb71330e1cbb731b9e9536) |
| `$playwright-cli` | Interactive browser checks. Use separate sessions to join a contested territory and verify both players see the same ownership update. The skill uses the Playwright CLI. Keep repeatable regression tests in Playwright Test. | [microsoft/playwright-cli](https://github.com/microsoft/playwright-cli/tree/281035b23ea61c0bc47b3c31f4f3aff9bd377595/skills/playwright-cli) |
| `$scenes`, `$input-keyboard-mouse-touch`, `$tilemaps` | Phaser 4 scene lifecycle, battle controls, and Tiled map integration. Use the specific skill for the subsystem you are editing. | [phaserjs/phaser](https://github.com/phaserjs/phaser/tree/02d8931b626d9764c133cbb3fbf99966c03c757c/skills) |
| `$imagegen` | Built-in Codex skill for raster art such as terrain textures and sprite concepts. Build the flag editor as an interactive grid. | Codex installation |
| Prisma ORM skill | Select the official skill matching the Prisma version once persistence work starts. Use it for schema and migration work. | [Prisma skills guide](https://www.prisma.io/docs/ai/tools/skills) |

Check the pinned Colyseus and Phaser guidance against the dependency versions when the application is initialized or upgraded. Update the pinned source here when refreshing a skill.

Keep repeated checks in scripts or tests and report concise results. During browser debugging, inspect the relevant session and capture screenshots or traces when they help explain a failure.
