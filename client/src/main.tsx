import { Client, type Room, type SeatReservation } from "@colyseus/sdk";
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArenaState } from "../../shared/src/arena-schema";
import type { ArenaEntryResult, StartChallengeResult, TerritoryActivity } from "../../shared/src/challenges.ts";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";
import { worldMap } from "../../shared/src/world-map";
import "./world.css";

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL ?? "http://127.0.0.1:2567");
const ArenaView = lazy(() => import("./ArenaView"));

function App() {
  const [status, setStatus] = useState("Connecting to the world…");
  const [room, setRoom] = useState<Room | null>(null);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [founded, setFounded] = useState<Faction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [arena, setArena] = useState<{ room: Room<unknown, ArenaState>; territoryName: string } | null>(null);
  const [activity, setActivity] = useState<TerritoryActivity | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [territoryId, setTerritoryId] = useState("");

  useEffect(() => {
    let active = true;
    const connection = client.joinOrCreate("world");

    void connection.then(
      (room) => {
        if (!active) return;
        room.onMessage("guestName", (guestName: string) => {
          if (active) setStatus(`Connected to the world as ${guestName}.`);
        });
        room.onMessage("factions", (factions: Faction[]) => {
          if (active) setFactions(factions);
        });
        room.onMessage("territoryActivity", (snapshot: TerritoryActivity) => {
          if (!active) return;
          const receivedAt = Date.now();
          setActivity(snapshot);
          setClockOffset(snapshot.serverTime - receivedAt);
          setNow(receivedAt);
        });
        room.onLeave(() => {
          if (!active) return;
          setRoom(null);
          setStatus("Disconnected. Reload to rejoin.");
        });
        setRoom(room);
      },
      () => {
        if (active) setStatus("Could not connect. Reload to try again.");
      },
    );

    return () => {
      active = false;
      void connection.then((room) => room.leave()).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!room) return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [room]);

  useEffect(() => {
    if (!arena) return;
    return () => {
      void arena.room.leave().catch(() => {});
    };
  }, [arena]);

  const serverNow = now + clockOffset;
  const ownChallenge = activity?.challenges.find(
    (challenge) => challenge.territoryId === territoryId && challenge.challengerFactionId === founded?.id,
  );
  const isOwner = Boolean(founded && activity?.owners[territoryId] === founded.id);
  const isGathering = !isOwner && Boolean(ownChallenge && ownChallenge.readyAt > serverNow);
  const canEnter = isOwner || Boolean(ownChallenge && !isGathering);

  async function createFaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || isSubmitting || founded) return;

    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError("");
    try {
      const result: CreateFactionResult = await room.request("createFaction", {
        name: form.get("name"),
        color: form.get("color"),
      });
      if (result.ok) setFounded(result.faction);
      else setError(result.error);
    } catch {
      setError("Could not confirm faction creation. Try again if you’re still connected.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function actOnTerritory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !founded || !territoryId || isSubmitting || isGathering) return;

    setIsSubmitting(true);
    setError("");
    try {
      if (canEnter) {
        const result: ArenaEntryResult<SeatReservation> = await room.request("enterArena", territoryId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const arenaRoom = await client.consumeSeatReservation(result.reservation, ArenaState);
        arenaRoom.onLeave(() => setArena((current) => current?.room === arenaRoom ? null : current));
        const territoryName = worldMap.territories.find(({ id }) => id === territoryId)?.name ?? territoryId;
        setArena({ room: arenaRoom, territoryName });
      } else {
        const result: StartChallengeResult = await room.request("startChallenge", territoryId);
        if (!result.ok) setError(result.error);
      }
    } catch {
      setError("The server did not confirm your request. Try again if you’re still connected.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (arena) {
    return (
      <main>
        <header>
          <h1>{arena.territoryName} arena</h1>
          <p role="status">You joined as {founded?.name}.</p>
        </header>
        <p><button type="button" onClick={() => setArena(null)}>Return to world map</button></p>
        <p>Move with WASD. Aim with the mouse.</p>
        <Suspense fallback={<p role="status">Loading arena…</p>}>
          <ArenaView room={arena.room} />
        </Suspense>
      </main>
    );
  }

  return (
    <main>
      <header>
        <h1>Territories Game</h1>
        <p role="status">{status}</p>
      </header>
      <div className="world">
        <section aria-labelledby="map-heading">
          <h2 id="map-heading">World map</h2>
          <svg
            className="map"
            viewBox={`0 0 ${worldMap.width} ${worldMap.height}`}
            role="img"
            aria-label={worldMap.territories.map(({ name }) => name).join(", ")}
          >
            {worldMap.territories.map(({ id, name, outline, seed: [x, y] }) => (
              <g key={id}>
                <polygon points={outline.map(([x, y]) => `${x},${y}`).join(" ")} />
                <text x={x} y={y} textAnchor="middle">{name}</text>
              </g>
            ))}
          </svg>
          <ul className="territory-activity" aria-label="Territory activity">
            {worldMap.territories.map(({ id, name }) => {
              const owner = factions.find(({ id: factionId }) => factionId === activity?.owners[id]);
              const challenges = activity?.challenges.filter(({ territoryId }) => territoryId === id) ?? [];
              return (
                <li key={id}>
                  <strong>{name}</strong>
                  <span>{owner ? `Held by ${owner.name}` : "Unclaimed"}</span>
                  {challenges.length > 0 && (
                    <ul>
                      {challenges.map(({ challengerFactionId, readyAt }) => {
                        const faction = factions.find(({ id }) => id === challengerFactionId);
                        const seconds = Math.ceil((readyAt - serverNow) / 1000);
                        return (
                          <li key={challengerFactionId}>
                            <span>{faction?.name ?? "Attacking faction"}</span>
                            <span>{seconds > 0 ? `Gathering · ${seconds}s` : "Ready to enter"}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <aside aria-labelledby="factions-heading">
          <h2 id="factions-heading">Factions</h2>
          {founded ? (
            <>
              <p role="status">You founded <strong>{founded.name}</strong>.</p>
              <form onSubmit={actOnTerritory}>
                <fieldset disabled={!room || !activity || isSubmitting}>
                  <label>
                    Territory
                    <select name="territory" required value={territoryId} onChange={(event) => {
                      setTerritoryId(event.target.value);
                      setError("");
                    }}>
                      <option value="" disabled>Choose a territory</option>
                      {worldMap.territories.map(({ id, name }) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={isGathering}>
                    {isGathering ? "Gathering…" : canEnter ? "Enter arena" : "Start challenge"}
                  </button>
                </fieldset>
              </form>
            </>
          ) : (
            <form onSubmit={createFaction}>
              <fieldset disabled={!room || isSubmitting}>
                <label>
                  Faction name
                  <input name="name" required maxLength={40} />
                </label>
                <label>
                  Faction color
                  <input name="color" type="color" defaultValue="#369b72" />
                </label>
                <button type="submit">{isSubmitting ? "Creating…" : "Create faction"}</button>
              </fieldset>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="faction-list" aria-live="polite">
            {factions.length === 0 ? <p>No factions yet.</p> : (
              <ul aria-label="Founded factions">
                {factions.map(({ id, name, color }) => (
                  <li key={id}>
                    <span className="swatch" style={{ backgroundColor: color }} aria-hidden="true" />
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing React root.");
createRoot(container).render(<App />);
