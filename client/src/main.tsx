import { Client, ErrorCode, type Room, type SeatReservation } from "@colyseus/sdk";
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArenaState } from "../../shared/src/arena-schema";
import { canAttackTerritory } from "../../shared/src/attack-eligibility";
import type { ArenaEntryResult, StartChallengeResult, TerritoryActivity } from "../../shared/src/challenges.ts";
import type { CreateFactionResult, Faction } from "../../shared/src/factions.ts";
import { worldMap } from "../../shared/src/world-map";
import "./world.css";

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL ?? "http://127.0.0.1:2567");
const ArenaView = lazy(() => import("./ArenaView"));

function App() {
  const [joinRequest, setJoinRequest] = useState<{ username?: string } | null>(null);
  const [joinError, setJoinError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [founded, setFounded] = useState<Faction | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [arena, setArena] = useState<{ room: Room<unknown, ArenaState>; territoryName: string; sideName: string } | null>(null);
  const [activity, setActivity] = useState<TerritoryActivity | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [territoryId, setTerritoryId] = useState("");
  const [confirmingAttack, setConfirmingAttack] = useState(false);
  const [provinceError, setProvinceError] = useState("");

  useEffect(() => {
    if (!joinRequest) return;
    let active = true;
    const connection = client.joinOrCreate("world", joinRequest);

    void connection.then(
      (room) => {
        if (!active) return;
        room.onMessage("displayName", (displayName: string) => {
          if (!active) return;
          setDisplayName(displayName);
          setRoom(room);
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
          setArena(null);
          setFactions([]);
          setFounded(null);
          setActivity(null);
          setTerritoryId("");
          setConfirmingAttack(false);
          setProvinceError("");
          setError("");
          setJoinError("Disconnected from the world. Join again to continue.");
          setJoinRequest(null);
        });
      },
      (error: unknown) => {
        if (!active) return;
        const invalidName = error instanceof Error && "code" in error && error.code === ErrorCode.AUTH_FAILED;
        setJoinError(invalidName ? error.message : "Could not connect to the world. Try again.");
        setJoinRequest(null);
      },
    );

    return () => {
      active = false;
      void connection.then((room) => room.leave()).catch(() => {});
    };
  }, [joinRequest]);

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
  const territory = worldMap.territories.find(({ id }) => id === territoryId);
  const ownChallenge = activity?.challenges.find(
    (challenge) => challenge.territoryId === territoryId && challenge.challengerFactionId === founded?.id,
  );
  const isOwner = Boolean(founded && activity?.owners[territoryId] === founded.id);
  const isGathering = !isOwner && Boolean(ownChallenge && ownChallenge.readyAt > serverNow);
  const canEnter = isOwner || Boolean(ownChallenge && !isGathering);
  const canAttack = Boolean(founded && territory && activity && !ownChallenge && canAttackTerritory(
    founded.id, territory, new Map(Object.entries(activity.owners)),
  ));

  function selectProvince(id: string) {
    if (isSubmitting) return;
    setTerritoryId(id);
    setConfirmingAttack(false);
    setProvinceError("");
  }

  function joinWorld(username?: string) {
    if (joinRequest) return;
    setJoinError("");
    setJoinRequest(username === undefined ? {} : { username });
  }

  function joinWithUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = new FormData(event.currentTarget).get("username");
    if (typeof username === "string") joinWorld(username);
  }

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

  async function actOnTerritory(action: "attack" | Faction) {
    if (!room || !territory || isSubmitting) return;
    if (action === "attack" && (!confirmingAttack || !canAttack)) return;

    setIsSubmitting(true);
    setProvinceError("");
    try {
      if (action !== "attack") {
        const result: ArenaEntryResult<SeatReservation> = await room.request("enterArena", {
          territoryId, factionId: action.id,
        });
        if (!result.ok) {
          setProvinceError(result.error);
          return;
        }
        const arenaRoom = await client.consumeSeatReservation(result.reservation, ArenaState);
        arenaRoom.onLeave(() => setArena((current) => current?.room === arenaRoom ? null : current));
        setArena({ room: arenaRoom, territoryName: territory.name, sideName: action.name });
      } else {
        const result: StartChallengeResult = await room.request("startChallenge", territoryId);
        if (result.ok) setConfirmingAttack(false);
        else setProvinceError(result.error);
      }
    } catch {
      setProvinceError("The server did not confirm your request. Try again if you’re still connected.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!room) {
    return (
      <main className="entry">
        <h1>Territories Game</h1>
        <div className="entry-options">
          <form onSubmit={joinWithUsername}>
            <fieldset disabled={Boolean(joinRequest)}>
              <label>
                Choose a username
                <input name="username" autoComplete="nickname" autoCapitalize="none" required />
              </label>
              <button type="submit">Join with username</button>
            </fieldset>
          </form>
          <button className="guest-button" type="button" disabled={Boolean(joinRequest)} onClick={() => joinWorld()}>
            Play as guest
          </button>
        </div>
        {joinRequest && <p role="status">Connecting to the world…</p>}
        {joinError && <p role="alert">{joinError}</p>}
      </main>
    );
  }

  if (arena) {
    return (
      <main className="arena-screen">
        <header className="arena-header">
          <div>
            <h1>{arena.territoryName} arena</h1>
            <p role="status">You joined {arena.sideName}.</p>
          </div>
          <button type="button" onClick={() => setArena(null)}>Return to world map</button>
          <p className="arena-controls">Move with WASD. Hold left click to fire. Drag your weapon out to drop it. Click a nearby weapon to pick it up.</p>
        </header>
        <div className="arena-stage">
          <Suspense fallback={<p role="status">Loading arena…</p>}>
            <ArenaView room={arena.room} factions={factions} />
          </Suspense>
        </div>
      </main>
    );
  }

  const factionsById = new Map(factions.map((faction) => [faction.id, faction]));
  const territories = worldMap.territories.map((territory) => ({
    ...territory,
    owner: factionsById.get(activity?.owners[territory.id] ?? ""),
    challenges: activity?.challenges.filter(({ territoryId }) => territoryId === territory.id) ?? [],
  }));
  const selectedProvince = territories.find(({ id }) => id === territoryId);

  const visitingSides = selectedProvince?.challenges.length
    ? [
        selectedProvince.owner,
        ...selectedProvince.challenges
          .filter(({ readyAt }) => readyAt <= serverNow)
          .map(({ challengerFactionId }) => factionsById.get(challengerFactionId)),
      ].filter((faction): faction is Faction => Boolean(faction && faction.id !== founded?.id))
    : [];

  function renderChallenges(challenges: TerritoryActivity["challenges"]) {
    if (challenges.length === 0) return null;
    return (
      <ul className="province-challenges">
        {challenges.map(({ challengerFactionId, readyAt }) => {
          const faction = factionsById.get(challengerFactionId);
          const seconds = Math.ceil((readyAt - serverNow) / 1000);
          return (
            <li key={challengerFactionId}>
              <span>{faction?.name ?? "Attacking faction"}</span>
              <span>{seconds > 0 ? `Gathering to attack · ${seconds}s` : "Attacking"}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <main className="world-screen">
      <section className="world" aria-label="World map">
        <svg
          className="map"
          viewBox={`0 0 ${worldMap.width} ${worldMap.height}`}
          role="group"
          aria-label="Select a province"
        >
          {territories.map(({ id, name, path, owner }) => (
            <path
              key={id}
              className="territory-shape"
              d={path}
              fillRule="evenodd"
              style={{ fill: owner?.color }}
              role="button"
              tabIndex={0}
              aria-label={`${name}, ${owner ? `owned by ${owner.name}` : "unclaimed"}`}
              aria-pressed={id === territoryId}
              onClick={() => selectProvince(id)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                selectProvince(id);
              }}
            />
          ))}
          <g className="map-relief" aria-hidden="true">
            {worldMap.reliefPaths.map((path, index) => (
              <path key={index} d={path} fillRule="evenodd" opacity={index * 0.095} />
            ))}
          </g>
          <g className="map-borders" aria-hidden="true">
            <path className="map-border-halo" d={worldMap.borders} />
            <path d={worldMap.borders} />
          </g>
          {worldMap.territories.map(({ id, name, labelAnchor: [x, y] }) => (
            <text
              key={id}
              x={Math.max(13, Math.min(worldMap.width - 13, x))}
              y={Math.max(6, Math.min(worldMap.height - 3, y))}
              textAnchor="middle"
              aria-hidden="true"
            >
              {name}
            </text>
          ))}
        </svg>
        <header className="world-identity">
          <h1>Territories Game</h1>
          <p role="status">Connected to the world as {displayName}.</p>
        </header>
        <details className="world-overlay world-activity" name="world-controls">
          <summary>Territories</summary>
          <div className="overlay-content">
            <ul className="territory-activity" aria-label="Territory activity">
              {territories.map(({ id, name, owner, challenges }) => (
                <li key={id}>
                  <strong>{name}</strong>
                  <span>{owner ? `Owned by ${owner.name}` : "Unclaimed"}</span>
                  {renderChallenges(challenges)}
                </li>
              ))}
            </ul>
          </div>
        </details>
        <details className="world-overlay world-factions" name="world-controls">
          <summary>Factions</summary>
          <div className="overlay-content">
            {founded ? (
              <p role="status">You founded <strong>{founded.name}</strong>.</p>
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
          </div>
        </details>
        {selectedProvince && (
          <section className="world-overlay province-panel" aria-labelledby="province-heading">
            <div className="province-heading">
              <h2 id="province-heading">{selectedProvince.name}</h2>
              <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => selectProvince("")}>
                Close
              </button>
            </div>
            <div className="overlay-content">
              <p>{selectedProvince.owner ? `Owned by ${selectedProvince.owner.name}` : "Unclaimed"}</p>
              <p>{selectedProvince.challenges.length > 0 ? "Contested" : "No active contest"}</p>
              {renderChallenges(selectedProvince.challenges)}
              <div className="province-actions">
                {canEnter && founded && (
                  <button type="button" disabled={isSubmitting} onClick={() => void actOnTerritory(founded)}>Enter arena</button>
                )}
                {visitingSides.map((faction) => (
                  <button key={faction.id} type="button" disabled={isSubmitting} onClick={() => void actOnTerritory(faction)}>
                    Fight for {faction.name}
                  </button>
                ))}
                {isGathering && <p>Your faction is gathering.</p>}
                {canAttack && confirmingAttack && (
                  <>
                    <p>Declare an attack on {selectedProvince.name}?</p>
                    <button type="button" disabled={isSubmitting} onClick={() => void actOnTerritory("attack")}>Confirm attack</button>
                    <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => setConfirmingAttack(false)}>Cancel</button>
                  </>
                )}
                {canAttack && !confirmingAttack && (
                  <button type="button" disabled={isSubmitting} onClick={() => setConfirmingAttack(true)}>Declare attack</button>
                )}
                {activity && !canEnter && !isGathering && !canAttack && visitingSides.length === 0 && (
                  <p>{founded ? "Your faction can only attack neighboring provinces." : "Found a faction to declare an attack."}</p>
                )}
              </div>
              {provinceError && <p role="alert">{provinceError}</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing React root.");
createRoot(container).render(<App />);
