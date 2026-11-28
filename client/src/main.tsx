import { Client, ErrorCode, type Room, type SeatReservation } from "@colyseus/sdk";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ArenaState } from "../../shared/src/arena-schema";
import { canAttackTerritory } from "../../shared/src/attack-eligibility";
import type { ArenaEntryResult, TerritoryActivity } from "../../shared/src/challenges.ts";
import { factionFlag, type FactionFlag as FlagColors, type FactionResult, type Faction } from "../../shared/src/factions";
import { worldMap } from "../../shared/src/world-map";
import { MapLabels } from "./MapLabels";
import { FactionFlag } from "./FactionFlag";
import { FlagEditor } from "./FlagEditor";
import "./world.css";

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL ?? "http://127.0.0.1:2567");
const ArenaView = lazy(() => import("./ArenaView"));
const defaultFactionColor = "#369b72";
const visibleBorders = worldMap.borderPaths
  .filter(({ kind }) => kind !== "map-edge")
  .map(({ path }) => path)
  .join("");
const provinceLabels = worldMap.territories.map(({ id, name, labelAnchor, labelFontSize }) => ({
  id, name, anchor: [labelAnchor[0], labelAnchor[1]] as const, fontSize: labelFontSize, outlineIds: [id],
}));
type Province = (typeof worldMap.territories)[number];

