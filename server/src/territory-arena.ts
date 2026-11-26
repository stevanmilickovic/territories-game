import { Room } from "colyseus";

export class TerritoryArena extends Room {
  // The world room reuses the same arena even when all players return to the map.
  autoDispose = false;

  static override async onAuth() {
    // Arena seats are issued by the world room after checking faction eligibility.
    return false;
  }

  async onCreate() {
    await this.setPrivate();
  }
}
