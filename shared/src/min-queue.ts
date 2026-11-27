type QueueEntry = { index: number; cost: number };

export class MinQueue {
  private readonly entries: QueueEntry[] = [];

  push(index: number, cost: number) {
    const entry = { index, cost };
    const entries = this.entries;
    let position = entries.length;
    entries.push(entry);
    while (position > 0) {
      const parent = (position - 1) >>> 1;
      if (entries[parent].cost <= cost) break;
      entries[position] = entries[parent];
      position = parent;
    }
    entries[position] = entry;
  }

  pop(): QueueEntry | undefined {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();
    if (!last || entries.length === 0) return first;

    let position = 0;
    while (position * 2 + 1 < entries.length) {
      let child = position * 2 + 1;
      if (child + 1 < entries.length && entries[child + 1].cost < entries[child].cost) child++;
      if (entries[child].cost >= last.cost) break;
      entries[position] = entries[child];
      position = child;
    }
    entries[position] = last;
    return first;
  }
}
