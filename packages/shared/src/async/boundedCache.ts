export class BoundedCache<K, V> {
  private entries = new Map<K, { value: V; weight: number }>();
  private weight = 0;
  private maxWeight: number;
  private maxEntries: number;
  constructor(maxWeight: number, maxEntries: number) {
    this.maxWeight = maxWeight;
    this.maxEntries = maxEntries;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, weight: number) {
    const previous = this.entries.get(key);
    if (previous) this.weight -= previous.weight;
    this.entries.delete(key);
    if (weight > this.maxWeight) return;
    this.entries.set(key, { value, weight });
    this.weight += weight;
    while (this.weight > this.maxWeight || this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value!;
      this.weight -= this.entries.get(oldest)!.weight;
      this.entries.delete(oldest);
    }
  }
}
