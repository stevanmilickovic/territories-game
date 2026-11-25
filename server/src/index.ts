import { defineRoom, defineServer, Room, type Client } from "colyseus";

type GuestClient = Client<{ userData: { guestName: string } }>;

class WorldRoom extends Room {
  autoDispose = false;
  private nextGuestNumber = 1;

  onJoin(client: GuestClient) {
    const guestName = `Guest ${this.nextGuestNumber++}`;
    client.userData = { guestName };
    client.send("guestName", guestName);
  }
}

const server = defineServer({
  rooms: {
    world: defineRoom(WorldRoom),
  },
});

await server.listen(2567, "127.0.0.1");