function App() {
  const [joinRequest, setJoinRequest] = useState<{ username?: string } | null>(null);
  const [joinError, setJoinError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [factions, setFactions] = useState<Faction[]>([]);
  const [founded, setFounded] = useState<Faction | null>(null);
  const [paintedCells, setPaintedCells] = useState<Partial<Record<number, string>>>({});
  const [editedFlag, setEditedFlag] = useState<FlagColors | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [arena, setArena] = useState<{ room: Room<unknown, ArenaState>; territoryName: string; sideName: string } | null>(null);
  const [activity, setActivity] = useState<TerritoryActivity | null>(null);
  const [territoryId, setTerritoryId] = useState("");
  const [provinceError, setProvinceError] = useState("");
  const pendingEntry = useRef<symbol | null>(null);

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
          setActivity(snapshot);
        });
        room.onLeave(() => {
          if (!active) return;
          setRoom(null);
          setArena(null);
          setFactions([]);
          setFounded(null);
          setPaintedCells({});
          setEditedFlag(null);
          setActivity(null);
          setTerritoryId("");
          pendingEntry.current = null;
          setIsSubmitting(false);
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
    if (!arena) return;
    return () => {
      void arena.room.leave().catch(() => {});
    };
  }, [arena]);

  const territory = worldMap.territories.find(({ id }) => id === territoryId);
  const ownAction = territory && getOwnBattleAction(territory);
  const canEnter = ownAction === "join";
  const canAttack = ownAction === "attack";
  const creationFlag = factionFlag().map((color, index) => paintedCells[index] ?? color);

  function getOwnBattleAction(province: Province): "join" | "attack" | undefined {
    if (!founded || !activity) return;
    if (activity.owners[province.id] === founded.id || activity.challenges.some(({ territoryId, challengerFactionId }) =>
      territoryId === province.id && challengerFactionId === founded.id)) return "join";
    if (canAttackTerritory(founded.id, province, new Map(Object.entries(activity.owners)))) return "attack";
  }

  function selectProvince(id: string) {
    if (isSubmitting) return;
    setTerritoryId(id);
    setProvinceError("");
  }

  function doubleClickProvince(province: Province) {
    const action = getOwnBattleAction(province);
    if (!founded || !action || isSubmitting || pendingEntry.current) return;
    selectProvince(province.id);
    void actOnTerritory(action === "attack" ? "attack" : founded, province);
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
      const result: FactionResult = await room.request("createFaction", {
        name: form.get("name"),
        color: form.get("color"),
        ...(Object.keys(paintedCells).length > 0 ? { flag: creationFlag } : {}),
      });
      if (result.ok) setFounded(result.faction);
      else setError(result.error);
    } catch {
      setError("Could not confirm faction creation. Try again if you’re still connected.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveFlag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !founded || !editedFlag || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result: FactionResult = await room.request("updateFactionFlag", { factionId: founded.id, flag: editedFlag });
      if (result.ok) {
        setFounded(result.faction);
        setEditedFlag(null);
      } else setError(result.error);
    } catch {
      setError("Could not save the flag. Try again if you’re still connected.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function actOnTerritory(action: "attack" | Faction, province = territory) {
    if (!room || !province || isSubmitting || pendingEntry.current) return;
    const side = action === "attack" ? founded : action;
    if (!side || (action === "attack" && getOwnBattleAction(province) !== "attack")) return;

    const entry = Symbol();
    pendingEntry.current = entry;
    setIsSubmitting(true);
    setProvinceError("");
    try {
      const result: ArenaEntryResult<SeatReservation> = action === "attack"
        ? await room.request("declareAndEnter", province.id)
        : await room.request("enterArena", { territoryId: province.id, factionId: side.id });
      if (pendingEntry.current !== entry) return;
      if (!result.ok) {
        setProvinceError(result.error);
        return;
      }
      const arenaRoom = await client.consumeSeatReservation(result.reservation, ArenaState);
      if (pendingEntry.current !== entry) {
        await arenaRoom.leave();
        return;
      }
      arenaRoom.onLeave(() => setArena((current) => current?.room === arenaRoom ? null : current));
      setArena({ room: arenaRoom, territoryName: province.name, sideName: side.name });
    } catch {
      if (pendingEntry.current === entry) setProvinceError("Could not enter the arena. Try again from this province.");
    } finally {
      if (pendingEntry.current === entry) {
        pendingEntry.current = null;
        setIsSubmitting(false);
      }
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
          .map(({ challengerFactionId }) => factionsById.get(challengerFactionId)),
      ].filter((faction): faction is Faction => Boolean(faction && faction.id !== founded?.id))
    : [];

  function renderChallenges(challenges: TerritoryActivity["challenges"]) {
    if (challenges.length === 0) return null;
    return (
      <ul className="province-challenges">
        {challenges.map(({ challengerFactionId }) => {
          const faction = factionsById.get(challengerFactionId);
          return (
            <li key={challengerFactionId}>
              <span className="faction-display">
                {faction && <FactionFlag faction={faction} />}
                {faction?.name ?? "Attacking faction"}
              </span>
              <span>Attacking</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <main className="world-screen">
      <section className="world" aria-label="World map">
        <div className="world-map-stage">
          <svg
            className="map"
            viewBox={`0 0 ${worldMap.width} ${worldMap.height}`}
            role="group"
            aria-label="Select a province"
          >
            {territories.map(({ owner, challenges, ...province }) => (
              <path
                key={province.id}
                id={province.id}
                className="territory-shape"
                d={province.path}
                fillRule="evenodd"
                style={{ fill: owner?.color }}
                role="button"
                tabIndex={0}
                aria-label={`${province.name}, ${owner ? `owned by ${owner.name}` : "unclaimed"}${challenges.length ? ", contested" : ""}`}
                aria-pressed={province.id === territoryId}
                onClick={() => selectProvince(province.id)}
                onDoubleClick={() => doubleClickProvince(province)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  selectProvince(province.id);
                }}
              />
            ))}
            <defs>
              <clipPath id="province-land-clip">
                {territories.map(({ id, path }) => <path key={id} d={path} clipRule="evenodd" />)}
              </clipPath>
              <filter id="contested-province-blur" filterUnits="userSpaceOnUse"
                x={-6} y={-6} width={worldMap.width + 12} height={worldMap.height + 12}>
                <feGaussianBlur stdDeviation="1.15" />
              </filter>
            </defs>
            <g className="map-relief" clipPath="url(#province-land-clip)" aria-hidden="true">
              {worldMap.reliefPaths.map((path, index) => (
                <path key={index} d={path} fillRule="evenodd" opacity={index * 0.095} />
              ))}
            </g>
            <g className="contested-glow" aria-hidden="true">
              {territories.filter(({ challenges }) => challenges.length > 0).map(({ id, path }) => (
                <path key={id} d={path} filter="url(#contested-province-blur)" />
              ))}
            </g>
            <g className="map-borders" aria-hidden="true">
              <path className="map-border-halo" d={visibleBorders} />
              <path d={visibleBorders} />
            </g>
            <MapLabels labels={provinceLabels} />
          </svg>
        </div>
        <div className="world-side world-side-left">
          <header className="world-identity">
            <h1>Territories Game</h1>
            <p role="status">Connected to the world as {displayName}.</p>
          </header>
          {selectedProvince && (
            <section className="world-overlay province-panel" aria-labelledby="province-heading">
              <div className="province-heading">
                <h2 id="province-heading">{selectedProvince.name}</h2>
                <button type="button" className="secondary-button" disabled={isSubmitting} onClick={() => selectProvince("")}>
                  Close
                </button>
              </div>
              <div className="overlay-content">
                {selectedProvince.owner ? (
                  <p className="faction-display">
                    <FactionFlag faction={selectedProvince.owner} />
                    <span>Owned by {selectedProvince.owner.name}</span>
                  </p>
                ) : <p>Unclaimed</p>}
                <p>{selectedProvince.challenges.length > 0 ? "Contested" : "No active contest"}</p>
                {renderChallenges(selectedProvince.challenges)}
                <div className="province-actions">
                  {canEnter && founded && (
                    <button type="button" disabled={isSubmitting} onClick={() => void actOnTerritory(founded)}>Enter arena</button>
                  )}
                  {visitingSides.map((faction) => (
                    <button className="faction-display" key={faction.id} type="button" disabled={isSubmitting}
                      onClick={() => void actOnTerritory(faction)}>
                      <FactionFlag faction={faction} />
                      <span>Fight for {faction.name}</span>
                    </button>
                  ))}
                  {canAttack && (
                    <button type="button" disabled={isSubmitting} onClick={() => void actOnTerritory("attack")}>Declare attack</button>
                  )}
                  {activity && !canEnter && !canAttack && visitingSides.length === 0 && (
                    <p>{founded ? "Your faction can only attack neighboring provinces." : "Found a faction to declare an attack."}</p>
                  )}
                </div>
                {provinceError && <p role="alert">{provinceError}</p>}
              </div>
            </section>
          )}
        </div>
        <div className="world-side world-side-right">
          <section className="world-overlay" aria-labelledby="faction-heading">
            <h2 id="faction-heading" className="faction-heading">Faction</h2>
            <div className="overlay-content">
              {founded ? (
                <div className="faction-profile">
                  <FactionFlag faction={founded} />
                  <strong>{founded.name}</strong>
                  <span className="faction-color">
                    <span className="swatch" style={{ backgroundColor: founded.color }} aria-hidden="true" />
                    {founded.color}
                  </span>
                  {editedFlag ? (
                    <form onSubmit={saveFlag}>
                      <fieldset disabled={isSubmitting}>
                        <FlagEditor flag={editedFlag} onPaint={(index, color) =>
                          setEditedFlag(flag => flag?.map((cell, pixel) => pixel === index ? color : cell) ?? null)} />
                        <button type="submit">Save flag</button>
                        <button type="button" onClick={() => { setEditedFlag(null); setError(""); }}>Cancel</button>
                      </fieldset>
                    </form>
                  ) : (
                    <button type="button" disabled={isSubmitting} onClick={() => setEditedFlag(factionFlag(founded))}>Edit flag</button>
                  )}
                </div>
              ) : (
                <form onSubmit={createFaction}>
                  <fieldset disabled={!room || isSubmitting}>
                    <label>
                      Faction name
                      <input name="name" required maxLength={40} />
                    </label>
                    <label>
                      Faction color
                      <input name="color" type="color" defaultValue={defaultFactionColor} />
                    </label>
                    <FlagEditor flag={creationFlag} onPaint={(index, color) =>
                      setPaintedCells(cells => ({ ...cells, [index]: color }))} />
                    <button type="submit">{isSubmitting ? "Creating…" : "Create faction"}</button>
                  </fieldset>
                </form>
              )}
              {error && <p role="alert">{error}</p>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing React root.");
createRoot(container).render(<App />);
