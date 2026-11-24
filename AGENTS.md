# Working on Territories Game

Read [README.md](README.md) for game scope and open design questions.

- Keep battle simulation and results server-authoritative. Each territory has at most one owning faction.
- Finalize battle results and ownership changes atomically and make retries safe. Save at most one ownership snapshot per scheduled day.
- Use the relevant skill for the task and read only the references needed for the current change. See [Codex skills](docs/codex-skills.md).
- Use focused Vitest checks for simulation and ownership rules. Use separate browser sessions for multiplayer smoke tests, and inspect screenshots or traces when behavior needs investigation.

## Commit messages

Write a short, sentence-case subject that starts with an imperative verb. Describe the specific change, for example `Add project overview` or `Fix territory ownership when a battle result is retried`. Omit prefixes and trailing punctuation.
