# Changelog

## v0.2.0

- Replaced the three-territory prototype map with ten provinces on a continent generated from Perlin elevation noise using seed `202`. Province borders follow coastlines and are shaped by ridges and drainage.
- Added guest and custom username entry. Display names appear above players in the arena.
- Made the world map square and interactive. Select a province to see its owner, confirm an attack, or choose a side in an active contest. Province colors update when ownership changes.
- Let guests and faction founders fight for eligible sides. Contests end when the last player leaves the arena, and the current owner keeps the province.
- Expanded arenas to 2400 × 1440 world units. Added a square viewport, a smooth player-following camera, and camera-aware aim.
- Replaced instant hits with traveling square projectiles. Shots appear immediately for the shooter, and the server resolves collisions and damage.
- Added a single weapon slot with drag-to-drop and nearby click-to-pick-up controls. Players drop their equipped AK-47 on death, cannot fire with an empty slot, and respawn with a weapon.
- Moved the local health bar below the character. It appears on hover or briefly after taking damage.

## v0.1.0

- Released the first local multiplayer prototype with a three-territory world map, guest identities, and faction creation.
- Added server-validated attack eligibility, independent gathering state for each attacking faction, and shared arenas that players can join mid-fight.
- Added defender spawns near the center and attacker spawns at the arena edges. Capturing the central point transfers ownership and updates the world map.
- Added server-authoritative movement and damage, local movement and firing prediction, remote player interpolation, and five-second respawns.
- Added a local launch script to start the browser client and game server together.
