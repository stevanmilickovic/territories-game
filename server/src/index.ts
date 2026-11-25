import { defineRoom, defineServer, Room } from "colyseus";

class WorldRoom extends Room {
  autoDispose = false;
}

const server = defineServer({
  rooms: {
    world: defineRoom(WorldRoom),
  },
});

await server.listen(2567, "127.0.0.1");
