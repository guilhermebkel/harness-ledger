export class CollectionUtil {
  /** The order of `Array.prototype.sort()` without a comparator (UTF-16 code units), stated explicitly. */
  static readonly compareCodeUnits = (left: string, right: string): number => {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  };

  static unique<Item>(items: Item[]): Item[] {
    return [...new Set(items)];
  }

  static countBy(values: string[]): Record<string, number> {
    const valueToCount: Record<string, number> = {};
    for (const value of values) {
      valueToCount[value] = (valueToCount[value] ?? 0) + 1;
    }
    return valueToCount;
  }

  /** Appends to the list under `key`, creating it on first use. */
  static pushTo<Key, Item>(keyToItems: Map<Key, Item[]>, key: Key, item: Item): void {
    const items = keyToItems.get(key) ?? [];
    items.push(item);
    keyToItems.set(key, items);
  }

  /** Runs async work over items with a concurrency limit, keeping the input order in the results. */
  static async mapWithConcurrency<Item, Result>(
    items: Item[],
    concurrency: number,
    work: (item: Item) => Promise<Result>,
  ): Promise<Result[]> {
    const results: Result[] = [];
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    const runWorker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex++;
        results[index] = await work(items[index] as Item);
      }
    };
    await Promise.all(Array.from({ length: workerCount }, runWorker));
    return results;
  }
}
