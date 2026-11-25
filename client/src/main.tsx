import { Client } from "@colyseus/sdk";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const client = new Client(import.meta.env.VITE_GAME_SERVER_URL ?? "http://127.0.0.1:2567");

function App() {
  const [status, setStatus] = useState("Connecting to the world…");

  useEffect(() => {
    let active = true;
    const connection = client.joinOrCreate("world");

    void connection.then(
      (room) => {
        if (!active) return;
        room.onMessage("guestName", (guestName: string) => {
          if (active) setStatus(`Connected to the world as ${guestName}.`);
        });
        room.onLeave(() => {
          if (active) setStatus("Disconnected. Reload to rejoin.");
        });
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

  return (
    <main>
      <h1>Territories Game</h1>
      <p role="status">{status}</p>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing React root.");
createRoot(container).render(<App />);
