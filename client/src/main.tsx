import { Client, type Room } from "@colyseus/sdk";
import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { StartChallengeResult } from "../../shared/src/challenges.ts";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";
import { worldMap } from "../../shared/src/world-map";
import "./world.css";

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL ?? "http://127.0.0.1:2567");

function App() {
  const [status, setStatus] = useState("Connecting to the world…");
  const [room, setRoom] = useState<Room | null>(null);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [founded, setFounded] = useState<Faction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [challengeNotice, setChallengeNotice] = useState("");

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

  async function startChallenge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !founded || isSubmitting) return;

    const territoryId = new FormData(event.currentTarget).get("territory");
    const territory = worldMap.territories.find(({ id }) => id === territoryId);
    if (!territory) return;

    setIsSubmitting(true);
    setError("");
    setChallengeNotice("");
    try {
      const result: StartChallengeResult = await room.request("startChallenge", territory.id);
      if (result.ok) {
        const readyTime = new Date(result.challenge.readyAt).toLocaleTimeString();
        setChallengeNotice(`Challenge opened for ${territory.name}. Your faction gathers until ${readyTime}.`);
      } else {
        setError(result.error);
      }
    } catch {
      setError("Could not confirm the challenge. Try again if you’re still connected.");
    } finally {
      setIsSubmitting(false);
    }
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
            aria-label={worldMap.territories.map(({ name }) => `${name}, unclaimed`).join("; ")}
          >
            {worldMap.territories.map(({ id, name, outline, seed: [x, y] }) => (
              <g key={id}>
                <polygon points={outline.map(([x, y]) => `${x},${y}`).join(" ")} />
                <text x={x} y={y} textAnchor="middle">{name}</text>
              </g>
            ))}
          </svg>
          <p className="map-caption">All territories are unclaimed.</p>
        </section>
        <aside aria-labelledby="factions-heading">
          <h2 id="factions-heading">Factions</h2>
          {founded ? (
            <>
              <p role="status">You founded <strong>{founded.name}</strong>.</p>
              <form onSubmit={startChallenge}>
                <fieldset disabled={!room || isSubmitting}>
                  <label>
                    Territory
                    <select name="territory" required defaultValue="">
                      <option value="" disabled>Choose a territory</option>
                      {worldMap.territories.map(({ id, name }) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit">{isSubmitting ? "Opening…" : "Start challenge"}</button>
                </fieldset>
                <p role="status">{challengeNotice}</p>
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
